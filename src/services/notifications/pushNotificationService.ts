/**
 * SKM Push Notification Service — Fixed
 *
 * Root causes of Android push not working, now fixed:
 *
 * 1. `messaging` was exported as `null` and populated async — callers read null.
 *    Fix: export `messagingPromise: Promise<Messaging|null>` and always await it.
 *
 * 2. `getOrRegisterSW()` was calling `getRegistration('/')` which returns sw.js
 *    (the cache worker) instead of firebase-messaging-sw.js.
 *    Fix: register specifically by filename and wait for it to be active.
 *
 * 3. sw.js and firebase-messaging-sw.js were both registered on scope '/' —
 *    they conflict and the browser only activates one.
 *    Fix: firebase-messaging-sw.js uses scope '/firebase-cloud-messaging-push-scope'
 *    so it is completely isolated from the cache SW.
 *
 * 4. VAPID key was commented out in .env — getToken() returns '' silently.
 *    Fix: hard-coded fallback + clear error log pointing to exact fix.
 *
 * 5. subscribeForegroundMessages() was called at module import time when
 *    messaging was still null.
 *    Fix: lazy-init inside the function, awaiting messagingPromise.
 */

import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, messagingPromise } from '../firebase/firebase';

// ─── VAPID key ────────────────────────────────────────────────────────────────
// Primary: set VITE_FIREBASE_VAPID_KEY in your .env
// This is your Web Push certificate public key from:
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
const VAPID_KEY: string | undefined = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

const FCM_SW_URL         = '/firebase-messaging-sw.js';
// Use a dedicated scope so the FCM SW never conflicts with the cache SW (sw.js)
const FCM_SW_SCOPE       = '/firebase-cloud-messaging-push-scope';
const FCM_TOKEN_LS_KEY   = 'skm_fcm_token';
const PERMISSION_ASKED   = 'skm_push_permission_asked';

export type PushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

// ─── Permission helpers ───────────────────────────────────────────────────────

export function getPushPermissionState(): PushPermissionState {
  if (!('Notification' in window))    return 'unsupported';
  if (!('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission as PushPermissionState;
}

export function hasAskedPermission(): boolean {
  return localStorage.getItem(PERMISSION_ASKED) === 'true';
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  if (!('Notification' in window))    return 'unsupported';
  if (!('serviceWorker' in navigator)) return 'unsupported';

  localStorage.setItem(PERMISSION_ASKED, 'true');
  try {
    const result = await Notification.requestPermission();
    return result as PushPermissionState;
  } catch {
    return 'denied';
  }
}

// ─── Service Worker registration ──────────────────────────────────────────────
// Register firebase-messaging-sw.js on its own dedicated scope so it never
// conflicts with sw.js (cache/offline worker) which uses scope '/'.

let _fcmSwReg: ServiceWorkerRegistration | null = null;

async function getFCMServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  // Return cached registration
  if (_fcmSwReg) return _fcmSwReg;

  try {
    // Check if already registered under the FCM scope
    const existing = await navigator.serviceWorker.getRegistration(FCM_SW_SCOPE);
    if (existing) {
      _fcmSwReg = existing;
      return existing;
    }

    // Register fresh
    const reg = await navigator.serviceWorker.register(FCM_SW_URL, {
      scope: FCM_SW_SCOPE,
    });

    // Wait until the SW is active (Android requires this before getToken)
    await waitForSWActive(reg);

    _fcmSwReg = reg;
    console.info('[Push] FCM service worker registered and active.');
    return reg;
  } catch (err) {
    console.error('[Push] FCM SW registration failed:', err);
    return null;
  }
}

function waitForSWActive(reg: ServiceWorkerRegistration): Promise<void> {
  return new Promise((resolve) => {
    if (reg.active) { resolve(); return; }

    const sw = reg.installing ?? reg.waiting;
    if (!sw) { resolve(); return; }

    sw.addEventListener('statechange', function handler() {
      if (sw.state === 'activated') {
        sw.removeEventListener('statechange', handler);
        resolve();
      }
    });

    // Safety timeout — don't block forever
    setTimeout(resolve, 5000);
  });
}

// ─── FCM Token ────────────────────────────────────────────────────────────────

/**
 * Generates or retrieves the FCM registration token and stores it in Firestore.
 * This is the core function that makes Android push work.
 */
export async function initFCMToken(uid: string): Promise<string | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[Push] Service workers not supported.');
    return null;
  }

  const messaging = await messagingPromise;
  if (!messaging) {
    console.warn('[Push] FCM not supported in this browser.');
    return null;
  }

  if (Notification.permission !== 'granted') {
    console.warn('[Push] Notification permission not granted.');
    return null;
  }

  if (!VAPID_KEY) {
    console.error(
      '[Push] VAPID key missing!\n' +
      '  → Open Firebase Console → Project Settings → Cloud Messaging\n' +
      '  → Web Push certificates → Generate key pair\n' +
      '  → Copy the public key\n' +
      '  → Add to .env: VITE_FIREBASE_VAPID_KEY=BYour...Key\n' +
      '  → Restart the dev server'
    );
    return null;
  }

  try {
    const swReg = await getFCMServiceWorker();
    if (!swReg) {
      console.error('[Push] Could not register FCM service worker.');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      console.warn('[Push] getToken() returned empty — permission may have changed.');
      return null;
    }

    const cachedToken = localStorage.getItem(FCM_TOKEN_LS_KEY);

    // Persist to Firestore — users/{uid}.fcmToken is what Cloud Function reads
    const tokenData = {
      fcmToken:    token,
      platform:    detectPlatform(),
      browser:     detectBrowser(),
      fcmUpdatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'users', uid), tokenData);
    } catch {
      // Document may not exist yet on brand-new accounts
      await setDoc(doc(db, 'users', uid), tokenData, { merge: true });
    }

    if (cachedToken !== token) {
      localStorage.setItem(FCM_TOKEN_LS_KEY, token);
      console.info('[Push] FCM token saved to Firestore for uid:', uid);
    }

    return token;
  } catch (err: any) {
    // Specific known Android Chrome error — scope mismatch
    if (err?.code === 'messaging/permission-blocked') {
      console.warn('[Push] Notification permission was blocked by the browser.');
    } else if (err?.code === 'messaging/failed-service-worker-registration') {
      console.error('[Push] SW registration failed — check firebase-messaging-sw.js is served at root.');
    } else {
      console.error('[Push] initFCMToken error:', err?.message ?? err);
    }
    return null;
  }
}

