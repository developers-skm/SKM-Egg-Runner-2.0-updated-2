import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  getWeeklyData, getMonthlyData, getTrackerSettings, getStreakInfo,
  getDailyStats, getLast30Days, todayKey,
  type WeeklyData, type TrackerSettings, type StreakInfo,
} from '../services/protein/proteinTrackerService';
import { getUserSummary, syncSummaryFromDailyStats, type UserSummary } from '../services/protein/userSummaryService';
import { AnalyticsIcon, TrendUpIcon, TargetIcon, FlameIcon, ZapIcon } from './Icons';
import { startTimer, endTimer } from '../utils/perfTimer';

type Period = 'week' | 'month';

interface AnalyticsScreenProps { user: User; refreshKey: number; }

// ── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard({ height = 80 }: { height?: number }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', height }}>
      <div style={{ background: '#F0F0F0', borderRadius: 8, height: '100%', animation: 'shimmer 1.4s ease infinite', backgroundImage: 'linear-gradient(90deg,#F0F0F0 25%,#E8E8E8 50%,#F0F0F0 75%)', backgroundSize: '200% 100%' }} />
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsScreen({ user, refreshKey }: AnalyticsScreenProps) {
  const [period,   setPeriod]   = useState<Period>('week');
  const [summary,  setSummary]  = useState<UserSummary | null>(null);
  const [settings, setSettings] = useState<TrackerSettings | null>(null);
  const [streak,   setStreak]   = useState<StreakInfo>({ currentStreak: 0, bestStreak: 0, lastActiveDate: '' });
  const [data,     setData]     = useState<WeeklyData[]>([]);
  const [chartsReady, setChartsReady] = useState(false);

  // Phase 1 — load summary doc (single read, Firestore-cached)
  const loadSummary = useCallback(async () => {
    setSummary(null);
    setChartsReady(false);
    startTimer('[Stats] total-phase1');
    try {
      startTimer('[Stats] summary-query');
      const sumResult = await getUserSummary(user.uid);
      endTimer('[Stats] summary-query');

      startTimer('[Stats] settings+streak-query');
      const [stg, si] = await Promise.all([
        getTrackerSettings(user.uid),
        getStreakInfo(user.uid),
      ]);
      endTimer('[Stats] settings+streak-query');

      setSummary(sumResult);
      setSettings(stg);
      setStreak(si);
    } catch (e) { console.error('[Analytics:summary]', e); }
    endTimer('[Stats] total-phase1');
    console.log('[Stats] >>> Phase 1 complete — stat cards should now be visible');
  }, [user.uid]);

  // Phase 2 — load chart data in parallel, then sync summary
  const loadCharts = useCallback(async () => {
    startTimer('[Stats] total-phase2');
    try {
      startTimer('[Stats] weekly-query');
      const weekD = await getWeeklyData(user.uid);
      endTimer('[Stats] weekly-query');

      startTimer('[Stats] monthly-query');
      const monthD = await getMonthlyData(user.uid);
      endTimer('[Stats] monthly-query');

      setData(period === 'week' ? weekD : monthD);

      // All 30 daily docs fetched in parallel (not serial)
      startTimer('[Stats] daily30-parallel-query');
      const dateKeys  = getLast30Days();
      const snapshots = await Promise.all(dateKeys.map(d => getDailyStats(user.uid, d)));
      endTimer('[Stats] daily30-parallel-query');

      startTimer('[Stats] summary-sync-write');
      const si = streak;
      await syncSummaryFromDailyStats(user.uid, snapshots, si);
      endTimer('[Stats] summary-sync-write');

      startTimer('[Stats] chart-processing');
      let tp = 0, te = 0, gm = 0, active = 0;
      for (const stat of snapshots) {
        if (!stat) continue;
        tp += stat.totalProtein;
        te += stat.totalEggs;
        if (stat.goalMet)          gm++;
        if (stat.totalProtein > 0) active++;
      }
      setSummary(prev => prev ? {
        ...prev,
        monthlyProtein:      tp,
        monthlyEggs:         te,
        goalsMetThisMonth:   gm,
        activeDaysThisMonth: active,
        goalCompletionRate:  Math.round((gm / 30) * 100),
        averageProtein:      Math.round(tp / 30),
        currentStreak:       si.currentStreak,
        bestStreak:          si.bestStreak,
      } : prev);
      endTimer('[Stats] chart-processing');

      setChartsReady(true);
      console.log('[Stats] >>> Phase 2 complete — charts visible');
    } catch (e) { console.error('[Analytics:charts]', e); }
    endTimer('[Stats] total-phase2');
  }, [user.uid, period, streak]);

  useEffect(() => { loadSummary(); }, [loadSummary, refreshKey]);

  // Start phase 2 once summary is ready
  useEffect(() => {
    if (summary !== null) loadCharts();
  }, [summary, loadCharts]);

  // Re-fetch chart data when period toggle changes (summary already loaded)
  useEffect(() => {
    if (!chartsReady) return;
    (async () => {
      const [weekD, monthD] = await Promise.all([
        getWeeklyData(user.uid),
        getMonthlyData(user.uid),
      ]);
      setData(period === 'week' ? weekD : monthD);
    })();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const goal        = settings?.dailyGoal ?? 60;
  const consistency = summary?.goalCompletionRate ?? 0;
  const avgProtein  = summary?.averageProtein ?? 0;
  const totalEggs30 = summary?.monthlyEggs ?? 0;
  const goalsMet30  = summary?.goalsMetThisMonth ?? 0;
  const maxBar      = Math.max(...data.map(d => d.totalProtein), goal, 1);
  const bestDay     = data.reduce((b, d) => d.totalProtein > b.totalProtein ? d : b, data[0] ?? { totalProtein: 0, dayLabel: '—' });

  // Insights — generated from summary (no extra reads)
  const insights: string[] = [];
  if (summary) {
    if (avgProtein >= goal)                      insights.push(`You average ${avgProtein}g protein per day — above your goal.`);
    if (goalsMet30 >= 20)                        insights.push(`Excellent! You met your goal ${goalsMet30} times this month.`);
    if (streak.currentStreak >= 7)               insights.push(`Strong ${streak.currentStreak}-day streak — you are building a habit.`);
    if ((summary.activeDaysThisMonth ?? 0) >= 25) insights.push(`Outstanding consistency — ${summary.activeDaysThisMonth} active days out of 30.`);
    if (totalEggs30 >= 30)                       insights.push(`You consumed ${totalEggs30} eggs in the last 30 days.`);
    if (insights.length === 0)                   insights.push('Start logging daily to see insights here.');
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#D71920,#B31217)', padding: '20px 20px 20px', flexShrink: 0, boxShadow: '0 4px 20px rgba(215,25,32,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AnalyticsIcon size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Analytics</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>Your nutrition journey insights</p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* Period toggle */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', gap: 0, background: '#F0F0F0', borderRadius: 16, padding: 4 }}>
            {(['week', 'month'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                flex: 1, padding: '9px 0', borderRadius: 13, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13,
                background: period === p ? '#D71920' : 'transparent',
                color:      period === p ? '#fff' : '#999',
                boxShadow:  period === p ? '0 2px 8px rgba(215,25,32,0.3)' : 'none',
                transition: 'all 150ms ease',
              }}>
                {p === 'week' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Key stats — render immediately from summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px 0' }}>
          {summary === null ? (
            [0,1,2,3].map(i => <SkeletonCard key={i} height={88} />)
          ) : (
            [
              { icon: <TrendUpIcon size={18} color="#D71920" />, title: 'Avg / Day',   value: `${avgProtein}g`,       sub: 'protein' },
              { icon: <TargetIcon size={18} color="#22C55E" />,  title: 'Consistency', value: `${consistency}%`,      sub: 'last 30 days' },
              { icon: <ZapIcon size={18} color="#F59E0B" />,     title: 'Goals Met',   value: `${goalsMet30}`,        sub: 'last 30 days' },
              { icon: <FlameIcon size={18} color="#D71920" />,   title: 'Streak',      value: `${streak.currentStreak}`, sub: 'days active' },
            ].map(s => (
              <div key={s.title} style={{ background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>{s.icon}<span style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.title}</span></div>
                <p style={{ fontSize: 24, fontWeight: 900, color: '#1A1A1A', margin: 0, lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: 10, color: '#bbb', margin: 0, marginTop: 3 }}>{s.sub}</p>
              </div>
            ))
          )}
        </div>

        {/* Egg consumption bar chart — skeleton until charts loaded */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>
              Egg Consumption — {period === 'week' ? '7 Days' : '30 Days'}
            </p>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#D71920' }}>
              {totalEggs30} total (30d)
            </span>
          </div>
          {!chartsReady ? (
            <div style={{ height: 80, background: '#F5F5F5', borderRadius: 10, animation: 'shimmer 1.4s ease infinite', backgroundImage: 'linear-gradient(90deg,#F0F0F0 25%,#E8E8E8 50%,#F0F0F0 75%)', backgroundSize: '200% 100%' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: period === 'month' ? 4 : 8, height: 80, overflowX: 'auto' }}>
              {data.map(d => {
                const maxEggs = Math.max(...data.map(x => x.totalEggs), 1);
                const barH = Math.max(3, Math.round((d.totalEggs / maxEggs) * 64));
                const isToday = d.dateKey === todayKey();
                return (
                  <div key={d.dateKey + '-egg'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: period === 'month' ? 10 : 28 }}>
                    <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                      <div style={{
                        width: '100%', height: barH, borderRadius: '3px 3px 0 0',
                        background: d.totalEggs > 0 ? (isToday ? 'linear-gradient(180deg,#F59E0B,#D97706)' : 'linear-gradient(180deg,#FCD34D,#F59E0B)') : '#F0F0F0',
                        outline: isToday ? '2px solid #D97706' : 'none', outlineOffset: 1,
                        transition: 'height 400ms ease',
                      }} />
                    </div>
                    {period === 'week' && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: d.totalEggs > 0 ? '#D97706' : '#ccc', marginTop: 3 }}>
                        {d.totalEggs > 0 ? d.totalEggs : d.dayLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {chartsReady && (
            <p style={{ fontSize: 10, color: '#bbb', margin: '8px 0 0', fontWeight: 500 }}>
              Average: {data.length > 0 ? (data.reduce((s, d) => s + d.totalEggs, 0) / data.length).toFixed(1) : 0} eggs/day
            </p>
          )}
        </div>

        {/* Protein bar chart — skeleton until charts loaded */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 14px' }}>
            Protein Trend — {period === 'week' ? '7 Days' : '30 Days'}
          </p>
          {!chartsReady ? (
            <div style={{ height: 100, background: '#F5F5F5', borderRadius: 10, animation: 'shimmer 1.4s ease infinite', backgroundImage: 'linear-gradient(90deg,#F0F0F0 25%,#E8E8E8 50%,#F0F0F0 75%)', backgroundSize: '200% 100%' }} />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: period === 'month' ? 4 : 8, height: 100, overflowX: 'auto' }}>
                {data.map(d => {
                  const barH = Math.max(3, Math.round((d.totalProtein / maxBar) * 80));
                  const isToday = d.dateKey === todayKey();
                  return (
                    <div key={d.dateKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: period === 'month' ? 10 : 28 }}>
                      <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', width: '100%', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round((goal / maxBar) * 80), borderTop: '1.5px dashed rgba(215,25,32,0.2)', pointerEvents: 'none' }} />
                        <div style={{
                          width: '100%', height: barH, borderRadius: '3px 3px 0 0',
                          background: d.goalMet ? 'linear-gradient(180deg,#D71920,#B31217)' : d.totalProtein > 0 ? 'rgba(215,25,32,0.3)' : '#F0F0F0',
                          outline: isToday ? '2px solid #D71920' : 'none', outlineOffset: 1,
                          transition: 'height 400ms ease',
                        }} />
                      </div>
                      {period === 'week' && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: d.goalMet ? '#D71920' : '#ccc', marginTop: 3 }}>{d.dayLabel}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                {[{ color: '#D71920', label: 'Goal met' }, { color: 'rgba(215,25,32,0.3)', label: 'Partial' }, { color: '#F0F0F0', label: 'No data' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 14, height: 8, borderRadius: 2, background: l.color }} />
                    <span style={{ fontSize: 9, color: '#999', fontWeight: 600 }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 30-day totals — render from summary immediately */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 14px' }}>30-Day Totals</p>
          {summary === null ? (
            <SkeletonCard height={140} />
          ) : (
            [
              { label: 'Total Protein',  value: `${summary.monthlyProtein}g`, pct: Math.min(100, (summary.monthlyProtein / (goal * 30)) * 100) },
              { label: 'Total Eggs',     value: `${totalEggs30}`,             pct: Math.min(100, (totalEggs30 / 60) * 100) },
              { label: 'Goals Met',      value: `${goalsMet30}/30`,           pct: (goalsMet30 / 30) * 100 },
              { label: 'Consistency',    value: `${consistency}%`,            pct: consistency },
            ].map(r => (
              <div key={r.label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>{r.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#D71920' }}>{r.value}</span>
                </div>
                <div style={{ height: 7, background: '#F0F0F0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, r.pct))}%`, background: 'linear-gradient(90deg,#D71920,#B31217)', borderRadius: 4, transition: 'width 600ms ease' }} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Consistency ring — from summary */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          {summary === null ? (
            <SkeletonCard height={90} />
          ) : (
            <>
              <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
                <svg width="90" height="90" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="45" cy="45" r="38" fill="none" stroke="#F0F0F0" strokeWidth="8" />
                  <circle cx="45" cy="45" r="38" fill="none" stroke="#D71920" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 38}
                    strokeDashoffset={2 * Math.PI * 38 * (1 - consistency / 100)}
                    style={{ transition: 'stroke-dashoffset 800ms ease' }} />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: '#D71920' }}>{consistency}%</span>
                </div>
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>Consistency Score</p>
                <p style={{ fontSize: 12, color: '#666', margin: 0, lineHeight: 1.5 }}>
                  {consistency >= 80 ? 'Outstanding performance. Keep it up.' :
                   consistency >= 60 ? 'Good consistency. Aim for daily logging.' :
                   consistency >= 30 ? 'Building the habit. Log every day.' :
                   'Just getting started. Every day counts.'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Insights — from summary, no extra reads */}
        {summary !== null && insights.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 12px' }}>Insights</p>
            {insights.map((msg, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: i < insights.length - 1 ? 10 : 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <TrendUpIcon size={14} color="#D71920" />
                </div>
                <p style={{ fontSize: 12, color: '#1A1A1A', margin: 0, paddingTop: 5, lineHeight: 1.5 }}>{msg}</p>
              </div>
            ))}
          </div>
        )}

        {/* Summary — from summary doc + chart data */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 12px' }}>Summary</p>
          {summary === null ? (
            <SkeletonCard height={180} />
          ) : (
            [
              { label: 'Best Day',         value: chartsReady ? `${bestDay?.dayLabel} (${bestDay?.totalProtein ?? 0}g)` : '—' },
              { label: 'Most Eggs/Day',    value: chartsReady ? `${Math.max(...data.map(d => d.totalEggs), 0)} eggs` : '—' },
              { label: 'Total Eggs (30d)', value: `${totalEggs30} eggs` },
              { label: 'Current Streak',   value: `${streak.currentStreak} days` },
              { label: 'Best Streak',      value: `${streak.bestStreak} days` },
              { label: 'Daily Goal',       value: `${goal}g protein` },
              { label: 'Avg Protein/Day',  value: `${avgProtein}g` },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #F5F5F5' }}>
                <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: '#1A1A1A' }}>{r.value}</span>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
