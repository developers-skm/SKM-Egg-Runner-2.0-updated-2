/**
 * SKM Smart Health Profile — Service
 *
 * Firestore collection:
 *   health_profiles/{uid}   — BMI, personalized protein goal, health score
 *
 * This is additive to the protein tracker: it does not touch QR validation,
 * QR management, protein scan logic, streaks, stickers, milestones,
 * notifications, rewards, or the existing dashboard layout. Dashboard only
 * reads `dailyProteinGoal` from here as an override for its fixed goal.
 */

import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { DEFAULT_DAILY_GOAL } from '../../constants/tracker';

export type Gender = 'Male' | 'Female' | 'Other';

export type ActivityLevel = 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active' | 'Athlete';

export const ACTIVITY_LEVELS: ActivityLevel[] = [
  'Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Athlete',
];

// Grams of protein per kg of bodyweight, by activity level.
const PROTEIN_MULTIPLIER: Record<ActivityLevel, number> = {
  'Sedentary':          0.8,
  'Lightly Active':     1.0,
  'Moderately Active':  1.2,
  'Very Active':        1.5,
  'Athlete':            1.8,
};

export const ACTIVITY_LEVEL_DESCRIPTIONS: Record<ActivityLevel, string> = {
  'Sedentary':         'Little to no exercise',
  'Lightly Active':    'Light exercise 1-3 days/week',
  'Moderately Active': 'Moderate exercise 3-5 days/week',
  'Very Active':       'Hard exercise 6-7 days/week',
  'Athlete':           'Elite training or physical job',
};

export type BmiStatus = 'Underweight' | 'Healthy' | 'Overweight' | 'Obese';

export interface HealthProfile {
  userId:           string;
  age:              number;
  gender:           Gender;
  heightCm:         number;
  weightKg:         number;
  activityLevel:    ActivityLevel;
  bmi:              number;
  dailyProteinGoal:   number;
  weeklyProteinGoal:  number;
  monthlyProteinGoal: number;
  waterIntakeMl:      number;
  idealWeightMin:   number;
  idealWeightMax:   number;
  healthScore:      number;
  motivation:       number; // 0-100, decays slightly on inactivity, recovers on scans
  lastActiveDate?:  string; // YYYY-MM-DD, used to compute motivation decay
  // Future-ready fields — safe to populate later without a schema redesign.
  calorieGoal?:     number;
  bodyFatPct?:      number;
  sleepHours?:      number;
  exerciseMinutes?: number;
  muscleMassKg?:    number;
  updatedAt:        Timestamp;
}

export interface HealthProfileInput {
  age:           number;
  gender:        Gender;
  heightCm:      number;
  weightKg:      number;
  activityLevel: ActivityLevel;
}

export function calcBmi(heightCm: number, weightKg: number): number {
  const heightM = heightCm / 100;
  if (heightM <= 0) return 0;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function bmiStatus(bmi: number): BmiStatus {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25)   return 'Healthy';
  if (bmi < 30)   return 'Overweight';
  return 'Obese';
}

export const BMI_STATUS_META: Record<BmiStatus, { emoji: string; color: string; bg: string; explanation: string }> = {
  Underweight: { emoji: '🟦', color: '#2563EB', bg: '#EFF6FF', explanation: 'Your weight is below the healthy range for your height.' },
  Healthy:     { emoji: '🟩', color: '#16A34A', bg: '#F0FDF4', explanation: 'Your weight is within the healthy range for your height.' },
  Overweight:  { emoji: '🟨', color: '#D97706', bg: '#FFFBEB', explanation: 'Your weight is above the healthy range for your height.' },
  Obese:       { emoji: '🟥', color: '#DC2626', bg: '#FEF2F2', explanation: 'Your weight is significantly above the healthy range for your height.' },
};

export function calcIdealWeightRange(heightCm: number): { min: number; max: number } {
  const heightM = heightCm / 100;
  return {
    min: Math.round(18.5 * heightM * heightM * 10) / 10,
    max: Math.round(24.9 * heightM * heightM * 10) / 10,
  };
}

export function calcDailyProteinGoal(weightKg: number, activityLevel: ActivityLevel): number {
  return Math.round(weightKg * PROTEIN_MULTIPLIER[activityLevel]);
}

