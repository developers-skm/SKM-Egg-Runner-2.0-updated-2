/**
 * SKM PROTEIN TRACKER — Retention Engine
 *
 * Firestore collections added:
 *   login_streaks/{uid}                   — daily login reward state
 *   daily_missions/{uid}/days/{dateKey}   — 3 daily missions per day
 *   weekly_missions/{uid}/weeks/{weekKey} — weekly missions
 *   streak_shields/{uid}                  — shield inventory
 *   game_rewards/{uid}                    — unlocked game content
 */

import {
  doc, collection,
  getDoc, getDocs, setDoc, updateDoc, addDoc,
  serverTimestamp, Timestamp,
  query, orderBy, limit, where,
  increment,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { addRewards, todayKey, dateKeyFor, getWeekKey, getStreakInfo, calcLevel } from './proteinTrackerService';

// ─────────────────────────────────────────────────────────────
// CONSTANTS — updated XP values
// ─────────────────────────────────────────────────────────────

export const XP_SCAN_EGG       = 50;
export const XP_DAILY_GOAL     = 100;
export const XP_CHALLENGE      = 150;
export const XP_STREAK_MILESTONE = 300;
export const XP_MISSION_DAILY  = 75;
export const XP_MISSION_WEEKLY = 200;
export const XP_LOGIN_BASE     = 30;

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface LoginReward {
  day:         number;     // 1-30
  type:        'coins' | 'xp' | 'shield' | 'game_reward' | 'premium';
  coins?:      number;
  xp?:         number;
  label:       string;
  description: string;
  claimed:     boolean;
  claimedAt?:  Timestamp;
}

export interface LoginStreak {
  uid:              string;
  currentLoginDay:  number;   // 1-30, which day they're on in the cycle
  lastLoginDate:    string;   // YYYY-MM-DD
  longestCycle:     number;   // how many days completed before reset
  totalLoginDays:   number;   // lifetime login count
  claimedDays?:     Record<string, boolean>; // dateKey → true when claimed
  updatedAt:        Timestamp;
}

export interface DailyMission {
  id:          string;
  uid:         string;
  dateKey:     string;
  title:       string;
  description: string;
  type:        'scan_egg' | 'reach_protein' | 'open_app' | 'maintain_streak' | 'log_food' | 'reach_50pct';
  target:      number;
  progress:    number;
  completed:   boolean;
  claimed:     boolean;
  xpReward:    number;
  coinReward:  number;
  createdAt:   Timestamp;
}

export interface WeeklyMission {
  id:          string;
  uid:         string;
  weekKey:     string;
  title:       string;
  description: string;
  type:        'scan_eggs' | 'total_protein' | 'goal_days' | 'streak_days';
  target:      number;
  progress:    number;
  completed:   boolean;
  claimed:     boolean;
  xpReward:    number;
  coinReward:  number;
  createdAt:   Timestamp;
}

export interface StreakShield {
  uid:        string;
  shields:    number;       // available shield count
  usedDates:  string[];     // dates where a shield was used
  updatedAt:  Timestamp;
}

export interface GameReward {
  id:          string;
  title:       string;
  description: string;
  type:        'skin' | 'character' | 'legendary';
  requirement: string;
  threshold:   number;
  field:       'lifetimeConsumption' | 'currentConsumptionStreak' | 'bestConsumptionStreak';
  unlocked:    boolean;
  unlockedAt?: Timestamp;
}

export interface ReturnSummary {
  proteinsYesterday:    number;
  proteinsToday:        number;
  proteinDelta:         number;
  streak:               number;
  streakProtected:      boolean;
  unclaimedLoginReward: boolean;
  unclaimedMissions:    number;
  unclaimedChallenges:  number;
  activeMissions:       DailyMission[];
  loginDay:             number;
  coinsAvailable:       number;
  xpAvailable:          number;
  motivationMessage:    string;
  levelInfo:            { level: number; title: string };
}

// ─────────────────────────────────────────────────────────────
// LOGIN REWARD SCHEDULE (30-day cycle)
// ─────────────────────────────────────────────────────────────

export function getLoginRewardSchedule(): Omit<LoginReward, 'claimed' | 'claimedAt'>[] {
  return [
    { day:  1, type: 'coins',       coins:  50,  xp:   0,  label: 'Day 1',   description: '50 Coins' },
    { day:  2, type: 'xp',          coins:   0,  xp: 100,  label: 'Day 2',   description: '100 XP' },
    { day:  3, type: 'coins',       coins: 100,  xp:   0,  label: 'Day 3',   description: 'Bonus 100 Coins' },
    { day:  4, type: 'xp',          coins:   0,  xp: 150,  label: 'Day 4',   description: '150 XP' },
    { day:  5, type: 'coins',       coins: 100,  xp:  50,  label: 'Day 5',   description: '100 Coins + 50 XP' },
    { day:  6, type: 'coins',       coins: 150,  xp:   0,  label: 'Day 6',   description: '150 Coins' },
    { day:  7, type: 'shield',      coins: 200,  xp: 200,  label: 'Day 7',   description: 'Streak Shield + 200 XP' },
    { day:  8, type: 'coins',       coins:  75,  xp:   0,  label: 'Day 8',   description: '75 Coins' },
    { day:  9, type: 'xp',          coins:   0,  xp: 200,  label: 'Day 9',   description: '200 XP' },
    { day: 10, type: 'coins',       coins: 200,  xp: 100,  label: 'Day 10',  description: '200 Coins + 100 XP' },
    { day: 11, type: 'xp',          coins:   0,  xp: 250,  label: 'Day 11',  description: '250 XP' },
    { day: 12, type: 'coins',       coins: 200,  xp:   0,  label: 'Day 12',  description: '200 Coins' },
    { day: 13, type: 'xp',          coins:  50,  xp: 300,  label: 'Day 13',  description: '300 XP + 50 Coins' },
    { day: 14, type: 'shield',      coins: 300,  xp: 300,  label: 'Day 14',  description: 'Streak Shield + 300 XP' },
    { day: 15, type: 'coins',       coins: 350,  xp: 150,  label: 'Day 15',  description: '350 Coins + 150 XP' },
    { day: 16, type: 'xp',          coins:   0,  xp: 350,  label: 'Day 16',  description: '350 XP' },
    { day: 17, type: 'coins',       coins: 250,  xp:   0,  label: 'Day 17',  description: '250 Coins' },
    { day: 18, type: 'xp',          coins: 100,  xp: 400,  label: 'Day 18',  description: '400 XP + 100 Coins' },
    { day: 19, type: 'coins',       coins: 300,  xp: 200,  label: 'Day 19',  description: '300 Coins + 200 XP' },
    { day: 20, type: 'shield',      coins: 400,  xp: 400,  label: 'Day 20',  description: 'Streak Shield + 400 XP' },
    { day: 21, type: 'coins',       coins: 400,  xp: 200,  label: 'Day 21',  description: '400 Coins + 200 XP' },
    { day: 22, type: 'xp',          coins:   0,  xp: 500,  label: 'Day 22',  description: '500 XP' },
    { day: 23, type: 'coins',       coins: 450,  xp: 300,  label: 'Day 23',  description: '450 Coins + 300 XP' },
    { day: 24, type: 'xp',          coins: 200,  xp: 600,  label: 'Day 24',  description: '600 XP + 200 Coins' },
    { day: 25, type: 'coins',       coins: 500,  xp: 400,  label: 'Day 25',  description: '500 Coins + 400 XP' },
    { day: 26, type: 'shield',      coins: 500,  xp: 500,  label: 'Day 26',  description: 'Streak Shield + 500 XP' },
    { day: 27, type: 'coins',       coins: 500,  xp: 500,  label: 'Day 27',  description: '500 Coins + 500 XP' },
    { day: 28, type: 'xp',          coins: 300,  xp: 700,  label: 'Day 28',  description: '700 XP + 300 Coins' },
    { day: 29, type: 'coins',       coins: 600,  xp: 600,  label: 'Day 29',  description: '600 Coins + 600 XP' },
    { day: 30, type: 'premium',     coins:1000,  xp:1000,  label: 'Day 30',  description: 'Premium Reward: 1000 Coins + 1000 XP' },
  ];
}

// ─────────────────────────────────────────────────────────────
// LOGIN STREAK & DAILY REWARD
// ─────────────────────────────────────────────────────────────

export async function getLoginStreak(uid: string): Promise<LoginStreak> {
  const ref  = doc(db, 'login_streaks', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as LoginStreak;
  const defaults: LoginStreak = {
    uid, currentLoginDay: 0, lastLoginDate: '',
    longestCycle: 0, totalLoginDays: 0,
    updatedAt: serverTimestamp() as Timestamp,
  };
  await setDoc(ref, defaults);
  return defaults;
}

export async function processAppOpen(uid: string): Promise<{
  loginStreak: LoginStreak;
  canClaim: boolean;
  currentReward: Omit<LoginReward, 'claimed' | 'claimedAt'>;
}> {
  const today    = todayKey();
  const ls       = await getLoginStreak(uid);
  const schedule = getLoginRewardSchedule();
  const yesterday = dateKeyFor((() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })());

  let newDay = ls.currentLoginDay;
  let isNew  = false;

  if (ls.lastLoginDate !== today) {
    isNew = true;
    if (ls.lastLoginDate === yesterday || ls.lastLoginDate === '') {
      // Consecutive or first login
      newDay = (ls.currentLoginDay % 30) + 1;
    } else {
      // Missed a day — reset cycle
      newDay = 1;
    }

    const updated: Partial<LoginStreak> = {
      currentLoginDay: newDay,
      lastLoginDate:   today,
      totalLoginDays:  (ls.totalLoginDays ?? 0) + 1,
      longestCycle:    Math.max(ls.longestCycle ?? 0, newDay),
      updatedAt:       serverTimestamp() as Timestamp,
    };
    await setDoc(doc(db, 'login_streaks', uid), { ...ls, ...updated });
    Object.assign(ls, updated);
  }

  const dayIdx = (newDay - 1 + 30) % 30;
  const reward = schedule[dayIdx];
  const canClaim = isNew || ls.lastLoginDate === today;

  return { loginStreak: ls, canClaim, currentReward: reward };
}

export async function claimLoginReward(uid: string): Promise<{ xp: number; coins: number; shield: boolean }> {
  const today    = todayKey();
  const ref      = doc(db, 'login_streaks', uid);
  const snap     = await getDoc(ref);
  if (!snap.exists()) return { xp: 0, coins: 0, shield: false };

  const ls       = snap.data() as LoginStreak;
  const schedule = getLoginRewardSchedule();
  const dayIdx   = ((ls.currentLoginDay - 1 + 30) % 30);
  const reward   = schedule[dayIdx];

  // Record claim in sub-collection
  await addDoc(collection(db, 'login_streaks', uid, 'claims'), {
    day: ls.currentLoginDay, dateKey: today, reward,
    claimedAt: serverTimestamp(),
  });

  // Grant rewards
  const xp    = reward.xp    ?? 0;
  const coins = reward.coins ?? 0;
  const shield = reward.type === 'shield';

  await addRewards(uid, xp, coins);

  if (shield) {
    await addStreakShield(uid, 1);
  }

  // Mark claimed for today (store in login_streaks doc)
  await updateDoc(ref, {
    [`claimedDays.${today}`]: true,
    updatedAt: serverTimestamp(),
  });

  return { xp, coins, shield };
}

export async function hasClaimedTodayLogin(uid: string): Promise<boolean> {
  const today = todayKey();
  const snap  = await getDoc(doc(db, 'login_streaks', uid));
  if (!snap.exists()) return false;
  const data = snap.data();
  return !!(data.claimedDays?.[today]);
}

// ─────────────────────────────────────────────────────────────
// STREAK SHIELDS
// ─────────────────────────────────────────────────────────────

export async function getStreakShields(uid: string): Promise<StreakShield> {
  const ref  = doc(db, 'streak_shields', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as StreakShield;
  const defaults: StreakShield = {
    uid, shields: 0, usedDates: [], updatedAt: serverTimestamp() as Timestamp,
  };
  await setDoc(ref, defaults);
  return defaults;
}

export async function addStreakShield(uid: string, count: number): Promise<void> {
  const ref  = doc(db, 'streak_shields', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { shields: Math.max(0, (snap.data().shields ?? 0) + count), updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, { uid, shields: count, usedDates: [], updatedAt: serverTimestamp() });
  }
}

export async function useStreakShield(uid: string): Promise<boolean> {
  const ref  = doc(db, 'streak_shields', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data() as StreakShield;
  if (data.shields <= 0) return false;
  const today = todayKey();
  await updateDoc(ref, {
    shields:    data.shields - 1,
    usedDates:  [...(data.usedDates ?? []), today],
    updatedAt:  serverTimestamp(),
  });
  return true;
}

// ─────────────────────────────────────────────────────────────
// DAILY MISSIONS
// ─────────────────────────────────────────────────────────────

const MISSION_POOL: Omit<DailyMission, 'id' | 'uid' | 'dateKey' | 'progress' | 'completed' | 'claimed' | 'createdAt'>[] = [
  { title: 'Morning Scan',        description: 'Scan 1 SKM Egg QR code',        type: 'scan_egg',      target: 1,  xpReward:  75, coinReward: 20 },
  { title: 'Double Egg Day',      description: 'Scan 2 SKM Egg QR codes',       type: 'scan_egg',      target: 2,  xpReward: 100, coinReward: 30 },
  { title: 'Protein Kickstart',   description: 'Log 30g of protein today',      type: 'reach_protein', target: 30, xpReward:  75, coinReward: 20 },
  { title: 'Half Goal Hero',      description: 'Reach 50% of your daily goal',  type: 'reach_50pct',   target: 1,  xpReward:  50, coinReward: 15 },
  { title: 'Daily Check-in',      description: 'Open the app today',            type: 'open_app',      target: 1,  xpReward:  30, coinReward: 10 },
  { title: 'Streak Keeper',       description: 'Maintain your current streak',  type: 'maintain_streak', target: 1, xpReward: 100, coinReward: 30 },
  { title: 'Food Logger',         description: 'Log 2 food entries today',      type: 'log_food',      target: 2,  xpReward:  60, coinReward: 15 },
  { title: 'Nutrition Champion',  description: 'Reach your full protein goal',  type: 'reach_protein', target: 60, xpReward: 150, coinReward: 50 },
  { title: 'Triple Scanner',      description: 'Scan 3 SKM Egg QR codes',      type: 'scan_egg',      target: 3,  xpReward: 150, coinReward: 50 },
];

function pickDailyMissions(dateKey: string): typeof MISSION_POOL {
  // Deterministic shuffle based on date so every user sees same 3 on same day
  const seed = dateKey.replace(/-/g, '');
  const idx  = parseInt(seed, 10) % MISSION_POOL.length;
  const picks: typeof MISSION_POOL = [];
  for (let i = 0; i < 3; i++) {
    picks.push(MISSION_POOL[(idx + i * 3) % MISSION_POOL.length]);
  }
  return picks;
}

export async function getDailyMissions(uid: string): Promise<DailyMission[]> {
  const today = todayKey();
  const q     = query(
    collection(db, 'daily_missions', uid, 'days'),
    where('dateKey', '==', today)
  );
  const snap  = await getDocs(q);

  if (snap.docs.length >= 3) {
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as DailyMission));
  }

  // Generate new missions for today
  const pool    = pickDailyMissions(today);
  const result: DailyMission[] = [];
  for (const def of pool) {
    const mission: Omit<DailyMission, 'id'> = {
      ...def, uid, dateKey: today,
      progress: 0, completed: false, claimed: false,
      createdAt: serverTimestamp() as Timestamp,
    };
    const ref = await addDoc(collection(db, 'daily_missions', uid, 'days'), mission);
    result.push({ ...mission, id: ref.id });
  }
  return result;
}

export async function updateMissionProgress(uid: string, type: DailyMission['type'], amount: number): Promise<string[]> {
  const missions   = await getDailyMissions(uid);
  const completed: string[] = [];

  for (const m of missions) {
    if (m.completed || m.type !== type) continue;
    const newProgress = Math.min(m.target, m.progress + amount);
    const nowDone     = newProgress >= m.target;
    await updateDoc(doc(db, 'daily_missions', uid, 'days', m.id), {
      progress: newProgress,
      completed: nowDone,
    });
    if (nowDone) completed.push(m.id);
  }
  return completed;
}

export async function claimDailyMission(uid: string, missionId: string): Promise<{ xp: number; coins: number }> {
  const ref  = doc(db, 'daily_missions', uid, 'days', missionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { xp: 0, coins: 0 };
  const m = snap.data() as DailyMission;
  if (!m.completed || m.claimed) return { xp: 0, coins: 0 };
  await updateDoc(ref, { claimed: true });
  await addRewards(uid, m.xpReward, m.coinReward);
  return { xp: m.xpReward, coins: m.coinReward };
}

// ─────────────────────────────────────────────────────────────
// WEEKLY MISSIONS
// ─────────────────────────────────────────────────────────────

const WEEKLY_POOL: Omit<WeeklyMission, 'id' | 'uid' | 'weekKey' | 'progress' | 'completed' | 'claimed' | 'createdAt'>[] = [
  { title: 'Egg Master',       description: 'Scan 10 SKM Eggs this week',       type: 'scan_eggs',    target: 10,  xpReward: 200, coinReward:  75 },
  { title: 'Protein Week',     description: 'Log 250g protein this week',       type: 'total_protein', target: 250, xpReward: 300, coinReward: 100 },
  { title: 'Goal Week',        description: 'Reach daily goal 5 times',         type: 'goal_days',    target: 5,   xpReward: 400, coinReward: 150 },
  { title: 'Streak Builder',   description: 'Log eggs 7 days in a row',         type: 'streak_days',  target: 7,   xpReward: 500, coinReward: 200 },
  { title: 'Power Week',       description: 'Log 400g protein this week',       type: 'total_protein', target: 400, xpReward: 500, coinReward: 175 },
  { title: 'QR Champion',      description: 'Scan 15 SKM Eggs this week',      type: 'scan_eggs',    target: 15,  xpReward: 400, coinReward: 150 },
];

export async function getWeeklyMissions(uid: string): Promise<WeeklyMission[]> {
  const weekKey = getWeekKey();
  const q       = query(
    collection(db, 'weekly_missions', uid, 'weeks'),
    where('weekKey', '==', weekKey)
  );
  const snap = await getDocs(q);
  if (snap.docs.length >= 2) {
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyMission));
  }

  // Pick 2 weekly missions
  const weekNum = parseInt(weekKey.replace(/-/g, ''), 10) % WEEKLY_POOL.length;
  const picks   = [WEEKLY_POOL[weekNum % WEEKLY_POOL.length], WEEKLY_POOL[(weekNum + 2) % WEEKLY_POOL.length]];
  const result: WeeklyMission[] = [];

  for (const def of picks) {
    const m: Omit<WeeklyMission, 'id'> = {
      ...def, uid, weekKey,
      progress: 0, completed: false, claimed: false,
      createdAt: serverTimestamp() as Timestamp,
    };
    const ref = await addDoc(collection(db, 'weekly_missions', uid, 'weeks'), m);
    result.push({ ...m, id: ref.id });
  }
  return result;
}

