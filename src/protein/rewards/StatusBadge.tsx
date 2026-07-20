/**
 * StatusBadge — small pill used for "LIVE", tier names, coupon status, etc.
 * Purely presentational; callers supply the icon, label, and colors so it
 * stays theme-agnostic (no hardcoded palette here).
 */

import type { ReactNode } from 'react';

export interface StatusBadgeProps {
  label: string;
  icon?: ReactNode;
  /** Background color (usually a soft tint). */
  bg: string;
  /** Label/icon color. */
  color: string;
  /** Optional pulsing dot before the label (e.g. "LIVE"). */
  pulseDot?: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ label, icon, bg, color, pulseDot, size = 'md' }: StatusBadgeProps) {
  const fontSize = size === 'sm' ? 8.5 : 10;
  const padding = size === 'sm' ? '3px 8px' : '4px 10px';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
      background: bg, color, borderRadius: 20, padding,
      fontSize, fontWeight: 800, letterSpacing: 0.4,
    }}>
      {pulseDot && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: pulseDot,
          animation: 'skmStatusBadgePulse 1.6s ease-in-out infinite', flexShrink: 0,
        }} />
      )}
      {icon}
      {label}
      <style>{`
        @keyframes skmStatusBadgePulse {
          0%, 100% { box-shadow: 0 0 0 0 ${pulseDot ?? 'rgba(46,125,91,0.5)'}80; }
          50%      { box-shadow: 0 0 0 5px ${pulseDot ?? 'rgba(46,125,91,0.5)'}00; }
        }
      `}</style>
    </span>
  );
}
