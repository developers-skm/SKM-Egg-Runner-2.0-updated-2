/**
 * Smart Notification Navigation — maps a tapped notification to where it
 * should take the user (screen, tab, sub-section, and the specific card to
 * highlight/scroll to). Pure function, no side effects — the caller (
 * NotificationItem) is responsible for calling `navigateTo()` and closing
 * the drawer.
 *
 * Every notification's Firestore doc already carries `type` and, for the
 * types below, enough `metadata` to resolve a precise target. If a type has
 * no mapping here, `resolveNavTarget` returns null and the caller falls back
 * to just opening the notification's own detail view — it must never throw
 * or crash on an unmapped/unknown type.
 */

import type { AppNotification } from '../../types/notifications';
import type { NavTarget } from '../../context/NavigationContext';

export function resolveNavTarget(n: AppNotification): NavTarget | null {
  const meta = n.metadata ?? {};

  switch (n.type) {
    // ── Egg Scan → Protein Home Dashboard, highlight today's protein card ──
    case 'protein_added':
    case 'protein_duplicate':
    case 'golden_egg_scanned':
      return { screen: 'PROTEIN_TRACKER', tab: 'dashboard', entityId: 'today-protein-card' };

    // ── Protein Goal Reached → Protein Dashboard, highlight Daily Goal card ──
    case 'protein_goal_complete':
    case 'protein_goal_missed':
      return { screen: 'PROTEIN_TRACKER', tab: 'dashboard', entityId: 'today-goal-card' };

    // ── Daily Streak → Streak Page, show celebration section ──
    case 'streak_milestone':
    case 'protein_streak_increased':
      return {
        screen: 'PROTEIN_TRACKER', tab: 'streaks', section: 'milestone-road',
        entityId: typeof meta.days === 'number' ? String(meta.days) : undefined,
      };
    case 'protein_streak_lost':
      return { screen: 'PROTEIN_TRACKER', tab: 'streaks' };

    // ── Sticker Unlocked → Profile → Sticker Collection → open unlock modal ──
    case 'sticker_unlocked':
      return {
        screen: 'PROTEIN_TRACKER', tab: 'profile', section: 'stickers',
        entityId: typeof meta.days === 'number' ? String(meta.days) : undefined,
      };
    case 'sticker_collection_progress':
    case 'mystery_reward':
      return { screen: 'PROTEIN_TRACKER', tab: 'profile', section: 'stickers' };

    // ── Membership Upgrade → Rewards → Overview, highlight Membership Card ──
    case 'membership_tier_up':
      return { screen: 'PROTEIN_TRACKER', tab: 'rewards', section: 'overview', entityId: 'membership-card' };

    // ── Reward Points Earned → Rewards → Overview, scroll to Reward Balance ──
    case 'reward_points_earned':
      return { screen: 'PROTEIN_TRACKER', tab: 'rewards', section: 'overview', entityId: 'reward-balance' };

    // ── Coupon Unlocked / Reward ready → Rewards → Coupons, open the coupon ──
    case 'reward_redeemable':
      return { screen: 'PROTEIN_TRACKER', tab: 'rewards', section: 'coupons' };

    // ── Coupon Expiring → Rewards → Coupons, highlight the expiring coupon ──
    case 'coupon_expiring':
      return {
        screen: 'PROTEIN_TRACKER', tab: 'rewards', section: 'coupons',
        entityId: typeof meta.couponId === 'string' ? meta.couponId : undefined,
        metadata: { statusFilter: 'available' },
      };

    // ── Reward Redeemed → Rewards → History, highlight the redemption entry ──
    case 'reward_redeemed':
      return {
        screen: 'PROTEIN_TRACKER', tab: 'rewards', section: 'history',
        entityId: typeof meta.couponId === 'string' ? meta.couponId : undefined,
      };

    // ── Weekly Batch Complete → Streak Page → Weekly Batches, highlight batch ──
    case 'week_complete':
      return {
        screen: 'PROTEIN_TRACKER', tab: 'streaks', section: 'weekly-batches',
        entityId: typeof meta.batchNumber === 'number' ? String(meta.batchNumber) : undefined,
      };
    case 'new_week_started':
      return { screen: 'PROTEIN_TRACKER', tab: 'streaks', section: 'weekly-batches' };

    // ── Daily Reminder → Scan Page ──
    case 'daily_goal_reminder':
    case 'protein_reminder':
    case 'streak_reminder':
    case 'morning_reminder':
    case 'afternoon_reminder':
    case 'evening_reminder':
    case 'midnight_reminder':
    case 'missed_one_day':
    case 'missed_three_days':
    case 'birthday':
      return { screen: 'PROTEIN_TRACKER', tab: 'scan' };

    // ── Health Insight → Health Intelligence → Insights tab ──
    // (Health Intelligence is reached through Profile in this app — there is
    // no top-level tab for it, so we route to Profile and let ProfileScreen
    // open HealthProfileScreen with the Insights tab pre-selected.)
    case 'weekly_summary':
    case 'daily_summary':
      return {
        screen: 'PROTEIN_TRACKER', tab: 'profile', section: 'health',
        metadata: { healthTab: 'insights' },
      };

    // ── BMI Reminder → Health Intelligence → Body tab, highlight BMI card ──
    // No dedicated BMI notification type exists yet; anniversary doubles as
    // the closest "check your body stats" nudge in the current type set.
    case 'anniversary':
      return {
        screen: 'PROTEIN_TRACKER', tab: 'profile', section: 'health',
        entityId: 'bmi-card',
        metadata: { healthTab: 'body' },
      };

    // ── Challenge Complete → Statistics → Achievements ──
    // No dedicated Statistics/Achievements screen exists in this app today;
    // Analytics ("stats" tab) is the closest equivalent.
    case 'achievement_unlocked':
    case 'level_up':
    case 'protein_milestone':
      return { screen: 'PROTEIN_TRACKER', tab: 'stats' };

    // ── Unknown / unmapped type → let the caller open Notification Details only ──
    default:
      return null;
  }
}
