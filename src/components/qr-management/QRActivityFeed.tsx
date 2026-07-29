import React, { useEffect, useState } from 'react';
import { Activity, ScanLine, Settings2, Radio } from 'lucide-react';
import { subscribeLiveActivity } from '../../services/qr/qrManagementService';
import type { LiveActivityEvent } from '../../types/qr/qrManagementTypes';
import EmptyState from './shared/EmptyState';

const RED  = '#D71920';
const SAFE = '#16A34A';

function relativeTime(ts: Date): string {
  const diffMs = Date.now() - ts.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function FeedRow({ event }: { event: LiveActivityEvent }) {
  const isScan = event.kind === 'scan';
  const color = isScan ? SAFE : RED;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid #F9FAFB' }}>
      <div style={{
        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
        background: `${color}12`, border: `1px solid ${color}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        {isScan ? <ScanLine size={12} /> : <Settings2 size={12} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {event.message}
        </p>
        <p style={{ fontSize: 9, color: '#9CA3AF', margin: '2px 0 0' }}>{relativeTime(event.ts)}</p>
      </div>
    </div>
  );
}

export default function QRActivityFeed() {
  const [events, setEvents] = useState<LiveActivityEvent[]>([]);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeLiveActivity(setEvents);
    return () => unsub();
  }, []);

  // Re-render every 30s so relative timestamps ("2m ago") stay fresh without a live re-query.
  useEffect(() => {
    const t = setInterval(() => forceTick(v => v + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #F3F4F6', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} color={RED} />
          <h3 style={{ fontSize: 12, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>Live Activity</h3>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: SAFE }}>
            <Radio size={10} /> LIVE
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 14px' }}>
        {events.length === 0 ? (
          <EmptyState icon={<Activity size={22} strokeWidth={1.6} />} title="No recent activity" message="Scans and admin actions will appear here live." />
        ) : events.map(e => <FeedRow key={e.id} event={e} />)}
      </div>
    </div>
  );
}
