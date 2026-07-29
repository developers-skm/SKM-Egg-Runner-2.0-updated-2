import React from 'react';
import type { QRBatchSummary } from '../../../types/qr/qrManagementTypes';

const SAFE = '#16A34A';
const WARN = '#F97316';
const MUTED = '#E5E7EB';

// Bucketed usage-intensity view — High Usage / Medium / Unused — per batch,
// reusing the same green/orange/gray semantic palette already used elsewhere
// in this module (no new charting library).
function intensity(usagePct: number): { label: string; color: string; blocks: number } {
  if (usagePct >= 66) return { label: 'High Usage', color: SAFE, blocks: 6 };
  if (usagePct >= 20) return { label: 'Medium',      color: WARN, blocks: 3 };
  return { label: 'Unused', color: MUTED, blocks: 1 };
}

interface Props {
  batches: QRBatchSummary[];
  onSelect?: (batchId: string) => void;
}

export default function QRHeatMap({ batches, onSelect }: Props) {
  if (!batches.length) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>
        No batches yet — generate QR codes to see usage intensity here.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {batches.map(b => {
        const { label, color, blocks } = intensity(b.usagePct);
        return (
          <div
            key={b.batchId}
            onClick={() => onSelect?.(b.batchId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px',
              cursor: onSelect ? 'pointer' : 'default', borderRadius: 8,
            }}
            onMouseEnter={e => onSelect && (e.currentTarget.style.background = '#FAFAFA')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', width: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.batchName}>
              {b.batchName}
            </span>
            <div style={{ display: 'flex', gap: 2, flex: 1 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 14, borderRadius: 3,
                  background: i < blocks ? color : '#F3F4F6',
                }} />
              ))}
            </div>
            <span style={{ fontSize: 9, fontWeight: 800, color, width: 78, textAlign: 'right', flexShrink: 0 }}>
              {label}
            </span>
            <span style={{ fontSize: 10, color: '#9CA3AF', width: 34, textAlign: 'right', flexShrink: 0 }}>
              {b.usagePct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
