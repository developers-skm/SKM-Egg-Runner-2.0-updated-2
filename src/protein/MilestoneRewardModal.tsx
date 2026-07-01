/**
 * SKM Premium Milestone Reward Modal
 *
 * Full-screen glassmorphism overlay with a 4-phase claim animation:
 *   idle → shaking → cracking → revealed
 *
 * Parent controls visibility via `milestone` prop (null = hidden).
 * Calls `onClaimed()` after Firestore write completes so parent can
 * refresh claimed sticker state.
 */

import { useState, useEffect } from 'react';
import type { MilestoneDef } from '../services/protein/milestoneRewardService';
import { claimMilestone } from '../services/protein/milestoneRewardService';

interface MilestoneRewardModalProps {
  uid:       string;
  milestone: MilestoneDef | null;
  onClaimed: () => void;
  onClose:   () => void;
}

type Phase = 'idle' | 'shaking' | 'cracking' | 'revealed';

export default function MilestoneRewardModal({ uid, milestone, onClaimed, onClose }: MilestoneRewardModalProps) {
  const [phase,    setPhase]    = useState<Phase>('idle');
  const [claiming, setClaiming] = useState(false);
  const [sparks,   setSparks]   = useState<{ id: number; x: number; y: number; r: number; c: string }[]>([]);

  // Reset phase when a new milestone is shown
  useEffect(() => {
    if (milestone) setPhase('idle');
  }, [milestone?.days]);

  if (!milestone) return null;

  const handleClaim = async () => {
    if (claiming || phase === 'revealed') return;
    setClaiming(true);

    // Phase 1 — shake the egg
    setPhase('shaking');
    await delay(500);

    // Phase 2 — crack the egg
    setPhase('cracking');
    await delay(600);

    // Phase 3 — reveal sticker + confetti
    setPhase('revealed');
    spawnSparks();

    // Write to Firestore
    try {
      await claimMilestone(uid, milestone.days);
      onClaimed();
    } catch (e) {
      console.error('[Milestone] claim error:', e);
    } finally {
      setClaiming(false);
    }
  };

  const spawnSparks = () => {
    const colors = ['#FFD700', '#D71920', '#F59E0B', '#ffffff', '#EC4899', '#22C55E'];
    const items = Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: 30 + Math.random() * 40,
      y: 30 + Math.random() * 40,
      r: Math.random() * 360,
      c: colors[i % colors.length],
    }));
    setSparks(items);
    setTimeout(() => setSparks([]), 2200);
  };

  const grad = `linear-gradient(135deg, ${milestone.color}, ${milestone.color2})`;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.78)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      animation: 'fadeIn 200ms ease',
      padding: '0 20px',
    }}>

      {/* Confetti sparks */}
      {sparks.map(s => (
        <div key={s.id} style={{
          position: 'fixed',
          left: `${s.x}%`,
          top:  `${s.y}%`,
          width: 8 + (s.id % 4) * 3,
          height: 8 + (s.id % 3) * 3,
          borderRadius: s.id % 3 === 0 ? '50%' : 2,
          background: s.c,
          animation: `spark-fly 1.8s ease-out forwards`,
          animationDelay: `${(s.id % 5) * 60}ms`,
          transform: `rotate(${s.r}deg)`,
          zIndex: 10000,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 380,
        background: '#fff',
        borderRadius: 32,
        overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        animation: 'cardPop 300ms cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* Hero banner */}
        <div style={{
          background: grad,
          padding: '32px 24px 28px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -50, left: -30, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

          {/* Egg / sticker display */}
          <div style={{
            fontSize: phase === 'revealed' ? 80 : 68,
            lineHeight: 1,
            marginBottom: 12,
            display: 'inline-block',
            animation:
              phase === 'shaking'  ? 'egg-shake 0.5s ease-in-out'       :
              phase === 'cracking' ? 'egg-crack 0.6s ease-in-out'        :
              phase === 'revealed' ? 'sticker-pop 0.5s cubic-bezier(0.34,1.56,0.64,1)' :
              'float 3s ease-in-out infinite',
            filter: phase === 'revealed'
              ? `drop-shadow(0 0 24px ${milestone.color}aa)`
              : 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
          }}>
            {phase === 'revealed' ? milestone.sticker : '🥚'}
          </div>

          <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
            {milestone.days}-Day Streak
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: -0.5 }}>
            {milestone.label}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 24px 28px', textAlign: 'center' }}>

          {phase !== 'revealed' ? (
            <>
              {/* Pre-claim state */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'linear-gradient(135deg,#FEF3C7,#FDE68A)',
                border: '1.5px solid #F59E0B',
                borderRadius: 50, padding: '5px 14px', marginBottom: 16,
              }}>
                <span style={{ fontSize: 12 }}>🎁</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#92400E' }}>Reward Ready to Claim</span>
              </div>

              <p style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px' }}>
                {milestone.stickerName}
              </p>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 22px', lineHeight: 1.6 }}>
                {milestone.stickerDesc}
              </p>

              <div style={{
                background: '#F8F8F8', borderRadius: 16,
                padding: '14px 16px', marginBottom: 22,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: 'linear-gradient(135deg,#F3F4F6,#E5E7EB)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, flexShrink: 0,
                  border: '2px dashed #D1D5DB',
                }}>
                  ?
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>Exclusive Sticker</p>
                  <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>Tap below to reveal your collectible</p>
                </div>
              </div>

              <button
                onClick={handleClaim}
                disabled={claiming}
                style={{
                  width: '100%', padding: '16px 0', borderRadius: 18,
                  border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 16,
                  background: `linear-gradient(135deg, ${milestone.color}, ${milestone.color2})`,
                  color: '#fff', letterSpacing: 0.5,
                  boxShadow: `0 8px 24px ${milestone.color}55`,
                  opacity: claiming ? 0.8 : 1,
                  transition: 'transform 150ms, opacity 150ms',
                }}
                onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
                onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
              >
                {claiming ? '✨ Opening…' : '🎁 CLAIM REWARD'}
              </button>
            </>
          ) : (
            <>
              {/* Post-reveal state */}
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 32 }}>🎉</span>
              </div>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px' }}>
                Congratulations!
              </p>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 4px', lineHeight: 1.6 }}>
                You maintained your streak for {milestone.days} days and unlocked:
              </p>

              <div style={{
                background: `linear-gradient(135deg, ${milestone.color}18, ${milestone.color2}10)`,
                border: `2px solid ${milestone.color}40`,
                borderRadius: 20, padding: '16px', margin: '16px 0',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16,
                  background: `linear-gradient(135deg, ${milestone.color}, ${milestone.color2})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, flexShrink: 0,
                  boxShadow: `0 6px 18px ${milestone.color}55`,
                }}>
                  {milestone.sticker}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>{milestone.stickerName}</p>
                  <p style={{ fontSize: 11, color: '#666', margin: '3px 0 0' }}>Added to your Sticker Collection</p>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#F0FDF4', borderRadius: 6, padding: '2px 8px', marginTop: 4,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#16A34A' }}>✅ Collected</span>
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                style={{
                  width: '100%', padding: '15px 0', borderRadius: 18,
                  border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 15,
                  background: 'linear-gradient(135deg,#22C55E,#16A34A)',
                  color: '#fff',
                  boxShadow: '0 6px 20px rgba(34,197,94,0.4)',
                }}
              >
                ✅ View Collection
              </button>
            </>
          )}

          {/* Dismiss link */}
          {phase !== 'revealed' && (
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: '#ccc', marginTop: 14, fontWeight: 600,
            }}>
              Maybe later
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes cardPop {
          from { transform: scale(0.82) translateY(30px); opacity: 0; }
          to   { transform: scale(1)    translateY(0);    opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes egg-shake {
          0%,100% { transform: rotate(0deg) scale(1); }
          15%     { transform: rotate(-12deg) scale(1.08); }
          30%     { transform: rotate(12deg)  scale(1.1); }
          45%     { transform: rotate(-10deg) scale(1.06); }
          60%     { transform: rotate(10deg)  scale(1.08); }
          75%     { transform: rotate(-6deg)  scale(1.04); }
          90%     { transform: rotate(6deg)   scale(1.02); }
        }
        @keyframes egg-crack {
          0%   { transform: scale(1);    filter: brightness(1); }
          20%  { transform: scale(1.12); filter: brightness(1.3); }
          50%  { transform: scale(0.92); filter: brightness(0.8); }
          70%  { transform: scale(1.18); filter: brightness(1.5); }
          100% { transform: scale(0);   filter: brightness(2) blur(4px); opacity: 0; }
        }
        @keyframes sticker-pop {
          0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
          60%  { transform: scale(1.25) rotate(5deg);  opacity: 1; }
          80%  { transform: scale(0.92) rotate(-2deg); }
          100% { transform: scale(1)    rotate(0deg);  }
        }
        @keyframes spark-fly {
          0%   { transform: translate(0, 0) rotate(var(--r, 0deg)) scale(1);  opacity: 1; }
          100% { transform: translate(var(--tx, 60px), var(--ty, -120px)) rotate(calc(var(--r, 0deg) + 360deg)) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
