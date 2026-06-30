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

const ICON = '/THUMBS_POSE__Egg_-removebg-preview.png';

// ─── Web Notifications API fallback (foreground only) ─────────────────────────
// Used when VITE_RENDER_API_URL is not set and the app tab is open.
// Does NOT work when the browser is fully closed — Render server handles that.

function showBrowserNotification(title: string, body: string, clickUrl = '/'): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notif = new Notification(title, {
    body,
    icon:  ICON,
    badge: ICON,
    tag:   'skm-' + Date.now(),
  });

  notif.onclick = () => {
    window.focus();
    notif.close();
    if (clickUrl && clickUrl !== '/') window.location.href = clickUrl;
  };
}

// ─── Click URL map ────────────────────────────────────────────────────────────

function clickUrlFor(type: string): string {
  switch (type) {
    case 'protein_added':
    case 'protein_goal_complete':
    case 'protein_reminder':
    case 'protein_duplicate':
    case 'golden_egg_scanned':
    case 'streak_reminder':
    case 'daily_goal_reminder':
    case 'daily_summary':
    case 'protein_milestone':
    case 'streak_milestone':
      return '/?tab=tracker';
    case 'new_high_score':
    case 'game_reminder':
    case 'mission_complete':
    case 'qr_validated':
    case 'run_completed':
      return '/?tab=game';
    case 'achievement_unlocked':
    case 'level_up':
    case 'champion_rank_improved':
      return '/?tab=profile';
    default:
      return '/';
  }
}

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

function buildFallbackText(body: Record<string, unknown>): { title: string; msg: string } {
  const type = String(body['type'] ?? '');
  switch (type) {
    case 'login':
      return { title: '👋 Welcome Back!', msg: 'You have successfully signed in to SKM.' };
    case 'protein_added':
      return { title: `+${body['grams'] ?? '?'}g Protein Added`, msg: `Daily protein is now ${body['total'] ?? '?'}g. Keep it up!` };
    case 'protein_goal_complete':
      return { title: '🎯 Daily Protein Goal Reached!', msg: `You hit ${body['total'] ?? '?'}g today. You're on fire!` };
    case 'protein_duplicate':
      return { title: '⚠️ Duplicate Egg Detected', msg: 'This egg has already been consumed today.' };
    case 'protein_reminder':
      return { title: '🥚 Time to Fuel Your Day!', msg: "Don't forget today's protein. Scan an SKM Egg!" };
    case 'daily_goal_reminder':
      return { title: '💪 Almost There!', msg: "You're close to today's protein goal. Keep going!" };
    case 'golden_egg_scanned':
      return { title: '🥇 Golden Egg Scanned!', msg: 'Unlimited plays unlocked!' };
    case 'streak_milestone':
      return { title: `🔥 ${body['days'] ?? '?'}-Day Streak!`, msg: `${body['days'] ?? '?'} days straight. Incredible!` };
    case 'streak_reminder':
      return { title: `⏰ Don't Lose Your Streak!`, msg: 'Record today\'s egg before midnight!' };
    case 'new_high_score':
      return { title: '🏆 New High Score!', msg: `New personal best: ${Number(body['score'] ?? 0).toLocaleString()} points!` };
    case 'game_reminder':
      return { title: '🎮 Ready for Another Run?', msg: 'Your chicken is warmed up. Tap to play!' };
    case 'mission_complete':
      return { title: '✅ Mission Complete!', msg: `You completed "${body['missionName'] ?? 'a mission'}". Claim your reward!` };
    case 'qr_validated':
      return { title: '✅ QR Code Validated', msg: `You have ${body['plays'] ?? '?'} plays available.` };
    case 'run_completed':
      return { title: '🐔 Run Complete!', msg: `Score: ${Number(body['score'] ?? 0).toLocaleString()} points.` };
    case 'achievement_unlocked':
      return { title: '🎖️ Achievement Unlocked!', msg: body['achievementName'] ? `You unlocked "${body['achievementName']}"!` : 'New achievement unlocked!' };
    case 'protein_milestone':
      return { title: `🏅 ${body['total'] ?? '?'}g Protein Milestone!`, msg: `You've consumed ${body['total'] ?? '?'}g total. Champion!` };
    case 'champion_rank_improved':
      return { title: '🏆 Champion Rank Improved!', msg: `Your ranking improved to #${body['rank'] ?? '?'}.` };
    case 'level_up':
      return { title: '⬆️ Level Up!', msg: 'You reached a new level. Keep climbing!' };
    case 'daily_summary':
      return { title: "📊 Today's Summary", msg: `Protein: ${body['protein'] ?? 0}g · Runs: ${body['runs'] ?? 0} · Streak: ${body['streak'] ?? 0} days` };
    default:
      return { title: String(body['title'] ?? 'SKM Notification'), msg: String(body['body'] ?? '') };
  }
}

async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
  if (!RENDER_URL) {
    // No Render server deployed yet — show a browser notification while the tab is open.
    // This is the foreground-only fallback. Background/closed-browser pushes require Render.
    const { title, msg } = buildFallbackText(body);
    const type = String(body['type'] ?? path);
    showBrowserNotification(title, msg, clickUrlFor(type));
    console.info(`[FCM] Browser notification shown (foreground fallback): ${title}`);
    return true;
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
