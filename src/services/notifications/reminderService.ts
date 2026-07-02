/**
 * SKM Smart Reminder Service
 *
 * Max 3 reminder notifications per day, 4 time slots:
 *   08:00 — Morning wake-up           (slot: morning)
 *   13:00 — Afternoon protein check   (slot: afternoon, skipped if egg already scanned)
 *   19:00 — Evening streak warning    (slot: evening,   skipped if egg already scanned)
 *   22:00 — Final midnight countdown  (slot: midnight,  skipped if egg already scanned)
 *
 * Rules:
 *   - Each slot fires at most once per day.
 *   - Total reminders per day capped at MAX_REMINDERS_PER_DAY (3).
 *   - Morning slot always fires regardless of scan status.
 *   - Afternoon/Evening/Midnight are cancelled the moment today's egg is scanned.
 *   - Streak warning (evening) only fires if currentStreak >= 3.
 */

import { createNotification, getReminderState, saveReminderState } from './notificationService';
import { getTodayStats, getStreakInfo } from '../protein/proteinTrackerService';
import { todayKey } from '../../utils/dateHelpers';
import { renderNotify } from './renderNotificationService';
import type { NotificationSettings } from '../../types/notifications';

const MAX_REMINDERS_PER_DAY = 3;

function hour(): number {
  return new Date().getHours();
}

