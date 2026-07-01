/**
 * SKM Premium Scan Celebration Overlay
 *
 * Renders as a fixed full-screen overlay above everything.
 * Shown only after a valid egg scan (phase === 'success').
 * Auto-dismisses after 2.5 s OR on tap of the Continue button.
 *
 * Touches NOTHING in scan/protein/streak logic — reads only the
 * ScanResult values passed to it as props.
 */

import { useEffect, useRef, useState } from 'react';

interface ScanCelebrationProps {
  streak:       number;
  protein:      number;
  todayEggs:    number;
  goal:         number;
  todayProtein: number;
  onDismiss:    () => void;
}

// ─── Motivational messages ────────────────────────────────────

const MESSAGES = [
  { icon: '🥚', line1: 'Great start!',              line2: 'Your streak has grown.' },
  { icon: '🔥', line1: 'Keep it alive!',            line2: 'Come back tomorrow.' },
  { icon: '💪', line1: 'Strong habits,',            line2: 'strong health.' },
  { icon: '⭐', line1: 'Amazing consistency!',      line2: "You're building something special." },
  { icon: '🏆', line1: 'One egg closer',            line2: 'to greatness.' },
  { icon: '🌟', line1: 'Unstoppable!',              line2: 'Every day counts.' },
  { icon: '🥇', line1: 'Champions show up',        line2: 'every single day.' },
];

// ─── Fire level by streak ─────────────────────────────────────

function fireEmoji(streak: number): string {
  if (streak >= 365) return '🔥🔥🔥🔥';
  if (streak >= 100) return '🔥🔥🔥';
  if (streak >= 30)  return '🔥🔥';
  if (streak >= 7)   return '🔥';
  return '🌱';
}

function fireColor(streak: number): string {
  if (streak >= 100) return '#F59E0B'; // golden
  if (streak >= 30)  return '#EF4444'; // red fire
  if (streak >= 7)   return '#F97316'; // orange
  return '#22C55E';                     // green sprout
}

function fireSize(streak: number): number {
  if (streak >= 100) return 52;
  if (streak >= 30)  return 44;
  if (streak >= 7)   return 36;
  return 28;
}

// ─── Particle generator ───────────────────────────────────────

interface Particle {
  id: number;
  x: number;      // % from left
  size: number;
  color: string;
  duration: number;
  delay: number;
  drift: number;   // px horizontal drift
}

const COLORS = ['#FFD700','#D71920','#F59E0B','#fff','#EC4899','#34D399','#60A5FA'];

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id:       i,
    x:        5 + Math.random() * 90,
    size:     4 + Math.random() * 7,
    color:    COLORS[i % COLORS.length],
    duration: 1200 + Math.random() * 900,
    delay:    Math.random() * 600,
    drift:    (Math.random() - 0.5) * 80,
  }));
}

// ─── Protein count-up hook ────────────────────────────────────

function useCountUp(target: number, durationMs: number, startDelay: number): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const start = performance.now();
      const tick = () => {
        const elapsed = performance.now() - start;
        const progress = Math.min(elapsed / durationMs, 1);
        // ease-out
        setVal(Math.round(target * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startDelay);
    return () => clearTimeout(t);
  }, [target, durationMs, startDelay]);
  return val;
}

// ─── Streak number count-up hook ─────────────────────────────

