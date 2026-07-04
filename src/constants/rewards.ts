/**
 * SKM Rewards Club — domain constants.
 * Single source of truth for point values and membership tier thresholds.
 * Additive to the protein tracker — does not affect XP/coins in constants/tracker.ts.
 */

// ── Points per action ──────────────────────────────────────────
export const POINTS_PER_SCAN = 10; // awarded once per genuinely new (non-duplicate) egg scan

export const POINTS_PER_STREAK_MILESTONE: Record<number, number> = {
  3:   20,
  7:   50,
  14:  100,
  21:  150,
  30:  250,
  50:  400,
  100: 750,
  365: 2000,
};

export const POINTS_PER_MILESTONE_STICKER = 30; // per sticker claimed via claimMilestone

// ── Membership tiers ───────────────────────────────────────────
export type MembershipTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';

export interface MembershipTierDef {
  tier:      MembershipTier;
  minPoints: number; // lifetime points required to reach this tier
  color:     string;
  color2:    string;
}

export const MEMBERSHIP_TIERS: MembershipTierDef[] = [
  { tier: 'Bronze',   minPoints: 0,     color: '#A16207', color2: '#78350F' },
  { tier: 'Silver',   minPoints: 500,   color: '#94A3B8', color2: '#64748B' },
  { tier: 'Gold',     minPoints: 1500,  color: '#D97706', color2: '#B45309' },
  { tier: 'Platinum', minPoints: 5000,  color: '#0EA5E9', color2: '#0369A1' },
  { tier: 'Diamond',  minPoints: 10000, color: '#7C3AED', color2: '#5B21B6' },
];

// ── Coupon defaults ─────────────────────────────────────────────
export const DEFAULT_COUPON_VALID_DAYS = 30; // days a redeemed coupon stays usable
