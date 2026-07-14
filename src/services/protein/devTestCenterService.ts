/**
 * Developer Test Center Service — TEMPORARY, development-only.
 *
 * This is the ONLY Developer Mode implementation in the app (the old, duplicate
 * devToolsService.ts has been retired — its logic never called the real reward
 * pipeline, which caused streak/sticker/etc. dev actions to silently desync from
 * rewardWallet). Every developer action, in Profile's small panel or the full
 * Test Center screen, must go through the functions in this file.
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
import { logEggScan, getTodayStats } from './proteinTrackerService';
import { recordStreakDay, getEggStreakData, getStreakHistory } from './eggStreakService';
import {
  addPoints, spendPoints, getRewardWallet, calcMembershipTier,
  awardScanPoints, awardMilestoneStickerPoints,
} from './rewardWalletService';
import {
  getRewardCatalog, redeemReward, getUserCoupons, markCouponUsed,
  type RewardCatalogItem, type RewardCoupon, type CouponStatus,
} from './rewardCouponService';
import { getRecentRewardTransactions } from './rewardTransactionService';
import { MILESTONES, getClaimedStickers, type Rarity } from './milestoneRewardService';
import { saveHealthProfile, getHealthProfile, calcBmi, type ActivityLevel } from './healthProfileService';
import { createNotification, fetchNotifications, markAllAsRead } from '../notifications/notificationService';
import {
  notifyRewardPointsEarned, notifyMembershipTierUp, notifyStreakMilestone,
  notifyStickerUnlocked, notifyProteinGoalComplete, notifyProteinGoalMissed, notifyWeekComplete,
} from '../notifications/notificationService';
import { updateProfile } from 'firebase/auth';
import { auth } from '../firebase/firebase';
import { MEMBERSHIP_TIERS, DEFAULT_COUPON_VALID_DAYS, POINTS_PER_MILESTONE_STICKER, type MembershipTier } from '../../constants/rewards';
import type { NotificationType } from '../../types/notifications';

// ─────────────────────────────────────────────────────────────────
// ROLE CHECK — single source of truth for "is this a developer account"
// ─────────────────────────────────────────────────────────────────

export async function isDevUser(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return false;
    const role = snap.data().role;
    return role === 'developer' || role === 'admin';
  } catch {
    return false;
  }
}

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
// PROTEIN  (uses logEggScan via a fake dev qrCode, same as a real scan)
// ─────────────────────────────────────────────────────────────────

/**
 * Adds `grams` of protein by running the real scan flow N times (each scan ≈ 6g).
 * Mirrors QRScanScreen.tsx's post-scan pipeline exactly: logEggScan (protein +
 * streak), recordStreakDay (calendar history), then awardScanPoints (reward
 * points + streak-milestone bonus + notifications) — so a dev "scan" produces
 * the same reward-side effects as a genuine QR scan.
 */
