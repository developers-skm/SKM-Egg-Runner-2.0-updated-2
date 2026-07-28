/**
 * Generic activity audit trail — one shared writer so every feature logs
 * the same shape (uid, action, timestamp, device, platform, success/failure)
 * instead of each service reinventing its own fields (see qrOperationLogs /
 * broadcast_logs, which predate this and keep their own bespoke shape).
 *
 * Firestore: auditLogs/{id} — append-only (create-only rule), each user can
 * read their own entries, developers can read all.
 */

import { addDoc, collection, getDocs, limit as fsLimit, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export type AuditAction =
  | 'login' | 'logout'
  | 'qr_scan' | 'reward_claimed' | 'coupon_redeemed'
  | 'stage_completed' | 'membership_changed' | 'health_profile_updated'
  | 'developer_action' | 'app_error';

export interface AuditLogEntry {
  id:        string;
  uid:       string;
  action:    AuditAction;
  detail:    string;
  success:   boolean;
  device:    string;
  platform:  string;
  createdAt: unknown;
}

function detectDevicePlatform(): { device: string; platform: string } {
  const ua = navigator.userAgent;
  const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';
  let platform = 'Unknown';
  if (/Android/i.test(ua)) platform = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iOS';
  else if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Mac OS/i.test(ua)) platform = 'macOS';
  else if (/Linux/i.test(ua)) platform = 'Linux';
  return { device, platform };
}

/**
 * Fire-and-forget by design — an audit log write must never block or fail
 * the user-facing action it's recording. Callers should not await this in
 * a way that delays their own success path; call it after the real action
 * has already committed.
 */
export function writeAuditLog(uid: string, action: AuditAction, detail: string, success: boolean): void {
  const { device, platform } = detectDevicePlatform();
  addDoc(collection(db, 'auditLogs'), {
    uid, action, detail, success, device, platform,
    createdAt: serverTimestamp(),
  }).catch(err => console.error('[auditLogService] write failed:', action, err?.message ?? err));
}

export async function getAuditLogsForUser(uid: string, max = 100): Promise<AuditLogEntry[]> {
  const q = query(
    collection(db, 'auditLogs'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    fsLimit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLogEntry));
}
