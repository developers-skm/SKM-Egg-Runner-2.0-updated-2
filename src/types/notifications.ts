/**
 * SKM Notification System — Types & Interfaces
 */

export type NotificationType =
  // Protein
  | 'protein_added'
  | 'protein_goal_complete'
  | 'protein_goal_missed'
  | 'protein_streak_increased'
  | 'protein_streak_lost'
  | 'protein_duplicate'
  | 'golden_egg_scanned'
  // Game
  | 'run_completed'
  | 'new_high_score'
  | 'mission_complete'
  | 'evolution_unlocked'
  | 'champion_rank_improved'
  | 'daily_reward_available'
  | 'qr_validated'
  // Reminders
  | 'protein_reminder'
  | 'game_reminder'
  | 'streak_reminder'
  | 'daily_goal_reminder'
  | 'daily_summary'
  | 'morning_reminder'
  | 'afternoon_reminder'
  | 'evening_reminder'
  | 'midnight_reminder'
  // Achievements / Milestones
  | 'achievement_unlocked'
  | 'level_up'
  | 'protein_milestone'
  | 'streak_milestone'
  // Stickers
  | 'sticker_unlocked'
  | 'sticker_collection_progress'
  // Weekly batch
  | 'week_complete'
  | 'new_week_started'
  // Collection & rewards
  | 'mystery_reward'
  | 'new_collection'
  // Special occasions
  | 'birthday'
  | 'anniversary'
  // Re-engagement
  | 'missed_one_day'
  | 'missed_three_days'
  // Profile progress
  | 'weekly_summary'
  // Admin
  | 'admin_announcement'
  | 'system_update'
  | 'campaign'
  | 'maintenance'
  // Auth
  | 'login';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationAction {
  label: string;
  actionType: 'scan_qr' | 'play_game' | 'view_achievement' | 'view_profile' | 'view_dashboard' | 'view_sticker' | 'view_streak' | 'view_progress' | 'dismiss' | 'open_url';
  url?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  read: boolean;
  createdAt: Date;
  expiresAt?: Date;
  actionUrl?: string;
  actions?: NotificationAction[];
  metadata?: Record<string, string | number | boolean>;
  // admin broadcasts have a targetAll flag
  targetAll?: boolean;
}

export interface NotificationSettings {
  proteinReminders: boolean;
  gameReminders: boolean;
  achievements: boolean;
  championHall: boolean;
  adminMessages: boolean;
  dailySummary: boolean;
  pushNotifications: boolean;
  streakReminders: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  proteinReminders: true,
  gameReminders: true,
  achievements: true,
  championHall: true,
  adminMessages: true,
  dailySummary: true,
  pushNotifications: false,
  streakReminders: true,
};

export interface ReminderState {
  lastProteinReminder?: string; // ISO date string YYYY-MM-DD
  proteinRemindersToday: number;
  lastGameReminder?: string;
  gameRemindersToday: number;
  // tracks which daily reminder slots already fired today
  morningReminderDate?:      string;
  afternoonReminderDate?:    string;
  eveningReminderDate?:      string;
  midnightReminderDate?:     string;
  almostThereReminderDate?:  string;
  totalRemindersToday?:      number;
  lastReminderDate?:         string;
}
