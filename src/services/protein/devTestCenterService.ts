/**
 * Developer Test Center Service — TEMPORARY, development-only.
 *
 * Purpose: instantly exercise every SKM Protein Tracker feature without scanning
 * hundreds of eggs or hand-editing Firestore. This file ONLY calls the existing,
 * production services (reward points, coupons, protein, notifications, health,
 * stickers) exactly as the real app does, or writes to the same Firestore
 * documents those services read. It NEVER modifies:
 *   • QR validation logic          • reward point logic
 *   • protein calculation          • coupon generation logic
 *   • notification infrastructure   • user authentication
 *
 * Guarded at the UI layer behind VITE_DEV_TOOLS / import.meta.env.DEV. Delete or
 * flip the flag before the official public launch.
 */

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, serverTimestamp, increment, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { todayKey } from '../../utils/dateHelpers';

// ── Existing services (used, never modified) ──────────────────────
import { logEggScan } from './proteinTrackerService';
import {
  addPoints, spendPoints, getRewardWallet, calcMembershipTier,
} from './rewardWalletService';
import {
  getRewardCatalog, getUserCoupons, markCouponUsed,
  type RewardCoupon, type CouponStatus,
} from './rewardCouponService';
import { MILESTONES, type Rarity } from './milestoneRewardService';
import { saveHealthProfile, calcBmi, type ActivityLevel } from './healthProfileService';
import { createNotification } from '../notifications/notificationService';
import {
  notifyRewardPointsEarned, notifyMembershipTierUp, notifyStreakMilestone,
  notifyStickerUnlocked, notifyProteinGoalComplete, notifyWeekComplete,
} from '../notifications/notificationService';
import { MEMBERSHIP_TIERS, DEFAULT_COUPON_VALID_DAYS, type MembershipTier } from '../../constants/rewards';
import type { NotificationType } from '../../types/notifications';

// ── Small local helpers (mirror service internals; no logic overrides) ──

function dateKeyOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('sv-SE');
}

function randomCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SKM-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─────────────────────────────────────────────────────────────────
// ENVIRONMENT SNAPSHOT (for the dashboard)
// ─────────────────────────────────────────────────────────────────

export interface DevEnvSnapshot {
  version:      string;
  environment:  string;
  database:     string;
  notification: string;
  userEmail:    string;
  userUid:      string;
  currentPoints:number;
  membership:   MembershipTier;
}

export async function getDevEnvSnapshot(uid: string, email: string | null): Promise<DevEnvSnapshot> {
  let currentPoints = 0;
  let membership: MembershipTier = 'Bronze';
  try {
    const w = await getRewardWallet(uid);
    currentPoints = w.currentPoints;
    membership = w.membership;
  } catch { /* ignore */ }

  return {
    version:      import.meta.env.VITE_APP_VERSION ?? 'dev',
    environment:  import.meta.env.MODE,
    database:     import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'firebase',
    notification: import.meta.env.VITE_RENDER_API_URL ? 'Render server configured' : 'local only',
    userEmail:    email ?? '—',
    userUid:      uid,
    currentPoints,
    membership,
  };
}

// ─────────────────────────────────────────────────────────────────
// PROTEIN  (uses logEggScan via a fake dev qrCode — same path as devToolsService)
// ─────────────────────────────────────────────────────────────────

/** Adds `grams` of protein by running the real scan flow N times (each scan ≈ 6g). */
export async function devAddProtein(uid: string, grams: number): Promise<void> {
  const scans = Math.max(1, Math.round(grams / 6));
  for (let i = 0; i < scans; i++) {
    const fakeCode = `DEV-TEST-${Date.now()}-${i}`;
    await setDoc(doc(db, 'qrCodes', fakeCode), {
      active: true, playCount: 0, maxPlays: 999, proteinConsumed: false,
      createdAt: serverTimestamp(), _devTestEntry: true,
    });
    await logEggScan(uid, fakeCode);
  }
}

export async function devResetProtein(uid: string): Promise<void> {
  const dk = todayKey();
  await deleteDoc(doc(db, 'daily_stats', uid, 'days', dk)).catch(() => {});
  const snap = await getDocs(collection(db, 'protein_logs', uid, 'entries'));
  await Promise.all(
    snap.docs.filter(d => d.data().dateKey === dk).map(d => deleteDoc(d.ref)),
  );
}

