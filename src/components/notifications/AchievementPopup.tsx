/**
 * AchievementPopup — removed.
 * Milestone celebrations are delivered via Android push (FCM) only.
 * This file is kept as a no-op so any stale import doesn't break.
 */

export type AchievementPopupType =
  | 'level_up' | 'badge' | 'protein_milestone'
  | 'streak_milestone' | 'champion_rank' | 'golden_qr' | 'high_score';

export interface AchievementPopupPayload {
  type:      AchievementPopupType;
  title:     string;
  subtitle?: string;
  value?:    string | number;
}

export function triggerAchievementPopup(_payload: AchievementPopupPayload): void {
  // No-op — use FCM push notifications instead.
}

export default function AchievementPopup() { return null; }