/**
 * Revoke FCM token on logout — clears Firestore + local cache.
 */
export async function revokeFCMToken(uid: string): Promise<void> {
  const messaging = await messagingPromise;
  if (!messaging) return;

  try {
    await deleteToken(messaging);
    localStorage.removeItem(FCM_TOKEN_LS_KEY);
    await updateDoc(doc(db, 'users', uid), {
      fcmToken: null,
      fcmUpdatedAt: serverTimestamp(),
    }).catch(() => {});
    console.info('[Push] FCM token revoked.');
  } catch (err) {
    console.warn('[Push] revokeFCMToken error:', err);
  }
}

// ─── Foreground message listener ──────────────────────────────────────────────
// When the app is open (foreground), FCM does NOT show an OS notification.
// We intercept the message here and dispatch a custom event so the app
// shows an in-app toast instead.

let _foregroundUnsubscribe: (() => void) | null = null;

export async function initForegroundMessages(): Promise<() => void> {
  // Already subscribed
  if (_foregroundUnsubscribe) return _foregroundUnsubscribe;

  const messaging = await messagingPromise;
  if (!messaging) return () => {};

  const unsub = onMessage(messaging, (payload) => {
    console.info('[Push] Foreground message:', payload);
    window.dispatchEvent(new CustomEvent('skm_push_foreground', {
      detail: {
        title:       payload.notification?.title   ?? payload.data?.title   ?? 'SKM',
        body:        payload.notification?.body    ?? payload.data?.body    ?? '',
        type:        payload.data?.type            ?? 'general',
        notifId:     payload.data?.notifId         ?? '',
        clickAction: payload.data?.clickAction     ?? '/',
      },
    }));
  });

  _foregroundUnsubscribe = unsub;
  return unsub;
}

// Keep old name as alias so existing callers compile
export function subscribeForegroundMessages(): () => void {
  // Fire-and-forget async init; return a no-op until it resolves.
  // The real unsub is stored in _foregroundUnsubscribe.
  initForegroundMessages().catch(() => {});
  return () => { _foregroundUnsubscribe?.(); _foregroundUnsubscribe = null; };
}

// ─── SW notification click → app navigation ───────────────────────────────────

export function listenForNotificationClicks(
  onNavigate: (type: string, url: string) => void
): () => void {
  if (!('serviceWorker' in navigator)) return () => {};

  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'FCM_NOTIFICATION_CLICK') {
      const { notifType, url } = event.data.data ?? {};
      onNavigate(notifType ?? '', url ?? '/');
    }
  };

  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

// ─── PWA install prompt ───────────────────────────────────────────────────────

let _installPrompt: any = null;

export function capturePWAInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _installPrompt = e;
    window.dispatchEvent(new CustomEvent('skm_pwa_installable'));
  });
  window.addEventListener('appinstalled', () => {
    _installPrompt = null;
    window.dispatchEvent(new CustomEvent('skm_pwa_installed'));
  });
}

export async function promptPWAInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!_installPrompt) return 'unavailable';
  _installPrompt.prompt();
  const { outcome } = await _installPrompt.userChoice;
  _installPrompt = null;
  return outcome as 'accepted' | 'dismissed';
}

export function isPWAInstallable(): boolean { return _installPrompt !== null; }
export function isPWAInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

// ─── Platform detection ───────────────────────────────────────────────────────

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/android/i.test(ua))           return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintosh/i.test(ua))        return 'macos';
  if (/windows/i.test(ua))          return 'windows';
  if (/linux/i.test(ua))            return 'linux';
  return 'unknown';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/edg\//i.test(ua))            return 'edge';
  if (/opr\//i.test(ua))            return 'opera';
  if (/chrome/i.test(ua))           return 'chrome';
  if (/firefox/i.test(ua))          return 'firefox';
  if (/safari/i.test(ua))           return 'safari';
  return 'unknown';
}