// ─────────────────────────────────────────────────────────────────
// REWARD POINTS  (uses addPoints — real reward-point logic, unmodified)
// ─────────────────────────────────────────────────────────────────

export async function devAddPoints(uid: string, points: number): Promise<void> {
  const before = await getRewardWallet(uid);
  const wallet = await addPoints(uid, points, 'adjustment', `Dev test +${points} points`);
  notifyRewardPointsEarned(uid, points, wallet.currentPoints).catch(() => {});
  if (wallet.membership !== before.membership) {
    notifyMembershipTierUp(uid, wallet.membership).catch(() => {});
  }
}

/** Resets current points to 0 (lifetime points are immutable by design). */
export async function devResetPoints(uid: string): Promise<void> {
  const w = await getRewardWallet(uid);
  if (w.currentPoints > 0) {
    await spendPoints(uid, w.currentPoints, 'Dev test — reset current points').catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────
// DAILY STREAK  (writes the same user-doc fields the streak service reads)
// ─────────────────────────────────────────────────────────────────

export async function devSetStreak(uid: string, days: number): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const best = snap.exists() ? ((snap.data().bestConsumptionStreak as number) ?? 0) : 0;
  await updateDoc(userRef, {
    currentConsumptionStreak: days,
    bestConsumptionStreak: Math.max(best, days),
    lastConsumptionDate: todayKey(),
  }).catch(async () => {
    await setDoc(userRef, {
      currentConsumptionStreak: days,
      bestConsumptionStreak: days,
      lastConsumptionDate: todayKey(),
    }, { merge: true });
  });
  // stamp today so streak UI shows a completed day
  await setDoc(doc(db, 'streakHistory', uid, 'days', todayKey()), { completed: true, time: '12:00' }, { merge: true });
}

export async function devAddStreak(uid: string, days: number): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const current = snap.exists() ? ((snap.data().currentConsumptionStreak as number) ?? 0) : 0;
  await devSetStreak(uid, current + days);
  const milestone = [3, 7, 14, 21, 30, 50, 100, 365].includes(current + days);
  if (milestone) notifyStreakMilestone(uid, current + days).catch(() => {});
}

export async function devResetStreak(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    currentConsumptionStreak: 0, bestConsumptionStreak: 0, lastConsumptionDate: '',
  }).catch(() => {});
  const hist = await getDocs(collection(db, 'streakHistory', uid, 'days'));
  await Promise.all(hist.docs.map(d => deleteDoc(d.ref)));
}

// ─────────────────────────────────────────────────────────────────
// WEEKLY BATCH  (dev-only progress doc used by batch UI)
// ─────────────────────────────────────────────────────────────────

const WEEKLY_DEV_DOC = (uid: string) => doc(db, 'devWeeklyProgress', uid);

export async function devCompleteCurrentWeek(uid: string): Promise<void> {
  const ref = WEEKLY_DEV_DOC(uid);
  const snap = await getDoc(ref);
  const week = snap.exists() ? ((snap.data().currentWeek as number) ?? 1) : 1;
  await setDoc(ref, { currentWeek: week, [`week_${week}_complete`]: true, updatedAt: serverTimestamp() }, { merge: true });
  notifyWeekComplete(uid).catch(() => {});
}

export async function devUnlockNextWeek(uid: string): Promise<void> {
  const ref = WEEKLY_DEV_DOC(uid);
  const snap = await getDoc(ref);
  const week = snap.exists() ? ((snap.data().currentWeek as number) ?? 1) : 1;
  await setDoc(ref, { currentWeek: week + 1, updatedAt: serverTimestamp() }, { merge: true });
}

