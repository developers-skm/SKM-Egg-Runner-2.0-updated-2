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

import { doc, getDoc, setDoc, serverTimestamp, increment, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { MEMBERSHIP_TIERS, POINTS_PER_SCAN, POINTS_PER_STREAK_MILESTONE, type MembershipTier, type MembershipTierDef } from '../../constants/rewards';
import { addRewardTransaction, type RewardTransactionType } from './rewardTransactionService';
import { notifyRewardPointsEarned, notifyMembershipTierUp } from '../notifications/notificationService';

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
  const before = await getRewardWallet(uid);

  const lifetimeDelta = points > 0 ? points : 0; // lifetime only ever grows
  const newLifetime = before.lifetimePoints + lifetimeDelta;
  const newCurrent = Math.max(0, before.currentPoints + points);
  const newTier = calcMembershipTier(newLifetime).tier;

  await setDoc(ref, {
    userId: uid,
    currentPoints: newCurrent,
    lifetimePoints: newLifetime,
    membership: newTier,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await addRewardTransaction(uid, { type, points, description });

  return { ...before, currentPoints: newCurrent, lifetimePoints: newLifetime, membership: newTier };
}

/**
 * Awards points for a genuinely new egg scan, plus a streak-milestone bonus if the
 * post-scan streak just hit a milestone threshold. Fires notifications additively —
 * safe to call fire-and-forget from QRScanScreen.tsx, mirroring recordStreakDay().
 */
export async function awardScanPoints(uid: string, currentStreak: number): Promise<void> {
  const before = await getRewardWallet(uid);

  let wallet = await addPoints(uid, POINTS_PER_SCAN, 'scan', 'Egg scan');

  const streakBonus = POINTS_PER_STREAK_MILESTONE[currentStreak];
  if (streakBonus) {
    wallet = await addPoints(uid, streakBonus, 'streak_milestone', `${currentStreak}-day streak bonus`);
  }

  notifyRewardPointsEarned(uid, POINTS_PER_SCAN + (streakBonus ?? 0), wallet.currentPoints).catch(() => {});

  if (wallet.membership !== before.membership) {
    notifyMembershipTierUp(uid, wallet.membership).catch(() => {});
  }
}

/** Awards a bonus for claiming a milestone sticker — call alongside claimMilestone(). */
export async function awardMilestoneStickerPoints(uid: string, points: number, days: number): Promise<void> {
  const before = await getRewardWallet(uid);
  const wallet = await addPoints(uid, points, 'sticker_milestone', `${days}-day sticker milestone bonus`);
  notifyRewardPointsEarned(uid, points, wallet.currentPoints).catch(() => {});
  if (wallet.membership !== before.membership) {
    notifyMembershipTierUp(uid, wallet.membership).catch(() => {});
  }
}

/** Spends points on a redemption. Throws if insufficient balance. Caller should catch and surface an error. */
export async function spendPoints(uid: string, points: number, description: string): Promise<RewardWallet> {
  const wallet = await getRewardWallet(uid);
  if (wallet.currentPoints < points) throw new Error('Insufficient reward points.');

  const ref = doc(db, WALLET_COLLECTION, uid);
  await setDoc(ref, {
    userId: uid,
    currentPoints: increment(-points),
    totalRedeemed: increment(points),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await addRewardTransaction(uid, { type: 'redeem', points: -points, description });

  return {
    ...wallet,
    currentPoints: wallet.currentPoints - points,
    totalRedeemed: wallet.totalRedeemed + points,
  };
}
