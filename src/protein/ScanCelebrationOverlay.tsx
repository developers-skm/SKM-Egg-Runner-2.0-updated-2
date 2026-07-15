/**
 * SKM Post-Scan Celebration — premium reward modal.
 *
 * Complete redesign: centered card (max-width 420px) over a blurred, dimmed
 * backdrop. Inspired by Apple Fitness / Nike Run Club / Duolingo streak
 * screens — no mascot, no emoji stage sequence, no oversized CTA. Manual
 * close only (Continue button + backdrop tap), single victory sound + haptic
 * on mount, everything else driven by CSS animation delays so there is no
 * multi-second JS stage machine to desync.
 */

import { useEffect, useState } from 'react';
import { ShieldCheck, Flame, TrendingUp, Sparkles, X } from 'lucide-react';
import { MILESTONES } from '../services/protein/milestoneRewardService';
import { POINTS_PER_STREAK_MILESTONE, MEMBERSHIP_TIERS } from '../constants/rewards';
import { calcTierProgress } from '../services/protein/rewardWalletService';
import type { RewardWallet } from '../services/protein/rewardWalletService';
import { HapticService } from '../services/audio/hapticService';

interface ScanCelebrationProps {
  streak:        number;
  protein:       number;
  todayEggs:     number;
  goal:          number;
  todayProtein:  number;
  isMilestone?:  boolean;
  pointsEarned:  number;
  wallet:        RewardWallet | null;
  playVictory?:  boolean; // true only after a genuinely new successful scan
  onDismiss:     () => void;
}

// ─── Victory sound ────────────────────────────────────────────
// Played exactly once per mount when playVictory=true. Ducks BGM, fades in/out.

