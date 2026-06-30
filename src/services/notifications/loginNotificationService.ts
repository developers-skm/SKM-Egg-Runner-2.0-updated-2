/**
 * SKM Login Notification Service
 *
 * After login + FCM token confirmed in Firestore:
 *   STEP 5 — POST /notify/login to Render server
 *   STEP 6 — Render server reads FCM token via Admin SDK
 *   STEP 7 — Admin SDK calls messaging.send() → push arrives on device
 *
 * Config:
 *   VITE_ENABLE_LOGIN_NOTIFICATION=true   (default — testing)
 *   VITE_ENABLE_LOGIN_NOTIFICATION=false  (disable)
 */

import { getTokenForUser } from './fcmSender';
import { renderNotify }    from './renderNotificationService';

const ENABLE = import.meta.env.VITE_ENABLE_LOGIN_NOTIFICATION !== 'false';

// One send per browser session per uid
const _sentThisSession = new Set<string>();

export async function sendLoginNotification(uid: string, email?: string): Promise<void> {
  if (!ENABLE) {
    console.info('[Render] Login notification disabled (VITE_ENABLE_LOGIN_NOTIFICATION=false).');
    return;
  }

  if (_sentThisSession.has(uid)) {
    console.info('[Render] Login notification already sent this session, uid:', uid);
    return;
  }
  _sentThisSession.add(uid);

  console.info('[Render] ── Login Notification Pipeline ──────────────────────');
  console.info('[Render] uid:', uid, '| email:', email ?? '—');

  // Confirm token exists in Firestore before calling Render
  const token = await getTokenForUser(uid);
  if (!token) {
    console.warn('[Render] STEP 5 SKIPPED — No FCM token in Firestore for uid:', uid);
    console.warn('[Render]   → User must open app, allow notifications, and reload once.');
    return;
  }
  console.info('[Render] Token confirmed ✓ (prefix:', token.substring(0, 20) + '...)');

  // STEP 5+6+7 — POST to Render, server delivers push
  console.info('[Render] STEP 5 — Calling POST /notify/login...');
  const ok = await renderNotify.login(uid, email);

  if (ok) {
    console.info('[Render] STEP 6 — Render server processed request ✓');
    console.info('[Render] STEP 7 — Push Notification Sent via Admin SDK ✓');
    console.info('[Render] ── Pipeline Complete ✓ ───────────────────────────');
  } else {
    console.warn('[Render] /notify/login returned success=false — check Render server logs.');
    console.warn('[Render]   Possible causes:');
    console.warn('[Render]   1. VITE_RENDER_API_URL not set in .env');
    console.warn('[Render]   2. Render server not deployed yet');
    console.warn('[Render]   3. FIREBASE_SERVICE_ACCOUNT_JSON not set on Render');
    console.warn('[Render]   4. User FCM token expired or device offline');
  }
}
