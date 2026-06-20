import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  getWeeklyData, getMonthlyData, getTrackerSettings, getStreakInfo, getDailyStats, getLast30Days, todayKey,
  type WeeklyData, type TrackerSettings, type StreakInfo,
} from '../services/protein/proteinTrackerService';
import { AnalyticsIcon, TrendUpIcon, TargetIcon, FlameIcon, EggIcon, ZapIcon } from './Icons';

type Period = 'week' | 'month';

interface AnalyticsScreenProps { user: User; refreshKey: number; }

export default function AnalyticsScreen({ user, refreshKey }: AnalyticsScreenProps) {
  const [period,      setPeriod]      = useState<Period>('week');
  const [data,        setData]        = useState<WeeklyData[]>([]);
  const [settings,    setSettings]    = useState<TrackerSettings | null>(null);
  const [streak,      setStreak]      = useState<StreakInfo>({ currentStreak: 0, bestStreak: 0, lastActiveDate: '' });
  const [loading,     setLoading]     = useState(true);
  const [consistency, setConsistency] = useState(0);
  const [totalProtein30, setTP30]     = useState(0);
  const [totalEggs30,    setTE30]     = useState(0);
  const [goalsMet30,     setGM30]     = useState(0);
  const [insights,    setInsights]    = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stg, si] = await Promise.all([getTrackerSettings(user.uid), getStreakInfo(user.uid)]);
      setSettings(stg); setStreak(si);
      const [weekD, monthD] = await Promise.all([getWeeklyData(user.uid), getMonthlyData(user.uid)]);
      setData(period === 'week' ? weekD : monthD);

      let tp = 0, te = 0, gm = 0, active = 0;
      for (const d of getLast30Days()) {
        const stat = await getDailyStats(user.uid, d);
        if (stat) { tp += stat.totalProtein; te += stat.totalEggs; if (stat.goalMet) gm++; if (stat.totalProtein > 0) active++; }
      }
      setTP30(tp); setTE30(te); setGM30(gm); setConsistency(Math.round((active / 30) * 100));

      // Insights engine
      const msgs: string[] = [];
      const avg = tp / 30;
      if (avg >= stg.dailyGoal)   msgs.push(`You average ${Math.round(avg)}g protein per day — above your goal.`);
      if (gm >= 20)               msgs.push(`Excellent! You met your goal ${gm} times this month.`);
      if (si.currentStreak >= 7)  msgs.push(`Strong ${si.currentStreak}-day streak — you are building a habit.`);
      if (active >= 25)           msgs.push(`Outstanding consistency — ${active} active days out of 30.`);
      if (te >= 30)               msgs.push(`You consumed ${te} eggs in the last 30 days.`);
      if (msgs.length === 0)      msgs.push('Start logging daily to see insights here.');
      setInsights(msgs.slice(0, 4));
    } catch (e) { console.error('[Analytics]', e); }
    finally { setLoading(false); }
  }, [user.uid, period]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const goal    = settings?.dailyGoal ?? 60;
  const maxBar  = Math.max(...data.map(d => d.totalProtein), goal, 1);
  const avgProtein = data.length ? Math.round(data.reduce((s, d) => s + d.totalProtein, 0) / data.length) : 0;
  const bestDay = data.reduce((b, d) => d.totalProtein > b.totalProtein ? d : b, data[0] ?? { totalProtein: 0, dayLabel: '—' });

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
            {(['week','month'] as Period[]).map(p => (
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

        {/* Key stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px 0' }}>
          {[
            { icon: <TrendUpIcon size={18} color="#D71920" />, title: 'Avg / Day',    value: `${avgProtein}g`, sub: 'protein' },
            { icon: <TargetIcon size={18} color="#22C55E" />,  title: 'Consistency',  value: `${consistency}%`, sub: 'last 30 days' },
            { icon: <ZapIcon size={18} color="#F59E0B" />,     title: 'Goals Met',    value: `${goalsMet30}`,  sub: 'last 30 days' },
            { icon: <FlameIcon size={18} color="#D71920" />,   title: 'Streak',       value: `${streak.currentStreak}`, sub: 'days active' },
          ].map(s => (
            <div key={s.title} style={{ background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>{s.icon}<span style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.title}</span></div>
              <p style={{ fontSize: 24, fontWeight: 900, color: '#1A1A1A', margin: 0, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 10, color: '#bbb', margin: 0, marginTop: 3 }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Bar chart */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 14px' }}>
            Protein Trend — {period === 'week' ? '7 Days' : '30 Days'}
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: period === 'month' ? 4 : 8, height: 100, overflowX: 'auto' }}>
            {data.map(d => {
              const barH = Math.max(3, Math.round((d.totalProtein / maxBar) * 80));
              const isToday = d.dateKey === todayKey();
              return (
                <div key={d.dateKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, minWidth: period === 'month' ? 10 : 28 }}>
                  <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', width: '100%', position: 'relative' }}>
                    {/* Goal line */}
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
        </div>

        {/* 30-day totals */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 14px' }}>30-Day Totals</p>
          {[
            { label: 'Total Protein',  value: `${totalProtein30}g`, pct: Math.min(100, (totalProtein30 / (goal * 30)) * 100) },
            { label: 'Total Eggs',     value: `${totalEggs30}`,     pct: Math.min(100, (totalEggs30 / 60) * 100) },
            { label: 'Goals Met',      value: `${goalsMet30}/30`,   pct: (goalsMet30 / 30) * 100 },
            { label: 'Consistency',    value: `${consistency}%`,    pct: consistency },
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
          ))}
        </div>

        {/* Consistency ring */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
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
        </div>

        {/* Insights */}
        {insights.length > 0 && (
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

        {/* Summary */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, margin: '12px 16px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 12px' }}>Summary</p>
          {[
            { label: 'Best Day',        value: `${bestDay?.dayLabel} (${bestDay?.totalProtein ?? 0}g)` },
            { label: 'Current Streak',  value: `${streak.currentStreak} days` },
            { label: 'Best Streak',     value: `${streak.bestStreak} days` },
            { label: 'Daily Goal',      value: `${goal}g protein` },
            { label: 'Avg Protein/Day', value: `${avgProtein}g` },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #F5F5F5' }}>
              <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>{r.label}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#1A1A1A' }}>{r.value}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
