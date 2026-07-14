/**
 * SKM Premium Scan Celebration Overlay — v2
 *
 * Full-screen, multi-stage celebration after a valid egg scan.
 * MANUAL CLOSE ONLY — no auto-dismiss.
 * Stage order: mascot bounce → crack + fire + streak count-up → protein count-up → message → progress → button
 */

import { useEffect, useRef, useState } from 'react';
import { MILESTONES } from '../services/protein/milestoneRewardService';
import { HapticService } from '../services/audio/hapticService';

interface ScanCelebrationProps {
  streak:       number;
  protein:      number;
  todayEggs:    number;
  goal:         number;
  todayProtein: number;
  isMilestone?: boolean;
  playVictory?: boolean; // true only after a genuinely new successful scan
  onDismiss:    () => void;
}

// ─── Motivational messages ────────────────────────────────────

const MESSAGES = [
  { icon: '🔥', line1: 'Amazing!',           line2: "You're building a healthy habit." },
  { icon: '🥚', line1: 'Another great day!', line2: 'Keep your streak alive.' },
  { icon: '💪', line1: 'Consistency',        line2: 'beats perfection.' },
  { icon: '🏆', line1: 'Every egg counts.',  line2: "Champions never skip." },
  { icon: '⭐', line1: 'Your future self',   line2: 'will thank you.' },
  { icon: '🌟', line1: 'Unstoppable!',       line2: 'Every single day.' },
  { icon: '🥇', line1: 'Champions show up',  line2: 'every single day.' },
];

// ─── Fire by streak ───────────────────────────────────────────

function fireEmoji(s: number)  { return s >= 100 ? '🔥🔥🔥🔥' : s >= 30 ? '🔥🔥🔥' : s >= 7 ? '🔥🔥' : s >= 3 ? '🔥' : '🌱'; }
function fireColor(s: number)  { return s >= 100 ? '#F59E0B' : s >= 30 ? '#EF4444' : s >= 7 ? '#F97316' : '#22C55E'; }
function heroGradient(s: number) {
  if (s >= 100) return 'linear-gradient(160deg,#78350F 0%,#D97706 50%,#92400E 100%)';
  if (s >= 30)  return 'linear-gradient(160deg,#4C1D95 0%,#7C3AED 50%,#B31217 100%)';
  if (s >= 7)   return 'linear-gradient(160deg,#B31217 0%,#EF4444 50%,#F97316 100%)';
  return 'linear-gradient(160deg,#D71920 0%,#B31217 60%,#991B1B 100%)';
}

// ─── Particle system ──────────────────────────────────────────

interface Particle { id: number; x: number; size: number; color: string; duration: number; delay: number; drift: number; shape: 'circle' | 'square' | 'diamond'; }
const COLORS = ['#FFD700','#D71920','#F59E0B','#fff','#EC4899','#34D399','#60A5FA','#A78BFA','#FB923C'];
function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i, x: 3 + Math.random() * 94,
    size: 5 + Math.random() * 9,
    color: COLORS[i % COLORS.length],
    duration: 1400 + Math.random() * 1200,
    delay: Math.random() * 800,
    drift: (Math.random() - 0.5) * 120,
    shape: (['circle','square','diamond'] as const)[i % 3],
  }));
}

// ─── Feather system ───────────────────────────────────────────

interface Feather { id: number; x: number; size: number; duration: number; delay: number; drift: number; rotate: number; }
function makeFeathers(n: number): Feather[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i, x: Math.random() * 100,
    size: 10 + Math.random() * 14,
    duration: 2200 + Math.random() * 1800,
    delay: Math.random() * 1200,
    drift: (Math.random() - 0.5) * 150,
    rotate: Math.random() * 720,
  }));
}

// ─── Count-up hooks ───────────────────────────────────────────

function useCountUp(target: number, durationMs: number, startDelay: number): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const start = performance.now();
      const tick = () => {
        const p = Math.min((performance.now() - start) / durationMs, 1);
        setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startDelay);
    return () => clearTimeout(t);
  }, [target, durationMs, startDelay]);
  return val;
}

