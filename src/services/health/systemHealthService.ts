/**
 * System Health Monitor — lightweight, on-demand connectivity probes for
 * each backend dependency. Dev-only diagnostics, not a production feature;
 * every probe is read-only (or, for Cloud Functions, reads a doc that
 * already exists) so running this can never mutate user data.
 */

import { doc, getDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import { db, auth, messagingPromise } from '../firebase/firebase';

export type HealthStatus = 'healthy' | 'warning' | 'offline';

export interface HealthCheckResult {
  name:      string;
  status:    HealthStatus;
  detail:    string;
  latencyMs: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

function statusForLatency(ms: number, warnAt: number): HealthStatus {
  return ms > warnAt ? 'warning' : 'healthy';
}

async function checkFirestore(): Promise<HealthCheckResult> {
  try {
    const { ms } = await timed(() => getDocs(query(collection(db, 'rewardCatalog'), limit(1))));
    return { name: 'Firestore', status: statusForLatency(ms, 2000), detail: `Read succeeded in ${ms}ms`, latencyMs: ms };
  } catch (err) {
    return { name: 'Firestore', status: 'offline', detail: (err as Error)?.message ?? 'Read failed', latencyMs: -1 };
  }
}

async function checkAuth(): Promise<HealthCheckResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { name: 'Authentication', status: 'warning', detail: 'No signed-in user', latencyMs: 0 };
    const { ms } = await timed(() => user.getIdToken(false));
    return { name: 'Authentication', status: statusForLatency(ms, 1500), detail: `Token valid, refreshed in ${ms}ms`, latencyMs: ms };
  } catch (err) {
    return { name: 'Authentication', status: 'offline', detail: (err as Error)?.message ?? 'Token refresh failed', latencyMs: -1 };
  }
}

async function checkNotificationService(): Promise<HealthCheckResult> {
  try {
    const { value: messaging, ms } = await timed(() => messagingPromise);
    if (!messaging) return { name: 'Notification Service', status: 'warning', detail: 'FCM unsupported in this browser', latencyMs: ms };
    return { name: 'Notification Service', status: 'healthy', detail: `FCM initialized in ${ms}ms`, latencyMs: ms };
  } catch (err) {
    return { name: 'Notification Service', status: 'offline', detail: (err as Error)?.message ?? 'FCM init failed', latencyMs: -1 };
  }
}

async function checkRewardEngine(uid: string): Promise<HealthCheckResult> {
  try {
    const { ms } = await timed(() => getDoc(doc(db, 'rewardWallet', uid)));
    return { name: 'Reward Engine', status: statusForLatency(ms, 2000), detail: `Wallet read in ${ms}ms`, latencyMs: ms };
  } catch (err) {
    return { name: 'Reward Engine', status: 'offline', detail: (err as Error)?.message ?? 'Wallet read failed', latencyMs: -1 };
  }
}

async function checkQrValidation(): Promise<HealthCheckResult> {
  try {
    const { ms } = await timed(() => getDocs(query(collection(db, 'qrCodes'), limit(1))));
    return { name: 'QR Validation', status: statusForLatency(ms, 2000), detail: `qrCodes reachable in ${ms}ms`, latencyMs: ms };
  } catch (err) {
    return { name: 'QR Validation', status: 'offline', detail: (err as Error)?.message ?? 'qrCodes read failed', latencyMs: -1 };
  }
}

async function checkGameProgress(uid: string): Promise<HealthCheckResult> {
  try {
    const { ms } = await timed(() => getDoc(doc(db, 'users', uid, 'gameStats', 'summary')));
    return { name: 'Game Progress', status: statusForLatency(ms, 2000), detail: `gameStats read in ${ms}ms`, latencyMs: ms };
  } catch (err) {
    return { name: 'Game Progress', status: 'offline', detail: (err as Error)?.message ?? 'gameStats read failed', latencyMs: -1 };
  }
}

async function checkCloudFunctions(): Promise<HealthCheckResult> {
  // No callable HTTPS function exists to ping directly (see functions/src/index.ts —
  // only Firestore triggers + a scheduled job). Infer health from the last
  // fcmDelivered confirmation a trigger wrote back, which only a live Cloud
  // Function could have set.
  try {
    const { value: snap, ms } = await timed(() =>
      getDocs(query(collection(db, 'notifications'), limit(5)))
    );
    const anyDelivered = snap.docs.some(d => d.data().fcmDelivered === true);
    return {
      name: 'Cloud Functions',
      status: anyDelivered ? 'healthy' : 'warning',
      detail: anyDelivered ? `Delivery confirmation observed (${ms}ms)` : 'No recent fcmDelivered confirmation seen',
      latencyMs: ms,
    };
  } catch (err) {
    return { name: 'Cloud Functions', status: 'offline', detail: (err as Error)?.message ?? 'Read failed', latencyMs: -1 };
  }
}

export async function runHealthChecks(uid: string): Promise<HealthCheckResult[]> {
  return Promise.all([
    checkFirestore(),
    checkAuth(),
    checkNotificationService(),
    checkRewardEngine(uid),
    checkQrValidation(),
    checkGameProgress(uid),
    checkCloudFunctions(),
  ]);
}