export function calcWaterIntakeMl(weightKg: number, activityLevel: ActivityLevel): number {
  // Baseline ~33ml/kg, plus an activity bump for higher-exertion levels.
  const activityBonusMl: Record<ActivityLevel, number> = {
    'Sedentary': 0, 'Lightly Active': 250, 'Moderately Active': 500, 'Very Active': 750, 'Athlete': 1000,
  };
  return Math.round((weightKg * 33 + activityBonusMl[activityLevel]) / 50) * 50; // round to nearest 50ml
}

/**
 * 0-100. Factors: BMI proximity to healthy range, protein-goal completion,
 * current streak, weekly consistency, daily scan frequency, and weekly activity.
 */
export function calcHealthScore(opts: {
  bmi: number;
  proteinGoalCompletionPct: number; // 0-100, e.g. today's consumed/goal
  currentStreak: number;
  consistencyPct: number;        // 0-100, % of last 7 days goal was met
  scanFrequencyPct: number;      // 0-100, % of last 7 days with at least one scan
  weeklyActivityPct: number;     // 0-100, days active this week / 7
}): number {
  const {
    bmi, proteinGoalCompletionPct, currentStreak, consistencyPct,
    scanFrequencyPct, weeklyActivityPct,
  } = opts;

  const bmiScore = bmi >= 18.5 && bmi < 25
    ? 100
    : Math.max(0, 100 - Math.abs(bmi - 21.7) * 8);

  const goalScore     = Math.min(100, proteinGoalCompletionPct);
  const streakScore   = Math.min(100, (currentStreak / 30) * 100);
  const consistency   = Math.min(100, consistencyPct);
  const scanFrequency = Math.min(100, scanFrequencyPct);
  const weeklyActivity = Math.min(100, weeklyActivityPct);

  const weighted =
    bmiScore * 0.25 +
    goalScore * 0.25 +
    streakScore * 0.15 +
    consistency * 0.15 +
    scanFrequency * 0.10 +
    weeklyActivity * 0.10;

  return Math.round(Math.max(0, Math.min(100, weighted)));
}

export function healthScoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs Attention';
}

export function getRecommendation(status: BmiStatus): string {
  switch (status) {
    case 'Underweight': return 'Increase protein-rich meals to support healthy weight gain.';
    case 'Healthy':     return 'Maintain your current healthy lifestyle.';
    case 'Overweight':  return 'Maintain a balanced diet and consistent protein intake.';
    case 'Obese':       return 'Focus on portion control alongside consistent protein intake, and consult a nutritionist.';
  }
}

/** Human-readable description of body status — the headline replacement for a bare BMI number. */
export function getBodyStatus(status: BmiStatus): { emoji: string; headline: string; sub: string } {
  switch (status) {
    case 'Underweight':
      return { emoji: '🔵', headline: 'Your body is currently below its healthy range.', sub: "Let's build up with consistent protein-rich meals." };
    case 'Healthy':
      return { emoji: '🟢', headline: 'Your body is currently in a healthy range.', sub: "Keep maintaining today's protein goal." };
    case 'Overweight':
      return { emoji: '🟡', headline: 'Your body is slightly above its healthy range.', sub: 'Steady, consistent habits will bring it back in line.' };
    case 'Obese':
      return { emoji: '🔴', headline: 'Your body needs some extra attention right now.', sub: 'Small consistent changes compound — you can do this.' };
  }
}

/** Generates personalized nutrition-insight lines from live tracker context. Order = priority. */
export function generateInsights(opts: {
  consumedToday: number;
  dailyGoal: number;
  currentStreak: number;
  bestStreak: number;
  consistencyPct: number;
  healthScoreDelta: number; // change vs last check, positive = improving
  daysToNextMilestone?: number;
}): string[] {
  const { consumedToday, dailyGoal, currentStreak, bestStreak, consistencyPct, healthScoreDelta, daysToNextMilestone } = opts;
  const insights: string[] = [];
  const remaining = Math.max(0, dailyGoal - consumedToday);

  if (remaining === 0 && consumedToday > 0) {
    insights.push("Excellent! Today's nutrition goal has been completed.");
  } else if (remaining > 0 && remaining <= 30) {
    insights.push(`You're only ${remaining}g away from today's protein goal.`);
  }
  if (currentStreak > 0 && currentStreak === bestStreak && currentStreak >= 7) {
    insights.push('Your healthy habit is getting stronger.');
  }
  if (daysToNextMilestone !== undefined && daysToNextMilestone > 0 && daysToNextMilestone <= 5) {
    insights.push(`Only ${daysToNextMilestone} more day${daysToNextMilestone === 1 ? '' : 's'} until your next milestone.`);
  }
  if (consistencyPct >= 85) {
    insights.push('Excellent consistency this week.');
  }
  if (healthScoreDelta > 0) {
    insights.push('Your streak improved your Health Score.');
  }
  if (insights.length === 0) {
    insights.push('Keep scanning your SKM eggs daily to build a healthy routine.');
  }
  return insights.slice(0, 3);
}

