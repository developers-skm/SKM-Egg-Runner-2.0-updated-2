/**
 * PointsProgressBar — a single labeled progress track. Used for campaign
 * completion, membership progress, and per-objective rows. Value/track/fill
 * colors are all caller-supplied so this stays theme-agnostic.
 */

export interface PointsProgressBarProps {
  /** 0-100. Values outside this range are clamped. */
  pct: number;
  trackColor: string;
  fillColor: string;
  height?: number;
  /** Optional marker rendered at the end of the track (e.g. a reward icon). */
  endMarker?: boolean;
  markerColor?: string;
}

export default function PointsProgressBar({ pct, trackColor, fillColor, height = 8, endMarker, markerColor }: PointsProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ position: 'relative', height, background: trackColor, borderRadius: 12, overflow: 'visible' }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${clamped}%`, borderRadius: 12,
          background: fillColor, transition: 'width 700ms cubic-bezier(0.34,1.56,0.4,1)',
        }} />
      </div>
      {endMarker && (
        <div style={{
          position: 'absolute', right: -2, top: '50%', transform: 'translateY(-50%)',
          width: height + 6, height: height + 6, borderRadius: '50%',
          background: markerColor ?? fillColor, border: '2px solid #fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }} />
      )}
    </div>
  );
}
