import React from 'react';
import { AlertTriangle, Info, PackageOpen, Gauge, Copy } from 'lucide-react';
import type { SmartWarning } from '../../types/qr/qrManagementTypes';

const WARN = '#D97706';
const INFO = '#6366F1';

function iconFor(kind: SmartWarning['kind']) {
  if (kind === 'unused_batch')         return <PackageOpen size={13} />;
  if (kind === 'almost_consumed')      return <Gauge size={13} />;
  return <Copy size={13} />;
}

interface Props {
  warnings: SmartWarning[];
  onSelectBatch?: (batchId: string) => void;
}

export default function QRSmartWarnings({ warnings, onSelectBatch }: Props) {
  if (!warnings.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
      {warnings.map(w => {
        const color = w.severity === 'warning' ? WARN : INFO;
        return (
          <div
            key={w.id}
            onClick={() => w.batchId && onSelectBatch?.(w.batchId)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
              background: `${color}0A`, border: `1px solid ${color}25`, borderRadius: 10,
              cursor: w.batchId ? 'pointer' : 'default',
            }}
          >
            <span style={{
              width: 24, height: 24, borderRadius: 7, flexShrink: 0,
              background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{iconFor(w.kind)}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', flex: 1 }}>{w.message}</span>
          </div>
        );
      })}
    </div>
  );
}
