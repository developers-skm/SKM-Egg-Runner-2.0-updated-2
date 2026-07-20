/**
 * MembershipTierCard — premium tier summary card: badge, points balance,
 * next-reward line, a progress track with an end marker, and a CTA.
 * All colors/copy are caller-supplied so this stays reusable across themes.
 */

import type { ReactNode } from 'react';
import PointsProgressBar from './PointsProgressBar';

export interface MembershipTierCardProps {
  tierIcon: ReactNode;
  tierLabel: string;
  /** Tier-identity color — used only for the badge background and tier label text. */
  tierAccent: string;
  tierAccentSoft: string;
  /** Brand accent — used for the progress fill, "pts to go" label, and CTA button. Defaults to tierAccent if omitted. */
  brandAccent?: string;
  points: number;
  pointsLabel?: string;
  /** e.g. "Next reward: ₹10 OFF" */
  nextRewardLabel?: string;
  /** e.g. "10 pts to go" */
  remainingLabel?: string;
  pct: number;
  ctaLabel: string;
  ctaIcon?: ReactNode;
  onCta?: () => void;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  trackColor: string;
}

export default function MembershipTierCard({
  tierIcon, tierLabel, tierAccent, tierAccentSoft, brandAccent, points, pointsLabel = 'Reward Points',
  nextRewardLabel, remainingLabel, pct, ctaLabel, ctaIcon, onCta,
  surface, border, textPrimary, textSecondary, trackColor,
}: MembershipTierCardProps) {
  const accent = brandAccent ?? tierAccent;
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', borderRadius: 18, padding: 16,
      background: surface, border: `1px solid ${border}`,
      boxShadow: '0 2px 10px rgba(36,26,23,0.05)',
    }}>
      {/* Tier badge + points balance */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 11, background: tierAccentSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {tierIcon}
          </span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: tierAccent, margin: 0 }}>{tierLabel} Member</p>
            <p style={{ fontSize: 20, fontWeight: 900, color: textPrimary, margin: '1px 0 0', lineHeight: 1 }}>
              {points.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 700, color: textSecondary }}>{pointsLabel}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Next reward + progress */}
      {nextRewardLabel && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: textPrimary }}>{nextRewardLabel}</span>
            {remainingLabel && (
              <span style={{ fontSize: 11, fontWeight: 800, color: accent }}>{remainingLabel}</span>
            )}
          </div>
          <PointsProgressBar pct={pct} trackColor={trackColor} fillColor={accent} height={7} endMarker markerColor={accent} />
        </div>
      )}

      {/* CTA */}
      <button
        className="rc-btn-ripple"
        onClick={onCta}
        disabled={!onCta}
        style={{
          width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
          background: accent, color: '#fff', fontWeight: 800, fontSize: 12.5,
          cursor: onCta ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {ctaIcon}
        {ctaLabel}
      </button>
    </div>
  );
}
