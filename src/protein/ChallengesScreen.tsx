import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { getChallenges, claimChallenge, updateChallengeProgress, type Challenge } from '../services/protein/proteinTrackerService';
import { TargetIcon, ZapIcon, CoinIcon, CheckCircleIcon, CalendarIcon, FlameIcon, TrophyIcon } from './Icons';

interface ChallengesScreenProps { user: User; refreshKey: number; onClaimed: () => void; }

type ChallengeType = 'all' | 'daily' | 'weekly' | 'monthly';

const TYPE_TABS: { key: ChallengeType; label: string }[] = [
  { key: 'all',     label: 'All'     },
  { key: 'daily',   label: 'Daily'   },
  { key: 'weekly',  label: 'Weekly'  },
  { key: 'monthly', label: 'Monthly' },
];

export default function ChallengesScreen({ user, refreshKey, onClaimed }: ChallengesScreenProps) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [tab,        setTab]        = useState<ChallengeType>('all');
  const [claiming,   setClaiming]   = useState<string | null>(null);
  const [toast,      setToast]      = useState<{ xp: number; coins: number } | null>(null);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Mark daily app-open challenge
      await updateChallengeProgress(user.uid, 'app_open', 1);
      const chs = await getChallenges(user.uid);
      setChallenges(chs);
    } catch (e) { console.error('[Challenges]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleClaim = async (ch: Challenge) => {
    if (!ch.completed || ch.claimed || claiming) return;
    setClaiming(ch.id);
    try {
      const { xp, coins } = await claimChallenge(user.uid, ch.id);
      setToast({ xp, coins });
      await load();
      onClaimed();
    } catch { /* ignore */ }
    finally { setClaiming(null); }
  };

  const filtered = challenges.filter(c => tab === 'all' || c.type === tab);
  const completed  = challenges.filter(c => c.completed && !c.claimed).length;

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: 16, right: 16, zIndex: 60,
          background: 'linear-gradient(135deg,#22C55E,#16a34a)', borderRadius: 18, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 24px rgba(34,197,94,0.4)',
        }}>
          <CheckCircleIcon size={28} color="#fff" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: 0 }}>Reward Claimed!</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: 0, marginTop: 2 }}>+{toast.xp} XP · +{toast.coins} coins added to wallet</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 20px', flexShrink: 0, boxShadow: '0 4px 20px rgba(215,25,32,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TargetIcon size={22} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Challenges</h2>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>Complete to earn XP and coins</p>
            </div>
          </div>
          {completed > 0 && (
            <div style={{ background: '#22C55E', borderRadius: 20, padding: '5px 12px' }}>
              <p style={{ fontSize: 12, fontWeight: 900, color: '#fff', margin: 0 }}>{completed} to claim</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, background: '#F0F0F0', borderRadius: 16, padding: 4, margin: '14px 16px 0' }}>
          {TYPE_TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '9px 0', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12,
              background: tab === t.key ? '#D71920' : 'transparent',
              color:      tab === t.key ? '#fff'    : '#999',
              transition: 'all 150ms ease',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Challenge list */}
        <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 20, padding: 28, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <TargetIcon size={40} color="#E0E0E0" />
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A', margin: '12px 0 4px' }}>No challenges found</p>
              <p style={{ fontSize: 12, color: '#999', margin: 0 }}>Challenges refresh daily, weekly, and monthly.</p>
            </div>
          ) : filtered.map(ch => <ChallengeCard key={ch.id} ch={ch} claiming={claiming === ch.id} onClaim={() => handleClaim(ch)} />)}
        </div>

        {/* How challenges work */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>How It Works</p>
          {[
            { icon: <CalendarIcon size={16} color="#D71920" />,   text: 'Daily challenges reset every midnight.' },
            { icon: <FlameIcon size={16} color="#D71920" />,      text: 'Weekly challenges reset every Monday.' },
            { icon: <TrophyIcon size={16} color="#D71920" />,     text: 'Monthly challenges reset on the 1st.' },
            { icon: <CheckCircleIcon size={16} color="#22C55E" />, text: 'Claim rewards before they expire.' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < 3 ? 10 : 0 }}>
              {row.icon}
              <p style={{ fontSize: 12, color: '#666', margin: 0 }}>{row.text}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

function ChallengeCard({ ch, claiming, onClaim }: { ch: Challenge; claiming: boolean; onClaim: () => void }) {
  const pct = Math.min(100, Math.round((ch.progress / ch.target) * 100));
  const typeColor = ch.type === 'daily' ? '#D71920' : ch.type === 'weekly' ? '#8B5CF6' : '#F59E0B';
  const typeBg    = ch.type === 'daily' ? '#FCE8E8' : ch.type === 'weekly' ? '#F5F3FF' : '#FEF3C7';

  return (
    <div style={{
      background: '#fff', borderRadius: 18, padding: '16px 16px',
      boxShadow: ch.completed && !ch.claimed ? '0 4px 16px rgba(34,197,94,0.2)' : '0 2px 8px rgba(0,0,0,0.06)',
      border: ch.completed && !ch.claimed ? '2px solid rgba(34,197,94,0.4)' : ch.claimed ? '2px solid rgba(0,0,0,0.04)' : '2px solid transparent',
      opacity: ch.claimed ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Type icon */}
        <div style={{ width: 44, height: 44, borderRadius: 14, background: typeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TargetIcon size={20} color={typeColor} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>{ch.title}</p>
            <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 7px', borderRadius: 7, background: typeBg, color: typeColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {ch.type}
            </span>
          </div>
          <p style={{ fontSize: 11, color: '#999', margin: '0 0 8px', fontWeight: 500 }}>{ch.description}</p>

          {/* Progress */}
          {!ch.claimed && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#999', fontWeight: 500 }}>Progress</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: typeColor }}>{ch.progress}/{ch.target}</span>
              </div>
              <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: ch.completed ? '#22C55E' : `linear-gradient(90deg,${typeColor},${typeColor}cc)`, borderRadius: 3, transition: 'width 600ms ease' }} />
              </div>
            </div>
          )}

          {/* Rewards */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ZapIcon size={12} color="#D71920" />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#D71920' }}>+{ch.xpReward} XP</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <CoinIcon size={12} color="#D97706" />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#D97706' }}>+{ch.coinReward}</span>
            </div>
          </div>
        </div>

        {/* Claim / Status */}
        <div style={{ flexShrink: 0 }}>
          {ch.claimed ? (
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircleIcon size={16} color="#bbb" />
            </div>
          ) : ch.completed ? (
            <button onClick={onClaim} disabled={claiming} style={{
              padding: '7px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#22C55E,#16a34a)', color: '#fff',
              fontWeight: 900, fontSize: 12, opacity: claiming ? 0.7 : 1,
            }}>
              {claiming ? '…' : 'Claim'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
