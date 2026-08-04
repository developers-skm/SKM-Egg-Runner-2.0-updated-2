/**
 * SKM Protein Wallet — "Smart Egg Bank"
 *
 * Firestore collection:
 *   proteinWallet/{uid}/items/{itemId}   — qrId, protein, status, storedAt, expiresAt, ...
 *
 * Scanning an SKM QR no longer awards protein immediately — it stores an
 * egg here (max 5, FIFO, 30-day expiry). The QR's global ownership claim
 * (qrCodes/{code}.proteinConsumed) still happens exactly as before, at
 * store time — QR validation/security is untouched (see qrService.ts).
 *
 * Only consuming a stored egg (consumeNextWalletEgg) runs the reward-side
 * transaction (streak, points, challenges, daily stats) — and only the
 * day's first consumption counts toward those; see awardWalletConsumption
 * in proteinTrackerService.ts, which this service calls but does not
 * duplicate.
 */

import {
  doc, collection, getDoc, getDocs, setDoc,
  serverTimestamp, Timestamp, increment, runTransaction,
  query, where, orderBy, limit,
} from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { PROTEIN_PER_EGG, CALORIES_PER_EGG, awardWalletConsumption, logManualEntryFromWallet, todayKey, getWeekKey } from './proteinTrackerService';

const WALLET_CAPACITY = 5;
const EXPIRY_DAYS = 30;
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export type WalletItemStatus = 'stored' | 'consumed' | 'expired' | 'replaced';

export interface WalletEggItem {
  id: string;
  uid: string;
  qrId: string;
  eggType: string;
  protein: number;
  calories: number;
  status: WalletItemStatus;
  storedAt: Timestamp;
  expiresAt: Timestamp;
  consumedAt: Timestamp | null;
  replacedAt: Timestamp | null;
  replacedByQrId: string | null;
  source: 'qr_scan';
}

export interface WalletWeeklySnapshot {
  walletWeekKey: string | null;
  walletWeekStoredCount: number;
  walletWeekConsumedCount: number;
  walletWeekExpiredCount: number;
  /** {date, balance} samples taken once per day this week — capped at 7, used for the average/highest/lowest balance stats and the dashboard mini-graph. */
  walletWeekBalanceSamples: { date: string; balance: number }[];
  walletPrevWeekStoredCount: number;
  walletPrevWeekConsumedCount: number;
  walletPrevWeekExpiredCount: number;
}

export interface WalletSummary extends WalletWeeklySnapshot {
  walletEggsStored: number;
  walletProteinAvailable: number;
  walletNextExpiryAt: Timestamp | null;
  walletLastConsumedDate: string | null;
  walletEggsStoredTotal: number;
  walletEggsConsumedTotal: number;
  walletEggsExpiredTotal: number;
  walletEggsReplacedTotal: number;
}

const DEFAULT_SUMMARY: WalletSummary = {
  walletEggsStored: 0,
  walletProteinAvailable: 0,
  walletNextExpiryAt: null,
  walletLastConsumedDate: null,
  walletEggsStoredTotal: 0,
  walletEggsConsumedTotal: 0,
  walletEggsExpiredTotal: 0,
  walletEggsReplacedTotal: 0,
  walletWeekKey: null,
  walletWeekStoredCount: 0,
  walletWeekConsumedCount: 0,
  walletWeekExpiredCount: 0,
  walletWeekBalanceSamples: [],
  walletPrevWeekStoredCount: 0,
  walletPrevWeekConsumedCount: 0,
  walletPrevWeekExpiredCount: 0,
};

function itemsCol(uid: string) {
  return collection(db, 'proteinWallet', uid, 'items');
}

// ─────────────────────────────────────────────────────────────
// READS
// ─────────────────────────────────────────────────────────────

