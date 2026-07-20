/**
 * RewardProgressRow — one labeled requirement/objective row: icon, label,
 * current/target value, and a thin progress bar underneath. Used by both
 * CampaignHero (campaign objectives) and the reward-claim requirement list.
 */

import type { ReactNode } from 'react';
import PointsProgressBar from './PointsProgressBar';

export interface RewardProgressRowProps {
  icon: ReactNode;
  label: string;
  /** Pre-formatted value text, e.g. "1 / 40" or "Stage 1". */
  valueLabel: string;
  pct: number;
  met?: boolean;
  trackColor: string;
  fillColor: string;
  metColor?: string;
  labelColor: string;
  valueColor?: string;
}

export default function RewardProgressRow({
  icon, label, valueLabel, pct, met, trackColor, fillColor, metColor = '#2E7D5B', labelColor, valueColor,
}: RewardProgressRowProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: labelColor, minWidth: 0 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: met ? metColor : (valueColor ?? labelColor), flexShrink: 0 }}>
          {valueLabel}
        </span>
      </div>
      <PointsProgressBar pct={pct} trackColor={trackColor} fillColor={met ? metColor : fillColor} height={6} />
    </div>
  );
}
