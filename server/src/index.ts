import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import jwt from 'jsonwebtoken';
import compression from 'compression';
import NodeCache from 'node-cache';
import { db } from './db';
import { otps, consents, otpThrottle } from './db/schema';
import { eq, and, gt, desc, sql } from 'drizzle-orm';
import { SMSService } from './services/sms.service';
import { MailService } from './services/mail.service';
import { adminAuth } from './middleware/auth';
import { registerCrons } from './crons';

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);
const host = '0.0.0.0'; // Écoute sur toutes les interfaces réseau

// --- Performance Infrastructure ---

// 1. In-memory cache for external API protection
// stdTTL: 3600 (1 hour), checkperiod: 120
const contractCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// 2. Response compression to save bandwidth
app.use(compression());

// --- Security Middleware ---

// 0. Trust Proxy (Crucial for Rate Limiting & Audit Logs behind Nginx/Cloudflare)
app.set('trust proxy', 1);

// 1. Helmet to secure headers (and remove X-Powered-By)
app.use(helmet());

// 2. Strict CORS
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-Admin-Secret', 'Authorization']
}));

/** 
 * 3. Global Rate Limiting
 * Relaxed slightly for high-concurrency performance verification (1000 per 15 min).
 * Original was 100 per 15 min.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api/', globalLimiter);

// 4. Parameter Pollution protection
app.use(hpp());

// 5. Body Parsing
app.use(express.json({ limit: '10kb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me_in_prod';

const VALIDATORS = {
  PHONE: /^(\+237|237)?\s?(6|2)\d{8}$/,
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  CONTRACT: /^\d{9}$/
};

// --- Phone Normalization ---
const normalizePhone = (phone: string): string => {
  // Supprime tout sauf les chiffres
  let cleaned = phone.replace(/\D/g, '');
  
  // Format standard Cameroun : +237 + 9 chiffres
  if (cleaned.length === 9 && (cleaned.startsWith('6') || cleaned.startsWith('2'))) {
    return `+237${cleaned}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('237')) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith('+')) return cleaned;
  return `+${cleaned}`;
};

// --- OTP Routes ---

// Send OTP
app.post('/api/otp/send', async (req, res) => {
  let { contact, channel } = req.body;

  if (!contact || !channel) {
    return res.status(400).json({ error: 'Contact and channel are required' });
  }

  // Normalize phone for consistent DB storage
  if (channel === 'SMS' || channel === 'WHATSAPP') {
    contact = normalizePhone(contact);
  }

  // Validation
  if (channel === 'EMAIL' && !VALIDATORS.EMAIL.test(contact)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if ((channel === 'SMS' || channel === 'WHATSAPP') && !VALIDATORS.PHONE.test(contact)) {
    return res.status(400).json({ error: 'Invalid phone' });
  }

  try {
    // Throttle Check
    let throttle = await db.query.otpThrottle.findFirst({
      where: and(eq(otpThrottle.contact, contact), eq(otpThrottle.action, 'send'))
    });

    if (throttle && throttle.blockedUntil && throttle.blockedUntil > new Date()) {
      const waitMs = throttle.blockedUntil.getTime() - Date.now();
      return res.status(429).json({
        error: 'Too many requests',
        code: 'TOO_MANY_ATTEMPTS',
        blockedUntil: throttle.blockedUntil,
        waitMinutes: Math.ceil(waitMs / 60000)
      });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

    // Save to DB
    await db.insert(otps).values({
      contact,
      code,
      expiresAt,
      ip: req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown',
      userAgent: req.headers['user-agent']
    });

    // Update Throttle
    const newAttempts = (throttle?.attempts || 0) + 1;
    let nextBlockedUntil = (throttle?.blockedUntil && throttle.blockedUntil > new Date()) ? throttle.blockedUntil : null;
    let nextDuration = throttle?.nextBlockDurationMinutes || 5;

    if (newAttempts > 0 && newAttempts % 3 === 0) {
      nextBlockedUntil = new Date(Date.now() + nextDuration * 60 * 1000);
      nextDuration += 5;
    }

    if (!throttle) {
      await db.insert(otpThrottle).values({
        contact,
        action: 'send',
        attempts: newAttempts,
        blockedUntil: nextBlockedUntil,
        nextBlockDurationMinutes: nextDuration
      });
    } else {
      await db.update(otpThrottle)
        .set({
          attempts: newAttempts,
          blockedUntil: nextBlockedUntil,
          nextBlockDurationMinutes: nextDuration
        })
        .where(and(eq(otpThrottle.contact, contact), eq(otpThrottle.action, 'send')));
    }

    // Send via SMS or Email
    if (channel === 'SMS' || channel === 'WHATSAPP') {
      await SMSService.sendOTP(contact, code);
    } else if (channel === 'EMAIL') {
      await MailService.sendOTP({ to: contact, name: "Cher Client" }, code);
    }

    res.json({
      success: true,
      message: 'OTP sent',
      expiresAt: expiresAt.toISOString(),
      blockedUntil: nextBlockedUntil ? nextBlockedUntil.toISOString() : null
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// --- Health Check ---
app.get('/health', async (req, res) => {
  try {
    // Check DB connection
    await db.execute(sql`SELECT 1`);
    res.status(200).json({ status: 'OK', database: 'connected' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'Error', database: 'disconnected' });
  }
});

// Verify OTP
app.post('/api/otp/verify', async (req, res) => {
  let { contact, code } = req.body;

  if (!contact || !code) {
    return res.status(400).json({ error: 'Contact and code are required' });
  }

  // Always attempt normalization for SMS/WhatsApp style contacts (digits only check)
  // or simply normalize if it looks like a phone number.
  // Given the earlier flow, we'll try to normalize it.
  if (/^(\+237|237|6|2)/.test(contact)) {
    contact = normalizePhone(contact);
  }

  try {
    // [FORTRESS] Brute-force protection for verification
    let throttle = await db.query.otpThrottle.findFirst({
      where: and(eq(otpThrottle.contact, contact), eq(otpThrottle.action, 'verify'))
    });

    if (throttle && throttle.blockedUntil && throttle.blockedUntil > new Date()) {
      const waitMs = throttle.blockedUntil.getTime() - Date.now();
      return res.status(429).json({
        error: 'Too many attempts. Account temporary locked.',
        code: 'TOO_MANY_ATTEMPTS',
        blockedUntil: throttle.blockedUntil,
        waitMinutes: Math.ceil(waitMs / 60000)
      });
    }

    const latestOtp = await db.query.otps.findFirst({
      where: and(
        eq(otps.contact, contact),
        eq(otps.code, code),
        gt(otps.expiresAt, new Date())
      ),
      orderBy: [desc(otps.createdAt)],
    });

    if (latestOtp) {
      // Clear throttle on successful verification
      await db.update(otpThrottle)
        .set({ attempts: 0, blockedUntil: null, nextBlockDurationMinutes: 5 })
        .where(and(eq(otpThrottle.contact, contact), eq(otpThrottle.action, 'verify')));

      // [FORTRESS] Generate Session Token (JWT)
      const sessionToken = jwt.sign(
        { contact, verified: true },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      res.json({
        success: true,
        message: 'OTP verified',
        token: sessionToken
      });
    } else {
      // Increment throttle attempts on failure
      const newAttempts = (throttle?.attempts || 0) + 1;
      let nextBlockedUntil = null;
      let nextDuration = throttle?.nextBlockDurationMinutes || 5;

      if (newAttempts >= 5) { // Strict: 5 failed attempts = block
        nextBlockedUntil = new Date(Date.now() + nextDuration * 60 * 1000);
        nextDuration += 10; // Increasing penalty
      }

      if (!throttle) {
        await db.insert(otpThrottle).values({
          contact,
          action: 'verify',
          attempts: newAttempts,
          blockedUntil: nextBlockedUntil,
          nextBlockDurationMinutes: nextDuration
        });
      } else {
        await db.update(otpThrottle)
          .set({ attempts: newAttempts, blockedUntil: nextBlockedUntil, nextBlockDurationMinutes: nextDuration })
          .where(and(eq(otpThrottle.contact, contact), eq(otpThrottle.action, 'verify')));
      }

      if (nextBlockedUntil) {
        return res.status(429).json({
          success: false,
          error: 'Too many attempts. Account temporary locked.',
          code: 'TOO_MANY_ATTEMPTS',
          blockedUntil: nextBlockedUntil,
          waitMinutes: throttle?.nextBlockDurationMinutes || 5
        });
      }

      res.status(400).json({ 
        success: false, 
        error: 'Invalid or expired code',
        code: 'INVALID_OTP',
        attemptsLeft: Math.max(0, 5 - newAttempts)
      });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// --- Contract Routes ---

// Proxy search to Eneo API
app.get('/api/contract/search/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Contract ID is required' });
  }

  if (!VALIDATORS.CONTRACT.test(id)) {
    return res.status(400).json({ error: 'Invalid contract format' });
  }

  // 1. Check Cache
  const cachedData = contractCache.get(id);
  if (cachedData) {
    return res.json(cachedData);
  }

  try {
    const response = await fetch(`https://connection.eneoapps.com/index.php/search/${id}`);

    if (!response.ok) {
      if (response.status === 422 || response.status === 404) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }
      return res.status(response.status).json({ error: 'Service unavailable' });
    }

    const data = await response.json();

    if (data.status === 'success' && data.data) {
      const result = {
        success: true,
        contract: data.data.contract,
        fullname: data.data.fullname || '',
        branch: data.data.branch || '',
        work_request: data.data.work_request || ''
      };

      // 2. Store in Cache
      contractCache.set(id, result);

      res.json(result);
    } else {
      res.status(404).json({ success: false, error: 'Not found' });
    }
  } catch (error) {
    console.error('Error proxying contract search:', error);
    res.status(500).json({ error: 'Technical error' });
  }
});

// --- Consent Routes ---

// Submit final consent
app.post('/api/consent/submit', async (req, res) => {
  let { contractNumber, clientName, channel, contactValue, language, status, isNotOwner } = req.body;
  const authHeader = req.headers.authorization;

  if (!contractNumber || !clientName || !channel || !contactValue || !language || !status) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Normalize phone if channel is SMS/WHATSAPP to match session token
  if (channel === 'SMS' || channel === 'WHATSAPP') {
    contactValue = normalizePhone(contactValue);
  }

  // [FORTRESS] Verify Session Token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing session token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { contact: string, verified: boolean };

    // Ensure the token matches the contact being submitted
    if (decoded.contact !== contactValue) {
      return res.status(403).json({ error: 'Forbidden: Session contact mismatch' });
    }

    await db.insert(consents).values({
      contractNumber,
      clientName,
      channel,
      contactValue,
      language,
      status,
      isNotOwner,
      ip: req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown',
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Consent recorded' });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }
    console.error('Error recording consent:', error);
    res.status(500).json({ error: 'Internal failure' });
  }
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[CRITICAL]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ── Démarrage — écoute sur toutes les interfaces (0.0.0.0) ──
app.listen(port, host, () => {
  console.log(`✅  Server running on http://${host}:${port}`);

  registerCrons();
  console.log('⏱️  Crons enregistrés');
});