export async function getWalletItems(uid: string, status?: WalletItemStatus): Promise<WalletEggItem[]> {
  const q = status
    ? query(itemsCol(uid), where('status', '==', status), orderBy('storedAt', 'asc'))
    : query(itemsCol(uid), orderBy('storedAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as WalletEggItem));
}

export async function getWalletSummary(uid: string): Promise<WalletSummary> {
  const snap = await getDoc(doc(db, 'userSummary', uid));
  if (!snap.exists()) return DEFAULT_SUMMARY;
  const data = snap.data();
  return {
    walletEggsStored: data.walletEggsStored ?? 0,
    walletProteinAvailable: data.walletProteinAvailable ?? 0,
    walletNextExpiryAt: data.walletNextExpiryAt ?? null,
    walletLastConsumedDate: data.walletLastConsumedDate ?? null,
    walletEggsStoredTotal: data.walletEggsStoredTotal ?? 0,
    walletEggsConsumedTotal: data.walletEggsConsumedTotal ?? 0,
    walletEggsExpiredTotal: data.walletEggsExpiredTotal ?? 0,
    walletEggsReplacedTotal: data.walletEggsReplacedTotal ?? 0,
    walletWeekKey: data.walletWeekKey ?? null,
    walletWeekStoredCount: data.walletWeekStoredCount ?? 0,
    walletWeekConsumedCount: data.walletWeekConsumedCount ?? 0,
    walletWeekExpiredCount: data.walletWeekExpiredCount ?? 0,
    walletWeekBalanceSamples: data.walletWeekBalanceSamples ?? [],
    walletPrevWeekStoredCount: data.walletPrevWeekStoredCount ?? 0,
    walletPrevWeekConsumedCount: data.walletPrevWeekConsumedCount ?? 0,
    walletPrevWeekExpiredCount: data.walletPrevWeekExpiredCount ?? 0,
  };
}

/**
 * Lazily rolls the weekly wallet-analytics window forward when the ISO week
 * changes, and appends today's balance sample if not already recorded today.
 * Called from sweepExpiredItems (the existing lazy on-screen-load hook) so
 * no separate cron/schedule is needed — same convention as
 * checkAndRotateCampaign's date-window check.
 */
async function rollWeeklyWindowIfNeeded(uid: string, currentBalance: number): Promise<void> {
  const summaryRef = doc(db, 'userSummary', uid);
  const snap = await getDoc(summaryRef);
  const data = snap.exists() ? snap.data() : {};
  const weekKey = getWeekKey();
  const today = todayKey();

  if (data.walletWeekKey !== weekKey) {
    // New week — archive current week's counts as "previous", reset current.
    await setDoc(summaryRef, {
      uid,
      walletWeekKey: weekKey,
      walletWeekStoredCount: 0,
      walletWeekConsumedCount: 0,
      walletWeekExpiredCount: 0,
      walletWeekBalanceSamples: [{ date: today, balance: currentBalance }],
      walletPrevWeekStoredCount: data.walletWeekStoredCount ?? 0,
      walletPrevWeekConsumedCount: data.walletWeekConsumedCount ?? 0,
      walletPrevWeekExpiredCount: data.walletWeekExpiredCount ?? 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return;
  }

  const samples: { date: string; balance: number }[] = data.walletWeekBalanceSamples ?? [];
  if (!samples.some(s => s.date === today)) {
    const updated = [...samples, { date: today, balance: currentBalance }].slice(-7);
    await setDoc(summaryRef, { walletWeekBalanceSamples: updated, updatedAt: serverTimestamp() }, { merge: true });
  }
}

async function recomputeNextExpiry(uid: string, excludingItemId?: string): Promise<Timestamp | null> {
  const q = query(itemsCol(uid), where('status', '==', 'stored'), orderBy('expiresAt', 'asc'), limit(2));
  const snap = await getDocs(q);
  const next = snap.docs.find(d => d.id !== excludingItemId);
  return next ? (next.data().expiresAt as Timestamp) : null;
}

// ─────────────────────────────────────────────────────────────
// STORE — scan result lands here instead of being awarded immediately
// ─────────────────────────────────────────────────────────────

export type StoreEggResult =
  | { ok: true; item: WalletEggItem }
  | { ok: false; reason: 'consumed_by_self' | 'consumed_by_other' }
  | { ok: false; reason: 'wallet_full'; oldestItem: WalletEggItem }
  | { ok: false; reason: 'error'; message: string };

export async function storeEggInWallet(uid: string, qrCode: string): Promise<StoreEggResult> {
  const qrRef = doc(db, 'qrCodes', qrCode);
  const summaryRef = doc(db, 'userSummary', uid);

  try {
    // Pre-check outside the transaction — capacity is re-verified inside it
    // to prevent a race from exceeding 5, mirroring how qrCodes.playCount
    // is re-checked transactionally rather than trusted from an earlier read.
    const storedSnap = await getDocs(query(itemsCol(uid), where('status', '==', 'stored'), orderBy('storedAt', 'asc')));
    if (storedSnap.size >= WALLET_CAPACITY) {
      const oldestDoc = storedSnap.docs[0];
      return { ok: false, reason: 'wallet_full', oldestItem: { id: oldestDoc.id, ...oldestDoc.data() } as WalletEggItem };
    }

    const itemRef = doc(itemsCol(uid));

    const result = await runTransaction(db, async (tx) => {
      const qrSnap = await tx.get(qrRef);

      if (qrSnap.exists() && qrSnap.data().proteinConsumed === true) {
        const claimedBy: string = qrSnap.data().proteinConsumedByUID ?? '';
        return { ok: false as const, reason: claimedBy === uid ? 'consumed_by_self' as const : 'consumed_by_other' as const };
      }

      // Re-verify capacity inside the transaction to close the race window.
      const recheckSnap = await getDocs(query(itemsCol(uid), where('status', '==', 'stored')));
      if (recheckSnap.size >= WALLET_CAPACITY) {
        const oldest = recheckSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as WalletEggItem))
          .sort((a, b) => a.storedAt.toMillis() - b.storedAt.toMillis())[0];
        return { ok: false as const, reason: 'wallet_full' as const, oldestItem: oldest };
      }

      const storedAtMs = Date.now();
      const expiresAt = Timestamp.fromMillis(storedAtMs + EXPIRY_MS);
      const item: Omit<WalletEggItem, 'id'> = {
        uid, qrId: qrCode, eggType: 'SKM Egg',
        protein: PROTEIN_PER_EGG, calories: CALORIES_PER_EGG,
        status: 'stored',
        storedAt: Timestamp.fromMillis(storedAtMs),
        expiresAt,
        consumedAt: null, replacedAt: null, replacedByQrId: null,
        source: 'qr_scan',
      };

      tx.set(qrRef, { proteinConsumed: true, proteinConsumedAt: serverTimestamp(), proteinConsumedByUID: uid }, { merge: true });
      tx.set(itemRef, item);
      tx.set(summaryRef, {
        uid,
        walletEggsStored: increment(1),
        walletProteinAvailable: increment(PROTEIN_PER_EGG),
        walletEggsStoredTotal: increment(1),
        walletWeekStoredCount: increment(1),
        ...(recheckSnap.size === 0 ? { walletNextExpiryAt: expiresAt } : {}),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      tx.set(doc(db, 'users', uid), { totalQRCodesScanned: increment(1), updatedAt: serverTimestamp() }, { merge: true });

      return { ok: true as const, item: { id: itemRef.id, ...item } };
    });

    if (!result.ok) return result;

    getWalletSummary(uid)
      .then(sm => rollWeeklyWindowIfNeeded(uid, sm.walletEggsStored))
      .catch(err => console.error('[storeEggInWallet] rollWeeklyWindowIfNeeded failed:', err));
    return result;
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error('[storeEggInWallet] error:', { uid, qrCode, message: e?.message });
    return { ok: false, reason: 'error', message: e?.message ?? 'Something went wrong. Please try again.' };
  }
}

// ─────────────────────────────────────────────────────────────
// REPLACE OLDEST — used from the wallet-full modal
// ─────────────────────────────────────────────────────────────

export type ReplaceOldestResult =
  | { ok: true; newItem: WalletEggItem; replacedItemId: string }
  | { ok: false; reason: 'consumed_by_self' | 'consumed_by_other' | 'nothing_to_replace' | 'error'; message?: string };

export async function replaceOldestEgg(uid: string, qrCode: string): Promise<ReplaceOldestResult> {
  const qrRef = doc(db, 'qrCodes', qrCode);
  const summaryRef = doc(db, 'userSummary', uid);

  try {
    const result = await runTransaction(db, async (tx) => {
      const qrSnap = await tx.get(qrRef);
      if (qrSnap.exists() && qrSnap.data().proteinConsumed === true) {
        const claimedBy: string = qrSnap.data().proteinConsumedByUID ?? '';
        return { ok: false as const, reason: claimedBy === uid ? 'consumed_by_self' as const : 'consumed_by_other' as const };
      }

      const storedSnap = await getDocs(query(itemsCol(uid), where('status', '==', 'stored'), orderBy('storedAt', 'asc'), limit(1)));
      if (storedSnap.empty) {
        return { ok: false as const, reason: 'nothing_to_replace' as const };
      }
      const oldestDoc = storedSnap.docs[0];
      const oldestRef = oldestDoc.ref;
      const oldest = oldestDoc.data() as WalletEggItem;

      const newItemRef = doc(itemsCol(uid));
      const storedAtMs = Date.now();
      const expiresAt = Timestamp.fromMillis(storedAtMs + EXPIRY_MS);
      const newItem: Omit<WalletEggItem, 'id'> = {
        uid, qrId: qrCode, eggType: 'SKM Egg',
        protein: PROTEIN_PER_EGG, calories: CALORIES_PER_EGG,
        status: 'stored',
        storedAt: Timestamp.fromMillis(storedAtMs),
        expiresAt,
        consumedAt: null, replacedAt: null, replacedByQrId: null,
        source: 'qr_scan',
      };

      tx.set(qrRef, { proteinConsumed: true, proteinConsumedAt: serverTimestamp(), proteinConsumedByUID: uid }, { merge: true });
      tx.update(oldestRef, { status: 'replaced', replacedAt: serverTimestamp(), replacedByQrId: qrCode });
      tx.set(newItemRef, newItem);
      tx.set(summaryRef, {
        uid,
        // wallet size stays at capacity: -1 old +1 new = net 0 on walletEggsStored
        walletProteinAvailable: increment(PROTEIN_PER_EGG - oldest.protein),
        walletEggsStoredTotal: increment(1),
        walletEggsReplacedTotal: increment(1),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      tx.set(doc(db, 'users', uid), { totalQRCodesScanned: increment(1), updatedAt: serverTimestamp() }, { merge: true });

      return { ok: true as const, newItem: { id: newItemRef.id, ...newItem }, replacedItemId: oldestDoc.id };
    });

    if (result.ok) {
      const nextExpiry = await recomputeNextExpiry(uid);
      await setDoc(summaryRef, { walletNextExpiryAt: nextExpiry }, { merge: true });
    }

    return result;
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error('[replaceOldestEgg] error:', { uid, qrCode, message: e?.message });
    return { ok: false, reason: 'error', message: e?.message ?? 'Something went wrong. Please try again.' };
  }
}

// ─────────────────────────────────────────────────────────────
// SWEEP EXPIRED — lazy, called on Wallet/Dashboard screen load
// ─────────────────────────────────────────────────────────────

export async function sweepExpiredItems(uid: string): Promise<number> {
  const now = Timestamp.now();
  const snap = await getDocs(query(itemsCol(uid), where('status', '==', 'stored'), where('expiresAt', '<=', now)));

  const summaryRef = doc(db, 'userSummary', uid);

  if (snap.empty) {
    // Nothing expired, but this is still the lazy on-load hook for the
    // weekly analytics window — roll it forward even on a no-op sweep.
    const sm = await getWalletSummary(uid);
    rollWeeklyWindowIfNeeded(uid, sm.walletEggsStored).catch(err => console.error('[sweepExpiredItems] rollWeeklyWindowIfNeeded failed:', err));
    return 0;
  }

  let expiredProtein = 0;

  for (const d of snap.docs) {
    const item = d.data() as WalletEggItem;
    await runTransaction(db, async (tx) => {
      const fresh = await tx.get(d.ref);
      if (!fresh.exists() || fresh.data().status !== 'stored') return;
      tx.update(d.ref, { status: 'expired' });
    });
    expiredProtein += item.protein;
  }

  const nextExpiry = await recomputeNextExpiry(uid);
  await setDoc(summaryRef, {
    walletEggsStored: increment(-snap.size),
    walletProteinAvailable: increment(-expiredProtein),
    walletEggsExpiredTotal: increment(snap.size),
    walletWeekExpiredCount: increment(snap.size),
    walletNextExpiryAt: nextExpiry,
    walletLastSweepDate: todayKey(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const sm = await getWalletSummary(uid);
  rollWeeklyWindowIfNeeded(uid, sm.walletEggsStored).catch(err => console.error('[sweepExpiredItems] rollWeeklyWindowIfNeeded failed:', err));

  return snap.size;
}

// ─────────────────────────────────────────────────────────────
// CONSUME — FIFO, one award per calendar day
// ─────────────────────────────────────────────────────────────

export type ConsumeResult =
  | {
      ok: true;
      item: WalletEggItem;
      countedTowardStreak: boolean;
      streak?: { currentStreak: number; bestStreak: number; lastActiveDate: string };
      prevStreak?: number;
      goalJustMet?: boolean;
      pointsEarned?: number;
      wallet?: { currentPoints: number; membership: string };
      tierChanged?: boolean;
    }
  | { ok: false; reason: 'wallet_empty' | 'error'; message?: string };

export async function consumeNextWalletEgg(uid: string): Promise<ConsumeResult> {
  try {
    // True FIFO — oldest stored item first, regardless of expiry order.
    // Non-expired items are the only ones with status 'stored' by the time
    // this runs (sweepExpiredItems flips expired ones out of 'stored'), so
    // no separate expiresAt filter is needed here.
    const storedSnap = await getDocs(query(itemsCol(uid), where('status', '==', 'stored'), orderBy('storedAt', 'asc'), limit(1)));
    if (storedSnap.empty) return { ok: false, reason: 'wallet_empty' };

    const itemDoc = storedSnap.docs[0];
    const itemRef = itemDoc.ref;
    const summaryRef = doc(db, 'userSummary', uid);

    const claim = await runTransaction(db, async (tx) => {
      const [itemSnap, summarySnap] = await Promise.all([tx.get(itemRef), tx.get(summaryRef)]);
      if (!itemSnap.exists() || itemSnap.data().status !== 'stored') {
        throw new Error('This egg is no longer available to consume.');
      }
      const item = { id: itemSnap.id, ...itemSnap.data() } as WalletEggItem;
      if (item.expiresAt.toMillis() <= Date.now()) {
        throw new Error('This egg has expired and can no longer be consumed.');
      }
      const today = todayKey();
      const lastConsumedDate: string | null = summarySnap.exists() ? (summarySnap.data().walletLastConsumedDate ?? null) : null;
      const countedTowardStreak = lastConsumedDate !== today;

      tx.update(itemRef, { status: 'consumed', consumedAt: serverTimestamp() });
      tx.set(summaryRef, {
        uid,
        walletEggsStored: increment(-1),
        walletProteinAvailable: increment(-item.protein),
        walletEggsConsumedTotal: increment(1),
        walletWeekConsumedCount: increment(1),
        ...(countedTowardStreak ? { walletLastConsumedDate: today } : {}),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      return { item, countedTowardStreak };
    });

    const nextExpiry = await recomputeNextExpiry(uid);
    await setDoc(summaryRef, { walletNextExpiryAt: nextExpiry }, { merge: true });

    getWalletSummary(uid)
      .then(sm => rollWeeklyWindowIfNeeded(uid, sm.walletEggsStored))
      .catch(err => console.error('[consumeNextWalletEgg] rollWeeklyWindowIfNeeded failed:', err));

    if (!claim.countedTowardStreak) {
      // Still log the food, but no streak/points/campaign award today — already claimed.
      await logManualEntryFromWallet(uid, claim.item.qrId, claim.item.protein, claim.item.calories);
      return { ok: true, item: claim.item, countedTowardStreak: false };
    }

    const award = await awardWalletConsumption(uid, claim.item.qrId);
    return {
      ok: true,
      item: claim.item,
      countedTowardStreak: true,
      streak: award.streak,
      prevStreak: award.prevStreak,
      goalJustMet: award.goalJustMet,
      pointsEarned: award.pointsEarned,
      wallet: { currentPoints: award.wallet.currentPoints, membership: award.wallet.membership },
      tierChanged: award.tierChanged,
    };
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error('[consumeNextWalletEgg] error:', { uid, message: e?.message });
    return { ok: false, reason: 'error', message: e?.message ?? 'Something went wrong. Please try again.' };
  }
}

// ─────────────────────────────────────────────────────────────
// HEALTH SCORE / INSIGHT — pure display helpers, no reads
// ─────────────────────────────────────────────────────────────

export interface WalletHealthScore {
  stars: 1 | 2 | 3 | 4 | 5;
  label: 'Empty' | 'Running Low' | 'Moderate' | 'Healthy' | 'Excellent';
  subLabel?: string;
}

export function getWalletHealthScore(stored: number): WalletHealthScore {
  if (stored <= 0) return { stars: 1, label: 'Empty' };
  if (stored === 1) return { stars: 2, label: 'Running Low' };
  if (stored <= 3) return { stars: 3, label: 'Moderate' };
  if (stored === 4) return { stars: 4, label: 'Healthy' };
  return { stars: 5, label: 'Excellent', subLabel: 'Fresh Supply' };
}

export interface WalletInsight {
  icon: string;
  message: string;
}

export function getWalletInsight(summary: WalletSummary, items: WalletEggItem[]): WalletInsight {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const expiringSoon = items.find(i => i.status === 'stored' && i.expiresAt.toMillis() - now <= oneDayMs);
  if (expiringSoon) return { icon: '⏰', message: 'One stored egg expires tomorrow. Consume it soon.' };

  if (summary.walletEggsStored >= WALLET_CAPACITY) {
    return { icon: '⚠️', message: 'Your wallet is almost full. Consume today\'s egg before scanning more.' };
  }
  if (summary.walletEggsStored === 0) {
    return { icon: '🥚', message: 'Wallet is empty. Scan a fresh SKM egg to continue your streak.' };
  }
  return { icon: '✅', message: 'Your Protein Wallet is in good shape. Keep the streak going!' };
}

export function getWalletRecommendation(summary: WalletSummary): string {
  const today = todayKey();
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (summary.walletNextExpiryAt && summary.walletNextExpiryAt.toMillis() - Date.now() <= oneDayMs) {
    return 'One egg expires tomorrow. Consume it first.';
  }
  if (summary.walletEggsStored < WALLET_CAPACITY) {
    return `Store ${WALLET_CAPACITY - summary.walletEggsStored} more egg${WALLET_CAPACITY - summary.walletEggsStored === 1 ? '' : 's'} to maximize your reserve.`;
  }
  if (summary.walletLastConsumedDate !== today) {
    return "Consume today's egg to continue your streak.";
  }
  return 'Your wallet is in great shape. Keep it up!';
}

export { WALLET_CAPACITY };
export function getWeeklyWalletKey(): string {
  return getWeekKey();
}

// ─────────────────────────────────────────────────────────────
// WEEKLY ANALYTICS — pure derived stats, no reads
// ─────────────────────────────────────────────────────────────

export type TrendDirection = 'up' | 'down' | 'flat';

export interface WalletWeeklyStats {
  stored: number;
  consumed: number;
  expired: number;
  avgBalance: number;
  highestBalance: number;
  lowestBalance: number;
  consumptionRate: number; // consumed / max(stored, 1), 0-100+
  storedTrend: TrendDirection;
  consumedTrend: TrendDirection;
  expiredTrend: TrendDirection;
}

function trend(current: number, previous: number): TrendDirection {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}

// ─────────────────────────────────────────────────────────────
// DEVELOPER KPIs — cross-user aggregate, developer-only
// ─────────────────────────────────────────────────────────────
//
// Firestore rules grant `userSummary/{uid}` read to isDeveloper() on every
// doc independently (no collection-level `list` rule needed), so a plain
// getDocs(collection(db, 'userSummary')) succeeds for a developer account —
// same posture as devAssistantService.ts's cmdTotalUsers/cmdNewUsersToday
// cross-user reads over `users`. Callers must gate this behind isDevUser()
// before calling; this function does not check role itself.

export interface WalletAdminKpis {
  usersWithWallet: number;
  averageWalletFill: number;      // 0-100, avg (stored/capacity) across users with any wallet activity
  averageDailyConsumption: number; // avg walletEggsConsumedTotal per active-wallet user (lifetime, coarse)
  replacementRate: number;        // 0-100, replaced / (stored + replaced)
  expiryRate: number;             // 0-100, expired / (stored)
  healthyWalletPercentage: number; // 0-100, % of users currently at 4-5 stored eggs
  averageEggsStored: number;      // avg current walletEggsStored across users with any wallet activity
}

export async function getWalletAdminKpis(): Promise<WalletAdminKpis> {
  const snap = await getDocs(collection(db, 'userSummary'));
  const docs = snap.docs.filter((d: QueryDocumentSnapshot<DocumentData>) => 'walletEggsStoredTotal' in d.data());

  if (docs.length === 0) {
    return {
      usersWithWallet: 0, averageWalletFill: 0, averageDailyConsumption: 0,
      replacementRate: 0, expiryRate: 0, healthyWalletPercentage: 0, averageEggsStored: 0,
    };
  }

  let sumFillPct = 0, sumConsumedTotal = 0, sumStored = 0;
  let totalStoredLifetime = 0, totalReplaced = 0, totalExpired = 0, healthyCount = 0;

  for (const d of docs) {
    const data = d.data();
    const stored = data.walletEggsStored ?? 0;
    const storedTotal = data.walletEggsStoredTotal ?? 0;
    const consumedTotal = data.walletEggsConsumedTotal ?? 0;
    const replacedTotal = data.walletEggsReplacedTotal ?? 0;
    const expiredTotal = data.walletEggsExpiredTotal ?? 0;

    sumFillPct += (stored / WALLET_CAPACITY) * 100;
    sumConsumedTotal += consumedTotal;
    sumStored += stored;
    totalStoredLifetime += storedTotal;
    totalReplaced += replacedTotal;
    totalExpired += expiredTotal;
    if (stored >= 4) healthyCount++;
  }

  const n = docs.length;
  return {
    usersWithWallet: n,
    averageWalletFill: Math.round(sumFillPct / n),
    averageDailyConsumption: Math.round((sumConsumedTotal / n) * 10) / 10,
    replacementRate: totalStoredLifetime + totalReplaced > 0 ? Math.round((totalReplaced / (totalStoredLifetime + totalReplaced)) * 100) : 0,
    expiryRate: totalStoredLifetime > 0 ? Math.round((totalExpired / totalStoredLifetime) * 100) : 0,
    healthyWalletPercentage: Math.round((healthyCount / n) * 100),
    averageEggsStored: Math.round((sumStored / n) * 10) / 10,
  };
}

export function getWalletWeeklyStats(summary: WalletSummary): WalletWeeklyStats {
  const samples = summary.walletWeekBalanceSamples;
  const balances = samples.map(s => s.balance);
  const avgBalance = balances.length ? Math.round((balances.reduce((a, b) => a + b, 0) / balances.length) * 10) / 10 : 0;
  const highestBalance = balances.length ? Math.max(...balances) : 0;
  const lowestBalance = balances.length ? Math.min(...balances) : 0;
  const consumptionRate = summary.walletWeekStoredCount > 0
    ? Math.round((summary.walletWeekConsumedCount / summary.walletWeekStoredCount) * 100)
    : (summary.walletWeekConsumedCount > 0 ? 100 : 0);

  return {
    stored: summary.walletWeekStoredCount,
    consumed: summary.walletWeekConsumedCount,
    expired: summary.walletWeekExpiredCount,
    avgBalance, highestBalance, lowestBalance, consumptionRate,
    storedTrend: trend(summary.walletWeekStoredCount, summary.walletPrevWeekStoredCount),
    consumedTrend: trend(summary.walletWeekConsumedCount, summary.walletPrevWeekConsumedCount),
    expiredTrend: trend(summary.walletWeekExpiredCount, summary.walletPrevWeekExpiredCount),
  };
}