export async function claimWeeklyMission(uid: string, missionId: string): Promise<{ xp: number; coins: number }> {
  const weekKey = getWeekKey();
  const ref     = doc(db, 'weekly_missions', uid, 'weeks', missionId);
  const snap    = await getDoc(ref);
  if (!snap.exists()) return { xp: 0, coins: 0 };
  const m = snap.data() as WeeklyMission;
  if (!m.completed || m.claimed) return { xp: 0, coins: 0 };
  await updateDoc(ref, { claimed: true });
  await addRewards(uid, m.xpReward, m.coinReward);
  return { xp: m.xpReward, coins: m.coinReward };
}

// ─────────────────────────────────────────────────────────────
// GAME REWARDS
// ─────────────────────────────────────────────────────────────

export const GAME_REWARDS_CATALOG: Omit<GameReward, 'unlocked' | 'unlockedAt'>[] = [
  { id: 'skin_10_eggs',     title: 'Bronze Egg Skin',    description: 'Scan 10 Eggs',          type: 'skin',      requirement: '10 Eggs Scanned',    threshold: 10,  field: 'lifetimeConsumption' },
  { id: 'skin_50_eggs',     title: 'Silver Egg Skin',    description: 'Scan 50 Eggs',          type: 'skin',      requirement: '50 Eggs Scanned',    threshold: 50,  field: 'lifetimeConsumption' },
  { id: 'skin_100_eggs',    title: 'Gold Egg Skin',      description: 'Scan 100 Eggs',         type: 'skin',      requirement: '100 Eggs Scanned',   threshold: 100, field: 'lifetimeConsumption' },
  { id: 'char_7streak',     title: 'Rare Egg Character', description: '7-Day Streak',          type: 'character', requirement: '7-Day Streak',       threshold: 7,   field: 'currentConsumptionStreak' },
  { id: 'char_30streak',    title: 'Special Runner',     description: '30-Day Streak',         type: 'character', requirement: '30-Day Streak',      threshold: 30,  field: 'currentConsumptionStreak' },
  { id: 'leg_100eggs',      title: 'Legendary Reward',   description: '100 Total Eggs',        type: 'legendary', requirement: '100 Eggs Total',     threshold: 100, field: 'lifetimeConsumption' },
  { id: 'leg_best50',       title: 'Champion Runner',    description: '50-Day Best Streak',    type: 'legendary', requirement: 'Best Streak 50 Days',threshold: 50,  field: 'bestConsumptionStreak' },
];

