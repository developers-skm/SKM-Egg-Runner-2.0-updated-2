/**
 * SKM Rewards Club — Wallet Service
 *
 * Firestore collection:
 *   rewardWallet/{uid}   — currentPoints, lifetimePoints, totalRedeemed, membership
 *
 * This is additive to the protein tracker: it does not touch QR validation,
 * QR management, protein scan logic, streaks, stickers, milestones,
 * notifications, health profile, passport, or Egg Runner integration.
 * Callers award points as a fire-and-forget side effect (see QRScanScreen.tsx).
 */

import { doc, getDoc, setDoc, serverTimestamp, increment, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { MEMBERSHIP_TIERS, POINTS_PER_SCAN, POINTS_PER_STREAK_MILESTONE, type MembershipTier, type MembershipTierDef } from '../../constants/rewards';
import { addRewardTransaction, type RewardTransactionType } from './rewardTransactionService';
import { notifyRewardPointsEarned, notifyMembershipTierUp } from '../notifications/notificationService';
import { HapticService } from '../audio/hapticService';

export interface RewardWallet {
  userId:         string;
  currentPoints:  number;
  lifetimePoints: number;
  totalRedeemed:  number; // points ever spent on coupons
  membership:     MembershipTier;
  updatedAt:      Timestamp;
}

const WALLET_COLLECTION = 'rewardWallet';

function defaultWallet(uid: string): Omit<RewardWallet, 'updatedAt'> {
  return { userId: uid, currentPoints: 0, lifetimePoints: 0, totalRedeemed: 0, membership: 'Bronze' };
}

export function calcMembershipTier(lifetimePoints: number): MembershipTierDef {
  let current = MEMBERSHIP_TIERS[0];
  for (const t of MEMBERSHIP_TIERS) {
    if (lifetimePoints >= t.minPoints) current = t;
  }
  return current;
}

export function calcTierProgress(lifetimePoints: number): {
  tier: MembershipTierDef;
  next: MembershipTierDef | null;
  pointsIntoTier: number;
  pointsToNext: number;
  pctToNext: number;
} {
  const idx = MEMBERSHIP_TIERS.findIndex(t => t.tier === calcMembershipTier(lifetimePoints).tier);
  const tier = MEMBERSHIP_TIERS[idx];
  const next = idx < MEMBERSHIP_TIERS.length - 1 ? MEMBERSHIP_TIERS[idx + 1] : null;
  const pointsIntoTier = lifetimePoints - tier.minPoints;
  const span = next ? next.minPoints - tier.minPoints : 1;
  const pointsToNext = next ? Math.max(0, next.minPoints - lifetimePoints) : 0;
  const pctToNext = next ? Math.min(100, Math.round((pointsIntoTier / span) * 100)) : 100;
  return { tier, next, pointsIntoTier, pointsToNext, pctToNext };
}

export async function getRewardWallet(uid: string): Promise<RewardWallet> {
  const ref = doc(db, WALLET_COLLECTION, uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as RewardWallet;
  const data: RewardWallet = { ...defaultWallet(uid), updatedAt: serverTimestamp() as Timestamp };
  await setDoc(ref, data);
  return data;
}

/**
 * Adds (or subtracts, if negative) points to the wallet, recalculates membership
 * tier from lifetime points, and logs an immutable transaction entry.
 */
export async function addPoints(
  uid: string,
  points: number,
  type: RewardTransactionType,
  description: string,
): Promise<RewardWallet> {
  if (points === 0) return getRewardWallet(uid);
  const ref = doc(db, WALLET_COLLECTION, uid);

  const updated = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const before: RewardWallet = snap.exists()
      ? (snap.data() as RewardWallet)
      : { ...defaultWallet(uid), updatedAt: serverTimestamp() as Timestamp };

    const lifetimeDelta = points > 0 ? points : 0; // lifetime only ever grows
    const newLifetime = before.lifetimePoints + lifetimeDelta;
    const newCurrent = Math.max(0, before.currentPoints + points);
    const newTier = calcMembershipTier(newLifetime).tier;

    tx.set(ref, {
      userId: uid,
      currentPoints: newCurrent,
      lifetimePoints: newLifetime,
      membership: newTier,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return { ...before, currentPoints: newCurrent, lifetimePoints: newLifetime, membership: newTier };
  });

  await addRewardTransaction(uid, { type, points, description });

  return updated;
}

export interface ScanPointsResult {
  pointsEarned: number; // POINTS_PER_SCAN + any streak bonus
  wallet:       RewardWallet;
  tierChanged:  boolean;
}

/**
 * Awards points for a genuinely new egg scan, plus a streak-milestone bonus if the
 * post-scan streak just hit a milestone threshold. Fires notifications additively.
 * Returns the resulting wallet so callers (e.g. the post-scan celebration UI) can
 * show real point/membership numbers instead of estimating them.
 */
export async function awardScanPoints(uid: string, currentStreak: number): Promise<ScanPointsResult> {
  const before = await getRewardWallet(uid);

  let wallet = await addPoints(uid, POINTS_PER_SCAN, 'scan', 'Egg scan');

  const streakBonus = POINTS_PER_STREAK_MILESTONE[currentStreak];
  if (streakBonus) {
    wallet = await addPoints(uid, streakBonus, 'streak_milestone', `${currentStreak}-day streak bonus`);
  }

  const pointsEarned = POINTS_PER_SCAN + (streakBonus ?? 0);
  notifyRewardPointsEarned(uid, pointsEarned, wallet.currentPoints).catch(() => {});

  const tierChanged = wallet.membership !== before.membership;
  if (tierChanged) {
    notifyMembershipTierUp(uid, wallet.membership).catch(() => {});
    // Membership Upgrade — best-effort only. This function may be invoked
    // fire-and-forget with no direct tie to a user gesture, so on Android
    // Chrome navigator.vibrate() may silently no-op here if the page's
    // sticky user-activation window has already lapsed. HapticService.fire()
    // logs the outcome under Developer Mode.
    HapticService.heavy();
  }

  return { pointsEarned, wallet, tierChanged };
}

/** Awards a bonus for claiming a milestone sticker — call alongside claimMilestone(). */
export async function awardMilestoneStickerPoints(uid: string, points: number, days: number): Promise<void> {
  const before = await getRewardWallet(uid);
  const wallet = await addPoints(uid, points, 'sticker_milestone', `${days}-day sticker milestone bonus`);
  notifyRewardPointsEarned(uid, points, wallet.currentPoints).catch(() => {});
  if (wallet.membership !== before.membership) {
    notifyMembershipTierUp(uid, wallet.membership).catch(() => {});
    // Membership Upgrade — see awardScanPoints() above re: activation-window caveat.
    HapticService.heavy();
  }
}

/**
 * Spends points on a redemption. Throws if insufficient balance.
 * The balance check and the deduction happen inside a single Firestore
 * transaction so two concurrent redemptions (e.g. two tabs/devices) can't
 * both read the same starting balance and both succeed — the transaction
 * re-reads and re-validates the live balance before committing.
 * Caller should catch and surface an error.
 */
export async function spendPoints(uid: string, points: number, description: string): Promise<RewardWallet> {
  const ref = doc(db, WALLET_COLLECTION, uid);

  const updated = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const wallet: RewardWallet = snap.exists()
      ? (snap.data() as RewardWallet)
      : { ...defaultWallet(uid), updatedAt: serverTimestamp() as Timestamp };

    if (wallet.currentPoints < points) throw new Error('Insufficient reward points.');

    const newCurrent = wallet.currentPoints - points;
    const newTotalRedeemed = wallet.totalRedeemed + points;

    tx.set(ref, {
      userId: uid,
      currentPoints: newCurrent,
      totalRedeemed: newTotalRedeemed,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return { ...wallet, currentPoints: newCurrent, totalRedeemed: newTotalRedeemed };
  });

  await addRewardTransaction(uid, { type: 'redeem', points: -points, description });

  return updated;
}
