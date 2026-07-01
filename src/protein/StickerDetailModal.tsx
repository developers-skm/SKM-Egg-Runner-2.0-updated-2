/**
 * StickerDetailModal — full-screen sticker detail + share card overlay.
 *
 * Props:
 *   milestone  — the milestone to show (null = hidden)
 *   claimed    — whether user has unlocked this sticker
 *   claimedDate — ISO date string of when it was claimed
 *   ownerName   — display name of the owner
 *   collectionIndex — 1-based position in user's collection
 *   totalCollected  — how many stickers user has total
 *   isFavorite — whether this sticker is favorited
 *   onToggleFavorite — called when user taps favorite
 *   onClose
 */

import { useState } from 'react';
import type { MilestoneDef } from '../services/protein/milestoneRewardService';
import { RARITY_COLOR, RARITY_BG } from '../services/protein/milestoneRewardService';
import StickerArt from './StickerArt';

interface StickerDetailModalProps {
  milestone:        MilestoneDef | null;
  claimed:          boolean;
  claimedDate?:     string;
  ownerName?:       string;
  collectionIndex:  number;
  totalCollected:   number;
  isFavorite:       boolean;
  onToggleFavorite: (days: number) => void;
  onClose:          () => void;
}

export default function StickerDetailModal({
  milestone, claimed, claimedDate, ownerName = 'Champion',
  collectionIndex, totalCollected, isFavorite, onToggleFavorite, onClose,
}: StickerDetailModalProps) {

  const [showShare, setShowShare] = useState(false);
  const [showMore,  setShowMore]  = useState(false);
  const [copied,    setCopied]    = useState(false);

  if (!milestone) return null;

  const rc  = RARITY_COLOR[milestone.rarity];
  const rb  = RARITY_BG[milestone.rarity];
  const grad = `linear-gradient(135deg, ${milestone.color}, ${milestone.color2})`;

  const formattedDate = claimedDate
    ? new Date(claimedDate + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  function handleCopyText() {
    const text = `🔥 I just unlocked "${milestone!.stickerName}" (${milestone!.days}-Day Streak) on SKM Protein Tracker! 💪 #SKMEgg #ProteinStreak`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  // ── Share modal ───────────────────────────────────────────────
  if (showShare) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '16px',
        animation: 'sdt-fade 200ms ease',
      }}>
        <div style={{
          width: '100%', maxWidth: 360,
          background: '#fff', borderRadius: 28,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          animation: 'sdt-pop 320ms cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          {/* Share card preview */}
          <div style={{
            background: grad,
            padding: '32px 24px',
            textAlign: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -50, left: -30, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

            <div style={{ marginBottom: 12 }}>
              <StickerArt days={milestone.days} fallback={milestone.sticker} size={80} />
            </div>

            <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.75)', margin: '0 0 4px', letterSpacing: 1, textTransform: 'uppercase' }}>I just unlocked</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 4px', letterSpacing: -0.5 }}>{milestone.stickerName}</p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '5px 14px',
              marginTop: 6,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>🔥 {milestone.days} Day Streak</span>
            </div>

            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', margin: '16px 0 0', fontWeight: 600, letterSpacing: 0.5 }}>
              Powered by SKM Protein Tracker
            </p>
          </div>

          {/* Share actions */}
          <div style={{ padding: '20px 20px 24px' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 14px' }}>Share To</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { icon: '💬', label: 'WhatsApp', color: '#25D366', href: `https://wa.me/?text=${encodeURIComponent(`🔥 I just unlocked "${milestone.stickerName}" (${milestone.days}-Day Streak) on SKM Protein Tracker! 💪`)}` },
                { icon: '📸', label: 'Instagram', color: '#E1306C', href: null },
                { icon: '👍', label: 'Facebook', color: '#1877F2', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://skm-egg-runner.web.app')}` },
                { icon: '🐦', label: 'X', color: '#000', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`🔥 I just unlocked "${milestone.stickerName}" (${milestone.days}-Day Streak) on SKM Protein Tracker! 💪 #SKMEgg`)}` },
              ].map(s => (
                <button key={s.label} onClick={() => {
                  if (s.href) window.open(s.href, '_blank', 'noopener');
                }} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  padding: '10px 4px', borderRadius: 14,
                  border: 'none', cursor: 'pointer',
                  background: `${s.color}15`,
                }}>
                  <span style={{ fontSize: 22 }}>{s.icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: s.color }}>{s.label}</span>
                </button>
              ))}
            </div>

            <button onClick={handleCopyText} style={{
              width: '100%', padding: '13px 0', borderRadius: 14,
              border: '1.5px solid #E8E8E8', background: copied ? '#F0FDF4' : '#F5F5F5',
              color: copied ? '#166534' : '#1A1A1A', fontWeight: 800, fontSize: 13,
              cursor: 'pointer', marginBottom: 10, transition: 'all 200ms',
            }}>
              {copied ? '✅ Copied!' : '📋 Copy Message'}
            </button>

            <button onClick={() => setShowShare(false)} style={{
              width: '100%', padding: '13px 0', borderRadius: 14,
              border: 'none', background: 'linear-gradient(135deg,#D71920,#B31217)',
              color: '#fff', fontWeight: 900, fontSize: 13, cursor: 'pointer',
            }}>
              Back
            </button>
          </div>
        </div>
        <style>{`@keyframes sdt-fade { from { opacity: 0; } to { opacity: 1; } } @keyframes sdt-pop { from { transform: scale(0.82) translateY(30px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }`}</style>
      </div>
    );
  }

  // ── Main detail modal ─────────────────────────────────────────
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        padding: '16px',
        animation: 'sdt-fade 200ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380,
          background: '#fff', borderRadius: 28,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          animation: 'sdt-pop 320ms cubic-bezier(0.34,1.56,0.64,1)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Hero */}
        <div style={{
          background: claimed ? grad : 'linear-gradient(135deg,#E8E8E8,#C8C8C8)',
          padding: '28px 20px 24px',
          textAlign: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -50, left: -30, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

          {/* Close button */}
          <button onClick={onClose} style={{
            position: 'absolute', top: 14, right: 14, zIndex: 2,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.25)', border: 'none', cursor: 'pointer',
            color: '#fff', fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>

          {/* Favorite */}
          {claimed && (
            <button onClick={() => onToggleFavorite(milestone.days)} style={{
              position: 'absolute', top: 14, left: 14, zIndex: 2,
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.25)', border: 'none', cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isFavorite ? '⭐' : '☆'}
            </button>
          )}

          <div style={{
            display: 'inline-block',
            marginBottom: 12,
            filter: claimed ? `drop-shadow(0 0 20px ${milestone.color}99)` : 'none',
            animation: claimed ? 'sdt-float 3s ease-in-out infinite' : 'none',
          }}>
            <StickerArt days={milestone.days} fallback={milestone.sticker} size={88} locked={!claimed} />
          </div>

          {/* Rarity badge */}
          <div style={{ marginBottom: 8 }}>
            <span style={{
              display: 'inline-block', padding: '3px 12px', borderRadius: 20,
              background: claimed ? 'rgba(255,255,255,0.25)' : '#E8E8E8',
              fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
              color: claimed ? '#fff' : '#999',
            }}>
              {milestone.rarity}
            </span>
          </div>

          <p style={{ fontSize: 18, fontWeight: 900, color: claimed ? '#fff' : '#ccc', margin: '0 0 4px', letterSpacing: -0.3 }}>
            {milestone.stickerName}
          </p>
          <p style={{ fontSize: 12, color: claimed ? 'rgba(255,255,255,0.7)' : '#bbb', margin: 0, fontWeight: 600 }}>
            {milestone.label} · {milestone.days}-Day Streak
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 20px 24px' }}>

          {/* Description */}
          <div style={{
            background: rb, border: `1.5px solid ${rc}33`,
            borderRadius: 14, padding: '12px 14px', marginBottom: 14,
          }}>
            <p style={{ fontSize: 13, color: '#1A1A1A', margin: 0, lineHeight: 1.6, fontWeight: 600 }}>
              {milestone.stickerDesc}
            </p>
          </div>

          {/* Meta grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <MetaCell label="Rarity" value={milestone.rarity} valueColor={rc} />
            <MetaCell label="Required Streak" value={`${milestone.days} Days`} />
            {formattedDate && <MetaCell label="Unlocked On" value={formattedDate} />}
            {claimed && <MetaCell label="Owner" value={ownerName} />}
            <MetaCell label="Collection" value={`#${collectionIndex} of ${totalCollected}`} />
            <MetaCell label="Status" value={claimed ? 'Collected ✅' : 'Locked 🔒'} valueColor={claimed ? '#22C55E' : '#999'} />
          </div>

          {/* Progress to this milestone */}
          {!claimed && (
            <div style={{
              background: '#F5F5F5', borderRadius: 14, padding: '12px 14px', marginBottom: 14,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#999', margin: '0 0 4px' }}>
                Keep your streak going to unlock this sticker
              </p>
              <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>
                {milestone.days} day streak required
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: claimed ? 10 : 0 }}>
            {claimed && (
              <button onClick={() => setShowShare(true)} style={{
                flex: 1, padding: '13px 0', borderRadius: 14,
                border: 'none', cursor: 'pointer',
                background: `linear-gradient(135deg,${milestone.color},${milestone.color2})`,
                color: '#fff', fontWeight: 900, fontSize: 13,
                boxShadow: `0 6px 18px ${milestone.color}44`,
              }}>
                📤 Share
              </button>
            )}
            {claimed && (
              <button onClick={() => onToggleFavorite(milestone.days)} style={{
                flex: 1, padding: '13px 0', borderRadius: 14,
                border: `1.5px solid ${isFavorite ? '#F59E0B' : '#E8E8E8'}`,
                background: isFavorite ? '#FFFBEB' : '#F5F5F5',
                color: isFavorite ? '#D97706' : '#666',
                fontWeight: 800, fontSize: 13, cursor: 'pointer',
              }}>
                {isFavorite ? '⭐ Favorited' : '☆ Favorite'}
              </button>
            )}
            {!claimed && (
              <button onClick={onClose} style={{
                flex: 1, padding: '13px 0', borderRadius: 14,
                border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)',
                color: '#fff', fontWeight: 900, fontSize: 13,
              }}>
                🔥 Keep Scanning to Unlock
              </button>
            )}
          </div>

          {/* More menu */}
          {claimed && (
            <>
              <button onClick={() => setShowMore(m => !m)} style={{
                width: '100%', padding: '11px 0', borderRadius: 14,
                border: '1.5px solid #E8E8E8', background: '#F5F5F5',
                color: '#999', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}>
                {showMore ? '▲ Less' : '▾ More'}
              </button>
              {showMore && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { icon: '🏆', label: 'View Milestone on Streak Page' },
                    { icon: '📅', label: `Unlock History: ${formattedDate ?? '—'}` },
                    { icon: '✨', label: `Rarity: ${milestone.rarity}` },
                    { icon: '📦', label: `Similar: Other ${milestone.rarity} stickers` },
                  ].map(item => (
                    <div key={item.label} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 12, background: '#F8F8F8',
                    }}>
                      <span style={{ fontSize: 16 }}>{item.icon}</span>
                      <span style={{ fontSize: 12, color: '#444', fontWeight: 600 }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes sdt-fade  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sdt-pop   { from { transform: scale(0.82) translateY(30px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes sdt-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
      `}</style>
    </div>
  );
}

function MetaCell({ label, value, valueColor = '#1A1A1A' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ background: '#F8F8F8', borderRadius: 12, padding: '10px 12px' }}>
      <p style={{ fontSize: 9, fontWeight: 800, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 800, color: valueColor, margin: 0, lineHeight: 1.3 }}>{value}</p>
    </div>
  );
}