function playVictorySound(): () => void {
  try {
    const audio = new Audio('/victory sound.mp3');
    audio.volume = 0;
    audio.preload = 'auto';

    const bgm = document.getElementById('skm-bgm') as HTMLAudioElement | null;
    const bgmOrigVol = bgm ? bgm.volume : 1;
    if (bgm && !bgm.paused) bgm.volume = bgmOrigVol * 0.35;

    audio.play().catch(() => {});

    const FADE_IN = 150;
    const TARGET_VOL = 0.7;
    const fadeInStart = performance.now();
    const fadeInTick = () => {
      const t = Math.min((performance.now() - fadeInStart) / FADE_IN, 1);
      audio.volume = TARGET_VOL * t;
      if (t < 1) requestAnimationFrame(fadeInTick);
    };
    requestAnimationFrame(fadeInTick);

    const FADE_OUT = 300;
    const scheduleFadeOut = () => {
      if (!isFinite(audio.duration) || audio.duration === 0) return;
      const fadeOutAt = Math.max(0, (audio.duration - FADE_OUT / 1000) * 1000);
      return setTimeout(() => {
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
    };

    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    audio.addEventListener('loadedmetadata', () => { fadeTimer = scheduleFadeOut(); }, { once: true });
    audio.addEventListener('ended', () => {
      if (bgm && !bgm.paused) bgm.volume = bgmOrigVol;
    }, { once: true });

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

// ─── Count-up hook ────────────────────────────────────────────

function useCountUp(target: number, durationMs = 800, startDelay = 250): number {
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

// ─── Minimal confetti (small, premium — a handful of soft particles) ──

interface Particle { id: number; x: number; size: number; color: string; duration: number; delay: number; drift: number; }
const PARTICLE_COLORS = ['#D71920', '#F0B429', '#FFFFFF', '#C9974A'];
function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: 20 + Math.random() * 60,
    size: 4 + Math.random() * 5,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    duration: 1100 + Math.random() * 700,
    delay: 200 + Math.random() * 400,
    drift: (Math.random() - 0.5) * 90,
  }));
}

// ─── One-sentence motivation — resolved deterministically, never random noise ──

function motivationLine(goalMet: boolean, nextMilestoneDays: number | null): string {
  if (nextMilestoneDays === 1) return 'One more day to unlock your next reward.';
  if (goalMet) return "You've hit today's goal — tomorrow's scan keeps the streak alive.";
  return "Tomorrow's scan keeps your streak alive.";
}

export default function ScanCelebrationOverlay({
  streak, protein, todayProtein, goal, isMilestone, pointsEarned, wallet, playVictory = false, onDismiss,
}: ScanCelebrationProps) {
  const [closing, setClosing] = useState(false);
  const particles = useState(() => makeParticles(14))[0];

  useEffect(() => {
    if (!playVictory) return;
    const cleanup = playVictorySound();
    HapticService.success();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only, intentional

  const displayedStreak  = useCountUp(streak, 700, 250);
  const displayedPoints  = useCountUp(pointsEarned, 600, 550);

  const goalMet = todayProtein >= goal;

  // Next streak milestone (from the real reward table — never fabricated).
  const nextMilestone = Object.keys(POINTS_PER_STREAK_MILESTONE)
    .map(Number)
    .filter(d => d > streak)
    .sort((a, b) => a - b)[0] ?? null;
  const nextMilestoneReward = nextMilestone ? POINTS_PER_STREAK_MILESTONE[nextMilestone] : null;
  const nextSticker = nextMilestone ? MILESTONES.find(m => m.days === nextMilestone) : null;
  const prevMilestone = nextMilestone
    ? Math.max(0, ...Object.keys(POINTS_PER_STREAK_MILESTONE).map(Number).filter(d => d <= streak))
    : streak;
  const milestoneSpan = nextMilestone ? Math.max(1, nextMilestone - prevMilestone) : 1;
  const milestonePct  = nextMilestone ? Math.min(100, Math.round(((streak - prevMilestone) / milestoneSpan) * 100)) : 100;

  // Membership — real data from the wallet the scan just updated.
  const tierProgress = wallet ? calcTierProgress(wallet.lifetimePoints) : null;
  const currentTier = wallet?.membership ?? MEMBERSHIP_TIERS[0].tier;

  const achievements = [
    { icon: <TrendingUp size={15} color="#D71920" />, label: `+${protein}g Protein` },
    { icon: <Sparkles size={15} color="#C9974A" />,    label: `+${pointsEarned} Reward Points` },
    { icon: <ShieldCheck size={15} color="#16A34A" />, label: 'Streak Protected' },
  ];

  function dismiss() {
    setClosing(true);
    HapticService.selection();
    setTimeout(onDismiss, 220);
  }

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(20,16,14,0.55)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        padding: '20px 16px',
        animation: closing ? 'skmCelFadeOut 220ms ease forwards' : 'skmCelFadeIn 200ms ease',
      }}
    >
      {/* Soft ambient glow behind the card */}
      <div style={{
        position: 'absolute', width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(215,25,32,0.25) 0%, transparent 70%)',
        filter: 'blur(20px)', pointerEvents: 'none',
        animation: 'skmCelGlow 2.4s ease-in-out infinite',
      }} />

      {/* Confetti — small, premium, not a firehose */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: `${p.x}%`, top: '38%',
          width: p.size, height: p.size, borderRadius: '50%',
          background: p.color, pointerEvents: 'none',
          animation: `skmCelConfetti ${p.duration}ms ease-out ${p.delay}ms forwards`,
          '--drift': `${p.drift}px`,
        } as React.CSSProperties} />
      ))}

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 420,
          background: '#FFFFFF',
          borderRadius: 28,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
          animation: closing ? 'skmCelCardOut 200ms ease forwards' : 'skmCelCardIn 360ms cubic-bezier(0.22,1,0.36,1)',
          overflow: 'hidden',
        }}
      >
        {/* Close */}
        <button onClick={dismiss} aria-label="Close" style={{
          position: 'absolute', top: 14, right: 14, zIndex: 2,
          width: 30, height: 30, borderRadius: '50%', border: 'none',
          background: 'rgba(0,0,0,0.06)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={15} color="#8A8580" />
        </button>

        <div style={{ padding: '36px 26px 26px', textAlign: 'center' }}>

          {/* ── Icon + title ── */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
            background: 'linear-gradient(135deg,#D71920,#B31217)',
            boxShadow: '0 10px 26px rgba(215,25,32,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'skmCelIconIn 480ms cubic-bezier(0.22,1,0.36,1) 80ms both',
          }}>
            {isMilestone
              ? <Flame size={30} color="#fff" strokeWidth={2.2} />
              : <ShieldCheck size={30} color="#fff" strokeWidth={2.2} />}
          </div>

          <h2 style={{ fontSize: 21, fontWeight: 800, color: '#181414', margin: '0 0 4px', letterSpacing: -0.3 }}>
            Great Job!
          </h2>
          <p style={{ fontSize: 13, color: '#8A8580', margin: '0 0 22px', fontWeight: 500 }}>
            Your healthy habit continues.
          </p>

          {/* ── Streak number ── */}
          <div style={{ marginBottom: 22, animation: 'skmCelRise 420ms cubic-bezier(0.22,1,0.36,1) 140ms both' }}>
            <span style={{
              fontSize: 56, fontWeight: 800, color: '#D71920', lineHeight: 1,
              letterSpacing: -2, display: 'block', fontVariantNumeric: 'tabular-nums',
            }}>
              {displayedStreak}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#B8B0A8', letterSpacing: 2.5,
              textTransform: 'uppercase', marginTop: 4, display: 'block',
            }}>
              Day Streak
            </span>
          </div>

          {/* ── Today's Achievement ── */}
          <div style={{ marginBottom: 22, textAlign: 'left' }}>
            <p style={{
              fontSize: 10, fontWeight: 700, color: '#B8B0A8', textTransform: 'uppercase',
              letterSpacing: 1, margin: '0 0 10px', textAlign: 'center',
            }}>
              Today's Achievement
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {achievements.map((a, i) => (
                <div key={a.label} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 14,
                  background: '#FAF8F6', border: '1px solid #F0ECE7',
                  animation: `skmCelSlideUp 380ms cubic-bezier(0.22,1,0.36,1) ${300 + i * 130}ms both`,
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 9, flexShrink: 0,
                    background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  }}>
                    {a.icon}
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#302A26' }}>{a.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Next milestone ── */}
          {nextMilestone && (
            <div style={{
              marginBottom: 16, padding: '14px 16px', borderRadius: 16,
              background: 'linear-gradient(135deg,#FBF6EE,#F5EBD8)',
              border: '1px solid #E9DAB8',
              animation: 'skmCelSlideUp 380ms cubic-bezier(0.22,1,0.36,1) 700ms both',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#A9782F', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Next Reward
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#8A6A24' }}>
                  {streak} / {nextMilestone}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#2B2420' }}>{nextMilestone} Day Streak</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#A9782F' }}>
                  +{nextMilestoneReward} pts{nextSticker ? ' · Sticker' : ''}
                </span>
              </div>
              <div style={{ height: 6, background: 'rgba(169,120,47,0.15)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${milestonePct}%`, borderRadius: 8,
                  background: 'linear-gradient(90deg,#C9974A,#A9782F)',
                  transition: 'width 900ms cubic-bezier(0.22,1,0.36,1) 750ms',
                }} />
              </div>
            </div>
          )}

          {/* ── Membership ── */}
          {tierProgress && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 14, marginBottom: 18,
              background: '#FAF8F6', border: '1px solid #F0ECE7',
              animation: 'skmCelSlideUp 380ms cubic-bezier(0.22,1,0.36,1) 820ms both',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#302A26' }}>{currentTier} Member</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#8A8580' }}>
                {tierProgress.next ? `${tierProgress.pointsToNext} points until ${tierProgress.next.tier}` : 'Top tier reached'}
              </span>
            </div>
          )}

          {/* ── Motivation — one sentence ── */}
          <p style={{
            fontSize: 12.5, color: '#8A8580', fontWeight: 500, margin: '0 0 20px',
            lineHeight: 1.5, animation: 'skmCelFadeUp 380ms ease 900ms both',
          }}>
            {motivationLine(goalMet, nextMilestone ? nextMilestone - streak : null)}
          </p>

          {/* ── Continue ── */}
          <button
            onClick={dismiss}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 14,
              border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#D71920,#B31217)',
              color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: 0.2,
              boxShadow: '0 6px 18px rgba(215,25,32,0.28)',
              animation: 'skmCelFadeUp 380ms ease 980ms both',
            }}
          >
            Continue
          </button>
        </div>
      </div>

      <style>{`
        @keyframes skmCelFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes skmCelFadeOut { from { opacity: 1; } to { opacity: 0; } }

        @keyframes skmCelCardIn {
          from { transform: scale(0.92) translateY(14px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }
        @keyframes skmCelCardOut {
          from { transform: scale(1)    translateY(0);   opacity: 1; }
          to   { transform: scale(0.96) translateY(8px); opacity: 0; }
        }

        @keyframes skmCelIconIn {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }

        @keyframes skmCelRise {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        @keyframes skmCelSlideUp {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        @keyframes skmCelFadeUp {
          from { transform: translateY(6px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }

        @keyframes skmCelGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.08); }
        }

        @keyframes skmCelConfetti {
          0%   { transform: translateY(0) translateX(0) scale(1); opacity: 1; }
          100% { transform: translateY(-160px) translateX(var(--drift)) scale(0.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
