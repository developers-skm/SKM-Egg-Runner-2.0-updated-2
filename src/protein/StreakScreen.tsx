import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { getStreakShields, addStreakShield, type StreakShield } from '../services/protein/retentionService';
import { getStreakInfo, getLast30Days, getDailyStats, todayKey, type StreakInfo } from '../services/protein/proteinTrackerService';
import { FlameIcon, ShieldIcon, CheckIcon, ZapIcon, TrophyIcon, CalendarIcon } from './Icons';

interface StreakScreenProps { user: User; refreshKey: number; }

const MILESTONES = [3, 7, 14, 30, 60, 100];
const MILESTONE_REWARDS: Record<number, { xp: number; coins: number; title: string }> = {
  3:   { xp: 75,   coins: 25,  title: '3-Day Warrior'     },
  7:   { xp: 200,  coins: 75,  title: 'Week Warrior'      },
  14:  { xp: 400,  coins: 150, title: 'Fortnight Strong'  },
  30:  { xp: 1000, coins: 350, title: 'Monthly Champion'  },
  60:  { xp: 2500, coins: 800, title: 'Iron Streak'       },
  100: { xp: 5000, coins: 1500,title: 'Legendary Streak'  },
};

export default function StreakScreen({ user, refreshKey }: StreakScreenProps) {
  const [streakInfo, setStreakInfo]  = useState<StreakInfo>({ currentStreak: 0, bestStreak: 0, lastActiveDate: '' });
  const [shields,    setShields]     = useState<StreakShield>({ uid: '', shields: 0, usedDates: [], updatedAt: null as any });
  const [heatmap,    setHeatmap]     = useState<{ dateKey: string; active: boolean; goalMet: boolean }[]>([]);
  const [loading,    setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [si, sh] = await Promise.all([
        getStreakInfo(user.uid),
        getStreakShields(user.uid),
      ]);
      setStreakInfo(si); setShields(sh);

      // Build 30-day heatmap
      const days = getLast30Days();
      const map: typeof heatmap = [];
      for (const d of days) {
        const stat = await getDailyStats(user.uid, d);
        map.push({ dateKey: d, active: !!(stat && stat.totalEggs > 0), goalMet: !!(stat?.goalMet) });
      }
      setHeatmap(map);
    } catch (e) { console.error('[Streak]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const nextMilestone = MILESTONES.find(m => m > streakInfo.currentStreak) ?? 100;
  const prevMilestone = [...MILESTONES].reverse().find(m => m <= streakInfo.currentStreak) ?? 0;
  const milestoneProgress = nextMilestone > prevMilestone
    ? Math.round(((streakInfo.currentStreak - prevMilestone) / (nextMilestone - prevMilestone)) * 100)
    : 100;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 20px', flexShrink: 0, boxShadow: '0 4px 20px rgba(215,25,32,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FlameIcon size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Streak Tracker</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>Build your daily habit</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Main streak card */}
        <div style={{ background: '#fff', borderRadius: 24, padding: 22, margin: '14px 16px 0', boxShadow: '0 4px 20px rgba(0,0,0,0.09)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {/* Flame circle */}
            <div style={{
              width: 88, height: 88, borderRadius: '50%', flexShrink: 0,
              background: streakInfo.currentStreak > 0
                ? 'linear-gradient(135deg,#D71920,#B31217)'
                : '#F0F0F0',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: streakInfo.currentStreak > 0 ? '0 8px 24px rgba(215,25,32,0.4)' : 'none',
            }}>
              <FlameIcon size={28} color={streakInfo.currentStreak > 0 ? '#fff' : '#ccc'} />
              <p style={{ fontSize: 22, fontWeight: 900, color: streakInfo.currentStreak > 0 ? '#fff' : '#ccc', margin: 0, lineHeight: 1, marginTop: 2 }}>
                {streakInfo.currentStreak}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px' }}>Current Streak</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#D71920', margin: 0, lineHeight: 1 }}>
                {streakInfo.currentStreak} {streakInfo.currentStreak === 1 ? 'day' : 'days'}
              </p>
              <p style={{ fontSize: 11, color: '#999', margin: '4px 0' }}>Best: {streakInfo.bestStreak} days</p>
              {streakInfo.currentStreak === 0 && (
                <p style={{ fontSize: 11, fontWeight: 700, color: '#D71920', margin: 0 }}>Scan an egg today to start!</p>
              )}
            </div>
          </div>

          {/* Progress to next milestone */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>Next milestone: {nextMilestone} days</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#D71920' }}>{streakInfo.currentStreak}/{nextMilestone}</span>
            </div>
            <div style={{ height: 10, background: '#F0F0F0', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${milestoneProgress}%`,
                background: 'linear-gradient(90deg,#D71920,#B31217)',
                borderRadius: 5, transition: 'width 800ms ease',
              }} />
            </div>
            <p style={{ fontSize: 10, color: '#bbb', margin: '4px 0 0', fontWeight: 500 }}>
              {nextMilestone - streakInfo.currentStreak} days to {MILESTONE_REWARDS[nextMilestone]?.title ?? 'next milestone'}
            </p>
          </div>
        </div>

        {/* Streak Shield card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', margin: '12px 16px 0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, flexShrink: 0,
              background: (shields.shields ?? 0) > 0 ? '#F5F3FF' : '#F0F0F0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldIcon size={24} color={(shields.shields ?? 0) > 0 ? '#8B5CF6' : '#ccc'} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Streak Shields</p>
              <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0', fontWeight: 500 }}>
                {(shields.shields ?? 0) > 0
                  ? `${shields.shields} shield${shields.shields > 1 ? 's' : ''} protecting your streak`
                  : 'Earn shields by completing Day 7, 14, 20, 26 login rewards'}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 26, fontWeight: 900, color: '#8B5CF6', margin: 0 }}>{shields.shields ?? 0}</p>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase', margin: 0 }}>shields</p>
            </div>
          </div>
          {(shields.usedDates ?? []).length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#F5F3FF', borderRadius: 12 }}>
              <p style={{ fontSize: 10, color: '#8B5CF6', fontWeight: 700, margin: 0 }}>
                Shields used on: {shields.usedDates.slice(-3).join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Milestones */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 14px' }}>Streak Milestones</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MILESTONES.map(m => {
              const reached  = streakInfo.bestStreak >= m;
              const current  = streakInfo.currentStreak >= m;
              const reward   = MILESTONE_REWARDS[m];
              return (
                <div key={m} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14,
                  background: current ? '#FCE8E8' : reached ? '#F0FDF4' : '#F8F8F8',
                  border: current ? '1.5px solid rgba(215,25,32,0.25)' : reached ? '1.5px solid rgba(34,197,94,0.2)' : '1.5px solid transparent',
                }}>
                  {/* Day badge */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: current ? '#D71920' : reached ? '#22C55E' : '#E0E0E0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {current || reached
                      ? <CheckIcon size={18} color="#fff" />
                      : <span style={{ fontSize: 11, fontWeight: 900, color: '#999' }}>{m}d</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: current ? '#D71920' : reached ? '#22C55E' : '#999', margin: 0 }}>
                      {m}-Day Streak — {reward?.title}
                    </p>
                    <p style={{ fontSize: 10, color: '#bbb', margin: '2px 0 0' }}>+{reward?.xp} XP · +{reward?.coins} coins</p>
                  </div>
                  {current && (
                    <span style={{ fontSize: 10, fontWeight: 900, background: '#D71920', color: '#fff', padding: '3px 8px', borderRadius: 8 }}>Active</span>
                  )}
                  {!current && reached && (
                    <span style={{ fontSize: 10, fontWeight: 900, background: '#22C55E', color: '#fff', padding: '3px 8px', borderRadius: 8 }}>Done</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 30-day activity heatmap */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>30-Day Activity</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ bg: 'linear-gradient(135deg,#D71920,#B31217)', label: 'Goal met' }, { bg: 'rgba(215,25,32,0.3)', label: 'Active' }, { bg: '#F0F0F0', label: 'Missed' }].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: l.bg }} />
                  <span style={{ fontSize: 8, color: '#bbb', fontWeight: 600 }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
            {heatmap.map((day, i) => (
              <div
                key={day.dateKey}
                title={`${day.dateKey}: ${day.goalMet ? 'Goal met' : day.active ? 'Active' : 'Missed'}`}
                style={{
                  height: 22, borderRadius: 5,
                  background: day.goalMet
                    ? 'linear-gradient(135deg,#D71920,#B31217)'
                    : day.active ? 'rgba(215,25,32,0.3)' : '#F0F0F0',
                  border: day.dateKey === todayKey() ? '1.5px solid #D71920' : 'none',
                  transition: 'all 200ms ease',
                }}
              />
            ))}
          </div>
        </div>

      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
