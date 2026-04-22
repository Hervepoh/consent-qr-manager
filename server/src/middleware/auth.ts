import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to protect administrative routes using a shared secret.
 * In a real-world scenario, this would be replaced with JWT or Session-based auth.
 */
export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const adminSecret = process.env.ADMIN_SECRET;
  
  if (!adminSecret) {
    console.error('[SECURITY CRITICAL] ADMIN_SECRET is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const clientSecret = req.headers['x-admin-secret'];

  if (clientSecret === adminSecret) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Admin access required' });
  }
};
