import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { db } from './db';
import { otps, consents } from './db/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import { SMSService } from './services/sms.service';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const VALIDATORS = {
  PHONE: /^(\+237|237)?\s?(6|2)\d{8}$/,
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  CONTRACT: /^\d{9}$/
};

// --- OTP Routes ---

// Send OTP
app.post('/api/otp/send', async (req, res) => {
  const { contact, channel } = req.body;
  
  if (!contact || !channel) {
    return res.status(400).json({ error: 'Contact and channel are required' });
  }

  // Validation
  if (channel === 'EMAIL' && !VALIDATORS.EMAIL.test(contact)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if ((channel === 'SMS' || channel === 'WHATSAPP') && !VALIDATORS.PHONE.test(contact)) {
    return res.status(400).json({ error: 'Invalid phone format (+237 or 6/2 xxxxxxxx)' });
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

  try {
    // Save to DB
    await db.insert(otps).values({
      contact,
      code,
      expiresAt,
      ip: req.ip || req.headers['x-forwarded-for']?.toString(),
      userAgent: req.headers['user-agent']
    });

    // Send via SMS (if channel is SMS or WHATSAPP - logic can be refined)
    if (channel === 'SMS' || channel === 'WHATSAPP') {
      await SMSService.sendOTP(contact, code);
    } else {
      console.log(`[EMAIL MOCK] Sending OTP ${code} to ${contact}`);
    }

    res.json({ success: true, message: 'OTP sent' });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP
app.post('/api/otp/verify', async (req, res) => {
  const { contact, code } = req.body;

  if (!contact || !code) {
    return res.status(400).json({ error: 'Contact and code are required' });
  }

  try {
    const latestOtp = await db.query.otps.findFirst({
      where: and(
        eq(otps.contact, contact),
        eq(otps.code, code),
        gt(otps.expiresAt, new Date())
      ),
      orderBy: [desc(otps.createdAt)],
    });

    if (latestOtp) {
      res.json({ success: true, message: 'OTP verified' });
    } else {
      res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
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
    return res.status(400).json({ error: 'Contract ID must be 9 digits' });
  }

  try {
    const response = await fetch(`https://connection.eneoapps.com/index.php/search/${id}`);
    
    if (!response.ok) {
      if (response.status === 422 || response.status === 404) {
        return res.status(404).json({ success: false, error: 'Contract not found' });
      }
      return res.status(response.status).json({ error: 'External API error' });
    }

    const data = await response.json();
    
    if (data.status === 'success' && data.data) {
      res.json({ 
        success: true, 
        contract: data.data.contract,
        fullname: data.data.fullname || '',
        branch: data.data.branch || '',
        work_request: data.data.work_request || ''
      });
    } else {
      res.status(404).json({ success: false, error: 'Contract not found' });
    }
  } catch (error) {
    console.error('Error proxying contract search:', error);
    res.status(500).json({ error: 'Internal server error during search' });
  }
});

// --- Consent Routes ---

// Submit final consent
app.post('/api/consent/submit', async (req, res) => {
  const { contractNumber, clientName, channel, contactValue, language, status, isNotOwner } = req.body;

  if (!contractNumber || !clientName || !channel || !contactValue || !language || !status) {
    return res.status(400).json({ error: 'Missing required consent fields' });
  }

  try {
    await db.insert(consents).values({
      contractNumber,
      clientName,
      channel,
      contactValue,
      language,
      status,
      isNotOwner,
      ip: req.ip || req.headers['x-forwarded-for']?.toString(),
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Consent stored successfully' });
  } catch (error) {
    console.error('Error storing consent:', error);
    res.status(500).json({ error: 'Failed to store consent' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
