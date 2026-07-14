/**
 * SKM Notification Service
 * Handles all Firestore CRUD, real-time listeners, and notification helpers.
 */

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp, getDocs, writeBatch,
  getDoc, setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { renderNotify } from './renderNotificationService';
import type {
  AppNotification,
  NotificationType,
  NotificationPriority,
  NotificationAction,
  NotificationSettings,
  ReminderState,
} from '../../types/notifications';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../../types/notifications';

const NOTIFICATIONS_COL = 'notifications';
const NOTIF_SETTINGS_COL = 'notification_settings';
const REMINDER_STATE_COL = 'reminder_state';
const PAGE_SIZE = 100;

// ─── Helpers ───────────────────────────────────────────────────────────────

function firestoreDocToNotification(id: string, data: Record<string, any>): AppNotification {
  return {
    id,
    userId: data.userId ?? '',
    title: data.title ?? '',
    message: data.message ?? '',
    type: data.type as NotificationType,
    priority: (data.priority ?? 'normal') as NotificationPriority,
    read: data.read ?? false,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt ?? Date.now()),
    expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate() : undefined,
    actionUrl: data.actionUrl,
    actions: data.actions,
    metadata: data.metadata,
    targetAll: data.targetAll,
    route: data.route ?? undefined,
    section: data.section ?? undefined,
    entityId: data.entityId ?? undefined,
  };
}

// ─── Create ────────────────────────────────────────────────────────────────

export interface CreateNotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
  actionUrl?: string;
  actions?: NotificationAction[];
  metadata?: Record<string, string | number | boolean>;
  expiresAt?: Date;
  targetAll?: boolean;
  // Optional smart-navigation overrides — most callers omit these and let
  // resolveNavTarget() derive the destination from `type` + `metadata`.
  route?: string;
  section?: string;
  entityId?: string;
}

export async function createNotification(payload: CreateNotificationPayload): Promise<string> {
  // Duplicate guard: skip if an identical notification was created within the last 60 seconds
  const cutoff = Timestamp.fromDate(new Date(Date.now() - 60_000));
  const dupQ = query(
    collection(db, NOTIFICATIONS_COL),
    where('userId', '==', payload.userId),
    where('type',   '==', payload.type),
    limit(10)
  );
  const existing = await getDocs(dupQ);
  for (const d of existing.docs) {
    const data = d.data();
    if (
      data.title   === payload.title &&
      data.message === payload.message &&
      data.createdAt instanceof Timestamp &&
      data.createdAt.toMillis() >= cutoff.toMillis()
    ) {
      console.log('[Notifications] Duplicate Prevented —', payload.type, payload.title);
      return d.id;
    }
  }

  console.log('[Notifications] Notification Created —', payload.type, payload.title);
  const ref = await addDoc(collection(db, NOTIFICATIONS_COL), {
    userId:    payload.userId,
    title:     payload.title,
    message:   payload.message,
    type:      payload.type,
    priority:  payload.priority ?? 'normal',
    read:      false,
    createdAt: serverTimestamp(),
    expiresAt: payload.expiresAt ? Timestamp.fromDate(payload.expiresAt) : null,
    actionUrl: payload.actionUrl ?? null,
    actions:   payload.actions ?? null,
    metadata:  payload.metadata ?? null,
    targetAll: payload.targetAll ?? false,
    route:     payload.route ?? null,
    section:   payload.section ?? null,
    entityId:  payload.entityId ?? null,
  });
  return ref.id;
}

// ─── Read (one-shot) ────────────────────────────────────────────────────────

