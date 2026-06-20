/**
 * SKM EGG RUNNER — QR Validation Service
 *
 * Firestore collection: qrCodes/{code}
 * Document fields:
 *   code:      string   — e.g. "EGG-0001"
 *   maxPlays:  number   — how many total game sessions this QR allows (default 2)
 *   playCount: number   — how many times it has already been used
 *   active:    boolean  — false = permanently disabled regardless of count
 *   createdAt: Timestamp
 */

import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const COLLECTION = 'qrCodes';

export type QRValidationResult =
  | { ok: true;  remaining: number; unlimited?: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'INACTIVE' | 'LIMIT_REACHED' | 'ERROR'; message: string };

// Codes that bypass Firestore and grant unlimited access
const GOLDEN_PASS_CODES = new Set(['SKM-GOLDEN-PASS']);

/**
 * Validates a scanned QR code against Firestore and atomically increments
 * playCount if the code is valid and under its maxPlays limit.
 */
export async function validateAndUseQR(rawCode: string): Promise<QRValidationResult> {
  const code = rawCode.trim().replace(/\s+/g, '').toUpperCase();

  // ── Golden Pass — unlimited access, no Firestore read or write ───────────
  if (GOLDEN_PASS_CODES.has(code)) {
    console.log(`[QR] GOLDEN PASS detected — unlimited access granted`);
    return { ok: true, remaining: -1, unlimited: true };
  }

  const ref  = doc(db, COLLECTION, code);

  console.log(`[QR] Collection : ${COLLECTION}`);
  console.log(`[QR] Document ID: ${code}`);

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);

      if (!snap.exists()) {
        console.warn(`[QR] Document NOT found → qrCodes/${code}`);
        return {
          ok:     false as const,
          reason: 'NOT_FOUND' as const,
          message: 'Invalid QR Code. Please scan a valid SKM QR.',
        };
      }

      const data      = snap.data();
      const active:    boolean = data.active    ?? true;
      const playCount: number  = data.playCount ?? 0;
      const maxPlays:  number  = data.maxPlays  ?? 2;

      console.log(`[QR] Document found → qrCodes/${code}`);
      console.log(`[QR] active    : ${active}`);
      console.log(`[QR] playCount : ${playCount}`);
      console.log(`[QR] maxPlays  : ${maxPlays}`);

      if (!active) {
        console.warn(`[QR] BLOCKED — code is inactive`);
        return {
          ok:     false as const,
          reason: 'INACTIVE' as const,
          message: 'This QR code has been disabled.',
        };
      }

      if (playCount >= maxPlays) {
        console.warn(`[QR] BLOCKED — limit reached (${playCount}/${maxPlays})`);
        return {
          ok:     false as const,
          reason: 'LIMIT_REACHED' as const,
          message: `QR Already Used. Maximum usage limit reached (${playCount}/${maxPlays}).`,
        };
      }

      // Atomically increment playCount
      tx.update(ref, { playCount: playCount + 1 });

      const remaining = maxPlays - (playCount + 1);
      console.log(`[QR] ALLOWED — playCount incremented to ${playCount + 1}/${maxPlays}, remaining: ${remaining}`);

      return { ok: true as const, remaining };
    });

    return result;
  } catch (err: any) {
    console.error('[QR] Firestore error:', err?.message ?? err);
    return {
      ok:     false,
      reason: 'ERROR',
      message: 'Network error. Please check your connection and try again.',
    };
  }
}