export async function checkAndUnlockGameRewards(uid: string): Promise<string[]> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return [];
  const userData = userSnap.data();

  const colRef  = collection(db, 'game_rewards', uid, 'unlocked');
  const existing = new Map((await getDocs(colRef)).docs.map(d => [d.id, true]));
  const newUnlocked: string[] = [];

  for (const reward of GAME_REWARDS_CATALOG) {
    if (existing.has(reward.id)) continue;
    const val = (userData[reward.field] as number) ?? 0;
    if (val >= reward.threshold) {
      await setDoc(doc(colRef, reward.id), {
        ...reward, unlocked: true, unlockedAt: serverTimestamp(),
      });
      newUnlocked.push(reward.id);
    }
  }
  return newUnlocked;
}

export async function getGameRewards(uid: string): Promise<GameReward[]> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  const userData = userSnap.exists() ? userSnap.data() : {};
  const colRef   = collection(db, 'game_rewards', uid, 'unlocked');
  const existing = new Map((await getDocs(colRef)).docs.map(d => [d.id, d.data() as GameReward]));

  return GAME_REWARDS_CATALOG.map(r => {
    if (existing.has(r.id)) return existing.get(r.id)!;
    const val = (userData[r.field] as number) ?? 0;
    return { ...r, unlocked: false, progress: val };
  });
}

