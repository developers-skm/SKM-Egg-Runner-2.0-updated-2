import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase/firebase';
import {
  getTrackerAchievements, updateTrackerAchievements, getRewardWallet, calcLevel,
  type TrackerAchievement, type RewardWallet,
} from '../services/protein/proteinTrackerService';
import { TrophyIcon, LockIcon, UnlockIcon, ZapIcon, CoinIcon, AwardIcon, CheckCircleIcon } from './Icons';

type FilterTab = 'all' | 'unlocked' | 'locked';

interface AchievementsScreenProps { user: User; refreshKey: number; }

export default function AchievementsScreen({ user, refreshKey }: AchievementsScreenProps) {
  const [achievements, setAchievements] = useState<TrackerAchievement[]>([]);
  const [wallet,       setWallet]       = useState<RewardWallet | null>(null);
  const [tab,          setTab]          = useState<FilterTab>('all');
  const [newUnlocked,  setNewUnlocked]  = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [snap, wl] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getRewardWallet(user.uid),
      ]);
      const ud = snap.exists() ? snap.data() : {};
      const unlocked = await updateTrackerAchievements(user.uid, ud);
      if (unlocked.length > 0) setNewUnlocked(unlocked);
      const achs = await getTrackerAchievements(user.uid);
      setAchievements(achs);
      setWallet(wl);
    } catch (e) { console.error('[Achievements]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    if (!newUnlocked.length) return;
    const t = setTimeout(() => setNewUnlocked([]), 4000);
    return () => clearTimeout(t);
  }, [newUnlocked]);

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const levelInfo     = calcLevel(wallet?.totalXP ?? 0);
  const xpProgress    = levelInfo.nextLevelXP - levelInfo.currentLevelXP;
  const xpCurrent     = (wallet?.totalXP ?? 0) - levelInfo.currentLevelXP;
  const levelPct      = xpProgress > 0 ? Math.min(100, Math.round((xpCurrent / xpProgress) * 100)) : 100;

  const filtered = achievements.filter(a =>
    tab === 'all' ? true : tab === 'unlocked' ? a.unlocked : !a.unlocked
  );

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* New unlock banner */}
      {newUnlocked.length > 0 && (
        <div style={{
          position: 'fixed', top: 16, left: 16, right: 16, zIndex: 60,
          background: 'linear-gradient(135deg,#D71920,#B31217)',
          borderRadius: 18, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 28px rgba(215,25,32,0.5)',
          animation: 'slideDown 300ms ease',
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrophyIcon size={20} color="#fff" />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: 0 }}>Achievement Unlocked!</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: 0, marginTop: 2 }}>
              {newUnlocked.length} new badge{newUnlocked.length > 1 ? 's' : ''} earned
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 20px', flexShrink: 0, boxShadow: '0 4px 20px rgba(215,25,32,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrophyIcon size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Achievements</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>{unlockedCount} of {achievements.length} unlocked</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Level Card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '14px 16px 0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18, flexShrink: 0,
              background: 'linear-gradient(135deg,#D71920,#B31217)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1 }}>{levelInfo.level}</p>
              <p style={{ fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.75)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>Level</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>{levelInfo.title}</p>
              <p style={{ fontSize: 11, color: '#999', margin: '2px 0 8px', fontWeight: 500 }}>{(wallet?.totalXP ?? 0).toLocaleString()} XP total</p>
              <div style={{ height: 7, background: '#F0F0F0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${levelPct}%`, background: 'linear-gradient(90deg,#D71920,#B31217)', borderRadius: 4, transition: 'width 600ms ease' }} />
              </div>
              <p style={{ fontSize: 10, color: '#bbb', margin: '4px 0 0', fontWeight: 600 }}>
                {xpCurrent} / {xpProgress} XP to Level {levelInfo.level + 1}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1, background: '#FCE8E8', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ZapIcon size={16} color="#D71920" />
              <div>
                <p style={{ fontSize: 14, fontWeight: 900, color: '#D71920', margin: 0 }}>{(wallet?.totalXP ?? 0).toLocaleString()}</p>
                <p style={{ fontSize: 9, color: '#A50F15', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>Total XP</p>
              </div>
            </div>
            <div style={{ flex: 1, background: '#FEF3C7', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CoinIcon size={16} color="#D97706" />
              <div>
                <p style={{ fontSize: 14, fontWeight: 900, color: '#D97706', margin: 0 }}>{(wallet?.coins ?? 0).toLocaleString()}</p>
                <p style={{ fontSize: 9, color: '#B45309', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>Coins</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 0, background: '#F0F0F0', borderRadius: 16, padding: 4, margin: '12px 16px 0' }}>
          {(['all','unlocked','locked'] as FilterTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '9px 0', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, textTransform: 'capitalize',
              background: tab === t ? '#D71920' : 'transparent',
              color:      tab === t ? '#fff'    : '#999',
              transition: 'all 150ms ease',
            }}>
              {t} {t === 'unlocked' ? `(${unlockedCount})` : t === 'locked' ? `(${achievements.length - unlockedCount})` : ''}
            </button>
          ))}
        </div>

        {/* Achievement cards */}
        <div style={{ padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 20, padding: 28, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <TrophyIcon size={40} color="#E0E0E0" />
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A', margin: '12px 0 4px' }}>No achievements here yet</p>
              <p style={{ fontSize: 12, color: '#999', margin: 0 }}>Log eggs and maintain your streak to unlock badges.</p>
            </div>
          ) : filtered.map(ach => (
            <AchievementCard key={ach.id} ach={ach} isNew={newUnlocked.includes(ach.id)} />
          ))}
        </div>

      </div>
      <style>{`@keyframes slideDown{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}

function AchievementCard({ ach, isNew }: { ach: TrackerAchievement; isNew: boolean }) {
  const pct = Math.min(100, Math.round((ach.progress / ach.target) * 100));
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: isNew ? '0 4px 16px rgba(215,25,32,0.25)' : '0 2px 8px rgba(0,0,0,0.05)',
      border: isNew ? '2px solid rgba(215,25,32,0.4)' : '2px solid transparent',
      opacity: ach.unlocked ? 1 : 0.7,
      transition: 'all 300ms ease',
    }}>
      {/* Icon */}
      <div style={{
        width: 48, height: 48, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: ach.unlocked ? 'linear-gradient(135deg,#D71920,#B31217)' : '#F0F0F0',
        boxShadow: ach.unlocked ? '0 4px 10px rgba(215,25,32,0.35)' : 'none',
      }}>
        {ach.unlocked
          ? <CheckCircleIcon size={24} color="#fff" />
          : <LockIcon size={22} color="#ccc" />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: ach.unlocked ? '#1A1A1A' : '#999', margin: 0 }}>{ach.title}</p>
          {ach.unlocked && <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircleIcon size={10} color="#fff" /></div>}
          {isNew && <span style={{ fontSize: 9, fontWeight: 900, background: '#FCE8E8', color: '#D71920', padding: '2px 6px', borderRadius: 6 }}>NEW</span>}
        </div>
        <p style={{ fontSize: 11, color: '#bbb', margin: '0 0 6px', fontWeight: 500 }}>{ach.description}</p>

        {!ach.unlocked && (
          <>
            <div style={{ height: 5, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#D71920,#B31217)', borderRadius: 3, transition: 'width 600ms ease' }} />
            </div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#D71920', margin: '3px 0 0' }}>{ach.progress} / {ach.target}</p>
          </>
        )}

        {ach.unlocked && ach.unlockedAt && (
          <p style={{ fontSize: 10, color: '#bbb', margin: 0 }}>
            Earned {new Date((ach.unlockedAt as any).seconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Rewards */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#D71920', margin: 0 }}>+{ach.xpReward} XP</p>
        <p style={{ fontSize: 10, fontWeight: 600, color: '#D97706', margin: 0, marginTop: 2 }}>+{ach.coinReward} coins</p>
      </div>
    </div>
  );
}
