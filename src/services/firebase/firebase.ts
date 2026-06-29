/**
 * SKM EGG RUNNER — Firebase Initialization
 * Single source of truth for all Firebase service instances.
 * Import from here in every service file.
 */

import { initializeApp, FirebaseApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  connectAuthEmulator,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getAnalytics, Analytics, isSupported } from 'firebase/analytics';
import { getMessaging, Messaging, isSupported as isMessagingSupported } from 'firebase/messaging';

// ─────────────────────────────────────────────
// Firebase project config (populated from .env)
// ─────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     as string,
};

// Prevent double-initialisation during HMR
const app: FirebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

// Auth instance — persisted across page reloads
export const auth: Auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {
  // Silently ignore — falls back to session persistence
});

// Firestore instance
export const db: Firestore = getFirestore(app);

// Analytics (only in browser environments that support it)
let analytics: Analytics | null = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
}).catch(() => {});
export { analytics };

// ─────────────────────────────────────────────
// Firebase Cloud Messaging
//
// IMPORTANT: isMessagingSupported() is async.
// Export a Promise<Messaging|null> so callers always await the real instance
// instead of reading a null that hasn't been resolved yet.
// ─────────────────────────────────────────────
export const messagingPromise: Promise<Messaging | null> = isMessagingSupported()
  .then((supported) => supported ? getMessaging(app) : null)
  .catch(() => null);

// Convenience re-export used by the SW eligibility check
export { isMessagingSupported };

// ─────────────────────────────────────────────
// Emulator support for local development
// ─────────────────────────────────────────────
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}

export default app;