// ─────────────────────────────────────────────────────────────
// SMART MOTIVATION ENGINE
// ─────────────────────────────────────────────────────────────

export interface MotivationContext {
  name:              string;
  consumed:          number;
  goal:              number;
  streak:            number;
  yesterdayProtein:  number;
  nearestReward?:    { label: string; remaining: number };
  shields:           number;
  loginDay:          number;
  unclaimedMissions: number;
}

export function getSmartMotivation(ctx: MotivationContext): string[] {
  const { name, consumed, goal, streak, yesterdayProtein, nearestReward, shields, loginDay, unclaimedMissions } = ctx;
  const pct       = goal > 0 ? Math.round((consumed / goal) * 100) : 0;
  const remaining = Math.max(0, goal - consumed);
  const eggsLeft  = Math.ceil(remaining / 6);
  const msgs: string[] = [];

  // Remaining protein
  if (remaining > 0 && remaining <= 12)
    msgs.push(`Only ${remaining}g remaining — ${eggsLeft} more SKM egg${eggsLeft !== 1 ? 's' : ''} will reach your goal.`);
  else if (remaining > 0 && remaining <= 30)
    msgs.push(`You are ${pct}% towards your goal. Keep going!`);

  // Vs yesterday
  if (yesterdayProtein > 0 && consumed > yesterdayProtein)
    msgs.push(`You are ahead of yesterday's intake by ${consumed - yesterdayProtein}g. Keep it up!`);
  else if (yesterdayProtein > 0 && consumed < yesterdayProtein)
    msgs.push(`Yesterday you logged ${yesterdayProtein}g. Today you're at ${consumed}g — time to catch up.`);

  // Goal just met
  if (pct >= 100)
    msgs.push(`Outstanding, ${name}! Daily protein goal achieved.`);

  // Streak
  if (streak >= 3)
    msgs.push(`${streak}-day streak active. Scan today to keep it going.`);
  else if (streak === 0)
    msgs.push(`Start your streak today — scan your first SKM egg!`);

  // Nearest game reward
  if (nearestReward && nearestReward.remaining <= 5)
    msgs.push(`Only ${nearestReward.remaining} more ${nearestReward.label} to unlock a game reward!`);

  // Shields
  if (shields > 0)
    msgs.push(`You have ${shields} streak shield${shields > 1 ? 's' : ''} protecting your progress.`);

  // Login reward
  if (loginDay > 0)
    msgs.push(`Day ${loginDay} login reward available. Don't miss your daily bonus.`);

  // Missions
  if (unclaimedMissions > 0)
    msgs.push(`${unclaimedMissions} completed mission${unclaimedMissions > 1 ? 's' : ''} ready to claim.`);

  // Fallback
  if (msgs.length === 0)
    msgs.push(`Good to see you, ${name}. Scan your SKM egg to start your day right.`);

  return msgs.slice(0, 3);
}

