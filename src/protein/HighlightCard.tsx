/**
 * HighlightCard — wraps a destination card so it can pulse/glow and
 * auto-scroll into view when targeted by smart notification navigation.
 * Highlight fades after ~2s, matching the brief's "highlight for
 * approximately 2 seconds" requirement.
 */

import { useEffect, useRef, useState } from 'react';

export default function HighlightCard({ active, glowColor = '#D71920', children, style, className }: {
  /** True on the render where this card is the notification's target. */
  active: boolean;
  glowColor?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (!active) return;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 2000);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        borderRadius: 20,
        transition: 'box-shadow 300ms ease',
        boxShadow: pulsing ? `0 0 0 3px ${glowColor}, 0 0 24px ${glowColor}66` : 'none',
        animation: pulsing ? 'skmHighlightPulse 700ms ease-in-out 2' : 'none',
        ...style,
      }}
    >
      {children}
      <style>{`
        @keyframes skmHighlightPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.015); }
        }
      `}</style>
    </div>
  );
}