export async function checkAndSendReminders(
  userId: string,
  settings: NotificationSettings
): Promise<void> {
  if (!settings.proteinReminders && !settings.streakReminders && !settings.gameReminders) return;

  const today = todayKey();
  const h = hour();

  try {
    const state = await getReminderState(userId);

    // Reset counters on a new day
    const isNewDay = state.lastReminderDate !== today;
    const totalToday       = isNewDay ? 0 : (state.totalRemindersToday ?? 0);
    const morningFired     = !isNewDay && state.morningReminderDate   === today;
    const afternoonFired   = !isNewDay && state.afternoonReminderDate === today;
    const eveningFired     = !isNewDay && state.eveningReminderDate   === today;
    const midnightFired    = !isNewDay && state.midnightReminderDate  === today;

    if (totalToday >= MAX_REMINDERS_PER_DAY) return;

    // Fetch stats once for slots that need them
    const needsStats = (h >= 13) || (h >= 19) || (h >= 22);
    const stats      = needsStats ? await getTodayStats(userId) : null;
    const totalProt  = stats?.totalProtein ?? 0;
    const dailyGoal  = (stats as any)?.goal ?? 60;
    const scannedToday = totalProt > 0;

    // ── SLOT 1: 08:00–08:59 — Morning greeting ──────────────────────────────
    if (settings.proteinReminders && !morningFired && h >= 8 && h < 9) {
      await createNotification({
        userId,
        title: '🥚 Good Morning!',
        message: "Today's healthy streak starts with one egg. Scan your first SKM egg today.",
        type: 'morning_reminder',
        priority: 'normal',
        actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
      });
      renderNotify.proteinReminder(userId).catch(() => {});
      await saveReminderState(userId, {
        ...state,
        morningReminderDate: today,
        lastReminderDate: today,
        totalRemindersToday: totalToday + 1,
      });
      return; // one notification per check cycle
    }

    if (totalToday + (morningFired ? 0 : 0) >= MAX_REMINDERS_PER_DAY) return;

    // ── SLOT 2: 13:00–13:59 — Afternoon protein check ──────────────────────
    if (settings.proteinReminders && !afternoonFired && h >= 13 && h < 14 && !scannedToday) {
      const remaining = Math.max(0, dailyGoal - totalProt);
      await createNotification({
        userId,
        title: '💪 Protein Check',
        message: `You've consumed ${totalProt}g today. ${remaining}g remaining to reach your goal.`,
        type: 'afternoon_reminder',
        priority: 'normal',
        actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
        metadata: { consumed: totalProt, remaining, goal: dailyGoal },
      });
      renderNotify.dailyGoalReminder(userId).catch(() => {});
      await saveReminderState(userId, {
        ...state,
        afternoonReminderDate: today,
        lastReminderDate: today,
        totalRemindersToday: totalToday + 1,
      });
      return;
    }

    const updatedTotal = totalToday + (morningFired ? 0 : 0) + (afternoonFired ? 0 : 0);
    if (updatedTotal >= MAX_REMINDERS_PER_DAY) return;

    // ── SLOT 3: 19:00–19:59 — Evening streak warning ────────────────────────
    if (settings.streakReminders && !eveningFired && h >= 19 && h < 20 && !scannedToday) {
      const streakInfo = await getStreakInfo(userId);
      if (streakInfo.currentStreak >= 3) {
        await createNotification({
          userId,
          title: `🔥 Keep Your ${streakInfo.currentStreak}-Day Streak Alive`,
          message: "Don't lose today's streak. One egg keeps the fire burning.",
          type: 'evening_reminder',
          priority: 'high',
          actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
          metadata: { streak: streakInfo.currentStreak },
        });
        renderNotify.streakReminder(userId, streakInfo.currentStreak).catch(() => {});
        await saveReminderState(userId, {
          ...state,
          eveningReminderDate: today,
          lastReminderDate: today,
          totalRemindersToday: totalToday + 1,
        });
        return;
      }
    }

    // ── SLOT 4: 22:00–22:59 — Final midnight countdown ──────────────────────
    if (settings.streakReminders && !midnightFired && h >= 22 && h < 23 && !scannedToday) {
      await createNotification({
        userId,
        title: '⏰ Final Reminder',
        message: 'Today is almost over. Scan your egg before midnight to continue your streak.',
        type: 'midnight_reminder',
        priority: 'high',
        actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
      });
      renderNotify.streakReminder(userId, 0).catch(() => {});
      await saveReminderState(userId, {
        ...state,
        midnightReminderDate: today,
        lastReminderDate: today,
        totalRemindersToday: totalToday + 1,
      });
      return;
    }

    // ── Legacy: almost-there nudge (15:00–17:59) ────────────────────────────
    if (settings.proteinReminders && h >= 15 && h < 18 && totalProt > 0) {
      const remaining = dailyGoal - totalProt;
      if (remaining > 0 && remaining <= 12) {
        await createNotification({
          userId,
          title: '⚡ Almost There',
          message: `Only ${remaining}g remaining. One more egg will complete today's goal.`,
          type: 'daily_goal_reminder',
          priority: 'normal',
          actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
          metadata: { remaining, goal: dailyGoal },
        });
        renderNotify.dailyGoalReminder(userId).catch(() => {});
        await saveReminderState(userId, {
          ...state,
          lastReminderDate: today,
          totalRemindersToday: totalToday + 1,
        });
      }
    }

  } catch (err) {
    console.warn('[ReminderService] Non-fatal error:', err);
  }
}

export async function sendDailySummaryIfNeeded(
  userId: string,
  settings: NotificationSettings,
  protein: number,
  runs: number,
  streak: number,
  rank?: number,
): Promise<void> {
  if (!settings.dailySummary) return;
  const h = hour();
  if (h < 20 || h > 23) return;

  try {
    const today = todayKey();
    const state = await getReminderState(userId);
    if ((state as any).lastDailySummary === today) return;

    const eggsLine = `🥚 Eggs: ${runs}`;
    const protLine = `💪 Protein: ${protein}g`;
    const strLine  = `🔥 Streak: ${streak} Days`;

    await createNotification({
      userId,
      title: '📈 Weekly Summary',
      message: `This week: ${eggsLine} · ${protLine} · ${strLine}. Fantastic progress!`,
      type: 'daily_summary',
      priority: 'low',
      metadata: { protein, runs, streak, rank: rank ?? 0 },
    });

    renderNotify.dailySummary(userId, protein, runs, streak, rank).catch(() => {});
    await saveReminderState(userId, { ...state, lastDailySummary: today } as any);
  } catch {
    /* non-fatal */
  }
}