export async function devAddProtein(uid: string, grams: number): Promise<void> {
  const scans = Math.max(1, Math.round(grams / 6));
  for (let i = 0; i < scans; i++) {
    const fakeCode = `DEV-TEST-${Date.now()}-${i}`;
    await setDoc(doc(db, 'qrCodes', fakeCode), {
      active: true, playCount: 0, maxPlays: 999, proteinConsumed: false,
      createdAt: serverTimestamp(), _devTestEntry: true,
    });
    const { streak } = await logEggScan(uid, fakeCode);
    await recordStreakDay(uid).catch(() => {});
    await awardScanPoints(uid, streak.currentStreak);
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
// DAILY STREAK  (writes the same user-doc fields the streak service reads,
// then runs the real reward pipeline once per day advanced — see devAddStreak)
// ─────────────────────────────────────────────────────────────────

const STREAK_MILESTONE_DAYS = [3, 7, 14, 21, 30, 50, 100, 365];

/** Sets the raw streak counters only — no reward side effects. Used internally by devAddStreak. */
async function setStreakCounters(uid: string, days: number, dateKey: string): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const best = snap.exists() ? ((snap.data().bestConsumptionStreak as number) ?? 0) : 0;
  await updateDoc(userRef, {
    currentConsumptionStreak: days,
    bestConsumptionStreak: Math.max(best, days),
    lastConsumptionDate: dateKey,
  }).catch(async () => {
    await setDoc(userRef, {
      currentConsumptionStreak: days,
      bestConsumptionStreak: Math.max(best, days),
      lastConsumptionDate: dateKey,
    }, { merge: true });
  });
}

/** Writes a backfilled streakHistory day exactly like recordStreakDay() does for a real scan. */
async function stampStreakHistoryDay(uid: string, dateKey: string): Promise<void> {
  const ref = doc(db, 'streakHistory', uid, 'days', dateKey);
  const snap = await getDoc(ref);
  if (snap.exists()) return; // already recorded — mirrors recordStreakDay's own guard
  await setDoc(ref, {
    dateKey, completed: true, time: '12:00 PM', recordedAt: serverTimestamp(),
  });
}

/**
 * Jumps straight to an absolute streak value — for quick one-shot testing where
 * intermediate-day reward bonuses don't matter. Runs the reward pipeline once,
 * for the final day only. Prefer devAddStreak for realistic simulation.
 */
export async function devSetStreak(uid: string, days: number): Promise<void> {
  const dk = todayKey();
  await setStreakCounters(uid, days, dk);
  await stampStreakHistoryDay(uid, dk);
  await awardScanPoints(uid, days);
}

/**
 * Advances the streak by `days`, one simulated day at a time — exactly like the
 * user scanning an egg once per day. Each simulated day: backfills streakHistory
 * (so the calendar / weekly-batch UI, which derives purely from streak data,
 * stays consistent), then calls awardScanPoints for that day's streak value —
 * the same call QRScanScreen.tsx makes after a real scan — so every
 * streak-milestone point bonus along the way is awarded, membership is
 * recalculated, and reward-points notifications fire exactly as in production.
 */
export async function devAddStreak(uid: string, days: number): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const current = snap.exists() ? ((snap.data().currentConsumptionStreak as number) ?? 0) : 0;

  for (let i = 1; i <= days; i++) {
    const dayValue = current + i;
    const dk = dateKeyOffset(-(days - i)); // backfill so history reads oldest-to-newest
    await setStreakCounters(uid, dayValue, i === days ? todayKey() : dk);
    await stampStreakHistoryDay(uid, dk);
    await awardScanPoints(uid, dayValue);
    if (STREAK_MILESTONE_DAYS.includes(dayValue)) {
      notifyStreakMilestone(uid, dayValue).catch(() => {});
    }
  }
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

/** No production point value exists for weekly-batch/challenge completion (they're dev-only concepts — see module header). Routed through the real addPoints pipeline, same as devAddPoints, so the wallet/membership/notifications stay consistent rather than silently skipped. */
const DEV_BATCH_BONUS_POINTS = 50;

export async function devCompleteCurrentWeek(uid: string): Promise<void> {
  const ref = WEEKLY_DEV_DOC(uid);
  const snap = await getDoc(ref);
  const week = snap.exists() ? ((snap.data().currentWeek as number) ?? 1) : 1;
  await setDoc(ref, { currentWeek: week, [`week_${week}_complete`]: true, updatedAt: serverTimestamp() }, { merge: true });
  const before = await getRewardWallet(uid);
  const wallet = await addPoints(uid, DEV_BATCH_BONUS_POINTS, 'adjustment', `Dev test — week ${week} complete bonus`);
  notifyRewardPointsEarned(uid, DEV_BATCH_BONUS_POINTS, wallet.currentPoints).catch(() => {});
  if (wallet.membership !== before.membership) notifyMembershipTierUp(uid, wallet.membership).catch(() => {});
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

/** Claims a sticker and awards its milestone point bonus — the same pairing MilestoneRewardModal is meant to trigger. */
async function claimStickerWithPoints(uid: string, claimed: number[], days: number): Promise<number[]> {
  if (claimed.includes(days)) return claimed;
  const next = [...claimed, days];
  await setClaimedDays(uid, next);
  await awardMilestoneStickerPoints(uid, POINTS_PER_MILESTONE_STICKER, days);
  return next;
}

export async function devUnlockNextSticker(uid: string): Promise<void> {
  const claimed = await getClaimedDays(uid);
  const next = MILESTONES.find(m => !claimed.includes(m.days));
  if (!next) return;
  await claimStickerWithPoints(uid, claimed, next.days);
  notifyStickerUnlocked(uid, next.stickerName ?? `${next.days}-day sticker`, next.rarity).catch(() => {});
}

export async function devUnlockRarity(uid: string, rarity: Rarity): Promise<void> {
  let claimed = await getClaimedDays(uid);
  const toAdd = MILESTONES.filter(m => m.rarity === rarity).map(m => m.days);
  for (const days of toAdd) claimed = await claimStickerWithPoints(uid, claimed, days);
}

export async function devUnlockAllStickers(uid: string): Promise<void> {
  let claimed = await getClaimedDays(uid);
  for (const m of MILESTONES) claimed = await claimStickerWithPoints(uid, claimed, m.days);
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

const DEV_CHALLENGE_BONUS_POINTS: Record<'daily' | 'weekly' | 'monthly', number> = {
  daily: 20, weekly: 50, monthly: 150,
};

export async function devCompleteChallenge(uid: string, type: 'daily' | 'weekly' | 'monthly'): Promise<void> {
  await setDoc(CHALLENGE_DEV_DOC(uid), { [`${type}_complete`]: true, updatedAt: serverTimestamp() }, { merge: true });
  const points = DEV_CHALLENGE_BONUS_POINTS[type];
  const before = await getRewardWallet(uid);
  const wallet = await addPoints(uid, points, 'challenge', `Dev test — ${type} challenge complete`);
  notifyRewardPointsEarned(uid, points, wallet.currentPoints).catch(() => {});
  if (wallet.membership !== before.membership) notifyMembershipTierUp(uid, wallet.membership).catch(() => {});
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

// ─────────────────────────────────────────────────────────────────
// CUSTOM VALUE SETTERS — "Set Custom Streak" / "Set Custom Protein" /
// "Set Custom BMI", all routed through the same real pipelines the
// preset dev buttons already use (devAddStreak / devAddProtein /
// saveHealthProfile), never a parallel write path.
// ─────────────────────────────────────────────────────────────────

/** Advances the streak by the delta needed to reach `targetDays` (no-op if already there or lower). */
export async function devSetCustomStreak(uid: string, targetDays: number): Promise<void> {
  const snap = await getDoc(doc(db, 'users', uid));
  const current = snap.exists() ? ((snap.data().currentConsumptionStreak as number) ?? 0) : 0;
  const delta = targetDays - current;
  if (delta > 0) await devAddStreak(uid, delta);
}

export async function devSetCustomProtein(uid: string, grams: number): Promise<void> {
  await devAddProtein(uid, grams);
}

const BMI_CUSTOM_HEIGHT_CM = 170;

/** Saves a health profile whose weight is chosen to land at exactly `targetBmi` at a fixed height. */
export async function devSetCustomBmi(uid: string, targetBmi: number): Promise<number> {
  const m = BMI_CUSTOM_HEIGHT_CM / 100;
  const weightKg = Math.round(targetBmi * m * m);
  await saveHealthProfile(uid, {
    age: 30, gender: 'Male', heightCm: BMI_CUSTOM_HEIGHT_CM, weightKg,
    activityLevel: 'Moderately Active' as ActivityLevel,
  });
  return calcBmi(BMI_CUSTOM_HEIGHT_CM, weightKg);
}

// ─────────────────────────────────────────────────────────────────
// REDEEM STORE — dev-only conveniences that call the real redemption
// pipeline (redeemReward / markCouponUsed), never a shadow coupon writer.
// ─────────────────────────────────────────────────────────────────

/** Redeems the cheapest catalog item at or under `maxPoints` (used by "Redeem ₹10/₹20 Coupon" — picks the closest real catalog match). */
export async function devRedeemCatalogItemNear(uid: string, targetDiscount: number): Promise<RewardCoupon | null> {
  const catalog = await getRewardCatalog();
  if (catalog.length === 0) return null;
  const closest = [...catalog].sort((a, b) => Math.abs(a.discountAmount - targetDiscount) - Math.abs(b.discountAmount - targetDiscount))[0];
  const wallet = await getRewardWallet(uid);
  if (wallet.currentPoints < closest.pointsCost) {
    await addPoints(uid, closest.pointsCost - wallet.currentPoints, 'adjustment', 'Dev test — top-up to afford redemption');
  }
  return redeemReward(uid, closest);
}

/** Redeems the single highest-discount catalog item (mirrors the Rewards Club's "Featured Reward"). */
export async function devRedeemFeaturedProduct(uid: string): Promise<RewardCoupon | null> {
  const catalog = await getRewardCatalog();
  if (catalog.length === 0) return null;
  const featured = [...catalog].sort((a, b) => b.discountAmount - a.discountAmount)[0];
  const wallet = await getRewardWallet(uid);
  if (wallet.currentPoints < featured.pointsCost) {
    await addPoints(uid, featured.pointsCost - wallet.currentPoints, 'adjustment', 'Dev test — top-up to afford redemption');
  }
  return redeemReward(uid, featured);
}

/**
 * Dev-only "undo a redemption": credits the coupon's point cost back to the
 * wallet (via the real addPoints pipeline) and marks the coupon expired so it
 * can no longer be used. There is no production refund flow — this exists
 * purely so testers can reset state after a test redemption, and it never
 * touches real coupon *validation* logic (QR/point-spend rules untouched).
 */
export async function devRefundCoupon(uid: string, couponId: string): Promise<void> {
  const ref = doc(db, 'rewardCoupons', uid, 'redemptions', couponId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const coupon = snap.data() as RewardCoupon;
  if (coupon.status === 'used') return; // don't refund an already-used coupon
  await addPoints(uid, coupon.pointsCost, 'adjustment', `Dev test — refund for ${coupon.rewardTitle}`);
  await updateDoc(ref, { status: 'expired' as CouponStatus });
}

// ─────────────────────────────────────────────────────────────────
// STATISTICS — bulk simulation for stress-testing dashboards/history
// views. Routes through devAddProtein / devAddStreak exactly like the
// smaller preset buttons; just larger magnitudes.
// ─────────────────────────────────────────────────────────────────

/** Adds enough scans to hit `targetEggs` for *today* specifically (caps at a sane batch size to avoid runaway writes). */
export async function devSetTodayEggs(uid: string, targetEggs: number): Promise<void> {
  const today = await getTodayStats(uid);
  const have = today?.totalEggs ?? 0;
  const need = Math.max(0, targetEggs - have);
  if (need > 0) await devAddProtein(uid, need * 6);
}

/** Simulates lifetime egg consumption by advancing the streak by `days` (each day = one real scan-equivalent). */
export async function devSimulateLifetimeEggs(uid: string, days: number): Promise<void> {
  await devAddStreak(uid, days);
}

/** Backfills a long streak so the 30/60-day history views have real data to render. */
export async function devGenerate365DayHistory(uid: string): Promise<void> {
  await devAddStreak(uid, 365);
}

// ─────────────────────────────────────────────────────────────────
// REWARD POINTS — remove / generate-transaction helpers, both via
// the real addPoints pipeline (never a shadow point ledger).
// ─────────────────────────────────────────────────────────────────

/** Subtracts points (never below 0) via the real addPoints pipeline (negative delta). */
export async function devRemovePoints(uid: string, points: number): Promise<void> {
  const wallet = await getRewardWallet(uid);
  const delta = -Math.min(points, wallet.currentPoints);
  if (delta !== 0) await addPoints(uid, delta, 'adjustment', `Dev test — removed ${Math.abs(delta)} points`);
}

/** Logs a one-off adjustment transaction so the Activity Timeline has something to render. */
export async function devGenerateRewardTransaction(uid: string): Promise<void> {
  await addPoints(uid, 15, 'adjustment', 'Dev test — sample transaction');
}

// ─────────────────────────────────────────────────────────────────
// NOTIFICATIONS — mark-all-read wraps the real notification service.
// ─────────────────────────────────────────────────────────────────

export async function devMarkAllNotificationsRead(uid: string): Promise<void> {
  await markAllAsRead(uid);
}

export async function devNotifyWeeklyReminder(uid: string): Promise<void> {
  await pushNotification(uid, 'system_update', '📅 Weekly Check-in', 'See how your week is going — scan an egg to keep the streak alive.');
}

export async function devNotifyDailyReminder(uid: string): Promise<void> {
  await pushNotification(uid, 'daily_goal_reminder', '🥚 Daily Reminder', "Don't forget today's SKM egg scan!");
}

// ─────────────────────────────────────────────────────────────────
// ANIMATION PREVIEWS — re-fire the real production notification for
// the user's CURRENT state, so the actual in-app modal/toast plays
// again without mutating any progress data. No separate preview
// rendering path — these call the exact same notifiers as the real
// unlock/upgrade/earn events.
// ─────────────────────────────────────────────────────────────────

export async function devPreviewMembershipUpgrade(uid: string): Promise<void> {
  const wallet = await getRewardWallet(uid);
  await notifyMembershipTierUp(uid, wallet.membership);
}

export async function devPreviewRewardUnlock(uid: string): Promise<void> {
  const wallet = await getRewardWallet(uid);
  await notifyRewardPointsEarned(uid, 25, wallet.currentPoints + 25);
}

export async function devPreviewStickerUnlock(uid: string): Promise<void> {
  const claimed = await getClaimedDays(uid);
  const mostRecent = [...MILESTONES].reverse().find(m => claimed.includes(m.days)) ?? MILESTONES[0];
  await notifyStickerUnlocked(uid, mostRecent.stickerName ?? `${mostRecent.days}-day sticker`, mostRecent.rarity);
}

// ─────────────────────────────────────────────────────────────────
// 30-DAY HISTORY — fills streakHistory/{uid}/days with realistic
// patterns for calendar/timeline testing. Missed days are represented
// by the ABSENCE of a document (matches recordStreakDay()/getStreakHistory()
// semantics — EggStreakScreen treats a missing doc as "not completed"),
// so these functions selectively skip writes rather than writing
// completed:false docs.
// ─────────────────────────────────────────────────────────────────

async function writeHistoryDay(uid: string, dateKey: string): Promise<void> {
  await setDoc(doc(db, 'streakHistory', uid, 'days', dateKey), {
    dateKey, completed: true, time: '12:00 PM', recordedAt: serverTimestamp(),
  });
}

/** Fills the last N days with completed scans (does not touch the live streak counters — history-only). */
async function fillHistoryDays(uid: string, days: number, predicate: (dayIndex: number) => boolean): Promise<void> {
  for (let i = 0; i < days; i++) {
    if (!predicate(i)) continue;
    await writeHistoryDay(uid, dateKeyOffset(-i));
  }
}

export async function devFillLast7Days(uid: string): Promise<void> {
  await fillHistoryDays(uid, 7, () => true);
}

export async function devFillLast30Days(uid: string): Promise<void> {
  await fillHistoryDays(uid, 30, () => true);
}

/** Deterministic-looking but varied pattern — roughly 70% of days completed. */
export async function devRandomHistory(uid: string): Promise<void> {
  await fillHistoryDays(uid, 30, i => (i * 7 + 3) % 10 < 7);
}

export async function devPerfectHistory(uid: string): Promise<void> {
  await fillHistoryDays(uid, 30, () => true);
}

/** Leaves gaps every 4th day so the calendar shows a realistic broken streak. */
export async function devBrokenStreakHistory(uid: string): Promise<void> {
  await fillHistoryDays(uid, 30, i => i % 4 !== 0);
}

export async function devResetHistory(uid: string): Promise<void> {
  const hist = await getDocs(collection(db, 'streakHistory', uid, 'days'));
  await Promise.all(hist.docs.map(d => deleteDoc(d.ref)));
}

// ─────────────────────────────────────────────────────────────────
// HEALTH / DAILY GOAL — fail / perfect-week variants, built on the
// same daily_stats documents proteinTrackerService reads.
// ─────────────────────────────────────────────────────────────────

export async function devFailDailyGoal(uid: string): Promise<void> {
  const dk = todayKey();
  await setDoc(doc(db, 'daily_stats', uid, 'days', dk), { goalMet: false, updatedAt: serverTimestamp() }, { merge: true });
  await notifyProteinGoalMissed(uid, 60).catch(() => {});
}

/** Marks the last 7 days as goal-met (history-side effect only, mirrors devCompleteDailyGoal for each day). */
export async function devPerfectWeek(uid: string): Promise<void> {
  for (let i = 0; i < 7; i++) {
    const dk = dateKeyOffset(-i);
    await setDoc(doc(db, 'daily_stats', uid, 'days', dk), { goalMet: true, updatedAt: serverTimestamp() }, { merge: true });
  }
  await notifyProteinGoalComplete(uid, 60).catch(() => {});
}

export async function devPerfectMonth(uid: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const dk = dateKeyOffset(-i);
    await setDoc(doc(db, 'daily_stats', uid, 'days', dk), { goalMet: true, updatedAt: serverTimestamp() }, { merge: true });
  }
}

export async function devResetHealthProgress(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, 'daily_stats', uid, 'days'));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  await devResetBmi(uid);
}

// ─────────────────────────────────────────────────────────────────
// REDEEM STORE — restore lets a used/expired coupon go back to
// "available" for repeat-testing redemption flows (dev-only, no
// production restore path exists — mirrors devRefundCoupon's status
// flip but does not re-credit points, since the coupon was never
// actually spent again).
// ─────────────────────────────────────────────────────────────────

export async function devRestoreCoupon(uid: string, couponId: string): Promise<void> {
  const ref = doc(db, 'rewardCoupons', uid, 'redemptions', couponId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, { status: 'available' as CouponStatus, expiryDate: dateKeyOffset(DEFAULT_COUPON_VALID_DAYS) });
}

export async function devResetRedeemStore(uid: string): Promise<void> {
  await devResetCoupons(uid);
  await devResetRewards(uid);
}

// ─────────────────────────────────────────────────────────────────
// PROFILE — avatar / username randomization and reset, all via the
// same firebase/auth updateProfile() call ProfileScreen.tsx uses for
// real edits (never a parallel profile-write path).
// ─────────────────────────────────────────────────────────────────

const DEV_AVATAR_SEEDS = ['felix', 'aneka', 'milo', 'zara', 'kiro', 'nova', 'pip', 'juno'];
const DEV_USERNAME_ADJECTIVES = ['Swift', 'Bold', 'Sunny', 'Mighty', 'Golden', 'Rapid', 'Vivid', 'Cosmic'];
const DEV_USERNAME_NOUNS = ['Falcon', 'Otter', 'Comet', 'Maple', 'Ranger', 'Pixel', 'Ember', 'Voyager'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Sets a deterministic placeholder avatar (DiceBear, publicly embeddable SVG avatars — no upload flow exists yet). */
export async function devSetRandomAvatar(uid: string): Promise<void> {
  const seed = pickRandom(DEV_AVATAR_SEEDS) + '-' + Date.now();
  const photoURL = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL });
  await updateDoc(doc(db, 'users', uid), { photoURL }).catch(() => {});
}

export async function devSetRandomUsername(uid: string): Promise<void> {
  const name = `${pickRandom(DEV_USERNAME_ADJECTIVES)}${pickRandom(DEV_USERNAME_NOUNS)}${Math.floor(Math.random() * 100)}`;
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: name });
  await updateDoc(doc(db, 'users', uid), { playerName: name }).catch(() => {});
}