/** ── TODAY'S EGG BENEFIT ──────────────────────────────────────
 * Rotating daily educational content about SKM eggs and nutrition.
 * General nutrition education only — no medical claims.
 * New cards can be appended here without touching the UI.
 */
export interface EggBenefitCard {
  id:      string;
  title:   string;
  body:    string;
  iconKey: 'egg' | 'heart' | 'leaf' | 'target' | 'trending-up' | 'droplets' | 'award' | 'activity';
}

const EGG_BENEFIT_CARDS: EggBenefitCard[] = [
  { id: 'protein-power',  title: 'Protein Power',    body: 'One egg naturally provides approximately 6g of high-quality protein. Protein helps support muscles and daily body functions.', iconKey: 'egg' },
  { id: 'heart-health',   title: 'Heart Health',     body: 'Eggs contain important nutrients that support a balanced diet. Healthy habits begin with consistency.', iconKey: 'heart' },
  { id: 'brain-support',  title: 'Brain Support',    body: 'Eggs contain choline, which contributes to normal brain function.', iconKey: 'activity' },
  { id: 'eye-health',     title: 'Eye Health',       body: 'Eggs naturally contain lutein and zeaxanthin, which help support healthy vision.', iconKey: 'leaf' },
  { id: 'muscle-recovery',title: 'Muscle Recovery',  body: 'Protein helps maintain and repair muscles after daily activities.', iconKey: 'trending-up' },
  { id: 'vitamin-d',      title: 'Vitamin D',        body: 'Eggs naturally provide Vitamin D, which supports bone health.', iconKey: 'droplets' },
  { id: 'healthy-habit',  title: 'Healthy Habit',    body: 'Every egg scanned keeps your healthy routine alive.', iconKey: 'award' },
];

/**
 * Returns today's rotating egg-benefit card, personalized when live context
 * makes a more relevant message available (goal status takes priority).
 */
export function getTodaysEggBenefit(opts: {
  dailyGoal: number;
  consumedToday: number;
  todayKey: string;
}): EggBenefitCard {
  const { dailyGoal, consumedToday, todayKey: key } = opts;
  const remaining = Math.max(0, dailyGoal - consumedToday);

  if (remaining === 0 && consumedToday > 0) {
    return { id: 'daily-goal-complete', title: 'Daily Goal', body: "Excellent! Today's nutrition goal has been completed.", iconKey: 'target' };
  }
  if (remaining > 0 && remaining <= 20) {
    return { id: 'daily-goal-close', title: 'Daily Goal', body: `Only ${remaining}g protein remaining today. You're getting closer to today's goal.`, iconKey: 'target' };
  }

  // Deterministic daily rotation based on the date, so all users see a stable card per day.
  const dayNumber = parseInt(key.replace(/-/g, ''), 10) || new Date().getDate();
  return EGG_BENEFIT_CARDS[dayNumber % EGG_BENEFIT_CARDS.length];
}

export type HealthLevel = 'Beginner' | 'Healthy' | 'Strong' | 'Champion' | 'Elite' | 'Legend';

const HEALTH_LEVELS: { level: HealthLevel; minStreak: number }[] = [
  { level: 'Beginner', minStreak: 0 },
  { level: 'Healthy',  minStreak: 7 },
  { level: 'Strong',   minStreak: 14 },
  { level: 'Champion', minStreak: 30 },
  { level: 'Elite',    minStreak: 60 },
  { level: 'Legend',   minStreak: 100 },
];

export function calcHealthLevel(currentStreak: number): { level: HealthLevel; index: number; nextLevel: HealthLevel | null; daysToNext: number } {
  let idx = 0;
  for (let i = HEALTH_LEVELS.length - 1; i >= 0; i--) {
    if (currentStreak >= HEALTH_LEVELS[i].minStreak) { idx = i; break; }
  }
  const next = idx < HEALTH_LEVELS.length - 1 ? HEALTH_LEVELS[idx + 1] : null;
  return {
    level: HEALTH_LEVELS[idx].level,
    index: idx,
    nextLevel: next ? next.level : null,
    daysToNext: next ? Math.max(0, next.minStreak - currentStreak) : 0,
  };
}

