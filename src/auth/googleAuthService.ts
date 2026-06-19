/**
 * SKM EGG RUNNER — Google Authentication Service
 * Handles sign-in and sign-out only.
 * Profile creation is intentionally NOT done here —
 * ProfileSetupScreen handles new-user profile creation.
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
  AuthError,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase/firebase';

export interface GoogleAuthResult {
  success: boolean;
  user?: User;
  error?: string;
  redirectInitiated?: boolean;
}

const provider = new GoogleAuthProvider();
provider.addScope('profile');
provider.addScope('email');
provider.setCustomParameters({ prompt: 'select_account' });

// ── checkRedirectResult ───────────────────────────────────────────────────────
// Called on app mount to catch users returning from redirect flow.

export async function checkRedirectResult(): Promise<GoogleAuthResult> {
  try {
    const result = await getRedirectResult(auth);
    if (!result) return { success: false };
    // Update lastLogin only — don't touch profile fields
    await setDoc(doc(db, 'users', result.user.uid), { lastLogin: serverTimestamp() }, { merge: true });
    return { success: true, user: result.user };
  } catch (err) {
    const error = err as AuthError;
    return { success: false, error: mapError(error.code) };
  }
}

// ── signInWithGoogle ──────────────────────────────────────────────────────────
// Popup on desktop, redirect on mobile. Does NOT create a Firestore profile —
// that is handled by ProfileSetupScreen after first login.

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    try {
      await signInWithRedirect(auth, provider);
      return { success: false, redirectInitiated: true };
    } catch (err) {
      return { success: false, error: mapError((err as AuthError).code) };
    }
  }

  try {
    const credential = await signInWithPopup(auth, provider);
    // Update lastLogin timestamp for returning users (merge so new users are unaffected)
    await setDoc(doc(db, 'users', credential.user.uid), { lastLogin: serverTimestamp() }, { merge: true });
    return { success: true, user: credential.user };
  } catch (err) {
    const error = err as AuthError;
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      return { success: false, error: '' };
    }
    if (error.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirect(auth, provider);
        return { success: false, redirectInitiated: true };
      } catch (r) {
        return { success: false, error: mapError((r as AuthError).code) };
      }
    }
    return { success: false, error: mapError(error.code) };
  }
}

// ── signOutGoogle ─────────────────────────────────────────────────────────────

export async function signOutGoogle(): Promise<{ success: boolean; error?: string }> {
  try {
    await signOut(auth);
    return { success: true };
  } catch (err) {
    return { success: false, error: mapError((err as AuthError).code) };
  }
}

// ── error mapping ─────────────────────────────────────────────────────────────

function mapError(code: string): string {
  const map: Record<string, string> = {
    'auth/configuration-not-found':
      'Google Sign-In is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.',
    'auth/network-request-failed':  'Network error. Please check your connection.',
    'auth/too-many-requests':       'Too many attempts. Please wait and try again.',
    'auth/user-disabled':           'This account has been disabled.',
    'auth/operation-not-allowed':   'Google sign-in is not enabled in Firebase.',
    'auth/unauthorized-domain':     'This domain is not authorised in Firebase Console.',
    'auth/internal-error':          'An internal error occurred. Please try again.',
  };
  return map[code] ?? `Sign-in error (${code}). Please try again.`;
}