export async function fetchNotifications(
  userId: string,
  options: { unreadOnly?: boolean; pageSize?: number } = {}
): Promise<AppNotification[]> {
  // Single-field query only — no composite index needed
  const constraints: any[] = [
    where('userId', '==', userId),
    limit(options.pageSize ?? PAGE_SIZE),
  ];
  if (options.unreadOnly) constraints.push(where('read', '==', false));

  const q = query(collection(db, NOTIFICATIONS_COL), ...constraints);
  const snap = await getDocs(q);
  const results = snap.docs.map(d => firestoreDocToNotification(d.id, d.data()));
  // Sort newest-first client-side
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ─── Real-time listener ─────────────────────────────────────────────────────
// Single listener on the user's own notifications only.
// Sorting is done client-side; no Firestore composite index required.
// The snapshot always REPLACES local state — never merged with stale data.

export function subscribeToNotifications(
  userId: string,
  onUpdate: (notifications: AppNotification[]) => void
): () => void {
  console.log('[Notifications] Listener Started — uid:', userId);

  const q = query(
    collection(db, NOTIFICATIONS_COL),
    where('userId', '==', userId),
    limit(PAGE_SIZE)
  );

  const unsub = onSnapshot(q, snap => {
    const docs = snap.docs.map(d => firestoreDocToNotification(d.id, d.data()));
    // Sort newest-first client-side
    docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const result = docs.slice(0, PAGE_SIZE);
    console.log('[Notifications] Snapshot Count:', result.length);
    onUpdate(result);
  }, (err) => {
    console.error('[Notifications] User query failed:', err.code, err.message);
  });

  return () => {
    console.log('[Notifications] Listener Stopped — uid:', userId);
    unsub();
  };
}

// ─── Mark as read ───────────────────────────────────────────────────────────

export async function markAsRead(notificationId: string): Promise<void> {
  await updateDoc(doc(db, NOTIFICATIONS_COL, notificationId), { read: true });
}

export async function markAllAsRead(userId: string): Promise<void> {
  // Single-field query only (no composite index needed).
  // Filter unread client-side to avoid requiring (userId + read) composite index.
  const q = query(
    collection(db, NOTIFICATIONS_COL),
    where('userId', '==', userId),
    limit(500)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const unread = snap.docs.filter(d => d.data().read === false);
  if (unread.length === 0) return;

  const batch = writeBatch(db);
  unread.forEach(d => batch.update(d.ref, { read: true }));
  await batch.commit();
}

// ─── Delete ─────────────────────────────────────────────────────────────────

export async function deleteNotification(notificationId: string): Promise<void> {
  console.log('[Notifications] Notification Deleted — id:', notificationId);
  await deleteDoc(doc(db, NOTIFICATIONS_COL, notificationId));
}

export async function clearAllNotifications(userId: string): Promise<void> {
  // Delete in chunks of 400 (Firestore batch limit is 500; keep headroom).
  let hasMore = true;
  while (hasMore) {
    const q = query(
      collection(db, NOTIFICATIONS_COL),
      where('userId', '==', userId),
      limit(400)
    );
    const snap = await getDocs(q);
    if (snap.empty) { hasMore = false; break; }

    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    if (snap.size < 400) hasMore = false;
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  const ref = doc(db, NOTIF_SETTINGS_COL, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...snap.data() } as NotificationSettings;
}

export async function saveNotificationSettings(userId: string, settings: NotificationSettings): Promise<void> {
  await setDoc(doc(db, NOTIF_SETTINGS_COL, userId), settings, { merge: true });
}

// ─── Reminder state ──────────────────────────────────────────────────────────

export async function getReminderState(userId: string): Promise<ReminderState> {
  const ref = doc(db, REMINDER_STATE_COL, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { proteinRemindersToday: 0, gameRemindersToday: 0 };
  return snap.data() as ReminderState;
}

export async function saveReminderState(userId: string, state: Partial<ReminderState>): Promise<void> {
  await setDoc(doc(db, REMINDER_STATE_COL, userId), state, { merge: true });
}

// ─── Convenience creators ────────────────────────────────────────────────────

export async function notifyProteinAdded(userId: string, grams: number, total: number): Promise<void> {
  await createNotification({
    userId,
    title: `+${grams}g Protein Added`,
    message: `Your daily protein is now ${total}g. Keep it up!`,
    type: 'protein_added',
    priority: 'normal',
    actionUrl: 'dashboard',
    actions: [{ label: 'View Dashboard', actionType: 'view_dashboard' }],
    metadata: { grams, total },
  });
  renderNotify.proteinAdded(userId, grams, total).catch(() => {});
}

export async function notifyProteinGoalComplete(userId: string, goal: number): Promise<void> {
  await createNotification({
    userId,
    title: 'Daily Protein Goal Reached!',
    message: `Congratulations! You hit ${goal}g today. You're on fire!`,
    type: 'protein_goal_complete',
    priority: 'high',
    actionUrl: 'dashboard',
    actions: [{ label: 'View Stats', actionType: 'view_dashboard' }],
    metadata: { goal },
  });
  renderNotify.proteinGoalComplete(userId, goal).catch(() => {});
}

export async function notifyDuplicateEgg(userId: string): Promise<void> {
  await createNotification({
    userId,
    title: 'Duplicate Egg Detected',
    message: 'This egg has already been consumed today.',
    type: 'protein_duplicate',
    priority: 'normal',
    actions: [{ label: 'Scan New QR', actionType: 'scan_qr' }],
  });
  renderNotify.proteinDuplicate(userId).catch(() => {});
}

export async function notifyGoldenEgg(userId: string): Promise<void> {
  await createNotification({
    userId,
    title: 'Golden Egg Scanned!',
    message: 'You found a Golden Egg. Unlimited plays unlocked!',
    type: 'golden_egg_scanned',
    priority: 'high',
    actionUrl: 'game',
    actions: [{ label: 'Play Game', actionType: 'play_game' }],
  });
  renderNotify.goldenEgg(userId).catch(() => {});
}

export async function notifyStreakMilestone(userId: string, days: number): Promise<void> {
  await createNotification({
    userId,
    title: `${days}-Day Streak!`,
    message: `You've maintained your protein streak for ${days} days straight. Incredible!`,
    type: 'streak_milestone',
    priority: 'high',
    metadata: { days },
  });
  renderNotify.streakMilestone(userId, days).catch(() => {});
}

export async function notifyProteinMilestone(userId: string, total: number): Promise<void> {
  await createNotification({
    userId,
    title: `${total}g Protein Milestone!`,
    message: `You've consumed ${total}g of protein total. Champion!`,
    type: 'protein_milestone',
    priority: 'high',
    metadata: { total },
  });
  renderNotify.proteinMilestone(userId, total).catch(() => {});
}

export async function notifyRewardPointsEarned(userId: string, points: number, currentPoints: number): Promise<void> {
  await createNotification({
    userId,
    title: `🎁 +${points} Reward Points`,
    message: `You now have ${currentPoints} points. Keep scanning to unlock more coupons!`,
    type: 'reward_points_earned',
    priority: 'low',
    actions: [{ label: 'View Rewards', actionType: 'view_dashboard' }],
    metadata: { points, currentPoints },
  });
  renderNotify.rewardPointsEarned(userId, points, currentPoints).catch(() => {});
}

export async function notifyRewardRedeemable(userId: string, message: string): Promise<void> {
  await createNotification({
    userId,
    title: '🎁 A Reward Is Ready to Redeem',
    message,
    type: 'reward_redeemable',
    priority: 'normal',
    actions: [{ label: 'Redeem Now', actionType: 'view_dashboard' }],
  });
  renderNotify.rewardRedeemable(userId, message).catch(() => {});
}

/** Fired right after a successful redemption — distinct from notifyRewardRedeemable (which fires *before*, when a reward becomes affordable). */
export async function notifyRewardRedeemed(userId: string, rewardTitle: string, couponId: string): Promise<void> {
  await createNotification({
    userId,
    title: '✅ Reward Redeemed',
    message: `You redeemed ${rewardTitle}. Find your coupon in History.`,
    type: 'reward_redeemed',
    priority: 'normal',
    metadata: { rewardTitle, couponId },
  });
}

export async function notifyMembershipTierUp(userId: string, tier: string): Promise<void> {
  await createNotification({
    userId,
    title: `⭐ Congratulations! You've Reached ${tier} Membership`,
    message: 'Your loyalty just unlocked a higher SKM Rewards Club tier.',
    type: 'membership_tier_up',
    priority: 'high',
    actions: [{ label: 'View Rewards', actionType: 'view_dashboard' }],
    metadata: { tier },
  });
  renderNotify.membershipTierUp(userId, tier).catch(() => {});
}

export async function notifyCouponExpiring(userId: string, rewardTitle: string, daysLeft: number, couponId?: string): Promise<void> {
  await createNotification({
    userId,
    title: '⏳ Coupon Expiring Soon',
    message: `Your ${rewardTitle} expires in ${daysLeft} day(s). Use it before it's gone.`,
    type: 'coupon_expiring',
    priority: 'normal',
    actions: [{ label: 'View Coupons', actionType: 'view_dashboard' }],
    metadata: couponId ? { rewardTitle, daysLeft, couponId } : { rewardTitle, daysLeft },
  });
  renderNotify.couponExpiring(userId, rewardTitle, daysLeft).catch(() => {});
}

export async function notifyChampionRank(userId: string, rank: number): Promise<void> {
  await createNotification({
    userId,
    title: 'Champion Hall Rank Improved!',
    message: `Your ranking has improved to #${rank} in the Champion Hall.`,
    type: 'champion_rank_improved',
    priority: 'normal',
    actionUrl: 'leaderboard',
    metadata: { rank },
  });
  renderNotify.championRank(userId, rank).catch(() => {});
}

export async function notifyNewHighScore(userId: string, score: number): Promise<void> {
  await createNotification({
    userId,
    title: 'New High Score!',
    message: `You set a new personal best of ${score.toLocaleString()} points!`,
    type: 'new_high_score',
    priority: 'high',
    metadata: { score },
  });
  renderNotify.newHighScore(userId, score).catch(() => {});
}

export async function notifyMissionComplete(userId: string, missionName: string): Promise<void> {
  await createNotification({
    userId,
    title: 'Mission Complete!',
    message: `You completed "${missionName}". Claim your reward!`,
    type: 'mission_complete',
    priority: 'normal',
    actions: [{ label: 'View Missions', actionType: 'view_achievement' }],
    metadata: { missionName },
  });
  renderNotify.missionComplete(userId, missionName).catch(() => {});
}

export async function notifyQRValidated(userId: string, plays: number): Promise<void> {
  await createNotification({
    userId,
    title: 'QR Code Validated',
    message: `Access granted! You have ${plays} play${plays !== 1 ? 's' : ''} available.`,
    type: 'qr_validated',
    priority: 'normal',
    actions: [{ label: 'Play Game', actionType: 'play_game' }],
    metadata: { plays },
  });
  renderNotify.qrValidated(userId, plays).catch(() => {});
}

export async function sendAdminAnnouncement(
  targetUserId: string,
  title: string,
  message: string,
  targetAll = false
): Promise<void> {
  await createNotification({
    userId: targetUserId,
    title,
    message,
    type: 'admin_announcement',
    priority: 'high',
    targetAll,
  });
}

// ─── Sticker notifications ───────────────────────────────────────────────────

export async function notifyStickerUnlocked(
  userId: string,
  stickerName: string,
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary',
  days?: number,
): Promise<void> {
  const emoji =
    rarity === 'Legendary' ? '👑' :
    rarity === 'Epic'      ? '🌟' :
    rarity === 'Rare'      ? '✨' : '🎉';

  const title =
    rarity === 'Legendary' ? '👑 Legendary Achievement!' :
    rarity === 'Epic'      ? '🌟 Rare Sticker Found!'    :
    rarity === 'Rare'      ? '✨ Rare Sticker Found!'    :
                             '🎉 New Sticker Unlocked!';

  const message =
    rarity === 'Legendary' ? `You unlocked an exclusive sticker: ${emoji} ${stickerName}. Only a few users will earn this.` :
    rarity === 'Epic'      ? `You've unlocked a rare collectible: ${stickerName}. Check it out now!` :
    rarity === 'Rare'      ? `You've unlocked a rare collectible: ${stickerName}. Check it out now!` :
                             `You earned: 🔥 ${stickerName}. Tap to view your collection.`;

  await createNotification({
    userId,
    title,
    message,
    type: 'sticker_unlocked',
    priority: rarity === 'Legendary' ? 'urgent' : rarity === 'Epic' ? 'high' : 'normal',
    actions: [{ label: 'View Sticker', actionType: 'view_sticker' }],
    metadata: days != null ? { stickerName, rarity, days } : { stickerName, rarity },
  });
  renderNotify.stickerUnlocked(userId, stickerName, rarity).catch(() => {});
}

export async function notifyStickerProgress(
  userId: string,
  owned: number,
  total: number,
): Promise<void> {
  const pct = Math.round((owned / total) * 100);
  await createNotification({
    userId,
    title: '📖 Sticker Album Updated',
    message: `You now own ${owned} of ${total} stickers. Collect them all!`,
    type: 'sticker_collection_progress',
    priority: 'low',
    actions: [{ label: 'View Collection', actionType: 'view_sticker' }],
    metadata: { owned, total, pct },
  });
}

export async function notifyStickerCollectionMilestone(
  userId: string,
  pct: number,
): Promise<void> {
  await createNotification({
    userId,
    title: '🏅 Collection Milestone',
    message: `${pct}% of your sticker album is complete. Keep collecting!`,
    type: 'sticker_collection_progress',
    priority: 'normal',
    actions: [{ label: 'View Collection', actionType: 'view_sticker' }],
    metadata: { pct },
  });
}

// ─── Weekly batch notifications ──────────────────────────────────────────────

export async function notifyWeekComplete(userId: string, batchNumber?: number): Promise<void> {
  await createNotification({
    userId,
    title: '📦 Week Complete!',
    message: "Congratulations! You've completed this week's nutrition batch.",
    type: 'week_complete',
    priority: 'high',
    actions: [{ label: 'View Streak', actionType: 'view_streak' }],
    metadata: batchNumber != null ? { batchNumber } : undefined,
  });
  renderNotify.weekComplete(userId).catch(() => {});
}

export async function notifyNewWeekStarted(userId: string): Promise<void> {
  await createNotification({
    userId,
    title: '📅 New Week Started',
    message: 'A fresh batch begins today. Let\'s keep growing.',
    type: 'new_week_started',
    priority: 'normal',
    actions: [{ label: 'View Streak', actionType: 'view_streak' }],
  });
  renderNotify.newWeekStarted(userId).catch(() => {});
}

// ─── Re-engagement ────────────────────────────────────────────────────────────

export async function notifyMissedOneDay(userId: string): Promise<void> {
  await createNotification({
    userId,
    title: '💛 We Missed You',
    message: 'Come back today and start a fresh streak.',
    type: 'missed_one_day',
    priority: 'normal',
    actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
  });
  renderNotify.reEngage(userId, 'missed_one_day').catch(() => {});
}

export async function notifyMissedThreeDays(userId: string): Promise<void> {
  await createNotification({
    userId,
    title: '🥚 Your Journey Awaits',
    message: 'Healthy habits begin again with one egg.',
    type: 'missed_three_days',
    priority: 'high',
    actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
  });
  renderNotify.reEngage(userId, 'missed_three_days').catch(() => {});
}

// ─── Streak lost ──────────────────────────────────────────────────────────────

export async function notifyStreakLost(userId: string, lostStreak: number): Promise<void> {
  await createNotification({
    userId,
    title: '💔 Streak Lost',
    message: `Your ${lostStreak}-day streak has ended. Start fresh today — every legend has a comeback!`,
    type: 'protein_streak_lost',
    priority: 'high',
    actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
    metadata: { lostStreak },
  });
}

// ─── Collection & rewards ────────────────────────────────────────────────────

export async function notifyMysteryReward(userId: string): Promise<void> {
  await createNotification({
    userId,
    title: '🎁 Mystery Reward Ready',
    message: 'You have an unopened reward. Tap to reveal it.',
    type: 'mystery_reward',
    priority: 'high',
    actions: [{ label: 'View Sticker', actionType: 'view_sticker' }],
  });
  renderNotify.mysteryReward(userId).catch(() => {});
}

// ─── Special occasions ────────────────────────────────────────────────────────

export async function notifyBirthday(userId: string): Promise<void> {
  await createNotification({
    userId,
    title: '🎂 Happy Birthday!',
    message: 'Celebrate with a healthy start today.',
    type: 'birthday',
    priority: 'high',
    actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
  });
}

export async function notifyAnniversary(userId: string, years: number): Promise<void> {
  await createNotification({
    userId,
    title: '🎉 Anniversary',
    message: `You've been part of SKM Protein for ${years === 1 ? 'one year' : `${years} years`}. Thanks for staying healthy with us!`,
    type: 'anniversary',
    priority: 'normal',
    actions: [{ label: 'Open Progress', actionType: 'view_progress' }],
    metadata: { years },
  });
}

// ─── Profile progress / weekly summary ───────────────────────────────────────

export async function notifyWeeklySummary(
  userId: string,
  eggs: number,
  protein: number,
  streak: number,
): Promise<void> {
  await createNotification({
    userId,
    title: '📈 Weekly Summary',
    message: `This week: 🥚 Eggs: ${eggs} · 💪 Protein: ${protein}g · 🔥 Streak: ${streak} Days. Fantastic progress!`,
    type: 'weekly_summary',
    priority: 'normal',
    actions: [{ label: 'Open Progress', actionType: 'view_progress' }],
    metadata: { eggs, protein, streak },
  });
}

// ─── System update ────────────────────────────────────────────────────────────

export async function notifySystemUpdate(userId: string, details?: string): Promise<void> {
  await createNotification({
    userId,
    title: '✨ New Features Available',
    message: details ?? 'Check out the latest improvements in SKM Protein.',
    type: 'system_update',
    priority: 'low',
  });
}

// ─── Protein goal missed ──────────────────────────────────────────────────────

export async function notifyProteinGoalMissed(userId: string, goal: number): Promise<void> {
  await createNotification({
    userId,
    title: '😔 Goal Missed Today',
    message: `You didn't reach your ${goal}g goal today. Tomorrow is a new day!`,
    type: 'protein_goal_missed',
    priority: 'low',
    actions: [{ label: 'Scan Now', actionType: 'scan_qr' }],
    metadata: { goal },
  });
}

export async function notifyDailySummary(
  userId: string,
  protein: number,
  runs: number,
  streak: number,
  rank?: number
): Promise<void> {
  const rankLine = rank ? ` · Rank #${rank}` : '';
  await createNotification({
    userId,
    title: "Today's Summary",
    message: `Protein: ${protein}g · Runs: ${runs} · Streak: ${streak} days${rankLine}`,
    type: 'daily_summary',
    priority: 'low',
    metadata: { protein, runs, streak, rank: rank ?? 0 },
  });
  renderNotify.dailySummary(userId, protein, runs, streak, rank).catch(() => {});
}