/** Motivation meter: recovers on scan activity, decays gently on inactivity. Never drops below a floor. */
export function calcMotivation(prevMotivation: number, lastActiveDate: string | undefined, todayKey: string, scannedToday: boolean): number {
  if (scannedToday) return Math.min(100, prevMotivation + 15);
  if (!lastActiveDate) return prevMotivation;
  const daysSince = daysBetween(lastActiveDate, todayKey);
  if (daysSince <= 0) return prevMotivation;
  const decay = Math.min(30, daysSince * 5); // gentle decay, floor protects against punishing users
  return Math.max(40, prevMotivation - decay);
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(fromKey + 'T12:00:00').getTime();
  const to   = new Date(toKey + 'T12:00:00').getTime();
  return Math.round((to - from) / 86400000);
}

function buildProfile(uid: string, input: HealthProfileInput, prev: HealthProfile | null): Omit<HealthProfile, 'updatedAt'> {
  const bmi = calcBmi(input.heightCm, input.weightKg);
  const { min, max } = calcIdealWeightRange(input.heightCm);
  const dailyProteinGoal = calcDailyProteinGoal(input.weightKg, input.activityLevel);
  const waterIntakeMl = calcWaterIntakeMl(input.weightKg, input.activityLevel);
  const healthScore = calcHealthScore({
    bmi, proteinGoalCompletionPct: 0, currentStreak: 0, consistencyPct: 0,
    scanFrequencyPct: 0, weeklyActivityPct: 0,
  });
  const profile: Omit<HealthProfile, 'updatedAt'> = {
    userId: uid,
    age: input.age,
    gender: input.gender,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    activityLevel: input.activityLevel,
    bmi,
    dailyProteinGoal,
    weeklyProteinGoal:  dailyProteinGoal * 7,
    monthlyProteinGoal: dailyProteinGoal * 30,
    waterIntakeMl,
    idealWeightMin: min,
    idealWeightMax: max,
    healthScore,
    motivation: prev?.motivation ?? 100,
  };
  // lastActiveDate is optional and Firestore's default (strict) mode rejects
  // any field with an `undefined` value — only include it when there's a
  // real previous value (i.e. not on a user's first-ever save).
  if (prev?.lastActiveDate) profile.lastActiveDate = prev.lastActiveDate;
  return profile;
}

export async function getHealthProfile(uid: string): Promise<HealthProfile | null> {
  const snap = await getDoc(doc(db, 'health_profiles', uid));
  return snap.exists() ? (snap.data() as HealthProfile) : null;
}

export async function saveHealthProfile(uid: string, input: HealthProfileInput): Promise<HealthProfile> {
  const prev = await getHealthProfile(uid);
  const built = buildProfile(uid, input, prev);
  const data: HealthProfile = { ...built, updatedAt: serverTimestamp() as Timestamp };
  await setDoc(doc(db, 'health_profiles', uid), data, { merge: true });
  return data;
}

/** Recompute health score + motivation from live tracker data without touching other fields. */
export async function refreshHealthScore(uid: string, opts: {
  proteinGoalCompletionPct: number;
  currentStreak: number;
  consistencyPct: number;
  scanFrequencyPct: number;
  weeklyActivityPct: number;
  scannedToday: boolean;
  todayKey: string;
}): Promise<void> {
  const profile = await getHealthProfile(uid);
  if (!profile) return;
  const healthScore = calcHealthScore({
    bmi: profile.bmi,
    proteinGoalCompletionPct: opts.proteinGoalCompletionPct,
    currentStreak: opts.currentStreak,
    consistencyPct: opts.consistencyPct,
    scanFrequencyPct: opts.scanFrequencyPct,
    weeklyActivityPct: opts.weeklyActivityPct,
  });
  const motivation = calcMotivation(profile.motivation ?? 100, profile.lastActiveDate, opts.todayKey, opts.scannedToday);
  await setDoc(doc(db, 'health_profiles', uid), {
    healthScore, motivation, lastActiveDate: opts.todayKey, updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function effectiveDailyGoal(profile: HealthProfile | null): number {
  return profile?.dailyProteinGoal ?? DEFAULT_DAILY_GOAL;
}