/** Clears the dev-set avatar and reverts display name to the account's original provider name where possible. */
export async function devResetProfile(uid: string): Promise<void> {
  if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: null });
  await updateDoc(doc(db, 'users', uid), {
    photoURL: '', age: '', gender: '', height: '', weight: '', goalWeight: '', phone: '',
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// FACTORY RESET — sequentially runs every reset function. Confirmation
// is enforced at the UI layer; this function itself just composes the
// existing, already-audited reset functions (no new deletion logic).
// ─────────────────────────────────────────────────────────────────

export async function devFactoryReset(uid: string): Promise<void> {
  await devResetRewards(uid);
  await devResetStreak(uid);
  await devResetProtein(uid);
  await devResetStickers(uid);
  await devResetCoupons(uid);
  await devClearNotifications(uid);
  await devResetPoints(uid);
  await devResetWeekly(uid);
  await devResetPassport(uid);
  await devResetBmi(uid);
  await devResetEggs(uid);
  await devResetChallenges(uid);
  await devResetDailyGoal(uid);
  await devResetHistory(uid);
  await devResetHealthProgress(uid);
}

// ─────────────────────────────────────────────────────────────────
// DEBUG SNAPSHOT — one read-only aggregate of everything the Debug
// Information panel displays. Every field is read via the same getters
// the real screens use (getStreakInfo-equivalent via getEggStreakData,
// getRewardWallet, getUserCoupons, getClaimedStickers, fetchNotifications,
// getHealthProfile) — this function performs no writes.
// ─────────────────────────────────────────────────────────────────

export interface DevDebugSnapshot {
  uid:                string;
  membership:         MembershipTier;
  rewardPoints:       number;
  lifetimePoints:     number;
  proteinToday:       number;
  eggsToday:          number;
  currentStreak:      number;
  bestStreak:         number;
  weeklyBatchProgress:number; // days completed in current batch, 0-7
  weeklyBatchNumber:  number;
  historyDaysRecorded:number; // days with a streakHistory doc, out of the last 30
  stickerCount:       number;
  stickerTotal:       number;
  couponCount:        number;
  availableCouponCount:number;
  notificationCount:  number;
  bmi:                number | null;
  healthScore:        number | null;
  rewardWalletStatus: 'ok' | 'missing';
  lastSyncTime:       string;
  firestoreStatus:    'connected' | 'error';
}

export async function getDevDebugSnapshot(uid: string): Promise<DevDebugSnapshot> {
  try {
    const [wallet, streakData, today, history, claimed, coupons, notifications, health] = await Promise.all([
      getRewardWallet(uid),
      getEggStreakData(uid),
      getTodayStats(uid),
      getStreakHistory(uid, 30),
      getClaimedStickers(uid),
      getUserCoupons(uid),
      fetchNotifications(uid, { pageSize: 200 }),
      getHealthProfile(uid),
    ]);

    return {
      uid,
      membership: wallet.membership,
      rewardPoints: wallet.currentPoints,
      lifetimePoints: wallet.lifetimePoints,
      proteinToday: today?.totalProtein ?? 0,
      eggsToday: today?.totalEggs ?? 0,
      currentStreak: streakData.currentStreak,
      bestStreak: streakData.bestStreak,
      weeklyBatchProgress: streakData.batchProgress,
      weeklyBatchNumber: streakData.completedBatches + 1,
      historyDaysRecorded: history.length,
      stickerCount: claimed.size,
      stickerTotal: MILESTONES.length,
      couponCount: coupons.length,
      availableCouponCount: coupons.filter(c => c.status === 'available').length,
      notificationCount: notifications.length,
      bmi: health ? calcBmi(health.heightCm, health.weightKg) : null,
      healthScore: health?.healthScore ?? null,
      rewardWalletStatus: 'ok',
      lastSyncTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      firestoreStatus: 'connected',
    };
  } catch (e) {
    console.error('[DevDebugSnapshot]', e);
    return {
      uid, membership: 'Bronze', rewardPoints: 0, lifetimePoints: 0, proteinToday: 0, eggsToday: 0,
      currentStreak: 0, bestStreak: 0, weeklyBatchProgress: 0, weeklyBatchNumber: 1, historyDaysRecorded: 0,
      stickerCount: 0, stickerTotal: MILESTONES.length, couponCount: 0, availableCouponCount: 0,
      notificationCount: 0, bmi: null, healthScore: null, rewardWalletStatus: 'missing',
      lastSyncTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      firestoreStatus: 'error',
    };
  }
}
