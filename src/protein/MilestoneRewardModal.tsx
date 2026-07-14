/**
 * SKM Premium Milestone Reward Modal v2
 *
 * Phase sequence:
 *   idle → shaking → cracking → revealed → flying (sticker flies to collection)
 *
 * Uses SVG sticker art instead of emoji.
 */

import { useState, useEffect } from 'react';
import type { MilestoneDef } from '../services/protein/milestoneRewardService';
import { claimMilestone } from '../services/protein/milestoneRewardService';
import { HapticService } from '../services/audio/hapticService';
import StickerArt from './StickerArt';

interface MilestoneRewardModalProps {
  uid:       string;
  milestone: MilestoneDef | null;
  onClaimed: () => void;
  onClose:   () => void;
}

type Phase = 'idle' | 'shaking' | 'cracking' | 'revealed' | 'flying';

export default function MilestoneRewardModal({ uid, milestone, onClaimed, onClose }: MilestoneRewardModalProps) {
  const [phase,    setPhase]    = useState<Phase>('idle');
  const [claiming, setClaiming] = useState(false);
  const [sparks,   setSparks]   = useState<{ id: number; x: number; y: number; angle: number; c: string; size: number }[]>([]);
  const [flying,   setFlying]   = useState(false);

  useEffect(() => {
    if (milestone) { setPhase('idle'); setFlying(false); }
  }, [milestone?.days]);

  if (!milestone) return null;

  const grad = `linear-gradient(135deg, ${milestone.color}, ${milestone.color2})`;

  const handleClaim = async () => {
    if (claiming || phase === 'revealed' || phase === 'flying') return;
    setClaiming(true);
    HapticService.selection(); // major button press — Claim

    setPhase('shaking');
    await delay(520);

    setPhase('cracking');
    await delay(640);

    setPhase('revealed');
    spawnSparks();
    HapticService.success(); // Sticker Unlocked

    try {
      await claimMilestone(uid, milestone.days);
      onClaimed();
    } catch (e) {
      console.error('[Milestone] claim error:', e);
    } finally {
      setClaiming(false);
    }
  };

  const handleViewCollection = async () => {
    // Trigger flying animation then close
    setFlying(true);
    await delay(900);
    onClose();
  };

  const spawnSparks = () => {
    const colors = ['#FFD700','#D71920','#F59E0B','#ffffff','#EC4899','#22C55E','#60A5FA','#A78BFA'];
    setSparks(Array.from({ length: 36 }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      y: 15 + Math.random() * 55,
      angle: Math.random() * 360,
      c: colors[i % colors.length],
      size: 5 + Math.random() * 8,
    })));
    setTimeout(() => setSparks([]), 2400);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.82)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      animation: 'mr-fade 200ms ease',
      padding: '0 20px',
    }}>

      {/* Confetti sparks */}
      {sparks.map(s => (
        <div key={s.id} style={{
          position: 'fixed',
          left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size,
          borderRadius: s.id % 3 === 0 ? '50%' : s.id % 3 === 1 ? 2 : '0',
          background: s.c,
          pointerEvents: 'none',
          zIndex: 10000,
          transform: `rotate(${s.angle}deg)`,
          animation: `mr-spark 2s ease-out ${(s.id % 6) * 50}ms forwards`,
          '--tx': `${(Math.random() - 0.5) * 180}px`,
          '--ty': `${-60 - Math.random() * 160}px`,
        } as React.CSSProperties} />
      ))}

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 380,
        background: '#fff',
        borderRadius: 32,
        overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.65)',
        animation: 'mr-card-in 320ms cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* Hero */}
        <div style={{
          background: grad,
          padding: '32px 24px 28px',
          textAlign: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -50, left: -30, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

          {/* Sticker / egg display */}
          <div style={{
            display: 'inline-block',
            marginBottom: 12,
            animation:
              phase === 'shaking'  ? 'mr-shake 0.52s ease-in-out' :
              phase === 'cracking' ? 'mr-crack 0.64s ease-in-out' :
              phase === 'revealed' ? (flying ? 'mr-fly-out 0.8s cubic-bezier(0.68,-0.55,0.27,1.55) forwards' : 'mr-pop 0.5s cubic-bezier(0.34,1.56,0.64,1)') :
              'mr-float 3s ease-in-out infinite',
            filter: phase === 'revealed'
              ? `drop-shadow(0 0 28px ${milestone.color}cc) drop-shadow(0 0 60px ${milestone.color}66)`
              : 'drop-shadow(0 4px 14px rgba(0,0,0,0.3))',
            transformOrigin: phase === 'flying' ? 'top right' : 'center',
          }}>
            {phase === 'revealed' || phase === 'flying'
              ? <StickerArt days={milestone.days} fallback={milestone.sticker} size={82} />
              : <span style={{ fontSize: 68, lineHeight: 1, display: 'block' }}>🥚</span>
            }
          </div>

          {phase === 'revealed' && !flying && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: `radial-gradient(circle at 50% 50%, ${milestone.color}44 0%, transparent 60%)`,
              animation: 'mr-glow-burst 600ms ease-out forwards',
            }} />
          )}

          <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
            {milestone.days}-Day Streak
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: -0.5 }}>
            {milestone.label}
          </div>

          {/* Rarity pill */}
          <div style={{
            display: 'inline-block', marginTop: 8,
            padding: '3px 12px', borderRadius: 20,
            background: 'rgba(255,255,255,0.22)',
            fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 0.5,
          }}>
            {milestone.rarity.toUpperCase()}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 24px 28px', textAlign: 'center' }}>

          {phase !== 'revealed' && phase !== 'flying' ? (
            <>
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

              {/* Mystery box */}
              <div style={{
                background: '#F8F8F8', borderRadius: 16,
                padding: '14px 16px', marginBottom: 22,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'linear-gradient(135deg,#F3F4F6,#E5E7EB)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, flexShrink: 0,
                  border: '2px dashed #D1D5DB',
                }}>
                  ?
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>Exclusive Collectible Sticker</p>
                  <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>Tap below to reveal your artwork</p>
                </div>
              </div>

              <button
                onClick={handleClaim}
                disabled={claiming}
                style={{
                  width: '100%', padding: '16px 0', borderRadius: 18,
                  border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 16,
                  background: grad, color: '#fff', letterSpacing: 0.5,
                  boxShadow: `0 8px 24px ${milestone.color}55`,
                  opacity: claiming ? 0.8 : 1,
                }}
              >
                {claiming ? '✨ Opening…' : '🎁 CLAIM REWARD'}
              </button>

              <button onClick={onClose} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: '#ccc', marginTop: 14, fontWeight: 600,
              }}>
                Maybe later
              </button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 32, animation: 'mr-bounce 0.6s cubic-bezier(0.34,1.56,0.64,1)' }}>🎉</span>
              </div>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px' }}>
                Congratulations!
              </p>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px', lineHeight: 1.6 }}>
                You earned the <strong>{milestone.stickerName}</strong> sticker after {milestone.days} days!
              </p>

              {/* Collected card */}
              <div style={{
                background: `linear-gradient(135deg, ${milestone.color}18, ${milestone.color2}10)`,
                border: `2px solid ${milestone.color}44`,
                borderRadius: 20, padding: '16px',
                display: 'flex', alignItems: 'center', gap: 14,
                marginBottom: 20, textAlign: 'left',
                animation: 'mr-slide-in 400ms cubic-bezier(0.34,1.56,0.64,1) 200ms both',
              }}>
                <StickerArt days={milestone.days} fallback={milestone.sticker} size={52}
                  style={{ filter: `drop-shadow(0 6px 14px ${milestone.color}55)` }} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>{milestone.stickerName}</p>
                  <p style={{ fontSize: 11, color: '#666', margin: '2px 0 0' }}>Added to your Sticker Collection</p>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#F0FDF4', borderRadius: 6, padding: '2px 8px', marginTop: 5,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#16A34A' }}>✅ Collected</span>
                  </div>
                </div>
              </div>

              {/* Flying hint */}
              {flying && (
                <div style={{
                  fontSize: 12, color: '#aaa', marginBottom: 14,
                  animation: 'mr-fade-in 300ms ease',
                }}>
                  ✨ Flying into your collection…
                </div>
              )}

              <button
                onClick={handleViewCollection}
                disabled={flying}
                style={{
                  width: '100%', padding: '15px 0', borderRadius: 18,
                  border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 15,
                  background: 'linear-gradient(135deg,#22C55E,#16A34A)',
                  color: '#fff',
                  boxShadow: '0 6px 20px rgba(34,197,94,0.4)',
                  opacity: flying ? 0.6 : 1,
                  animation: 'mr-slide-in 400ms cubic-bezier(0.34,1.56,0.64,1) 400ms both',
                }}
              >
                {flying ? '✨ Adding to Collection…' : '📚 View My Collection'}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes mr-fade      { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mr-fade-in   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mr-card-in   { from { transform: scale(0.82) translateY(30px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes mr-float     { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes mr-bounce    { 0% { transform: scale(0); } 60% { transform: scale(1.3); } 100% { transform: scale(1); } }
        @keyframes mr-slide-in  { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes mr-shake {
          0%,100% { transform: rotate(0deg) scale(1); }
          15%     { transform: rotate(-14deg) scale(1.08); }
          30%     { transform: rotate(14deg)  scale(1.1); }
          45%     { transform: rotate(-10deg) scale(1.06); }
          60%     { transform: rotate(10deg)  scale(1.08); }
          75%     { transform: rotate(-7deg)  scale(1.04); }
          90%     { transform: rotate(7deg)   scale(1.02); }
        }
        @keyframes mr-crack {
          0%   { transform: scale(1);    filter: brightness(1); }
          20%  { transform: scale(1.15); filter: brightness(1.4); }
          50%  { transform: scale(0.90); filter: brightness(0.7); }
          70%  { transform: scale(1.22); filter: brightness(1.7) drop-shadow(0 0 30px gold); }
          100% { transform: scale(0);   filter: brightness(3) blur(6px); opacity: 0; }
        }
        @keyframes mr-pop {
          0%   { transform: scale(0) rotate(-18deg); opacity: 0; }
          60%  { transform: scale(1.28) rotate(6deg); opacity: 1; }
          80%  { transform: scale(0.92) rotate(-2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes mr-fly-out {
          0%   { transform: scale(1) translate(0, 0) rotate(0deg); opacity: 1; }
          40%  { transform: scale(1.2) translate(20px, -30px) rotate(10deg); opacity: 1; }
          100% { transform: scale(0.15) translate(140px, -300px) rotate(45deg); opacity: 0; }
        }
        @keyframes mr-glow-burst {
          0%   { opacity: 1; transform: scale(0.5); }
          100% { opacity: 0; transform: scale(2); }
        }
        @keyframes mr-spark {
          0%   { transform: translate(0, 0) rotate(var(--r, 0deg)) scale(1); opacity: 1; }
          100% { transform: translate(var(--tx, 60px), var(--ty, -120px)) rotate(calc(var(--r, 0deg) + 540deg)) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
