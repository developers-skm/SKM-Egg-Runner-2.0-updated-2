import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  getTodayStats, getStreakInfo, getWeeklyData, getTrackerSettings,
  getRecentEntries, getRewardWallet, calcLevel,
  type DailyStats, type StreakInfo, type WeeklyData, type ProteinLogEntry,
  type TrackerSettings, type RewardWallet,
  todayKey,
} from '../services/protein/proteinTrackerService';
import {
  getDailyMissions, processAppOpen, hasClaimedTodayLogin,
  getSmartMotivation, getStreakShields,
  type DailyMission, type LoginStreak,
} from '../services/protein/retentionService';
import {
  EggIcon, FlameIcon, TargetIcon, TrendUpIcon, ZapIcon, CameraIcon,
  FoodLogIcon, AnalyticsIcon, AwardIcon, GiftIcon, ChevronRightIcon,
  SunIcon, MoonIcon, ShieldIcon, CheckCircleIcon, ListIcon,
} from './Icons';

interface DashboardScreenProps {
  user: User;
  onScanQR: () => void;
  onViewAnalytics: () => void;
  onViewConsumption: () => void;
  onViewAchievements: () => void;
  onViewMissions: () => void;
  onViewLoginReward: () => void;
  refreshKey: number;
}

export default function DashboardScreen({
  user, onScanQR, onViewAnalytics, onViewConsumption,
  onViewAchievements, onViewMissions, onViewLoginReward, refreshKey,
}: DashboardScreenProps) {
  const [todayStats,   setTodayStats]   = useState<DailyStats | null>(null);
  const [streak,       setStreak]       = useState<StreakInfo>({ currentStreak: 0, bestStreak: 0, lastActiveDate: '' });
  const [weekData,     setWeekData]     = useState<WeeklyData[]>([]);
  const [settings,     setSettings]     = useState<TrackerSettings | null>(null);
  const [recent,       setRecent]       = useState<ProteinLogEntry[]>([]);
  const [wallet,       setWallet]       = useState<RewardWallet | null>(null);
  const [missions,     setMissions]     = useState<DailyMission[]>([]);
  const [shields,      setShields]      = useState(0);
  const [loginState,   setLoginState]   = useState<{ loginStreak: LoginStreak | null; canClaim: boolean; hasClaimed: boolean }>({ loginStreak: null, canClaim: false, hasClaimed: false });
  const [motivationIdx,setMotivationIdx]= useState(0);
  const [motivations,  setMotivations]  = useState<string[]>([]);
  const [loading,      setLoading]      = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ts, si, wd, stg, rc, wl, dm, sh] = await Promise.all([
        getTodayStats(user.uid),
        getStreakInfo(user.uid),
        getWeeklyData(user.uid),
        getTrackerSettings(user.uid),
        getRecentEntries(user.uid, 5),
        getRewardWallet(user.uid),
        getDailyMissions(user.uid),
        getStreakShields(user.uid),
      ]);
      setTodayStats(ts); setStreak(si); setWeekData(wd);
      setSettings(stg); setRecent(rc); setWallet(wl);
      setMissions(dm); setShields(sh.shields ?? 0);

      // Login reward state
      const { loginStreak, canClaim } = await processAppOpen(user.uid);
      const hasClaimed = await hasClaimedTodayLogin(user.uid);
      setLoginState({ loginStreak, canClaim: canClaim && !hasClaimed, hasClaimed });

      // Smart motivation messages
      const name    = user.displayName?.split(' ')[0] ?? 'Champion';
      const consumed = ts?.totalProtein ?? 0;
      const goal     = stg.dailyGoal;
      const msgs = getSmartMotivation({
        name, consumed, goal,
        streak: si.currentStreak,
        yesterdayProtein: 0,
        shields: sh.shields ?? 0,
        loginDay: loginStreak?.currentLoginDay ?? 0,
        unclaimedMissions: dm.filter(m => m.completed && !m.claimed).length,
      });
      setMotivations(msgs);
    } catch (e) { console.error('[Dashboard]', e); }
    finally { setLoading(false); }
  }, [user.uid, user.displayName]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Rotate motivation messages
  useEffect(() => {
    if (motivations.length <= 1) return;
    const t = setInterval(() => setMotivationIdx(i => (i + 1) % motivations.length), 5000);
    return () => clearInterval(t);
  }, [motivations]);

  const goal         = settings?.dailyGoal ?? 60;
  const consumed     = todayStats?.totalProtein ?? 0;
  const eggs         = todayStats?.totalEggs    ?? 0;
  const pct          = Math.min(100, Math.round((consumed / goal) * 100));
  const remaining    = Math.max(0, goal - consumed);
  const name         = user.displayName?.split(' ')[0] ?? 'Champion';
  const levelInfo    = calcLevel(wallet?.totalXP ?? 0);
  const levelPct     = wallet ? Math.min(100, Math.round(((wallet.totalXP - levelInfo.currentLevelXP) / Math.max(1, levelInfo.nextLevelXP - levelInfo.currentLevelXP)) * 100)) : 0;
  const R            = 52;
  const circumf      = 2 * Math.PI * R;
  const dashOffset   = circumf - (circumf * pct) / 100;
  const maxBar       = Math.max(...weekData.map(d => d.totalProtein), goal, 1);
  const hour         = new Date().getHours();
  const unclaimedMissions = missions.filter(m => m.completed && !m.claimed).length;
  const activeMissions    = missions.filter(m => !m.completed);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg,#D71920 0%,#B31217 100%)',
        padding: '18px 18px 26px', position: 'relative', overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(215,25,32,0.3)',
      }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -20, width: 110, height: 110, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

        {/* Greeting row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, position: 'relative' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              {hour < 17 ? <SunIcon size={13} color="rgba(255,255,255,0.65)" /> : <MoonIcon size={13} color="rgba(255,255,255,0.65)" />}
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, fontWeight: 600 }}>
                {hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'}
              </p>
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.3px' }}>{name}</h1>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: '7px 12px', backdropFilter: 'blur(8px)', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1 }}>Lv {levelInfo.level}</p>
            <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{levelInfo.title}</p>
          </div>
        </div>

        {/* XP bar */}
        <div style={{ marginBottom: 12, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>XP Progress</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', margin: 0, fontWeight: 700 }}>{wallet?.totalXP?.toLocaleString() ?? 0} XP</p>
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${levelPct}%`, background: 'rgba(255,255,255,0.85)', borderRadius: 3, transition: 'width 600ms ease' }} />
          </div>
        </div>

        {/* Smart motivation — rotating */}
        <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '10px 14px', backdropFilter: 'blur(8px)', minHeight: 40, display: 'flex', alignItems: 'center' }}>
          <p style={{ fontSize: 12, color: '#fff', margin: 0, fontWeight: 500, lineHeight: 1.55, transition: 'opacity 300ms ease' }} key={motivationIdx}>
            {motivations[motivationIdx] ?? 'Scan your first SKM egg today!'}
          </p>
        </div>
      </div>

      <div style={{ padding: '0 14px' }}>

        {/* ── Login Reward Banner ── */}
        {loginState.canClaim && (
          <button onClick={onViewLoginReward} style={{
            width: '100%', borderRadius: 18, padding: '12px 16px', border: 'none', cursor: 'pointer', textAlign: 'left', marginTop: 12,
            background: 'linear-gradient(135deg,#8B5CF6,#7C3AED)',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 4px 16px rgba(139,92,246,0.35)',
            animation: 'pulseGlow 2s ease-in-out infinite',
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <GiftIcon size={20} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: 0 }}>Day {loginState.loginStreak?.currentLoginDay ?? 1} Reward Available</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', margin: 0, marginTop: 2 }}>Tap to claim your daily bonus</p>
            </div>
            <ChevronRightIcon size={16} color="rgba(255,255,255,0.7)" />
          </button>
        )}

        {/* ── Unclaimed missions banner ── */}
        {unclaimedMissions > 0 && (
          <button onClick={onViewMissions} style={{
            width: '100%', borderRadius: 16, padding: '11px 16px', border: '1.5px solid rgba(34,197,94,0.35)', cursor: 'pointer', textAlign: 'left', marginTop: 10,
            background: '#F0FDF4', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircleIcon size={18} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', margin: 0 }}>{unclaimedMissions} Mission{unclaimedMissions > 1 ? 's' : ''} Ready to Claim</p>
              <p style={{ fontSize: 10, color: '#22C55E', margin: 0, marginTop: 1 }}>Collect your XP and coins</p>
            </div>
            <ChevronRightIcon size={16} color="#22C55E" />
          </button>
        )}

        {/* ── Protein Summary Card ── */}
        <div style={{ background: '#fff', borderRadius: 24, padding: 18, marginTop: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Ring */}
            <div style={{ position: 'relative', width: 116, height: 116, flexShrink: 0 }}>
              <svg width="116" height="116" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="58" cy="58" r={R} fill="none" stroke="#F0F0F0" strokeWidth={10} />
                <circle cx="58" cy="58" r={R} fill="none" stroke={pct >= 100 ? '#22C55E' : '#D71920'}
                  strokeWidth={10} strokeLinecap="round"
                  strokeDasharray={circumf} strokeDashoffset={dashOffset}
                  style={{ transition: 'stroke-dashoffset 800ms ease' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A', lineHeight: 1 }}>{pct}%</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: pct >= 100 ? '#22C55E' : '#D71920', marginTop: 1 }}>of goal</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 900, color: '#1A1A1A', margin: '0 0 8px' }}>Today's Protein</p>
              <Row label="Consumed"  value={`${consumed}g`} red />
              <Row label="Goal"      value={`${goal}g`} />
              <Row label="Remaining" value={`${remaining}g`} red={remaining > 0} green={remaining === 0} />
              <Row label="Eggs"      value={`${eggs}`} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 9, background: '#F0F0F0', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: pct >= 100 ? '#22C55E' : 'linear-gradient(90deg,#D71920,#B31217)',
                borderRadius: 5, transition: 'width 800ms ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ fontSize: 9, color: '#bbb', fontWeight: 500 }}>0g</span>
              <span style={{ fontSize: 9, color: '#D71920', fontWeight: 700 }}>{pct}% of {goal}g daily goal</span>
              <span style={{ fontSize: 9, color: '#bbb', fontWeight: 500 }}>{goal}g</span>
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <QuickAction icon={<CameraIcon size={20} color="#fff" />}     label="Scan QR"       sub={`+6g +${50} XP`}     primary onClick={onScanQR} />
          <QuickAction icon={<FoodLogIcon size={20} color="#D71920" />} label="Food Log"      sub="Manual entry"          onClick={onViewConsumption} />
          <QuickAction icon={<ListIcon size={20} color="#D71920" />}    label="Missions"      sub={unclaimedMissions > 0 ? `${unclaimedMissions} ready` : `${missions.filter(m=>m.completed).length}/${missions.length} done`} onClick={onViewMissions} badge={unclaimedMissions > 0 ? unclaimedMissions : undefined} />
          <QuickAction icon={<AnalyticsIcon size={20} color="#D71920" />} label="Analytics"  sub="View trends"           onClick={onViewAnalytics} />
        </div>

        {/* ── Wallet row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          <WalletCard value={wallet?.coins ?? 0}         label="Coins" color="#D97706" />
          <WalletCard value={wallet?.totalXP ?? 0}       label="XP"    color="#D71920" />
          <WalletCard value={streak.currentStreak}       label="Streak" color="#22C55E" suffix="d" />
          <WalletCard value={shields}                    label="Shields" color="#8B5CF6" icon={<ShieldIcon size={12} color="#8B5CF6" />} />
        </div>

        {/* ── Streak card ── */}
        <div style={{
          background: 'linear-gradient(135deg,#D71920,#B31217)', borderRadius: 20, padding: '14px 18px', marginTop: 12,
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 4px 16px rgba(215,25,32,0.3)',
        }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FlameIcon size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1 }}>{streak.currentStreak}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', margin: '2px 0 0', fontWeight: 600 }}>
              Day Streak — Best: {streak.bestStreak} days
            </p>
          </div>
          {shields > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '6px 10px' }}>
              <ShieldIcon size={14} color="#fff" />
              <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{shields}</span>
            </div>
          )}
          <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '6px 12px' }}>
            <p style={{ fontSize: 10, fontWeight: 900, color: '#fff', margin: 0 }}>
              {streak.currentStreak > 0 ? 'Active' : 'Start Now'}
            </p>
          </div>
        </div>

        {/* ── Active missions preview ── */}
        {activeMissions.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '16px 16px', marginTop: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Today's Missions</p>
              <button onClick={onViewMissions} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#D71920', fontWeight: 700, fontSize: 11 }}>
                All Missions <ChevronRightIcon size={13} color="#D71920" />
              </button>
            </div>
            {activeMissions.slice(0, 2).map(m => {
              const mPct = Math.min(100, Math.round((m.progress / m.target) * 100));
              return (
                <div key={m.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A' }}>{m.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#D71920' }}>{m.progress}/{m.target}</span>
                  </div>
                  <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${mPct}%`, background: 'linear-gradient(90deg,#D71920,#B31217)', borderRadius: 3, transition: 'width 500ms ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Weekly Chart ── */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 16, marginTop: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Weekly Overview</p>
            <button onClick={onViewAnalytics} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#D71920', fontWeight: 700, fontSize: 11 }}>
              Details <ChevronRightIcon size={13} color="#D71920" />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 76 }}>
            {weekData.map(d => {
              const barH = maxBar > 0 ? Math.max(4, Math.round((d.totalProtein / maxBar) * 68)) : 4;
              return (
                <div key={d.dateKey} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: '100%', height: 68, position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round((goal / maxBar) * 68), borderTop: '1.5px dashed rgba(215,25,32,0.2)' }} />
                    <div style={{ width: '100%', height: barH, borderRadius: '4px 4px 0 0', background: d.goalMet ? 'linear-gradient(180deg,#D71920,#B31217)' : d.totalProtein > 0 ? 'rgba(215,25,32,0.3)' : '#F0F0F0', transition: 'height 400ms ease' }} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: d.goalMet ? '#D71920' : '#ccc' }}>{d.dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Recent activity ── */}
        {recent.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '16px 16px', marginTop: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Recent Activity</p>
              <button onClick={onViewConsumption} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#D71920', fontWeight: 700, fontSize: 11 }}>
                View All <ChevronRightIcon size={13} color="#D71920" />
              </button>
            </div>
            {recent.map((entry, i) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: i > 0 ? 9 : 0, marginTop: i > 0 ? 9 : 0, borderTop: i > 0 ? '1px solid #F8F8F8' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: entry.type === 'qr_scan' ? '#FCE8E8' : '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {entry.type === 'qr_scan' ? <EggIcon size={17} color="#D71920" /> : <FoodLogIcon size={17} color="#666" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.foodName}</p>
                  <p style={{ fontSize: 10, color: '#bbb', margin: 0, textTransform: 'capitalize' }}>{entry.meal}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 900, color: '#D71920', margin: 0 }}>+{entry.protein}g</p>
                  <p style={{ fontSize: 9, color: '#ddd', margin: 0 }}>{entry.calories} kcal</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 4px 16px rgba(139,92,246,0.35); }
          50%       { box-shadow: 0 6px 24px rgba(139,92,246,0.6); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Row({ label, value, red, green }: { label: string; value: string; red?: boolean; green?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
      <span style={{ fontSize: 10, color: '#bbb', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 10, fontWeight: 800, color: green ? '#22C55E' : red ? '#D71920' : '#1A1A1A' }}>{value}</span>
    </div>
  );
}

function QuickAction({ icon, label, sub, primary, onClick, badge }: {
  icon: React.ReactNode; label: string; sub: string; primary?: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button onClick={onClick} style={{
      background: primary ? 'linear-gradient(135deg,#D71920,#B31217)' : '#fff',
      borderRadius: 17, padding: '13px 13px', border: 'none', cursor: 'pointer',
      boxShadow: primary ? '0 5px 16px rgba(215,25,32,0.35)' : '0 2px 8px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column', gap: 7, textAlign: 'left', position: 'relative',
    }}>
      {badge !== undefined && badge > 0 && (
        <div style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: '#fff' }}>{badge}</span>
        </div>
      )}
      <div style={{ width: 36, height: 36, borderRadius: 11, background: primary ? 'rgba(255,255,255,0.2)' : '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 12, fontWeight: 900, color: primary ? '#fff' : '#1A1A1A', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 10, color: primary ? 'rgba(255,255,255,0.7)' : '#bbb', margin: 0, marginTop: 1 }}>{sub}</p>
      </div>
    </button>
  );
}

function WalletCard({ value, label, color, suffix, icon }: { value: number; label: string; color: string; suffix?: string; icon?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '10px 8px', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
      {icon && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 3 }}>{icon}</div>}
      <p style={{ fontSize: 16, fontWeight: 900, color, margin: 0, lineHeight: 1 }}>{value.toLocaleString()}{suffix ?? ''}</p>
      <p style={{ fontSize: 8, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.3, margin: '3px 0 0' }}>{label}</p>
    </div>
  );
}
