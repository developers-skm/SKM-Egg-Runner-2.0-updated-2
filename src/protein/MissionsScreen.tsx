import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  getDailyMissions, getWeeklyMissions, claimDailyMission, claimWeeklyMission,
  type DailyMission, type WeeklyMission,
} from '../services/protein/retentionService';
import { TargetIcon, ZapIcon, CoinIcon, CheckCircleIcon, CalendarIcon, FlameIcon, EggIcon, ListIcon } from './Icons';

interface MissionsScreenProps { user: User; refreshKey: number; onClaimed: () => void; }

type MissionTab = 'daily' | 'weekly';

export default function MissionsScreen({ user, refreshKey, onClaimed }: MissionsScreenProps) {
  const [dailyMissions,  setDailyMissions]  = useState<DailyMission[]>([]);
  const [weeklyMissions, setWeeklyMissions] = useState<WeeklyMission[]>([]);
  const [tab,            setTab]            = useState<MissionTab>('daily');
  const [claiming,       setClaiming]       = useState<string | null>(null);
  const [toast,          setToast]          = useState<{ xp: number; coins: number } | null>(null);
  const [loading,        setLoading]        = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dm, wm] = await Promise.all([
        getDailyMissions(user.uid),
        getWeeklyMissions(user.uid),
      ]);
      setDailyMissions(dm);
      setWeeklyMissions(wm);
    } catch (e) { console.error('[Missions]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleClaimDaily = async (mission: DailyMission) => {
    if (!mission.completed || mission.claimed || claiming) return;
    setClaiming(mission.id);
    try {
      const { xp, coins } = await claimDailyMission(user.uid, mission.id);
      setToast({ xp, coins });
      await load(); onClaimed();
    } catch { /* ignore */ }
    finally { setClaiming(null); }
  };

  const handleClaimWeekly = async (mission: WeeklyMission) => {
    if (!mission.completed || mission.claimed || claiming) return;
    setClaiming(mission.id);
    try {
      const { xp, coins } = await claimWeeklyMission(user.uid, mission.id);
      setToast({ xp, coins });
      await load(); onClaimed();
    } catch { /* ignore */ }
    finally { setClaiming(null); }
  };

  const dailyCompleted  = dailyMissions.filter(m => m.completed && !m.claimed).length;
  const weeklyCompleted = weeklyMissions.filter(m => m.completed && !m.claimed).length;
  const totalClaimable  = dailyCompleted + weeklyCompleted;

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
          animation: 'slideIn 300ms ease',
        }}>
          <CheckCircleIcon size={28} color="#fff" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: 0 }}>Mission Complete!</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: 0, marginTop: 2 }}>
              +{toast.xp} XP · +{toast.coins} coins added to wallet
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 20px', flexShrink: 0, boxShadow: '0 4px 20px rgba(215,25,32,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ListIcon size={22} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Missions</h2>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>Complete for XP and coins</p>
            </div>
          </div>
          {totalClaimable > 0 && (
            <div style={{ background: '#22C55E', borderRadius: 20, padding: '5px 12px' }}>
              <p style={{ fontSize: 12, fontWeight: 900, color: '#fff', margin: 0 }}>{totalClaimable} ready</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 0, background: '#F0F0F0', borderRadius: 16, padding: 4, margin: '14px 16px 0' }}>
          {(['daily','weekly'] as MissionTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 0', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, textTransform: 'capitalize',
              background: tab === t ? '#D71920' : 'transparent',
              color:      tab === t ? '#fff'    : '#999',
              transition: 'all 150ms ease',
              position: 'relative',
            }}>
              {t === 'daily' ? 'Daily Missions' : 'Weekly Missions'}
              {t === 'daily' && dailyCompleted > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 8, width: 16, height: 16, borderRadius: '50%', background: '#22C55E', fontSize: 9, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {dailyCompleted}
                </span>
              )}
              {t === 'weekly' && weeklyCompleted > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 8, width: 16, height: 16, borderRadius: '50%', background: '#22C55E', fontSize: 9, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {weeklyCompleted}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Mission info banner */}
        <div style={{ margin: '10px 16px 0', background: tab === 'daily' ? '#FCE8E8' : '#F5F3FF', borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {tab === 'daily'
            ? <CalendarIcon size={16} color="#D71920" />
            : <TargetIcon size={16} color="#8B5CF6" />}
          <p style={{ fontSize: 11, fontWeight: 600, color: tab === 'daily' ? '#D71920' : '#8B5CF6', margin: 0 }}>
            {tab === 'daily'
              ? '3 new missions every day. Reset at midnight.'
              : 'Weekly missions reset every Monday. Earn bigger rewards.'}
          </p>
        </div>

        {/* Mission cards */}
        <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tab === 'daily' ? (
            dailyMissions.map(m => (
              <MissionCard
                key={m.id}
                title={m.title}
                description={m.description}
                type={m.type}
                progress={m.progress}
                target={m.target}
                completed={m.completed}
                claimed={m.claimed}
                xpReward={m.xpReward}
                coinReward={m.coinReward}
                claiming={claiming === m.id}
                onClaim={() => handleClaimDaily(m)}
                period="daily"
              />
            ))
          ) : (
            weeklyMissions.map(m => (
              <MissionCard
                key={m.id}
                title={m.title}
                description={m.description}
                type={m.type as string}
                progress={m.progress}
                target={m.target}
                completed={m.completed}
                claimed={m.claimed}
                xpReward={m.xpReward}
                coinReward={m.coinReward}
                claiming={claiming === m.id}
                onClaim={() => handleClaimWeekly(m)}
                period="weekly"
              />
            ))
          )}
        </div>

        {/* Tips */}
        <div style={{ margin: '14px 16px 0', background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>How to Earn</p>
          {[
            { icon: <EggIcon size={15} color="#D71920" />,        text: 'Scan a QR code to progress scan missions.' },
            { icon: <TargetIcon size={15} color="#D71920" />,     text: 'Log food manually to progress protein missions.' },
            { icon: <FlameIcon size={15} color="#D71920" />,      text: 'Log eggs daily to maintain your streak mission.' },
            { icon: <CheckCircleIcon size={15} color="#22C55E" />, text: 'Tap Claim to collect your XP and coins.' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < 3 ? 10 : 0 }}>
              {r.icon}
              <p style={{ fontSize: 12, color: '#666', margin: 0 }}>{r.text}</p>
            </div>
          ))}
        </div>

      </div>

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideIn{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Mission Card
// ─────────────────────────────────────────────────────────────

function MissionCard({
  title, description, type, progress, target, completed, claimed,
  xpReward, coinReward, claiming, onClaim, period,
}: {
  title: string; description: string; type: string; progress: number; target: number;
  completed: boolean; claimed: boolean; xpReward: number; coinReward: number;
  claiming: boolean; onClaim: () => void; period: 'daily' | 'weekly';
}) {
  const pct     = Math.min(100, Math.round((progress / target) * 100));
  const color   = period === 'daily' ? '#D71920' : '#8B5CF6';
  const lightBg = period === 'daily' ? '#FCE8E8' : '#F5F3FF';

  return (
    <div style={{
      background: '#fff', borderRadius: 18, padding: '16px 16px',
      boxShadow: completed && !claimed ? '0 4px 16px rgba(34,197,94,0.2)' : '0 2px 8px rgba(0,0,0,0.05)',
      border: completed && !claimed ? '2px solid rgba(34,197,94,0.4)' : claimed ? '2px solid #F0F0F0' : '2px solid transparent',
      opacity: claimed ? 0.55 : 1,
      transition: 'all 200ms ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Icon */}
        <div style={{ width: 44, height: 44, borderRadius: 14, background: completed ? '#F0FDF4' : lightBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {completed
            ? <CheckCircleIcon size={22} color="#22C55E" />
            : getMissionIcon(type, 22, color)}
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: 0, marginBottom: 2 }}>{title}</p>
          <p style={{ fontSize: 11, color: '#999', margin: '0 0 8px', fontWeight: 500 }}>{description}</p>

          {/* Progress */}
          {!claimed && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#bbb', fontWeight: 600 }}>{progress}/{target}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: completed ? '#22C55E' : color }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: completed ? '#22C55E' : `linear-gradient(90deg,${color},${color}cc)`,
                  borderRadius: 3, transition: 'width 500ms ease',
                }} />
              </div>
            </div>
          )}

          {/* Rewards */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ZapIcon size={12} color="#D71920" />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#D71920' }}>+{xpReward} XP</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <CoinIcon size={12} color="#D97706" />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#D97706' }}>+{coinReward}</span>
            </div>
          </div>
        </div>

        {/* Claim button */}
        <div style={{ flexShrink: 0 }}>
          {claimed ? (
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircleIcon size={16} color="#22C55E" />
            </div>
          ) : completed ? (
            <button onClick={onClaim} disabled={claiming} style={{
              padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
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

function getMissionIcon(type: string, size: number, color: string) {
  switch (type) {
    case 'scan_egg':
    case 'scan_eggs':      return <EggIcon size={size} color={color} />;
    case 'reach_protein':
    case 'total_protein':  return <TargetIcon size={size} color={color} />;
    case 'maintain_streak':
    case 'streak_days':    return <FlameIcon size={size} color={color} />;
    case 'goal_days':      return <CheckCircleIcon size={size} color={color} />;
    case 'log_food':       return <ListIcon size={size} color={color} />;
    default:               return <TargetIcon size={size} color={color} />;
  }
}