export async function devResetWeekly(uid: string): Promise<void> {
  await deleteDoc(WEEKLY_DEV_DOC(uid)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// STICKERS  (writes the milestone_rewards claimed[] the sticker UI reads)
// ─────────────────────────────────────────────────────────────────

async function getClaimedDays(uid: string): Promise<number[]> {
  const snap = await getDoc(doc(db, 'milestone_rewards', uid));
  return snap.exists() ? ((snap.data().claimed as number[]) ?? []) : [];
}

async function setClaimedDays(uid: string, days: number[]): Promise<void> {
  await setDoc(doc(db, 'milestone_rewards', uid), { claimed: Array.from(new Set(days)) }, { merge: true });
}

export async function devUnlockNextSticker(uid: string): Promise<void> {
  const claimed = await getClaimedDays(uid);
  const next = MILESTONES.find(m => !claimed.includes(m.days));
  if (!next) return;
  await setClaimedDays(uid, [...claimed, next.days]);
  notifyStickerUnlocked(uid, next.stickerName ?? `${next.days}-day sticker`, next.rarity).catch(() => {});
}

export async function devUnlockRarity(uid: string, rarity: Rarity): Promise<void> {
  const claimed = await getClaimedDays(uid);
  const toAdd = MILESTONES.filter(m => m.rarity === rarity).map(m => m.days);
  await setClaimedDays(uid, [...claimed, ...toAdd]);
}

export async function devUnlockAllStickers(uid: string): Promise<void> {
  await setClaimedDays(uid, MILESTONES.map(m => m.days));
}

export async function devResetStickers(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'milestone_rewards', uid)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// PASSPORT  (dev-only progress doc — no production passport entity exists)
// ─────────────────────────────────────────────────────────────────

const PASSPORT_DEV_DOC = (uid: string) => doc(db, 'devPassportProgress', uid);
const PASSPORT_TOTAL = 5;

export async function devCompleteCurrentPassport(uid: string): Promise<void> {
  const ref = PASSPORT_DEV_DOC(uid);
  const snap = await getDoc(ref);
  const cur = snap.exists() ? ((snap.data().current as number) ?? 1) : 1;
  await setDoc(ref, { current: cur, [`passport_${cur}_complete`]: true, updatedAt: serverTimestamp() }, { merge: true });
}

export async function devUnlockNextPassport(uid: string): Promise<void> {
  const ref = PASSPORT_DEV_DOC(uid);
  const snap = await getDoc(ref);
  const cur = snap.exists() ? ((snap.data().current as number) ?? 1) : 1;
  await setDoc(ref, { current: Math.min(PASSPORT_TOTAL, cur + 1), updatedAt: serverTimestamp() }, { merge: true });
}

export async function devCompleteAllPassports(uid: string): Promise<void> {
  const data: Record<string, unknown> = { current: PASSPORT_TOTAL, updatedAt: serverTimestamp() };
  for (let i = 1; i <= PASSPORT_TOTAL; i++) data[`passport_${i}_complete`] = true;
  await setDoc(PASSPORT_DEV_DOC(uid), data, { merge: true });
}

export async function devResetPassport(uid: string): Promise<void> {
  await deleteDoc(PASSPORT_DEV_DOC(uid)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// NOTIFICATIONS  (uses createNotification — real notification infrastructure)
// ─────────────────────────────────────────────────────────────────

async function pushNotification(uid: string, type: NotificationType, title: string, message: string): Promise<void> {
  await createNotification({ userId: uid, type, title, message, priority: 'normal' });
}

export const devNotify = {
  test:     (uid: string) => pushNotification(uid, 'system_update', '🛠 Developer Test', 'This is a test notification from the Developer Test Center.'),
  welcome:  (uid: string) => pushNotification(uid, 'system_update', '👋 Welcome to SKM Protein', 'Start scanning eggs to earn protein and rewards!'),
  reminder: (uid: string) => pushNotification(uid, 'daily_goal_reminder', '🥚 Time to scan today\'s egg', 'Keep your streak alive — scan an SKM egg now.'),
  reward:   (uid: string) => pushNotification(uid, 'reward_points_earned', '🎁 New reward unlocked', 'You have enough points to redeem a reward.'),
  coupon:   (uid: string) => pushNotification(uid, 'coupon_expiring', '🎫 ₹20 coupon generated', 'Your ₹20 OFF coupon is ready in your wallet.'),
  sticker:  (uid: string) => pushNotification(uid, 'sticker_unlocked', '⭐ Rare sticker collected', 'You unlocked a new sticker for your collection.'),
  dailyGoal:(uid: string) => pushNotification(uid, 'daily_goal_reminder', '💪 Daily protein goal', 'You\'re close to today\'s protein goal — one more egg!'),
};

export async function devClearNotifications(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, 'notifications'));
  await Promise.all(
    snap.docs.filter(d => d.data().userId === uid).map(d => deleteDoc(d.ref)),
  );
}

/** Generates the full set of sample notifications so the Notification Center fills immediately. */
export async function devGenerateSampleNotifications(uid: string): Promise<void> {
  const samples: Array<[NotificationType, string, string]> = [
    ['protein_added',        '🥚 Egg scanned successfully', 'You added 6g of protein.'],
    ['streak_milestone',     '🔥 7-day streak achieved',    'Amazing consistency — keep it going!'],
    ['reward_points_earned', '🎁 New reward unlocked',      'You can now redeem a reward.'],
    ['membership_tier_up',   '🏆 Bronze upgraded to Silver','Welcome to Silver membership.'],
    ['sticker_unlocked',     '⭐ Rare sticker collected',   'A new rare sticker joined your collection.'],
    ['protein_goal_complete','💪 Daily protein goal completed','You hit your protein goal today.'],
    ['coupon_expiring',      '🎫 ₹20 coupon generated',     'Your ₹20 OFF coupon is ready.'],
    ['daily_goal_reminder',  '🥚 Time to scan today\'s egg', 'Scan an SKM egg to keep your streak.'],
  ];
  for (const [type, title, message] of samples) {
    await createNotification({ userId: uid, type, title, message, priority: 'normal' });
  }
}

// ─────────────────────────────────────────────────────────────────
// COUPONS  (writes to rewardCoupons/{uid}/redemptions — same shape/collection)
// ─────────────────────────────────────────────────────────────────

export async function devGenerateCoupon(uid: string, discount: number): Promise<void> {
  const code = randomCouponCode();
  const ref = doc(collection(db, 'rewardCoupons', uid, 'redemptions'));
  const coupon: Omit<RewardCoupon, 'createdAt'> & { createdAt: unknown } = {
    id: ref.id,
    userId: uid,
    couponCode: code,
    rewardTitle: `₹${discount} OFF`,
    discountAmount: discount,
    minimumPurchase: discount * 5,
    pointsCost: 0,
    expiryDate: dateKeyOffset(DEFAULT_COUPON_VALID_DAYS),
    status: 'available' as CouponStatus,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, coupon);
}

/** Flips all available coupons to expired (sets expiry in the past). */
export async function devExpireCoupons(uid: string): Promise<void> {
  const coupons = await getUserCoupons(uid);
  await Promise.all(
    coupons
      .filter(c => c.status === 'available')
      .map(c => updateDoc(doc(db, 'rewardCoupons', uid, 'redemptions', c.id), {
        status: 'expired', expiryDate: dateKeyOffset(-1),
      })),
  );
}

export async function devResetCoupons(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, 'rewardCoupons', uid, 'redemptions'));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

// ─────────────────────────────────────────────────────────────────
// REWARDS  (generate = ensure points + issue coupon from cheapest catalog item)
// ─────────────────────────────────────────────────────────────────

/** Issues a sample reward coupon (₹20). Uses the dev coupon writer so no points are required. */
export async function devGenerateReward(uid: string): Promise<void> {
  await devGenerateCoupon(uid, 20);
}

/** Marks the most recent available coupon as used (simulates redemption end-state). */
export async function devRedeemReward(uid: string): Promise<void> {
  const coupons = await getUserCoupons(uid);
  const avail = coupons.find(c => c.status === 'available');
  if (avail) await markCouponUsed(uid, avail.id);
}

export async function devResetRewards(uid: string): Promise<void> {
  await devResetCoupons(uid);
}

/** Confirms the catalog is reachable (used by the "Refresh Rewards" Firestore action). */
export async function devRefreshCatalog(): Promise<number> {
  const cat = await getRewardCatalog();
  return cat.length;
}

// ─────────────────────────────────────────────────────────────────
// MEMBERSHIP  (override via lifetime points needed for a tier — real tier math)
// ─────────────────────────────────────────────────────────────────

export async function devSetMembership(uid: string, tier: MembershipTier): Promise<void> {
  const def = MEMBERSHIP_TIERS.find(t => t.tier === tier)!;
  const wallet = await getRewardWallet(uid);
  const targetLifetime = Math.max(wallet.lifetimePoints, def.minPoints);
  await setDoc(doc(db, 'rewardWallet', uid), {
    userId: uid,
    lifetimePoints: targetLifetime,
    membership: calcMembershipTier(targetLifetime).tier,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  const before = wallet.membership;
  if (before !== tier) notifyMembershipTierUp(uid, tier).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// EGG CONSUMPTION  (dev counter doc)
// ─────────────────────────────────────────────────────────────────

const EGG_CONSUMPTION_DOC = (uid: string) => doc(db, 'devEggConsumption', uid);

export async function devAddEggs(uid: string, count: number): Promise<void> {
  await setDoc(EGG_CONSUMPTION_DOC(uid), { total: increment(count), updatedAt: serverTimestamp() }, { merge: true });
}

export async function devResetEggs(uid: string): Promise<void> {
  await setDoc(EGG_CONSUMPTION_DOC(uid), { total: 0, updatedAt: serverTimestamp() }, { merge: true });
}

// ─────────────────────────────────────────────────────────────────
// BMI  (uses saveHealthProfile — real health service, unmodified)
// ─────────────────────────────────────────────────────────────────

type BmiTarget = 'healthy' | 'underweight' | 'overweight' | 'obese';

/** Picks a weight (at a fixed 170cm height) that lands in the requested BMI band. */
function weightForBmiBand(band: BmiTarget, heightCm = 170): number {
  const targetBmi = band === 'underweight' ? 17
    : band === 'healthy' ? 22
    : band === 'overweight' ? 27.5
    : 33; // obese
  const m = heightCm / 100;
  return Math.round(targetBmi * m * m);
}

export async function devGenerateBmi(uid: string, band: BmiTarget): Promise<number> {
  const heightCm = 170;
  const weightKg = weightForBmiBand(band, heightCm);
  await saveHealthProfile(uid, {
    age: 30,
    gender: 'Male',
    heightCm,
    weightKg,
    activityLevel: 'Moderately Active' as ActivityLevel,
  });
  return calcBmi(heightCm, weightKg);
}

export async function devResetBmi(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'health_profiles', uid)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// DAILY GOAL  (dev flag doc + real goal-complete notification)
// ─────────────────────────────────────────────────────────────────

export async function devCompleteDailyGoal(uid: string): Promise<void> {
  const dk = todayKey();
  await setDoc(doc(db, 'daily_stats', uid, 'days', dk), { goalMet: true, updatedAt: serverTimestamp() }, { merge: true });
  notifyProteinGoalComplete(uid, 60).catch(() => {});
}

export async function devResetDailyGoal(uid: string): Promise<void> {
  const dk = todayKey();
  await setDoc(doc(db, 'daily_stats', uid, 'days', dk), { goalMet: false, updatedAt: serverTimestamp() }, { merge: true });
}

// ─────────────────────────────────────────────────────────────────
// CHALLENGES  (dev completion flags — production challenge logic untouched)
// ─────────────────────────────────────────────────────────────────

const CHALLENGE_DEV_DOC = (uid: string) => doc(db, 'devChallenges', uid);

export async function devCompleteChallenge(uid: string, type: 'daily' | 'weekly' | 'monthly'): Promise<void> {
  await setDoc(CHALLENGE_DEV_DOC(uid), { [`${type}_complete`]: true, updatedAt: serverTimestamp() }, { merge: true });
}

export async function devResetChallenges(uid: string): Promise<void> {
  await deleteDoc(CHALLENGE_DEV_DOC(uid)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// FIRESTORE UTILITIES
// ─────────────────────────────────────────────────────────────────

/** Ensures a wallet doc exists and returns its current snapshot (Sync User / Reload). */
export async function devSyncUser(uid: string): Promise<void> {
  await getRewardWallet(uid);
}

export async function devReloadUser(uid: string): Promise<void> {
  await getDoc(doc(db, 'users', uid));
}

/** No server cache to clear beyond in-memory; touches the wallet to force a re-read. */
export async function devClearCache(uid: string): Promise<void> {
  await getRewardWallet(uid);
}
