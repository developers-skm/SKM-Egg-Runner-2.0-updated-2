/**
 * SKM EGG RUNNER — Mobile OTP Auth Service
 * Real Firebase Phone Authentication with invisible reCAPTCHA.
 *
 * reCAPTCHA strategy: create a hidden <div> directly on document.body
 * (outside React's render tree) so React never clobbers it. On every
 * sendOtp call we destroy the old verifier + div and create a fresh one.
 * This avoids "reCAPTCHA has already been rendered in this element".
 */

import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { auth } from '../services/firebase/firebase';

let recaptchaVerifier: RecaptchaVerifier | null = null;
let recaptchaContainer: HTMLDivElement | null = null;

export interface OtpSendResult {
  success: boolean;
  error?: string;
  confirmationResult?: ConfirmationResult;
}

export interface OtpVerifyResult {
  success: boolean;
  error?: string;
  uid?: string;
}

// ─────────────────────────────────────────────────────────────
// destroyRecaptcha — tears down verifier + removes DOM node
// ─────────────────────────────────────────────────────────────
function destroyRecaptcha(): void {
  try { recaptchaVerifier?.clear(); } catch { /* ignore */ }
  recaptchaVerifier = null;

  if (recaptchaContainer && recaptchaContainer.parentNode) {
    recaptchaContainer.parentNode.removeChild(recaptchaContainer);
  }
  recaptchaContainer = null;
}

// ─────────────────────────────────────────────────────────────
// createRecaptcha — makes a fresh hidden div + verifier
// ─────────────────────────────────────────────────────────────
function createRecaptcha(): void {
  destroyRecaptcha(); // always start clean

  // Append a brand-new hidden div to body (outside React tree)
  const div = document.createElement('div');
  div.id = 'recaptcha-' + Date.now();
  div.style.display = 'none';
  document.body.appendChild(div);
  recaptchaContainer = div;

  recaptchaVerifier = new RecaptchaVerifier(auth, div.id, {
    size: 'invisible',
    callback: () => { /* solved */ },
    'expired-callback': () => { destroyRecaptcha(); },
  });
}

// ─────────────────────────────────────────────────────────────
// sendOtp
// phoneNumber must include country code, e.g. "+919876543210"
// ─────────────────────────────────────────────────────────────
export async function sendOtp(phoneNumber: string): Promise<OtpSendResult> {
  const cleaned = phoneNumber.trim();
  if (!cleaned || cleaned.length < 8) {
    return { success: false, error: 'Please enter a valid mobile number.' };
  }

  // Always create a fresh reCAPTCHA for each send attempt
  createRecaptcha();

  try {
    console.log('[OTP] Sending to', cleaned);
    const confirmationResult = await signInWithPhoneNumber(
      auth,
      cleaned,
      recaptchaVerifier!,
    );
    console.log('[OTP] SMS sent successfully');
    return { success: true, confirmationResult };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? '';
    const rawMessage = (err as { message?: string }).message ?? '';
    console.error('[OTP] sendOtp error — code:', code, '| message:', rawMessage);
    destroyRecaptcha();
    return { success: false, error: mapFirebaseError(code) };
  }
}

// ─────────────────────────────────────────────────────────────
// confirmOtp — verifies the 6-digit code
// ─────────────────────────────────────────────────────────────
export async function confirmOtp(
  confirmationResult: ConfirmationResult,
  code: string,
): Promise<OtpVerifyResult> {
  if (!code || code.trim().length !== 6) {
    return { success: false, error: 'Please enter the 6-digit code.' };
  }
  try {
    const credential = await confirmationResult.confirm(code.trim());
    return { success: true, uid: credential.user.uid };
  } catch (err: unknown) {
    const firebaseCode = (err as { code?: string }).code ?? '';
    console.error('[OTP] confirmOtp error — code:', firebaseCode);
    return { success: false, error: mapFirebaseError(firebaseCode) };
  }
}

// ─────────────────────────────────────────────────────────────
// mapFirebaseError — user-friendly messages
// ─────────────────────────────────────────────────────────────
function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'Invalid phone number format. Please check and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/quota-exceeded':
      return 'SMS quota exceeded. Please try again later.';
    case 'auth/captcha-check-failed':
    case 'auth/recaptcha-not-enabled':
      return 'Verification failed. Please refresh the page and try again.';
    case 'auth/invalid-verification-code':
      return 'Incorrect OTP. Please check the code and try again.';
    case 'auth/code-expired':
      return 'OTP expired. Please request a new code.';
    case 'auth/session-expired':
      return 'Session expired. Please resend the OTP.';
    case 'auth/missing-phone-number':
      return 'Please enter your mobile number.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Phone sign-in is not enabled. Please contact support.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
