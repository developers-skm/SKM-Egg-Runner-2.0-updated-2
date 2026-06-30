/**
 * FCM send helpers — all server-side via Firebase Admin SDK.
 * No client credentials ever used.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import type { Message, MulticastMessage } from 'firebase-admin/messaging';

const APP_URL = 'https://skm-egg-runner.web.app';
const ICON    = `${APP_URL}/THUMBS_POSE__Egg_-removebg-preview.png`;
const BADGE   = `${APP_URL}/skm-badge-96.png`;

export type NotifPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface PushPayload {
  title:       string;
  body:        string;
  type:        string;
  clickAction: string;
  priority?:   NotifPriority;
  data?:       Record<string, string>;
}

// ─── Get single user's FCM token ──────────────────────────────────────────────

export async function getTokenForUser(uid: string): Promise<string | null> {
  const snap  = await getFirestore().collection('users').doc(uid).get();
  const token = snap.data()?.fcmToken as string | undefined;
  return (token && token.length > 10) ? token : null;
}

// ─── Get all registered tokens ────────────────────────────────────────────────

export async function getAllTokens(): Promise<{ uid: string; token: string }[]> {
  const snap = await getFirestore()
    .collection('users')
    .where('fcmToken', '!=', null)
    .select('fcmToken')
    .get();

  const results: { uid: string; token: string }[] = [];
  snap.forEach(doc => {
    const t = doc.data().fcmToken as string | undefined;
    if (t && t.length > 10) results.push({ uid: doc.id, token: t });
  });
  return results;
}

// ─── Build click-action URL ───────────────────────────────────────────────────

export function clickActionFor(type: string, override?: string): string {
  if (override) return override.startsWith('http') ? override : `${APP_URL}${override}`;

  switch (type) {
    case 'protein_added':
    case 'protein_goal_complete':
    case 'protein_reminder':
    case 'protein_duplicate':
    case 'streak_reminder':
    case 'daily_goal_reminder':
    case 'daily_summary':
    case 'golden_egg_scanned':
    case 'protein_milestone':
    case 'streak_milestone':
      return `${APP_URL}/?tab=tracker`;

    case 'run_completed':
    case 'new_high_score':
    case 'game_reminder':
    case 'mission_complete':
    case 'qr_validated':
      return `${APP_URL}/?tab=game`;

    case 'achievement_unlocked':
    case 'level_up':
    case 'champion_rank_improved':
      return `${APP_URL}/?tab=profile`;

    case 'login':
    case 'system_update':
    case 'admin_announcement':
    default:
      return `${APP_URL}/`;
  }
}

// ─── Build FCM message ────────────────────────────────────────────────────────

function buildMessage(token: string, payload: PushPayload): Message {
  const isHighPri = payload.priority === 'high' || payload.priority === 'urgent';

  return {
    token,
    notification: { title: payload.title, body: payload.body },
    data: {
      type:        payload.type,
      clickAction: payload.clickAction,
      priority:    payload.priority ?? 'normal',
      ...(payload.data ?? {}),
    },
    android: {
      priority: isHighPri ? 'high' : 'normal',
      notification: {
        icon:      'ic_notification',
        color:     '#D71920',
        channelId: isHighPri ? 'skm_urgent' : 'skm_default',
        defaultVibrateTimings: true,
      },
    },
    webpush: {
      notification: {
        title: payload.title,
        body:  payload.body,
        icon:  ICON,
        badge: BADGE,
        requireInteraction: isHighPri,
      },
      fcmOptions: { link: payload.clickAction },
    },
  };
}

// ─── Send to single user ──────────────────────────────────────────────────────

export interface SendResult {
  ok:     boolean;
  uid:    string;
  type:   string;
  error?: string;
}

export async function sendToUser(uid: string, payload: PushPayload): Promise<SendResult> {
  const token = await getTokenForUser(uid);
  if (!token) {
    console.warn(`[FCM] No token for uid ${uid} — push skipped.`);
    return { ok: false, uid, type: payload.type, error: 'no_token' };
  }

  try {
    const msgId = await getMessaging().send(buildMessage(token, payload));
    console.info(`[FCM] ✓ Sent ${payload.type} to uid=${uid} msgId=${msgId}`);
    return { ok: true, uid, type: payload.type };
  } catch (err: any) {
    console.error(`[FCM] ✗ Failed ${payload.type} to uid=${uid}:`, err?.message ?? err);

    if (
      err?.code === 'messaging/registration-token-not-registered' ||
      err?.code === 'messaging/invalid-registration-token'
    ) {
      await getFirestore().collection('users').doc(uid)
        .update({ fcmToken: FieldValue.delete() })
        .catch(() => {});
      console.info(`[FCM] Removed stale token for uid=${uid}`);
    }

    return { ok: false, uid, type: payload.type, error: err?.message ?? String(err) };
  }
}

// ─── Broadcast to all users ───────────────────────────────────────────────────

export interface BroadcastResult {
  ok:      boolean;
  total:   number;
  success: number;
  failure: number;
}

export async function broadcastToAll(payload: PushPayload): Promise<BroadcastResult> {
  const users  = await getAllTokens();
  const tokens = users.map(u => u.token);

  if (tokens.length === 0) {
    console.info('[FCM] Broadcast: no registered tokens.');
    return { ok: true, total: 0, success: 0, failure: 0 };
  }

  console.info(`[FCM] Broadcasting ${payload.type} to ${tokens.length} tokens`);

  const CHUNK = 500;
  let success = 0;
  let failure = 0;

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const chunk = tokens.slice(i, i + CHUNK);
    const multicast: MulticastMessage = {
      tokens: chunk,
      notification: { title: payload.title, body: payload.body },
      data: {
        type:        payload.type,
        clickAction: payload.clickAction,
        priority:    payload.priority ?? 'normal',
        ...(payload.data ?? {}),
      },
      android: {
        priority: 'high',
        notification: {
          icon: 'ic_notification', color: '#D71920',
          channelId: 'skm_urgent', defaultVibrateTimings: true,
        },
      },
      webpush: {
        notification: {
          title: payload.title, body: payload.body,
          icon: ICON, badge: BADGE, requireInteraction: true,
        },
        fcmOptions: { link: payload.clickAction },
      },
    };

    const resp = await getMessaging().sendEachForMulticast(multicast);
    success += resp.successCount;
    failure += resp.failureCount;

    // Clean stale tokens
    const stale: string[] = [];
    resp.responses.forEach((r, idx) => {
      if (!r.success && (
        r.error?.code === 'messaging/registration-token-not-registered' ||
        r.error?.code === 'messaging/invalid-registration-token'
      )) stale.push(chunk[idx]);
    });

    if (stale.length > 0) {
      const db    = getFirestore();
      const batch = db.batch();
      for (const tok of stale) {
        const s = await db.collection('users').where('fcmToken', '==', tok).limit(1).get();
        s.forEach(d => batch.update(d.ref, { fcmToken: FieldValue.delete() }));
      }
      await batch.commit().catch(() => {});
      console.info(`[FCM] Removed ${stale.length} stale tokens.`);
    }

    console.info(`[FCM] Chunk ${Math.floor(i / CHUNK) + 1}: success=${resp.successCount} fail=${resp.failureCount}`);
  }

  return { ok: true, total: tokens.length, success, failure };
}
