import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  getLoginStreak, claimLoginReward, hasClaimedTodayLogin,
  getLoginRewardSchedule, type LoginStreak,
} from '../services/protein/retentionService';
import { GiftIcon, CheckIcon, LockIcon, ZapIcon, CoinIcon, ShieldIcon, StarIcon } from './Icons';

interface DailyLoginScreenProps {
  user: User;
  refreshKey: number;
}

export default function DailyLoginScreen({ user, refreshKey }: DailyLoginScreenProps) {
  const [loginStreak, setLoginStreak] = useState<LoginStreak | null>(null);
  const [hasClaimed,  setHasClaimed]  = useState(false);
  const [claiming,    setClaiming]    = useState(false);
  const [claimed,     setClaimed]     = useState(false);
  const [reward,      setReward]      = useState<{ xp: number; coins: number; shield: boolean } | null>(null);
  const [loading,     setLoading]     = useState(true);

  const schedule = getLoginRewardSchedule();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ls, claimed] = await Promise.all([
        getLoginStreak(user.uid),
        hasClaimedTodayLogin(user.uid),
      ]);
      setLoginStreak(ls);
      setHasClaimed(claimed);
    } catch (e) { console.error('[DailyLogin]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleClaim = async () => {
    if (hasClaimed || claiming) return;
    setClaiming(true);
    try {
      const r = await claimLoginReward(user.uid);
      setReward(r);
      setClaimed(true);
      setHasClaimed(true);
      await load();
    } catch (e) { console.error('[DailyLogin] claim error', e); }
    finally { setClaiming(false); }
  };

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const currentDay = loginStreak?.currentLoginDay ?? 1;
  const totalDays  = loginStreak?.totalLoginDays  ?? 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#D71920,#B31217)',
        padding: '20px 20px 20px', flexShrink: 0,
        boxShadow: '0 4px 20px rgba(215,25,32,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GiftIcon size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Daily Login Reward</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>
              Day {currentDay} of 30 · {totalDays} total logins
            </p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Claim success toast */}
        {claimed && reward && (
          <div style={{
            margin: '14px 16px 0', background: 'linear-gradient(135deg,#22C55E,#16a34a)',
            borderRadius: 18, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 6px 20px rgba(34,197,94,0.35)',
            animation: 'slideIn 300ms ease',
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckIcon size={22} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', margin: 0 }}>Reward Claimed!</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: 0, marginTop: 3 }}>
                {reward.coins > 0 && `+${reward.coins} coins`}
                {reward.coins > 0 && reward.xp > 0 && ' · '}
                {reward.xp > 0 && `+${reward.xp} XP`}
                {reward.shield && ' · Streak Shield added'}
              </p>
            </div>
          </div>
        )}

        {/* Current day card */}
        <div style={{ margin: '14px 16px 0', background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.09)' }}>
          {/* Red top accent */}
          <div style={{ height: 4, background: 'linear-gradient(90deg,#D71920,#B31217)' }} />
          <div style={{ padding: '20px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>Today's Reward</p>

            {/* Reward icon */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
              background: hasClaimed ? '#F0FDF4' : 'linear-gradient(135deg,#D71920,#B31217)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: hasClaimed ? '0 4px 12px rgba(34,197,94,0.3)' : '0 8px 24px rgba(215,25,32,0.4)',
            }}>
              {hasClaimed
                ? <CheckIcon size={36} color="#22C55E" />
                : <RewardIcon type={schedule[currentDay - 1]?.type} size={36} color="#fff" />}
            </div>

            <h3 style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px' }}>
              {schedule[currentDay - 1]?.label ?? `Day ${currentDay}`}
            </h3>
            <p style={{ fontSize: 14, color: '#666', margin: '0 0 6px', fontWeight: 500 }}>
              {schedule[currentDay - 1]?.description ?? ''}
            </p>

            {/* Reward chips */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              {(schedule[currentDay - 1]?.coins ?? 0) > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FEF3C7', padding: '7px 14px', borderRadius: 20 }}>
                  <CoinIcon size={14} color="#D97706" />
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#D97706' }}>+{schedule[currentDay - 1]?.coins} Coins</span>
                </div>
              )}
              {(schedule[currentDay - 1]?.xp ?? 0) > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#FCE8E8', padding: '7px 14px', borderRadius: 20 }}>
                  <ZapIcon size={14} color="#D71920" />
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#D71920' }}>+{schedule[currentDay - 1]?.xp} XP</span>
                </div>
              )}
              {schedule[currentDay - 1]?.type === 'shield' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F5F3FF', padding: '7px 14px', borderRadius: 20 }}>
                  <ShieldIcon size={14} color="#8B5CF6" />
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#8B5CF6' }}>Streak Shield</span>
                </div>
              )}
            </div>

            {hasClaimed ? (
              <div style={{ padding: '13px 0', borderRadius: 16, background: '#F0FDF4', border: '1.5px solid rgba(34,197,94,0.3)' }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#22C55E', margin: 0 }}>Claimed — Come back tomorrow</p>
              </div>
            ) : (
              <button onClick={handleClaim} disabled={claiming} style={{
                width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff',
                fontWeight: 900, fontSize: 15, letterSpacing: 1, textTransform: 'uppercase',
                boxShadow: '0 6px 20px rgba(215,25,32,0.4)', opacity: claiming ? 0.7 : 1,
              }}>
                {claiming ? 'Claiming…' : 'Claim Daily Reward'}
              </button>
            )}

            <p style={{ fontSize: 10, color: '#bbb', margin: '10px 0 0', fontWeight: 500 }}>
              Missing a day resets your reward cycle back to Day 1.
            </p>
          </div>
        </div>

        {/* 30-day calendar grid */}
        <div style={{ margin: '14px 16px 0', background: '#fff', borderRadius: 24, padding: '18px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 14px' }}>30-Day Reward Calendar</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {schedule.map((r, i) => {
              const dayNum   = i + 1;
              const isPast   = dayNum < currentDay;
              const isToday  = dayNum === currentDay;
              const isFuture = dayNum > currentDay;
              const isSpecial = r.type === 'shield' || r.type === 'premium';

              return (
                <div key={dayNum} style={{
                  borderRadius: 14, padding: '8px 4px', textAlign: 'center',
                  background: isToday
                    ? (hasClaimed ? 'linear-gradient(135deg,#22C55E,#16a34a)' : 'linear-gradient(135deg,#D71920,#B31217)')
                    : isPast ? '#F0FDF4'
                    : isSpecial ? '#F5F3FF' : '#F8F8F8',
                  border: isToday ? 'none' : isSpecial ? '1.5px solid rgba(139,92,246,0.3)' : '1.5px solid transparent',
                  transform: isToday ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: isToday ? '0 4px 14px rgba(215,25,32,0.4)' : 'none',
                  transition: 'all 200ms ease',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>
                    {isPast
                      ? <CheckIcon size={12} color="#22C55E" />
                      : isFuture
                        ? <RewardIcon type={r.type} size={12} color={isSpecial ? '#8B5CF6' : '#D71920'} />
                        : hasClaimed
                          ? <CheckIcon size={12} color="#fff" />
                          : <RewardIcon type={r.type} size={12} color="#fff" />}
                  </div>
                  <p style={{ fontSize: 9, fontWeight: 900, margin: 0, color: isToday ? '#fff' : isPast ? '#22C55E' : isSpecial ? '#8B5CF6' : '#999' }}>
                    D{dayNum}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
            {[
              { color: '#22C55E', label: 'Claimed' },
              { color: '#D71920', label: 'Today'   },
              { color: '#8B5CF6', label: 'Special' },
              { color: '#E0E0E0', label: 'Locked'  },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                <span style={{ fontSize: 10, color: '#999', fontWeight: 600 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ margin: '14px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Login Day',    value: `${currentDay}/30`, color: '#D71920' },
            { label: 'Total Logins', value: `${totalDays}`,     color: '#8B5CF6' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: '4px 0 0' }}>{s.label}</p>
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

function RewardIcon({ type, size, color }: { type?: string; size: number; color: string }) {
  if (type === 'shield')  return <ShieldIcon size={size} color={color} />;
  if (type === 'premium') return <StarIcon size={size} color={color} />;
  if (type === 'xp')      return <ZapIcon size={size} color={color} />;
  return <CoinIcon size={size} color={color} />;
}
