import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, ArrowUp, ArrowDown, Minus } from 'lucide-react';

const RED = '#D71920';

function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(start + diff * ease));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export interface KPICardProps {
  label:       string;
  value:       number;
  icon:        React.ReactNode;
  accent?:     string;
  percentage?: number;   // e.g. share of total, shown as "12% of total"
  todayDelta?: number;   // e.g. +352 today
  trendPct?:   number;   // e.g. +12 / -8, shown with an arrow
  onClick?:    () => void;
}

export default function KPICard({
  label, value, icon, accent = RED, percentage, todayDelta, trendPct, onClick,
}: KPICardProps) {
  const displayed = useCountUp(value);
  const [hover, setHover] = useState(false);

  const trendUp = (trendPct ?? 0) > 0;
  const trendDown = (trendPct ?? 0) < 0;
  const trendColor = trendUp ? '#16A34A' : trendDown ? '#DC2626' : '#9CA3AF';
  const TrendIcon = trendUp ? ArrowUp : trendDown ? ArrowDown : Minus;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#FFFFFF', borderRadius: 14, padding: '16px 16px',
        border: `1px solid ${hover && onClick ? accent + '30' : '#E5E7EB'}`,
        boxShadow: hover && onClick ? `0 4px 16px ${accent}15` : '0 1px 4px rgba(0,0,0,0.04)',
        display: 'flex', flexDirection: 'column', gap: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 200ms, box-shadow 200ms',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: `${accent}12`, border: `1px solid ${accent}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
        }}>{icon}</div>
        {onClick && <ChevronRight size={13} color="#D1D5DB" />}
      </div>

      <div>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#1A1A1A', lineHeight: 1 }}>
          {displayed.toLocaleString()}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 }}>
          {label}
        </div>
      </div>

      {(percentage !== undefined || todayDelta !== undefined || trendPct !== undefined) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {todayDelta !== undefined && (
            <span style={{ fontSize: 10, fontWeight: 800, color: '#16A34A' }}>
              +{todayDelta.toLocaleString()} Today
            </span>
          )}
          {trendPct !== undefined && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 800, color: trendColor }}>
              <TrendIcon size={10} strokeWidth={3} />
              {Math.abs(trendPct)}%
            </span>
          )}
          {percentage !== undefined && (
            <span style={{ fontSize: 9, color: '#C4C9D4', fontWeight: 600 }}>
              {percentage}% of total
            </span>
          )}
        </div>
      )}
    </div>
  );
}
