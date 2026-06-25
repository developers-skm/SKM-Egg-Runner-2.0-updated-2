/**
 * userSummaryService — Pre-computed stats for instant Stats page load.
 *
 * Collection: userSummary/{uid}
 *
 * Updated on every QR scan and manual food entry. The Stats page reads this
 * single document first (cached by Firestore), then lazily fetches chart data.
 */

import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, increment, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

export interface UserSummary {
  uid:                string;
  totalProtein:       number;
  totalEggs:          number;
  currentStreak:      number;
  bestStreak:         number;
  goalCompletionRate: number;   // 0-100, based on last 30 days
  averageProtein:     number;   // last 30 days average g/day
  weeklyProtein:      number;   // rolling 7-day total
  monthlyProtein:     number;   // rolling 30-day total
  weeklyEggs:         number;
  monthlyEggs:        number;
  goalsMetThisMonth:  number;
  activeDaysThisMonth:number;
  lastActiveDate:     string;
  updatedAt:          Timestamp;
}

const DEFAULT_SUMMARY = (uid: string): Omit<UserSummary, 'updatedAt'> => ({
  uid,
  totalProtein:        0,
  totalEggs:           0,
  currentStreak:       0,
  bestStreak:          0,
  goalCompletionRate:  0,
  averageProtein:      0,
  weeklyProtein:       0,
  monthlyProtein:      0,
  weeklyEggs:          0,
  monthlyEggs:         0,
  goalsMetThisMonth:   0,
  activeDaysThisMonth: 0,
  lastActiveDate:      '',
});

export async function getUserSummary(uid: string): Promise<UserSummary> {
  const ref  = doc(db, 'userSummary', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as UserSummary;
  const defaults: UserSummary = {
    ...DEFAULT_SUMMARY(uid),
    updatedAt: serverTimestamp() as Timestamp,
  };
  await setDoc(ref, defaults);
  return defaults;
}

/**
 * Called after every QR scan.
 * protein/calories are the amounts for the scanned egg.
 * streak is the updated StreakInfo from updateStreak().
 * weeklyProtein/monthlyProtein are passed in so we don't need extra reads here.
 */
export async function updateSummaryOnScan(
  uid: string,
  protein: number,
  streak: { currentStreak: number; bestStreak: number; lastActiveDate: string },
): Promise<void> {
  const ref = doc(db, 'userSummary', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      ...DEFAULT_SUMMARY(uid),
      totalProtein:   protein,
      totalEggs:      1,
      weeklyProtein:  protein,
      monthlyProtein: protein,
      weeklyEggs:     1,
      monthlyEggs:    1,
      currentStreak:  streak.currentStreak,
      bestStreak:     streak.bestStreak,
      lastActiveDate: streak.lastActiveDate,
      updatedAt:      serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, {
    totalProtein:   increment(protein),
    totalEggs:      increment(1),
    weeklyProtein:  increment(protein),
    monthlyProtein: increment(protein),
    weeklyEggs:     increment(1),
    monthlyEggs:    increment(1),
    currentStreak:  streak.currentStreak,
    bestStreak:     streak.bestStreak,
    lastActiveDate: streak.lastActiveDate,
    updatedAt:      serverTimestamp(),
  });
}

/**
 * Called after every manual food entry.
 */
export async function updateSummaryOnManualEntry(
  uid: string,
  protein: number,
): Promise<void> {
  const ref  = doc(db, 'userSummary', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      ...DEFAULT_SUMMARY(uid),
      totalProtein:   protein,
      weeklyProtein:  protein,
      monthlyProtein: protein,
      updatedAt:      serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, {
    totalProtein:   increment(protein),
    weeklyProtein:  increment(protein),
    monthlyProtein: increment(protein),
    updatedAt:      serverTimestamp(),
  });
}

/**
 * Called when a daily goal is met, to keep goalCompletionRate and goalsMetThisMonth fresh.
 */
export async function updateSummaryOnGoalMet(uid: string, activeDays: number): Promise<void> {
  const ref  = doc(db, 'userSummary', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as UserSummary;
  const newGoalsMet   = (data.goalsMetThisMonth ?? 0) + 1;
  const newActiveDays = activeDays;
  const rate          = Math.round((newGoalsMet / 30) * 100);

  await updateDoc(ref, {
    goalsMetThisMonth:   newGoalsMet,
    activeDaysThisMonth: newActiveDays,
    goalCompletionRate:  rate,
    averageProtein:      data.monthlyProtein > 0 ? Math.round(data.monthlyProtein / 30) : 0,
    updatedAt:           serverTimestamp(),
  });
}

/**
 * Full recompute from daily_stats — called when a month rolls over or data
 * may be stale. Not called on normal app usage; only triggered lazily if the
 * updatedAt is more than 24 hours behind.
 */
export async function syncSummaryFromDailyStats(
  uid: string,
  recentDays: Array<{ totalProtein: number; totalEggs: number; goalMet: boolean } | null>,
  streak: { currentStreak: number; bestStreak: number; lastActiveDate: string },
): Promise<void> {
  const last7  = recentDays.slice(-7);
  const last30 = recentDays;

  const weeklyProtein  = last7.reduce((s, d)  => s + (d?.totalProtein ?? 0), 0);
  const weeklyEggs     = last7.reduce((s, d)  => s + (d?.totalEggs ?? 0), 0);
  const monthlyProtein = last30.reduce((s, d) => s + (d?.totalProtein ?? 0), 0);
  const monthlyEggs    = last30.reduce((s, d) => s + (d?.totalEggs ?? 0), 0);
  const goalsMet       = last30.filter(d => d?.goalMet).length;
  const activeDays     = last30.filter(d => (d?.totalProtein ?? 0) > 0).length;

  await setDoc(doc(db, 'userSummary', uid), {
    uid,
    weeklyProtein,
    weeklyEggs,
    monthlyProtein,
    monthlyEggs,
    goalsMetThisMonth:   goalsMet,
    activeDaysThisMonth: activeDays,
    goalCompletionRate:  Math.round((goalsMet / 30) * 100),
    averageProtein:      Math.round(monthlyProtein / 30),
    currentStreak:       streak.currentStreak,
    bestStreak:          streak.bestStreak,
    lastActiveDate:      streak.lastActiveDate,
    updatedAt:           serverTimestamp(),
  }, { merge: true });
}
