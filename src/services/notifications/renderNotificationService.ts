/**
 * SKM Render Notification Service
 *
 * Client-side helper that POSTs to the Render.com notification server.
 * All calls include a Firebase ID Token for server-side auth verification.
 *
 * The server (render-server/) reads the token, verifies it, looks up the
 * user's FCM token in Firestore via Admin SDK, and calls messaging.send().
 *
 * No FCM server credentials ever touch this file or the browser.
 *
 * Usage:
 *   import { renderNotify } from './renderNotificationService';
 *   await renderNotify.login(uid);
 *   await renderNotify.protein(uid, { grams: 6, total: 12 });
 */

import { getAuth } from 'firebase/auth';

const RENDER_URL: string = (import.meta.env.VITE_RENDER_API_URL as string | undefined) ?? '';

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function getIdToken(): Promise<string | null> {
  try {
    const user = getAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
  if (!RENDER_URL) {
    console.warn('[Render] VITE_RENDER_API_URL is not set — push skipped. Set it in .env after deploying render-server/.');
    return false;
  }

  const idToken = await getIdToken();
  if (!idToken) {
    console.warn('[Render] No authenticated user — push skipped.');
    return false;
  }

  const url = `${RENDER_URL.replace(/\/$/, '')}/notify/${path}`;

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[Render] POST /notify/${path} → HTTP ${res.status}:`, text);
      return false;
    }

    const data = await res.json().catch(() => ({}));
    if (data.success) {
      console.info(`[Render] ✓ /notify/${path} delivered uid=${body['uid']}`);
    } else {
      console.warn(`[Render] /notify/${path} no-op (reason: ${data.reason ?? 'unknown'}) — user may not have FCM token yet.`);
    }
    return !!data.success;
  } catch (err: any) {
    console.error(`[Render] POST /notify/${path} network error:`, err?.message ?? err);
    return false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const renderNotify = {
  /** Called after every successful login. */
  login: (uid: string, email?: string) =>
    post('login', { uid, email: email ?? '' }),

  /** Protein-related events. */
  proteinAdded: (uid: string, grams: number, total: number) =>
    post('protein', { uid, grams, total, type: 'protein_added' }),

  proteinGoalComplete: (uid: string, goal: number) =>
    post('protein', { uid, total: goal, type: 'protein_goal_complete' }),

  proteinDuplicate: (uid: string) =>
    post('protein', { uid, type: 'protein_duplicate' }),

  proteinReminder: (uid: string) =>
    post('protein', { uid, type: 'protein_reminder' }),

  dailyGoalReminder: (uid: string) =>
    post('protein', { uid, type: 'daily_goal_reminder' }),

  goldenEgg: (uid: string) =>
    post('protein', { uid, type: 'golden_egg_scanned' }),

  /** Streak events. */
  streakMilestone: (uid: string, days: number) =>
    post('streak', { uid, days, type: 'streak_milestone' }),

  streakReminder: (uid: string, days: number) =>
    post('streak', { uid, days, type: 'streak_reminder' }),

  /** Game events. */
  newHighScore: (uid: string, score: number) =>
    post('game', { uid, score, type: 'new_high_score' }),

  gameReminder: (uid: string) =>
    post('game', { uid, type: 'game_reminder' }),

  missionComplete: (uid: string, missionName: string) =>
    post('game', { uid, missionName, type: 'mission_complete' }),

  qrValidated: (uid: string, plays: number) =>
    post('game', { uid, plays, type: 'qr_validated' }),

  runCompleted: (uid: string, score: number) =>
    post('game', { uid, score, type: 'run_completed' }),

  /** Achievement events. */
  achievementUnlocked: (uid: string, achievementName: string) =>
    post('achievement', { uid, achievementName, type: 'achievement_unlocked' }),

  proteinMilestone: (uid: string, total: number) =>
    post('achievement', { uid, total, type: 'protein_milestone' }),

  championRank: (uid: string, rank: number) =>
    post('achievement', { uid, rank, type: 'champion_rank_improved' }),

  levelUp: (uid: string) =>
    post('achievement', { uid, type: 'level_up' }),

  /** Daily summary. */
  dailySummary: (uid: string, protein: number, runs: number, streak: number, rank?: number) =>
    post('daily-summary', { uid, protein, runs, streak, rank }),

  /** Admin broadcast — developer only. */
  broadcast: (uid: string, title: string, message: string, target = 'all') =>
    post('broadcast', { uid, title, message, target }),
};
