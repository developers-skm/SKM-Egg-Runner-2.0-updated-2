/**
 * Firebase ID Token auth guard.
 *
 * Every /notify/* route requires:
 *   Authorization: Bearer <Firebase ID Token>
 *
 * The server verifies the token with Admin SDK.
 * Only the token owner can trigger their own notifications
 * (uid in the token must match uid in the request body).
 */

import type { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  uid: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header. Expected: Bearer <idToken>' });
    return;
  }

  const idToken = authHeader.slice(7);
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    (req as AuthRequest).uid = decoded.uid;
    next();
  } catch (err: any) {
    console.warn('[Auth] verifyIdToken failed:', err?.message ?? err);
    res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }
}