// ─────────────────────────────────────────────────────────────
// RETURN SUMMARY (app-open overview)
// ─────────────────────────────────────────────────────────────

export async function buildReturnSummary(uid: string, name: string): Promise<ReturnSummary> {
  const today     = todayKey();
  const yesterday = dateKeyFor((() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })());

  const [
    userSnap, streakInfo, shieldData, missions, loginSnap, wallet,
  ] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getStreakInfo(uid),
    getStreakShields(uid),
    getDailyMissions(uid),
    getDoc(doc(db, 'login_streaks', uid)),
    getDoc(doc(db, 'tracker_rewards', uid)),
  ]);

  // Today / yesterday stats
  const [todayStat, yestStat] = await Promise.all([
    getDoc(doc(db, 'daily_stats', uid, 'days', today)),
    getDoc(doc(db, 'daily_stats', uid, 'days', yesterday)),
  ]);

  const todayP  = todayStat.exists()  ? (todayStat.data().totalProtein  as number) : 0;
  const yesterP = yestStat.exists()   ? (yestStat.data().totalProtein   as number) : 0;

  const loginData     = loginSnap.exists() ? loginSnap.data() as LoginStreak : null;
  const hasClaimed    = !!(loginData?.claimedDays?.[today]);
  const walletData    = wallet.exists() ? wallet.data() : { totalXP: 0, coins: 0 };
  const levelInfo     = calcLevel(walletData.totalXP ?? 0);

  const unclaimedMissions = missions.filter(m => m.completed && !m.claimed).length;

  // Nearest game reward
  const userData     = userSnap.exists() ? userSnap.data() : {};
  const gameRewCatalog = GAME_REWARDS_CATALOG;
  let nearestReward: { label: string; remaining: number } | undefined;
  for (const r of gameRewCatalog) {
    const val  = (userData[r.field] as number) ?? 0;
    const diff = r.threshold - val;
    if (diff > 0 && diff <= 10) {
      nearestReward = { label: r.requirement, remaining: diff };
      break;
    }
  }

  const motivationCtx: MotivationContext = {
    name, consumed: todayP, goal: 60,
    streak:  streakInfo.currentStreak,
    yesterdayProtein: yesterP,
    nearestReward,
    shields: shieldData.shields ?? 0,
    loginDay: loginData?.currentLoginDay ?? 0,
    unclaimedMissions,
  };

  return {
    proteinsYesterday:    yesterP,
    proteinsToday:        todayP,
    proteinDelta:         todayP - yesterP,
    streak:               streakInfo.currentStreak,
    streakProtected:      (shieldData.shields ?? 0) > 0,
    unclaimedLoginReward: !hasClaimed,
    unclaimedMissions,
    unclaimedChallenges:  0,
    activeMissions:       missions.filter(m => !m.completed),
    loginDay:             loginData?.currentLoginDay ?? 1,
    coinsAvailable:       walletData.coins ?? 0,
    xpAvailable:          walletData.totalXP ?? 0,
    motivationMessage:    getSmartMotivation(motivationCtx)[0] ?? '',
    levelInfo,
  };
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE RULE HELPERS
// ─────────────────────────────────────────────────────────────

export const RETENTION_COLLECTIONS = [
  'login_streaks',
  'daily_missions',
  'weekly_missions',
  'streak_shields',
  'game_rewards',
] as const;
