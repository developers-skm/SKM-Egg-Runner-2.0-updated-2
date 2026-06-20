import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase/firebase';
import { checkAndUnlockGameRewards, getGameRewards, GAME_REWARDS_CATALOG, type GameReward } from '../services/protein/retentionService';
import { GamepadIcon, TrophyIcon, ZapIcon, LockIcon, CheckCircleIcon, EggIcon, FlameIcon } from './Icons';

interface GameRewardsScreenProps { user: User; refreshKey: number; }

export default function GameRewardsScreen({ user, refreshKey }: GameRewardsScreenProps) {
  const [rewards,      setRewards]      = useState<GameReward[]>([]);
  const [userStats,    setUserStats]    = useState<Record<string, number>>({});
  const [newUnlocked,  setNewUnlocked]  = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const unlocked = await checkAndUnlockGameRewards(user.uid);
      if (unlocked.length > 0) setNewUnlocked(unlocked);
      const [rw, snap] = await Promise.all([
        getGameRewards(user.uid),
        getDoc(doc(db, 'users', user.uid)),
      ]);
      setRewards(rw);
      if (snap.exists()) {
        const d = snap.data();
        setUserStats({
          lifetimeConsumption:      d.lifetimeConsumption      ?? 0,
          currentConsumptionStreak: d.currentConsumptionStreak ?? 0,
          bestConsumptionStreak:    d.bestConsumptionStreak    ?? 0,
        });
      }
    } catch (e) { console.error('[GameRewards]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    if (!newUnlocked.length) return;
    const t = setTimeout(() => setNewUnlocked([]), 5000);
    return () => clearTimeout(t);
  }, [newUnlocked]);

  const unlockedCount = rewards.filter(r => r.unlocked).length;

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Unlock toast */}
      {newUnlocked.length > 0 && (
        <div style={{
          position: 'fixed', top: 16, left: 16, right: 16, zIndex: 60,
          background: 'linear-gradient(135deg,#D71920,#B31217)', borderRadius: 18, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 28px rgba(215,25,32,0.5)',
          animation: 'slideIn 300ms ease',
        }}>
          <GamepadIcon size={28} color="#fff" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: 0 }}>Game Reward Unlocked!</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: 0, marginTop: 2 }}>
              {newUnlocked.length} new game content unlocked
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 20px', flexShrink: 0, boxShadow: '0 4px 20px rgba(215,25,32,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GamepadIcon size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Game Rewards</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>
              {unlockedCount}/{rewards.length} unlocked — protein progress earns game content
            </p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Current stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '14px 16px 0' }}>
          {[
            { icon: <EggIcon size={16} color="#D71920" />,   label: 'Eggs Scanned',  value: userStats.lifetimeConsumption ?? 0 },
            { icon: <FlameIcon size={16} color="#D71920" />, label: 'Current Streak', value: userStats.currentConsumptionStreak ?? 0 },
            { icon: <TrophyIcon size={16} color="#D71920" />,label: 'Best Streak',    value: userStats.bestConsumptionStreak ?? 0 },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 16, padding: '12px 10px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{s.icon}</div>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#D71920', margin: 0, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 8, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.3, margin: '3px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div style={{ margin: '12px 16px 0', background: '#FCE8E8', borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <GamepadIcon size={18} color="#D71920" />
          <p style={{ fontSize: 12, color: '#D71920', margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
            Scan SKM Egg QR codes and build streaks in the Protein Tracker to unlock exclusive skins, characters, and rewards in the SKM Egg Runner game.
          </p>
        </div>

        {/* Rewards list */}
        <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rewards.map(r => {
            const val = userStats[r.field] ?? 0;
            const progress = Math.min(r.threshold, val);
            const pct = Math.min(100, Math.round((progress / r.threshold) * 100));
            const isNew = newUnlocked.includes(r.id);

            return (
              <div key={r.id} style={{
                background: '#fff', borderRadius: 18, padding: '16px 16px',
                boxShadow: isNew ? '0 6px 20px rgba(215,25,32,0.3)' : r.unlocked ? '0 4px 14px rgba(34,197,94,0.15)' : '0 2px 8px rgba(0,0,0,0.05)',
                border: isNew ? '2px solid rgba(215,25,32,0.4)' : r.unlocked ? '2px solid rgba(34,197,94,0.35)' : '2px solid transparent',
                opacity: r.unlocked ? 1 : 0.8,
                transition: 'all 200ms ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {/* Type icon */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                    background: r.unlocked
                      ? 'linear-gradient(135deg,#D71920,#B31217)'
                      : r.type === 'legendary' ? '#F5F3FF' : r.type === 'character' ? '#FEF3C7' : '#FCE8E8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: r.unlocked ? '0 4px 12px rgba(215,25,32,0.35)' : 'none',
                  }}>
                    {r.unlocked
                      ? <CheckCircleIcon size={26} color="#fff" />
                      : r.type === 'legendary' ? <TrophyIcon size={26} color="#8B5CF6" />
                      : r.type === 'character' ? <ZapIcon size={26} color="#D97706" />
                      : <GamepadIcon size={26} color="#D71920" />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>{r.title}</p>
                      {isNew && <span style={{ fontSize: 9, fontWeight: 900, background: '#FCE8E8', color: '#D71920', padding: '2px 6px', borderRadius: 6 }}>NEW</span>}
                      {r.unlocked && !isNew && <span style={{ fontSize: 9, fontWeight: 900, background: '#F0FDF4', color: '#22C55E', padding: '2px 6px', borderRadius: 6 }}>Unlocked</span>}
                    </div>
                    <p style={{ fontSize: 11, color: '#bbb', margin: '0 0 8px', fontWeight: 500 }}>{r.description}</p>

                    {/* Requirement badge */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: r.unlocked ? '#F0FDF4' : '#F8F8F8', padding: '4px 10px', borderRadius: 10 }}>
                      {r.field === 'lifetimeConsumption' ? <EggIcon size={11} color={r.unlocked ? '#22C55E' : '#999'} /> : <FlameIcon size={11} color={r.unlocked ? '#22C55E' : '#999'} />}
                      <span style={{ fontSize: 10, fontWeight: 700, color: r.unlocked ? '#22C55E' : '#999' }}>{r.requirement}</span>
                    </div>

                    {/* Progress bar */}
                    {!r.unlocked && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: '#bbb', fontWeight: 600 }}>{progress}/{r.threshold}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#D71920' }}>{pct}%</span>
                        </div>
                        <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#D71920,#B31217)', borderRadius: 3, transition: 'width 600ms ease' }} />
                        </div>
                      </div>
                    )}

                    {r.unlocked && r.unlockedAt && (
                      <p style={{ fontSize: 10, color: '#22C55E', margin: '6px 0 0', fontWeight: 600 }}>
                        Unlocked — active in SKM Egg Runner
                      </p>
                    )}
                  </div>

                  {/* Lock/unlock icon */}
                  <div style={{ flexShrink: 0 }}>
                    {r.unlocked ? null : <LockIcon size={18} color="#ddd" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Connection info */}
        <div style={{ margin: '12px 16px 0', background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Protein → Game Connection</p>
          {[
            'Scan 10 eggs → Bronze Egg Skin in the game',
            '7-day streak → Rare Character unlock',
            '30-day streak → Special Runner unlock',
            '100 eggs total → Legendary game reward',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: i < 3 ? 10 : 0 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D71920', marginTop: 4, flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: '#666', margin: 0, lineHeight: 1.5 }}>{t}</p>
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