function useCountUpFrom(from: number, to: number, durationMs: number, startDelay: number): number {
  const [val, setVal] = useState(from);
  useEffect(() => {
    if (from === to) return;
    const t = setTimeout(() => {
      const range = to - from;
      const start = performance.now();
      const tick = () => {
        const p = Math.min((performance.now() - start) / durationMs, 1);
        setVal(Math.round(from + range * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startDelay);
    return () => clearTimeout(t);
  }, [from, to, durationMs, startDelay]);
  return val;
}

// ─── Component ────────────────────────────────────────────────

type Stage = 'mascot' | 'crack' | 'fire' | 'protein' | 'message' | 'progress' | 'done';

// ─── Victory sound ────────────────────────────────────────────
// Played exactly once per mount when playVictory=true.
// Fade-in 150ms, volume 70%, fade-out 300ms before end.
// Ducks any playing BGM to 35% while active, then restores.

function playVictorySound(): () => void {
  try {
    const audio = new Audio('/victory sound.mp3');
    audio.volume = 0;
    audio.preload = 'auto';

    // Duck BGM if it exists (global SKM bgm element tagged with id="skm-bgm")
    const bgm = document.getElementById('skm-bgm') as HTMLAudioElement | null;
    const bgmOrigVol = bgm ? bgm.volume : 1;
    if (bgm && !bgm.paused) bgm.volume = bgmOrigVol * 0.35;

    // Optional haptic on supported devices
    try { if (navigator.vibrate) navigator.vibrate(50); } catch { /* unsupported */ }

    audio.play().catch(() => {});

    // Fade in over 150ms
    const FADE_IN = 150;
    const TARGET_VOL = 0.7;
    const fadeInStart = performance.now();
    const fadeInTick = () => {
      const t = Math.min((performance.now() - fadeInStart) / FADE_IN, 1);
      audio.volume = TARGET_VOL * t;
      if (t < 1) requestAnimationFrame(fadeInTick);
    };
    requestAnimationFrame(fadeInTick);

    // Fade out 300ms before natural end; restore BGM after
    const FADE_OUT = 300;
    const scheduleFadeOut = () => {
      if (!isFinite(audio.duration) || audio.duration === 0) return;
      const fadeOutAt = Math.max(0, (audio.duration - FADE_OUT / 1000) * 1000);
      const timer = setTimeout(() => {
        const fadeOutStart = performance.now();
        const fadeOutTick = () => {
          const t = Math.min((performance.now() - fadeOutStart) / FADE_OUT, 1);
          audio.volume = TARGET_VOL * (1 - t);
          if (t < 1) requestAnimationFrame(fadeOutTick);
          else {
            audio.pause();
            if (bgm && !bgm.paused) bgm.volume = bgmOrigVol;
          }
        };
        requestAnimationFrame(fadeOutTick);
      }, fadeOutAt);
      return timer;
    };

    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    audio.addEventListener('loadedmetadata', () => { fadeTimer = scheduleFadeOut(); }, { once: true });
    audio.addEventListener('ended', () => {
      if (bgm && !bgm.paused) bgm.volume = bgmOrigVol;
    }, { once: true });

    // Cleanup: fade out and restore BGM
    return () => {
      if (fadeTimer !== undefined) clearTimeout(fadeTimer);
      audio.volume = 0;
      audio.pause();
      if (bgm && !bgm.paused) bgm.volume = bgmOrigVol;
    };
  } catch {
    return () => {};
  }
}

export default function ScanCelebrationOverlay({
  streak, protein, todayEggs, goal, todayProtein, isMilestone, playVictory = false, onDismiss,
}: ScanCelebrationProps) {

  const [visible, setVisible] = useState(true);
  const [stage,   setStage]   = useState<Stage>('mascot');

  // Play victory sound exactly once on mount when playVictory=true
  useEffect(() => {
    if (!playVictory) return;
    const cleanup = playVictorySound();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only, intentional
  const [cracked, setCracked] = useState(false);
  const particles             = useRef(makeParticles(44)).current;
  const feathers              = useRef(makeFeathers(18)).current;
  const msgRef                = useRef(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]).current;

  const displayedStreak  = useCountUpFrom(Math.max(0, streak - 1), streak, 700, 1000);
  const displayedProtein = useCountUp(protein, 600, 1600);

  const fc  = fireColor(streak);
  const fe  = fireEmoji(streak);
  const pct = Math.min(100, Math.round((todayProtein / goal) * 100));
  const batchProgress = streak % 7 === 0 && streak > 0 ? 7 : streak % 7;
  const weekDots      = Array.from({ length: 7 }, (_, i) => i < batchProgress);
  const goalMet       = todayProtein >= goal;

  // Newest claimed milestone (for milestone banner)
  const MILESTONE_DAYS = MILESTONES.map(m => m.days);
  const isMilestoneHit = isMilestone && MILESTONE_DAYS.includes(streak);
  const milestoneDef   = isMilestoneHit ? MILESTONES.find(m => m.days === streak) : null;

  // Stage sequencing
  useEffect(() => {
    const t1 = setTimeout(() => setStage('crack'),   600);
    const t2 = setTimeout(() => setCracked(true),    900);
    const t3 = setTimeout(() => setStage('fire'),    1000);
    const t4 = setTimeout(() => setStage('protein'), 1500);
    const t5 = setTimeout(() => setStage('message'), 2200);
    const t6 = setTimeout(() => setStage('progress'),2800);
    const t7 = setTimeout(() => setStage('done'),    3200);
    return () => [t1,t2,t3,t4,t5,t6,t7].forEach(clearTimeout);
  }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(onDismiss, 280);
  }

  const cardVisible = stage !== 'mascot';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        padding: '12px 16px',
        animation: visible ? 'cel-fade-in 220ms ease' : 'cel-fade-out 260ms ease forwards',
        overflowY: 'auto',
      }}
    >
      {/* Particles */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'fixed',
          left: `${p.x}%`, bottom: '-12px',
          width: p.size, height: p.size,
          borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'diamond' ? 3 : 2,
          background: p.color,
          transform: p.shape === 'diamond' ? 'rotate(45deg)' : 'none',
          pointerEvents: 'none',
          animation: `cel-particle ${p.duration}ms ease-out ${p.delay}ms forwards`,
          '--drift': `${p.drift}px`,
        } as React.CSSProperties} />
      ))}

      {/* Feathers */}
      {feathers.map(f => (
        <div key={f.id} style={{
          position: 'fixed',
          left: `${f.x}%`, top: '-20px',
          fontSize: f.size,
          pointerEvents: 'none',
          animation: `cel-feather ${f.duration}ms ease-in ${f.delay}ms forwards`,
          '--drift': `${f.drift}px`,
          '--rotate': `${f.rotate}deg`,
        } as React.CSSProperties}>🪶</div>
      ))}

      {/* ── STAGE 1: Full-screen mascot drop ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        marginBottom: cardVisible ? 0 : 0,
        animation: stage === 'mascot' ? 'cel-mascot-drop 500ms cubic-bezier(0.34,1.56,0.64,1)' : 'none',
      }}>
        {/* Egg mascot */}
        <div style={{
          fontSize: cardVisible ? 64 : 96,
          lineHeight: 1,
          transition: 'font-size 300ms ease',
          animation: cracked
            ? 'cel-crack 400ms cubic-bezier(0.34,1.56,0.64,1)'
            : stage === 'done'
            ? 'cel-mascot-float 3s ease-in-out infinite'
            : stage === 'mascot'
            ? 'cel-mascot-wave 1.2s ease-in-out infinite'
            : 'none',
          filter: stage === 'fire' || stage === 'done'
            ? `drop-shadow(0 0 28px ${fc}cc) drop-shadow(0 0 60px ${fc}66)`
            : stage === 'crack'
            ? 'drop-shadow(0 0 40px rgba(255,215,0,1)) brightness(1.3)'
            : 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))',
          position: 'relative',
          zIndex: 2,
          cursor: 'pointer',
          marginBottom: 0,
        }} onClick={dismiss}>
          {cracked ? '🐣' : '🥚'}
        </div>

        {/* Golden light burst on crack */}
        {cracked && (
          <div style={{
            position: 'absolute',
            width: 200, height: 200,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,215,0,0.6) 0%, rgba(255,165,0,0.3) 40%, transparent 70%)',
            animation: 'cel-burst 600ms ease-out forwards',
            pointerEvents: 'none',
            zIndex: 1,
          }} />
        )}

        {/* Sparkles around mascot */}
        {stage !== 'mascot' && ['✨','⭐','💫','✨','⭐'].map((s, i) => (
          <div key={i} style={{
            position: 'absolute',
            fontSize: 14 + i * 2,
            pointerEvents: 'none',
            animation: `cel-sparkle 1.5s ease-in-out ${i * 200}ms infinite`,
            top: `${-20 + Math.sin(i * 72 * Math.PI / 180) * 55}px`,
            left: `${50 + Math.cos(i * 72 * Math.PI / 180) * 55}%`,
          }}>{s}</div>
        ))}
      </div>

      {/* ── Main card ── */}
      {cardVisible && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 380,
            background: 'rgba(255,255,255,0.97)',
            borderRadius: 32,
            overflow: 'hidden',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.15)',
            animation: 'cel-card-in 380ms cubic-bezier(0.34,1.56,0.64,1)',
            marginTop: 8,
          }}
        >
          {/* ── Hero band ── */}
          <div style={{
            background: heroGradient(streak),
            padding: '22px 20px 20px',
            textAlign: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Decorative rings */}
            <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -60, left: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

            {/* STAGE 2: Fire appears */}
            {(stage === 'fire' || stage === 'protein' || stage === 'message' || stage === 'progress' || stage === 'done') && (
              <div style={{
                fontSize: streak >= 50 ? 36 : 28,
                marginBottom: 6,
                animation: 'cel-fire-flicker 0.7s ease-in-out infinite alternate',
                filter: `drop-shadow(0 0 12px ${fc}cc)`,
              }}>
                {fe}
              </div>
            )}

            {/* Streak number */}
            <div style={{
              animation: 'cel-num-pop 450ms cubic-bezier(0.34,1.56,0.64,1) 1000ms both',
            }}>
              <span style={{
                fontSize: streak >= 100 ? 58 : 70,
                fontWeight: 900, color: '#fff', lineHeight: 1,
                letterSpacing: -2,
                textShadow: '0 4px 24px rgba(0,0,0,0.35)',
                display: 'block',
              }}>
                {displayedStreak}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.8)',
                letterSpacing: 2, textTransform: 'uppercase', marginTop: 3, display: 'block',
              }}>
                Day Streak
              </span>
            </div>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: '18px 20px 22px' }}>

            {/* STAGE 3: Protein count-up */}
            {(stage === 'protein' || stage === 'message' || stage === 'progress' || stage === 'done') && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                marginBottom: 16, padding: '14px 0',
                background: 'linear-gradient(135deg,#FCE8E8,#FFF5F5)',
                borderRadius: 18,
                animation: 'cel-num-pop 380ms cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <span style={{ fontSize: 28 }}>💪</span>
                <div>
                  <span style={{ fontSize: 32, fontWeight: 900, color: '#D71920', lineHeight: 1 }}>
                    +{displayedProtein}g
                  </span>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#999', margin: '2px 0 0' }}>Protein Added</p>
                </div>
              </div>
            )}

            {/* STAGE 4: Random motivation */}
            {(stage === 'message' || stage === 'progress' || stage === 'done') && (
              <div style={{
                background: '#FFF7F0',
                border: '1.5px solid #FFE4CC',
                borderRadius: 16, padding: '12px 14px', marginBottom: 14,
                display: 'flex', alignItems: 'center', gap: 12,
                animation: 'cel-num-pop 340ms cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <span style={{ fontSize: 26, flexShrink: 0 }}>{msgRef.icon}</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>{msgRef.line1}</p>
                  <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', fontWeight: 600 }}>{msgRef.line2}</p>
                </div>
              </div>
            )}

            {/* STAGE 5: Progress */}
            {(stage === 'progress' || stage === 'done') && (
              <>
                {/* Weekly dots */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 9, fontWeight: 800, color: '#bbb', textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 8px', textAlign: 'center' }}>
                    Weekly Journey
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 7 }}>
                    {weekDots.map((filled, i) => (
                      <div key={i} style={{
                        width: 34, height: 34, borderRadius: 11,
                        background: filled ? `linear-gradient(135deg,${fc},${fc}bb)` : '#F0F0F0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 17,
                        boxShadow: filled ? `0 3px 10px ${fc}55` : 'none',
                        animation: filled ? `cel-dot-in 280ms cubic-bezier(0.34,1.56,0.64,1) ${i * 70}ms both` : 'none',
                      }}>
                        {filled ? '🥚' : ''}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#999', margin: '7px 0 0', textAlign: 'center' }}>
                    {batchProgress} / 7 days this week
                  </p>
                </div>

                {/* Daily protein bar */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#bbb' }}>Daily Protein Goal</span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: goalMet ? '#22C55E' : '#D71920' }}>
                      {todayProtein}g / {goal}g
                    </span>
                  </div>
                  <div style={{ height: 9, background: '#F0F0F0', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: goalMet ? 'linear-gradient(90deg,#16A34A,#22C55E)' : `linear-gradient(90deg,#D71920,${fc})`,
                      borderRadius: 6, transition: 'width 900ms ease 200ms',
                    }} />
                  </div>
                  {goalMet && (
                    <p style={{ fontSize: 11, color: '#22C55E', fontWeight: 800, margin: '5px 0 0', textAlign: 'center' }}>
                      🎉 Daily goal reached!
                    </p>
                  )}
                </div>

                {/* Eggs count */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  marginBottom: 16,
                  fontSize: 12, fontWeight: 700, color: '#888',
                }}>
                  🥚 <span style={{ color: '#D71920', fontWeight: 900 }}>{todayEggs}</span> egg{todayEggs !== 1 ? 's' : ''} scanned today
                </div>
              </>
            )}

            {/* Milestone banner */}
            {(stage === 'progress' || stage === 'done') && milestoneDef && (
              <div style={{
                background: `linear-gradient(135deg,${milestoneDef.color}22,${milestoneDef.color2}18)`,
                border: `2px solid ${milestoneDef.color}55`,
                borderRadius: 18, padding: '12px 16px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 12,
                animation: 'cel-num-pop 400ms cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                  background: `linear-gradient(135deg,${milestoneDef.color},${milestoneDef.color2})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, boxShadow: `0 4px 14px ${milestoneDef.color}44`,
                }}>
                  🎁
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 900, color: milestoneDef.color, margin: 0 }}>
                    Reward Ready!
                  </p>
                  <p style={{ fontSize: 11, color: '#666', margin: '2px 0 0', fontWeight: 600 }}>
                    Visit Streaks to claim your {streak}-day sticker
                  </p>
                </div>
              </div>
            )}

            {/* ── Continue button — only shown in done stage ── */}
            {stage === 'done' && (
              <button
                onClick={() => { HapticService.selection(); dismiss(); }}
                style={{
                  width: '100%', padding: '17px 0', borderRadius: 20,
                  border: 'none', cursor: 'pointer',
                  background: `linear-gradient(135deg,#D71920,#B31217)`,
                  color: '#fff', fontWeight: 900, fontSize: 17, letterSpacing: 0.4,
                  boxShadow: '0 10px 30px rgba(215,25,32,0.5)',
                  animation: 'cel-num-pop 350ms cubic-bezier(0.34,1.56,0.64,1)',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                <span style={{ position: 'relative', zIndex: 1 }}>
                  {goalMet ? '🎉 Awesome!' : streak >= 7 ? '🔥 Keep Growing' : '🥚 Continue'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes cel-fade-in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cel-fade-out { from { opacity: 1; } to { opacity: 0; } }

        @keyframes cel-card-in {
          from { transform: scale(0.80) translateY(50px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }

        @keyframes cel-mascot-drop {
          0%   { transform: translateY(-80px) scale(0.6) rotate(-10deg); opacity: 0; }
          60%  { transform: translateY(12px)  scale(1.1) rotate(4deg);   opacity: 1; }
          80%  { transform: translateY(-6px)  scale(0.96) rotate(-2deg); }
          100% { transform: translateY(0)     scale(1)   rotate(0deg); }
        }

        @keyframes cel-mascot-wave {
          0%,100% { transform: rotate(0deg) scale(1); }
          25%     { transform: rotate(-12deg) scale(1.05); }
          75%     { transform: rotate(12deg)  scale(1.05); }
        }

        @keyframes cel-mascot-float {
          0%,100% { transform: translateY(0) rotate(0deg); }
          33%     { transform: translateY(-8px) rotate(-3deg); }
          66%     { transform: translateY(-4px) rotate(3deg); }
        }

        @keyframes cel-crack {
          0%   { transform: scale(1)    rotate(0deg); filter: brightness(1); }
          20%  { transform: scale(0.9)  rotate(-6deg); filter: brightness(2) drop-shadow(0 0 40px gold); }
          50%  { transform: scale(1.3)  rotate(6deg);  filter: brightness(2.5) drop-shadow(0 0 60px gold); }
          70%  { transform: scale(0.95) rotate(-3deg); filter: brightness(1.5); }
          100% { transform: scale(1)    rotate(0deg); filter: brightness(1); }
        }

        @keyframes cel-burst {
          0%   { transform: scale(0); opacity: 1; }
          100% { transform: scale(4); opacity: 0; }
        }

        @keyframes cel-sparkle {
          0%,100% { transform: scale(0.7) rotate(0deg);   opacity: 0.4; }
          50%     { transform: scale(1.3) rotate(180deg);  opacity: 1; }
        }

        @keyframes cel-fire-flicker {
          from { transform: scale(1)    rotate(-3deg) translateY(0); }
          to   { transform: scale(1.1)  rotate(3deg)  translateY(-3px); }
        }

        @keyframes cel-num-pop {
          from { transform: scale(0.55) translateY(16px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }

        @keyframes cel-dot-in {
          from { transform: scale(0) rotate(-30deg); opacity: 0; }
          to   { transform: scale(1) rotate(0deg);   opacity: 1; }
        }

        @keyframes cel-particle {
          0%   { transform: translateY(0) translateX(0) scale(1) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(-480px) translateX(var(--drift)) scale(0.2) rotate(360deg); opacity: 0; }
        }

        @keyframes cel-feather {
          0%   { transform: translateY(0) translateX(0) rotate(0deg);   opacity: 0.9; }
          100% { transform: translateY(110vh) translateX(var(--drift)) rotate(var(--rotate)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
