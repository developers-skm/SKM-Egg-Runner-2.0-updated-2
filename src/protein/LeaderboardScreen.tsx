import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { getLeaderboard, updateLeaderboard, type LeaderboardEntry } from '../services/protein/proteinTrackerService';
import { UsersIcon, TrophyIcon, EggIcon, FlameIcon, ZapIcon, CrownIcon } from './Icons';

type RankBy = 'totalEggs' | 'totalProtein' | 'currentStreak' | 'xp';

interface LeaderboardScreenProps { user: User; refreshKey: number; }

const RANK_OPTIONS: { key: RankBy; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'totalEggs',     label: 'Eggs',    icon: <EggIcon size={14} color="#D71920" />,    color: '#D71920' },
  { key: 'totalProtein',  label: 'Protein', icon: <ZapIcon size={14} color="#8B5CF6" />,    color: '#8B5CF6' },
  { key: 'currentStreak', label: 'Streak',  icon: <FlameIcon size={14} color="#F59E0B" />,  color: '#F59E0B' },
  { key: 'xp',            label: 'XP',      icon: <TrophyIcon size={14} color="#22C55E" />, color: '#22C55E' },
];

export default function LeaderboardScreen({ user, refreshKey }: LeaderboardScreenProps) {
  const [entries,  setEntries]  = useState<LeaderboardEntry[]>([]);
  const [rankBy,   setRankBy]   = useState<RankBy>('totalEggs');
  const [loading,  setLoading]  = useState(true);
  const [myRank,   setMyRank]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Update own entry
      await updateLeaderboard(user.uid, user.displayName ?? 'Player', user.photoURL ?? '');
      const list = await getLeaderboard(rankBy);
      setEntries(list);
      const idx = list.findIndex(e => e.uid === user.uid);
      setMyRank(idx >= 0 ? idx + 1 : null);
    } catch (e) { console.error('[Leaderboard]', e); }
    finally { setLoading(false); }
  }, [user.uid, user.displayName, user.photoURL, rankBy]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const activeRank = RANK_OPTIONS.find(r => r.key === rankBy)!;

  const getValueForRank = (e: LeaderboardEntry): string => {
    switch (rankBy) {
      case 'totalEggs':    return `${e.totalEggs} eggs`;
      case 'totalProtein': return `${e.totalProtein}g`;
      case 'currentStreak':return `${e.currentStreak} days`;
      case 'xp':           return `${e.xp.toLocaleString()} XP`;
    }
  };

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 20px', flexShrink: 0, boxShadow: '0 4px 20px rgba(215,25,32,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CrownIcon size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Leaderboard</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>
              {myRank ? `Your rank: #${myRank}` : 'Log eggs to appear on the board'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Rank-by selector */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 16px 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {RANK_OPTIONS.map(r => (
            <button key={r.key} onClick={() => setRankBy(r.key)} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
              background: rankBy === r.key ? r.color : '#fff',
              color:      rankBy === r.key ? '#fff' : '#666',
              boxShadow:  rankBy === r.key ? `0 4px 12px ${r.color}55` : '0 2px 6px rgba(0,0,0,0.06)',
              transition: 'all 150ms ease',
            }}>
              {r.icon} {r.label}
            </button>
          ))}
        </div>

        {/* Top 3 podium */}
        {entries.length >= 3 && (
          <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'flex-end', gap: 10, justifyContent: 'center' }}>
            {/* 2nd */}
            <PodiumCard entry={entries[1]} rank={2} rankColor="#A0AEC0" height={90} value={getValueForRank(entries[1])} isMe={entries[1].uid === user.uid} />
            {/* 1st */}
            <PodiumCard entry={entries[0]} rank={1} rankColor="#F59E0B" height={120} value={getValueForRank(entries[0])} isMe={entries[0].uid === user.uid} />
            {/* 3rd */}
            <PodiumCard entry={entries[2]} rank={3} rankColor="#CD7F32" height={70} value={getValueForRank(entries[2])} isMe={entries[2].uid === user.uid} />
          </div>
        )}

        {/* Full list */}
        <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 20, padding: 28, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <UsersIcon size={40} color="#E0E0E0" />
              <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A', margin: '12px 0 4px' }}>No entries yet</p>
              <p style={{ fontSize: 12, color: '#999', margin: 0 }}>Be the first to log eggs and claim the top spot.</p>
            </div>
          ) : entries.map((e, i) => (
            <div key={e.uid} style={{
              background: e.uid === user.uid ? '#FCE8E8' : '#fff',
              borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              border: e.uid === user.uid ? '2px solid rgba(215,25,32,0.35)' : '2px solid transparent',
            }}>
              {/* Rank */}
              <div style={{ width: 32, height: 32, borderRadius: 10, background: i < 3 ? (i === 0 ? '#FEF3C7' : i === 1 ? '#F5F5F5' : '#FFF7ED') : '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: i === 0 ? '#F59E0B' : i === 1 ? '#A0AEC0' : i === 2 ? '#CD7F32' : '#999' }}>
                  {i + 1}
                </span>
              </div>
              {/* Avatar */}
              {e.photoURL ? (
                <img src={e.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: e.uid === user.uid ? '#D71920' : '#E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>{(e.playerName ?? 'U')[0].toUpperCase()}</span>
                </div>
              )}
              {/* Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: e.uid === user.uid ? '#D71920' : '#1A1A1A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.playerName ?? 'Player'} {e.uid === user.uid ? '(You)' : ''}
                </p>
                <p style={{ fontSize: 10, color: '#999', margin: 0, marginTop: 1, fontWeight: 500 }}>Level {e.level}</p>
              </div>
              {/* Value */}
              <p style={{ fontSize: 14, fontWeight: 900, color: activeRank.color, margin: 0, flexShrink: 0 }}>{getValueForRank(e)}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

function PodiumCard({ entry, rank, rankColor, height, value, isMe }: {
  entry: LeaderboardEntry; rank: number; rankColor: string; height: number; value: string; isMe: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      {rank === 1 && <CrownIcon size={18} color="#F59E0B" />}
      {entry.photoURL ? (
        <img src={entry.photoURL} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${rankColor}`, marginBottom: 6, marginTop: 4 }} />
      ) : (
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: rankColor, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${rankColor}`, marginBottom: 6, marginTop: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{(entry.playerName ?? 'U')[0].toUpperCase()}</span>
        </div>
      )}
      <p style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A', margin: '0 0 2px', textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.playerName ?? 'Player'}
      </p>
      <p style={{ fontSize: 10, fontWeight: 800, color: rankColor, margin: '0 0 4px' }}>{value}</p>
      <div style={{ width: '100%', height, background: rankColor, borderRadius: '8px 8px 0 0', opacity: 0.15 + (rank === 1 ? 0.15 : rank === 2 ? 0.1 : 0.05) }} />
    </div>
  );
}