function useCountUpFrom(from: number, to: number, durationMs: number, startDelay: number): number {
  const [val, setVal] = useState(from);
  useEffect(() => {
    if (from === to) return;
    const t = setTimeout(() => {
      const range = to - from;
      const start = performance.now();
      const tick = () => {
        const elapsed  = performance.now() - start;
        const progress = Math.min(elapsed / durationMs, 1);
        setVal(Math.round(from + range * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startDelay);
    return () => clearTimeout(t);
  }, [from, to, durationMs, startDelay]);
  return val;
}

// ─── Component ────────────────────────────────────────────────

export default function ScanCelebrationOverlay({
  streak, protein, todayEggs, goal, todayProtein, onDismiss,
}: ScanCelebrationProps) {

  const [visible,   setVisible]   = useState(true);
  const [egAnim,    setEgAnim]    = useState<'drop' | 'glow' | 'fire' | 'done'>('drop');
  const timerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const particles                 = useRef(makeParticles(32)).current;
  const msgRef                    = useRef(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]).current;

  const displayedStreak = useCountUpFrom(Math.max(0, streak - 1), streak, 600, 700);
  const displayedProtein = useCountUp(protein, 500, 900);

  // Animation phases
  useEffect(() => {
    const t1 = setTimeout(() => setEgAnim('glow'), 300);
    const t2 = setTimeout(() => setEgAnim('fire'), 700);
    const t3 = setTimeout(() => setEgAnim('done'), 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // Auto-dismiss at 2.5 s
  useEffect(() => {
    timerRef.current = setTimeout(dismiss, 2500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  function dismiss() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    // Small delay so fade-out completes before unmounting
    setTimeout(onDismiss, 280);
  }

  // Weekly batch progress (how far into current 7-day batch)
  const batchProgress = streak % 7 === 0 && streak > 0 ? 7 : streak % 7;
  const weekDots      = Array.from({ length: 7 }, (_, i) => i < batchProgress);

  const fc    = fireColor(streak);
  const fe    = fireEmoji(streak);
  const fs    = fireSize(streak);
  const pct   = Math.min(100, Math.round((todayProtein / goal) * 100));
  const goalMet = todayProtein >= goal;

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        padding: '0 20px',
        animation: visible ? 'cel-fade-in 220ms ease' : 'cel-fade-out 260ms ease forwards',
      }}
    >
      {/* Floating particles */}
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'fixed',
            left: `${p.x}%`,
            bottom: '-10px',
            width: p.size,
            height: p.size,
            borderRadius: p.id % 3 === 0 ? '50%' : 3,
            background: p.color,
            pointerEvents: 'none',
            animation: `cel-particle ${p.duration}ms ease-out ${p.delay}ms forwards`,
            '--drift': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}

      {/* Main card — stop click propagation so tapping the card doesn't dismiss */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360,
          background: '#fff',
          borderRadius: 32,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
          animation: 'cel-card-in 320ms cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* ── Hero band ── */}
        <div style={{
          background: streak >= 100
            ? 'linear-gradient(135deg,#92400E,#D97706)'
            : streak >= 30
            ? 'linear-gradient(135deg,#7C3AED,#B31217)'
            : 'linear-gradient(135deg,#D71920,#B31217)',
          padding: '28px 20px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative rings */}
          <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -40, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

          {/* Egg mascot */}
          <div style={{
            fontSize: 72,
            lineHeight: 1,
            marginBottom: 8,
            display: 'inline-block',
            animation:
              egAnim === 'drop'  ? 'cel-drop 300ms cubic-bezier(0.34,1.56,0.64,1)' :
              egAnim === 'glow'  ? 'cel-glow-pulse 400ms ease-in-out' :
              egAnim === 'fire'  ? 'cel-fire 400ms ease-in-out' :
              'cel-float 3s ease-in-out infinite',
            filter: egAnim === 'glow' || egAnim === 'done'
              ? `drop-shadow(0 0 20px rgba(255,200,50,0.8))`
              : 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))',
          }}>
            🥚
          </div>

          {/* Fire indicator */}
          <div style={{
            fontSize: fs,
            lineHeight: 1,
            marginBottom: 10,
            animation: egAnim === 'fire' || egAnim === 'done' ? 'cel-fire-flicker 0.8s ease-in-out infinite alternate' : 'none',
            filter: `drop-shadow(0 0 8px ${fc}aa)`,
            opacity: egAnim === 'drop' || egAnim === 'glow' ? 0 : 1,
            transition: 'opacity 300ms ease',
          }}>
            {fe}
          </div>

          {/* Streak number */}
          <div style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
            animation: 'cel-num-pop 400ms cubic-bezier(0.34,1.56,0.64,1) 700ms both',
          }}>
            <span style={{
              fontSize: streak >= 100 ? 62 : 76,
              fontWeight: 900, color: '#fff', lineHeight: 1,
              letterSpacing: -2,
              textShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}>
              {displayedStreak}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.75)', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>
              Day Streak
            </span>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '20px 22px 22px' }}>

          {/* Protein count-up */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 14,
            animation: 'cel-num-pop 350ms cubic-bezier(0.34,1.56,0.64,1) 900ms both',
          }}>
            <span style={{ fontSize: 22 }}>💪</span>
            <span style={{ fontSize: 26, fontWeight: 900, color: '#D71920', lineHeight: 1 }}>
              +{displayedProtein}g
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#999' }}>Protein</span>
          </div>

          {/* Weekly dots */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: '#bbb', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 7px', textAlign: 'center' }}>
              Weekly Progress
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {weekDots.map((filled, i) => (
                <div
                  key={i}
                  style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: filled
                      ? `linear-gradient(135deg, ${fc}, ${fc}cc)`
                      : '#F0F0F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                    boxShadow: filled ? `0 3px 8px ${fc}44` : 'none',
                    animation: filled ? `cel-dot-in 250ms cubic-bezier(0.34,1.56,0.64,1) ${i * 60 + 300}ms both` : 'none',
                  }}
                >
                  {filled ? '🥚' : ''}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#999', margin: '6px 0 0', textAlign: 'center' }}>
              {batchProgress} / 7 days this week
            </p>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#bbb' }}>Daily Goal</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: goalMet ? '#22C55E' : '#D71920' }}>
                {todayProtein}g / {goal}g
              </span>
            </div>
            <div style={{ height: 7, background: '#F0F0F0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: goalMet ? '#22C55E' : 'linear-gradient(90deg,#D71920,#F59E0B)',
                borderRadius: 4,
                transition: 'width 800ms ease 400ms',
              }} />
            </div>
          </div>

          {/* Motivational message */}
          <div style={{
            background: '#FFF7F0',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 18,
            display: 'flex', alignItems: 'center', gap: 10,
            animation: 'cel-num-pop 300ms cubic-bezier(0.34,1.56,0.64,1) 1100ms both',
          }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{msgRef.icon}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>{msgRef.line1}</p>
              <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', fontWeight: 600 }}>{msgRef.line2}</p>
            </div>
          </div>

          {/* Continue button */}
          <button
            onClick={dismiss}
            style={{
              width: '100%', padding: '16px 0', borderRadius: 18,
              border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#D71920,#B31217)',
              color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: 0.3,
              boxShadow: '0 8px 24px rgba(215,25,32,0.45)',
              animation: 'cel-num-pop 300ms cubic-bezier(0.34,1.56,0.64,1) 1200ms both',
            }}
          >
            🥚 Keep Going
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cel-fade-in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cel-fade-out { from { opacity: 1; } to { opacity: 0; } }

        @keyframes cel-card-in {
          from { transform: scale(0.78) translateY(40px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }

        @keyframes cel-drop {
          0%   { transform: translateY(-40px) scale(0.8); opacity: 0; }
          60%  { transform: translateY(8px)   scale(1.08); opacity: 1; }
          80%  { transform: translateY(-4px)  scale(0.96); }
          100% { transform: translateY(0)     scale(1); }
        }

        @keyframes cel-glow-pulse {
          0%,100% { transform: scale(1);    filter: drop-shadow(0 0 0px rgba(255,200,50,0)); }
          50%     { transform: scale(1.12); filter: drop-shadow(0 0 24px rgba(255,200,50,0.9)); }
        }

        @keyframes cel-fire {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.15) rotate(-4deg); }
          60%  { transform: scale(0.95) rotate(3deg); }
          100% { transform: scale(1)   rotate(0deg); }
        }

        @keyframes cel-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-7px); }
        }

        @keyframes cel-fire-flicker {
          from { transform: scale(1)    rotate(-2deg); }
          to   { transform: scale(1.08) rotate(2deg); }
        }

        @keyframes cel-num-pop {
          from { transform: scale(0.6) translateY(12px); opacity: 0; }
          to   { transform: scale(1)   translateY(0);    opacity: 1; }
        }

        @keyframes cel-dot-in {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }

        @keyframes cel-particle {
          0%   { transform: translateY(0) translateX(0) scale(1); opacity: 1; }
          100% { transform: translateY(-420px) translateX(var(--drift)) scale(0.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
