import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { buildReturnSummary, type ReturnSummary } from '../services/protein/retentionService';
import {
  FlameIcon, ZapIcon, CoinIcon, GiftIcon, TargetIcon, CheckCircleIcon,
  TrendUpIcon, ShieldIcon, EggIcon, ListIcon, ArrowLeftIcon,
} from './Icons';

interface ReturnScreenProps {
  user: User;
  onDismiss: () => void;
  onGoToScan: () => void;
  onGoToMissions: () => void;
  onGoToLogin: () => void;
}

export default function ReturnScreen({ user, onDismiss, onGoToScan, onGoToMissions, onGoToLogin }: ReturnScreenProps) {
  const [summary, setSummary] = useState<ReturnSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [step,    setStep]    = useState(0); // animated entrance step

  useEffect(() => {
    const name = user.displayName?.split(' ')[0] ?? 'Champion';
    buildReturnSummary(user.uid, name)
      .then(s => { setSummary(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user.uid, user.displayName]);

  // Staggered entrance animation
  useEffect(() => {
    if (loading) return;
    let i = 0;
    const t = setInterval(() => { i++; setStep(i); if (i >= 6) clearInterval(t); }, 120);
    return () => clearInterval(t);
  }, [loading]);

  if (loading || !summary) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const name    = user.displayName?.split(' ')[0] ?? 'Champion';
  const hour    = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const totalUnclaimed = summary.unclaimedMissions + (summary.unclaimedLoginReward ? 1 : 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
    }}
      onClick={onDismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, borderRadius: '28px 28px 0 0',
          background: '#F5F5F5', maxHeight: '90vh', overflowY: 'auto',
          paddingBottom: 16,
          transform: 'translateY(0)',
          animation: 'slideUp 350ms cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 24px', borderRadius: '28px 28px 0 0', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: '0 0 2px', fontWeight: 600 }}>{greeting}</p>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>{name}</h2>
            </div>
            <button onClick={onDismiss} style={{
              width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.18)',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ArrowLeftIcon size={16} color="#fff" />
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: '6px 0 0', lineHeight: 1.5, fontWeight: 500 }}>
            {summary.motivationMessage}
          </p>
        </div>

        <div style={{ padding: '0 14px' }}>

          {/* Progress since yesterday */}
          {step >= 1 && (
            <div style={{ background: '#fff', borderRadius: 20, padding: '14px 16px', marginTop: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', animation: 'fadeUp 250ms ease' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Since Yesterday</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <MiniStat
                  icon={<EggIcon size={14} color="#D71920" />}
                  value={`${summary.proteinsToday}g`}
                  label="Today"
                  color="#D71920"
                />
                <MiniStat
                  icon={<TrendUpIcon size={14} color={summary.proteinDelta >= 0 ? '#22C55E' : '#F59E0B'} />}
                  value={`${summary.proteinDelta >= 0 ? '+' : ''}${summary.proteinDelta}g`}
                  label="vs Yesterday"
                  color={summary.proteinDelta >= 0 ? '#22C55E' : '#F59E0B'}
                />
                <MiniStat
                  icon={<FlameIcon size={14} color="#D71920" />}
                  value={`${summary.streak}`}
                  label="Streak"
                  color="#D71920"
                />
              </div>
            </div>
          )}

          {/* XP + Coins row */}
          {step >= 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, animation: 'fadeUp 250ms ease' }}>
              <div style={{ background: '#FCE8E8', borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <ZapIcon size={18} color="#D71920" />
                <div>
                  <p style={{ fontSize: 16, fontWeight: 900, color: '#D71920', margin: 0 }}>{summary.xpAvailable.toLocaleString()}</p>
                  <p style={{ fontSize: 9, fontWeight: 700, color: '#A50F15', textTransform: 'uppercase', margin: 0 }}>Total XP · Lv {summary.levelInfo.level}</p>
                </div>
              </div>
              <div style={{ background: '#FEF3C7', borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <CoinIcon size={18} color="#D97706" />
                <div>
                  <p style={{ fontSize: 16, fontWeight: 900, color: '#D97706', margin: 0 }}>{summary.coinsAvailable.toLocaleString()}</p>
                  <p style={{ fontSize: 9, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', margin: 0 }}>Coins</p>
                </div>
              </div>
            </div>
          )}

          {/* Streak status */}
          {step >= 3 && summary.streak > 0 && (
            <div style={{
              background: 'linear-gradient(135deg,#D71920,#B31217)', borderRadius: 18, padding: '12px 16px',
              marginTop: 10, display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 4px 14px rgba(215,25,32,0.3)', animation: 'fadeUp 250ms ease',
            }}>
              <FlameIcon size={22} color="#fff" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: 0 }}>{summary.streak}-Day Streak Active</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: 0, marginTop: 2 }}>
                  {summary.streakProtected ? 'Protected by a Streak Shield' : 'Scan an egg today to maintain it'}
                </p>
              </div>
              {summary.streakProtected && <ShieldIcon size={20} color="rgba(255,255,255,0.8)" />}
            </div>
          )}

          {/* Unclaimed items */}
          {step >= 4 && totalUnclaimed > 0 && (
            <div style={{ background: '#fff', borderRadius: 20, padding: '14px 16px', marginTop: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', animation: 'fadeUp 250ms ease' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Ready to Collect</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {summary.unclaimedLoginReward && (
                  <UnclaimedRow icon={<GiftIcon size={16} color="#D71920" />} label="Daily Login Reward" sub={`Day ${summary.loginDay} reward available`} color="#FCE8E8" textColor="#D71920" onTap={onGoToLogin} />
                )}
                {summary.unclaimedMissions > 0 && (
                  <UnclaimedRow icon={<ListIcon size={16} color="#8B5CF6" />} label={`${summary.unclaimedMissions} Mission${summary.unclaimedMissions > 1 ? 's' : ''} Completed`} sub="Tap to collect XP and coins" color="#F5F3FF" textColor="#8B5CF6" onTap={onGoToMissions} />
                )}
              </div>
            </div>
          )}

          {/* Active missions */}
          {step >= 5 && summary.activeMissions.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 20, padding: '14px 16px', marginTop: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', animation: 'fadeUp 250ms ease' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>Active Missions</p>
              {summary.activeMissions.slice(0, 2).map(m => {
                const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
                return (
                  <div key={m.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A' }}>{m.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#D71920' }}>{m.progress}/{m.target}</span>
                    </div>
                    <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#D71920,#B31217)', borderRadius: 3, transition: 'width 500ms ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CTA buttons */}
          {step >= 6 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, animation: 'fadeUp 250ms ease' }}>
              <button onClick={onGoToScan} style={{
                width: '100%', padding: '15px 0', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff',
                fontWeight: 900, fontSize: 15, letterSpacing: 1, textTransform: 'uppercase',
                boxShadow: '0 6px 20px rgba(215,25,32,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                <EggIcon size={18} color="#fff" />
                Scan SKM Egg Now
              </button>
              <button onClick={onDismiss} style={{
                width: '100%', padding: '13px 0', borderRadius: 18, border: '1.5px solid #E8E8E8', cursor: 'pointer',
                background: '#fff', color: '#666', fontWeight: 700, fontSize: 13,
              }}>
                View Dashboard
              </button>
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function MiniStat({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{icon}</div>
      <p style={{ fontSize: 16, fontWeight: 900, color, margin: 0, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 9, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', margin: '3px 0 0', letterSpacing: 0.3 }}>{label}</p>
    </div>
  );
}

function UnclaimedRow({ icon, label, sub, color, textColor, onTap }: {
  icon: React.ReactNode; label: string; sub: string; color: string; textColor: string; onTap: () => void;
}) {
  return (
    <button onClick={onTap} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 12px',
      background: color, borderRadius: 14, border: 'none', cursor: 'pointer', textAlign: 'left',
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: textColor, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 10, color: textColor, opacity: 0.7, margin: 0, marginTop: 1 }}>{sub}</p>
      </div>
      <span style={{ fontSize: 16, color: textColor, opacity: 0.6 }}>›</span>
    </button>
  );
}
