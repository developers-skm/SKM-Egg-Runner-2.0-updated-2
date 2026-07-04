import { useEffect, useState, useCallback, useRef } from 'react';
import type { User } from 'firebase/auth';
import {
  ChevronLeft, ChevronRight, Heart, Egg, Leaf, Target,
  TrendingUp, Award, Activity, Droplets, Scale, Flame, Pencil,
} from 'lucide-react';
import {
  getHealthProfile, saveHealthProfile, refreshHealthScore, calcBmi, bmiStatus, BMI_STATUS_META,
  calcIdealWeightRange, calcDailyProteinGoal, healthScoreLabel, getBodyStatus, generateInsights,
  getTodaysEggBenefit, calcHealthLevel,
  ACTIVITY_LEVELS, ACTIVITY_LEVEL_DESCRIPTIONS, getRecommendation,
  type HealthProfile, type Gender, type ActivityLevel, type EggBenefitCard,
} from '../services/protein/healthProfileService';
import { getStreakInfo, getTodayStats, getWeeklyData, todayKey } from '../services/protein/proteinTrackerService';
import { MILESTONES } from '../services/protein/milestoneRewardService';

const EGG_BENEFIT_ICON: Record<EggBenefitCard['iconKey'], React.ReactNode> = {
  'egg':          <Egg size={18} color="#D71920" />,
  'heart':        <Heart size={18} color="#D71920" />,
  'leaf':         <Leaf size={18} color="#D71920" />,
  'target':       <Target size={18} color="#D71920" />,
  'trending-up':  <TrendingUp size={18} color="#D71920" />,
  'droplets':     <Droplets size={18} color="#D71920" />,
  'award':        <Award size={18} color="#D71920" />,
  'activity':     <Activity size={18} color="#D71920" />,
};

/** Smoothly counts up to `target` whenever it changes — used for the Health Score number. */
function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

interface HealthProfileScreenProps {
  user: User;
  onBack: () => void;
  onProfileSaved: () => void; // lets ProfileScreen/Dashboard know to refresh the goal
}

type WizardStep = 0 | 1 | 2 | 3 | 4;
type HubTab = 'overview' | 'body' | 'goals' | 'insights';

const GENDERS: Gender[] = ['Male', 'Female', 'Other'];
const HUB_TABS: { key: HubTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'body',     label: 'Body' },
  { key: 'goals',    label: 'Goals' },
  { key: 'insights', label: 'Insights' },
];

export default function HealthProfileScreen({ user, onBack, onProfileSaved }: HealthProfileScreenProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [mode, setMode] = useState<'view' | 'wizard' | 'edit'>('view');
  const [tab, setTab] = useState<HubTab>('overview');

  // Live tracker data for the health score + protein recommendation context.
  const [consumedToday, setConsumedToday] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [bestStreakDays, setBestStreakDays] = useState(0);
  const [consistencyPct, setConsistencyPct] = useState(0);
  const [scanFrequencyPct, setScanFrequencyPct] = useState(0);
  const [weeklyActivityPct, setWeeklyActivityPct] = useState(0);
  const [prevHealthScore, setPrevHealthScore] = useState<number | null>(null);

  // Wizard / edit form state
  const [step, setStep] = useState<WizardStep>(0);
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('Male');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('Moderately Active');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const animatedScore = useCountUp(profile?.healthScore ?? 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, streak, todayStats, week] = await Promise.all([
        getHealthProfile(user.uid),
        getStreakInfo(user.uid),
        getTodayStats(user.uid),
        getWeeklyData(user.uid),
      ]);
      const consumed = todayStats?.totalProtein ?? 0;
      const metCount = week.filter(d => d.goalMet).length;
      const scanDays = week.filter(d => d.totalEggs > 0).length;
      const activeDays = week.filter(d => d.totalProtein > 0).length;
      const consistency = week.length > 0 ? Math.round((metCount / week.length) * 100) : 0;
      const scanFreq = week.length > 0 ? Math.round((scanDays / week.length) * 100) : 0;
      const weeklyActivity = week.length > 0 ? Math.round((activeDays / week.length) * 100) : 0;

      setStreakDays(streak.currentStreak);
      setBestStreakDays(streak.bestStreak);
      setConsumedToday(consumed);
      setConsistencyPct(consistency);
      setScanFrequencyPct(scanFreq);
      setWeeklyActivityPct(weeklyActivity);

      if (!p) {
        setProfile(null);
        setMode('wizard');
        return;
      }

      setPrevHealthScore(p.healthScore);

      // Refresh health score + motivation from live tracker data, then reload the profile.
      const scannedToday = (todayStats?.totalEggs ?? 0) > 0;
      const goalCompletionPct = p.dailyProteinGoal > 0 ? Math.round((consumed / p.dailyProteinGoal) * 100) : 0;
      await refreshHealthScore(user.uid, {
        proteinGoalCompletionPct: goalCompletionPct,
        currentStreak: streak.currentStreak,
        consistencyPct: consistency,
        scanFrequencyPct: scanFreq,
        weeklyActivityPct: weeklyActivity,
        scannedToday,
        todayKey: todayKey(),
      });
      const refreshed = await getHealthProfile(user.uid);
      setProfile(refreshed);
    } catch (e) { console.error('[HealthProfile]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load]);

  const startEdit = () => {
    if (profile) {
      setAge(String(profile.age));
      setGender(profile.gender);
      setHeightCm(String(profile.heightCm));
      setWeightKg(String(profile.weightKg));
      setActivityLevel(profile.activityLevel);
    }
    setStep(0);
    setErr('');
    setMode(profile ? 'edit' : 'wizard');
  };

  const canProceed = (): boolean => {
    if (step === 0) return age.trim() !== '' && !isNaN(Number(age)) && Number(age) > 0 && Number(age) < 120;
    if (step === 1) return !!gender;
    if (step === 2) return heightCm.trim() !== '' && !isNaN(Number(heightCm)) && Number(heightCm) > 50 && Number(heightCm) < 260;
    if (step === 3) return weightKg.trim() !== '' && !isNaN(Number(weightKg)) && Number(weightKg) > 20 && Number(weightKg) < 400;
    if (step === 4) return !!activityLevel;
    return false;
  };

  const handleSave = async () => {
    setSaving(true); setErr('');
    try {
      const saved = await saveHealthProfile(user.uid, {
        age: parseInt(age, 10),
        gender,
        heightCm: parseFloat(heightCm),
        weightKg: parseFloat(weightKg),
        activityLevel,
      });
      setProfile(saved);
      setMode('view');
      onProfileSaved();
    } catch {
      setErr('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── SETUP WIZARD / EDIT ────────────────────────────────────
  if (mode === 'wizard' || mode === 'edit') {
    const steps = ['Age', 'Gender', 'Height', 'Weight', 'Activity Level'];
    // Live preview using current form values (falls back to sensible defaults mid-entry).
    const previewH = parseFloat(heightCm) || profile?.heightCm || 170;
    const previewW = parseFloat(weightKg) || profile?.weightKg || 70;
    const previewBmi = calcBmi(previewH, previewW);
    const previewGoal = calcDailyProteinGoal(previewW, activityLevel);

    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 90, background: '#FAFAFA' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <button onClick={mode === 'edit' ? () => setMode('view') : onBack} style={{
            width: 34, height: 34, borderRadius: 10, background: '#fff', border: '1px solid #F0F0F0',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ChevronLeft size={18} color="#1A1A1A" />
          </button>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>
              {mode === 'wizard' ? 'Set Up Your Health Profile' : 'Edit Health Profile'}
            </h2>
            <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', fontWeight: 600 }}>Step {step + 1} of 5 — {steps[step]}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, background: '#F0F0F0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ height: '100%', width: `${((step + 1) / 5) * 100}%`, background: 'linear-gradient(90deg,#D71920,#F59E0B)', borderRadius: 10, transition: 'width 300ms ease' }} />
        </div>

        <div style={{ background: '#fff', borderRadius: 24, padding: 22, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          {step === 0 && (
            <WizardField label="What's your age?" hint="Used to personalize your health recommendations.">
              <input type="number" autoFocus value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 28"
                style={inputStyle} />
            </WizardField>
          )}

          {step === 1 && (
            <WizardField label="What's your gender?">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {GENDERS.map(g => (
                  <SelectTile key={g} label={g} active={gender === g} onClick={() => setGender(g)} />
                ))}
              </div>
            </WizardField>
          )}

          {step === 2 && (
            <WizardField label="What's your height?" hint="In centimeters.">
              <input type="number" autoFocus value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="e.g. 170"
                style={inputStyle} />
            </WizardField>
          )}

          {step === 3 && (
            <WizardField label="What's your weight?" hint="In kilograms. This can be updated any time.">
              <input type="number" autoFocus value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="e.g. 68"
                style={inputStyle} />
              {heightCm && weightKg && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: '#FEF2F2', borderRadius: 12, border: '1px solid #FECACA' }}>
                  <p style={{ fontSize: 11, color: '#999', margin: 0, fontWeight: 600 }}>Your BMI will be</p>
                  <p style={{ fontSize: 20, fontWeight: 900, color: '#D71920', margin: '2px 0 0' }}>{previewBmi}</p>
                </div>
              )}
            </WizardField>
          )}

          {step === 4 && (
            <WizardField label="How active are you?" hint="This drives your personalized protein goal.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ACTIVITY_LEVELS.map(lvl => (
                  <SelectTile key={lvl} label={lvl} sub={ACTIVITY_LEVEL_DESCRIPTIONS[lvl]} active={activityLevel === lvl} onClick={() => setActivityLevel(lvl)} />
                ))}
              </div>
              {weightKg && (
                <div style={{ marginTop: 14, padding: '12px 16px', background: 'linear-gradient(135deg,#FEF2F2,#FFF7ED)', borderRadius: 14, border: '1px solid #FECACA' }}>
                  <p style={{ fontSize: 11, color: '#999', margin: 0, fontWeight: 600 }}>Your personalized daily protein goal</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: '#D71920', margin: '2px 0 0' }}>{previewGoal}g</p>
                </div>
              )}
            </WizardField>
          )}

          {err && <p style={{ fontSize: 12, color: '#D71920', textAlign: 'center', margin: '14px 0 0' }}>{err}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => (s - 1) as WizardStep)} style={secondaryBtnStyle}>Back</button>
            )}
            {step < 4 ? (
              <button disabled={!canProceed()} onClick={() => setStep(s => (s + 1) as WizardStep)}
                style={{ ...primaryBtnStyle, opacity: canProceed() ? 1 : 0.5, cursor: canProceed() ? 'pointer' : 'not-allowed' }}>
                Next
              </button>
            ) : (
              <button disabled={!canProceed() || saving} onClick={handleSave}
                style={{ ...primaryBtnStyle, opacity: canProceed() && !saving ? 1 : 0.5, cursor: canProceed() && !saving ? 'pointer' : 'not-allowed' }}>
                {saving ? 'Saving…' : 'Save Health Profile'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN HEALTH INTELLIGENCE CENTER ─────────────────────────
  if (!profile) return null; // unreachable — wizard forces creation first

  const status = bmiStatus(profile.bmi);
  const statusMeta = BMI_STATUS_META[status];
  const bodyStatus = getBodyStatus(status);
  const { min, max } = calcIdealWeightRange(profile.heightCm);
  const consumedPct = Math.min(100, Math.round((consumedToday / profile.dailyProteinGoal) * 100));
  const remainingG = Math.max(0, profile.dailyProteinGoal - consumedToday);
  const scoreLabel = healthScoreLabel(profile.healthScore);
  const memberSince = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : '—';

  const { level, nextLevel, daysToNext } = calcHealthLevel(streakDays);
  const nextMilestone = MILESTONES.find(m => m.days > streakDays);
  const daysToNextMilestone = nextMilestone ? nextMilestone.days - streakDays : undefined;
  const insights = generateInsights({
    consumedToday, dailyGoal: profile.dailyProteinGoal,
    currentStreak: streakDays, bestStreak: bestStreakDays,
    consistencyPct, healthScoreDelta: prevHealthScore !== null ? profile.healthScore - prevHealthScore : 0,
    daysToNextMilestone,
  });
  const eggBenefit = getTodaysEggBenefit({
    dailyGoal: profile.dailyProteinGoal, consumedToday, todayKey: todayKey(),
  });
  const firstName = user.displayName?.split(' ')[0] ?? 'Champion';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  const R = 46;
  const circumf = 2 * Math.PI * R;
  const scoreOffset = circumf - (circumf * animatedScore) / 100;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAFAFA' }}>

      {/* ── Fixed header ── */}
      <div style={{
        background: 'linear-gradient(160deg,#D71920 0%,#B31217 55%,#7C1015 100%)',
        padding: '18px 18px 0', flexShrink: 0, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onBack} style={{
              width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ChevronLeft size={18} color="#fff" />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src="/egg mus_Image_v5vrg3v5vrg3v5vr-removebg-preview.png" alt="SKM"
                style={{ width: 22, height: 22, objectFit: 'contain' }} />
              <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>SKM Protein</h2>
            </div>
          </div>
          <button onClick={startEdit} style={{
            width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Pencil size={16} color="#fff" />
          </button>
        </div>

        {/* ── Segmented tab bar ── */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.18)', borderRadius: 14, padding: 4 }}>
          {HUB_TABS.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '9px 0', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: active ? '#fff' : 'transparent',
                color: active ? '#D71920' : 'rgba(255,255,255,0.75)',
                fontWeight: 800, fontSize: 12, transition: 'all 150ms ease',
              }}>
                {t.label}
              </button>
            );
          })}
        </div>
        <div style={{ height: 14 }} />
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {tab === 'overview' && (
          <>
            {/* HEALTH JOURNEY GREETING */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'hiFadeIn 400ms ease' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Heart size={19} color="#D71920" />
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Health Journey</p>
                <p style={{ fontSize: 15, fontWeight: 900, color: '#1A1A1A', margin: '2px 0 0' }}>{greeting}, {firstName}</p>
              </div>
            </div>

            {/* HOME CARD */}
            <div style={{
              background: 'linear-gradient(135deg,#1A1A1A,#2A2A2A)', borderRadius: 22, padding: 18,
              animation: 'hiFadeIn 400ms ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
                  <svg width="92" height="92" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="46" cy="46" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={8} />
                    <circle cx="46" cy="46" r={R} fill="none" stroke="#F59E0B" strokeWidth={8} strokeLinecap="round"
                      strokeDasharray={circumf} strokeDashoffset={scoreOffset}
                      style={{ transition: 'stroke-dashoffset 800ms ease' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{animatedScore}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>SCORE</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Today's Health Score</p>
                  <p style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '2px 0 0' }}>{scoreLabel}</p>
                </div>
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '14px 0' }} />

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Body Status</p>
                  <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusMeta.color, display: 'inline-block' }} />
                    {status}
                  </p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Protein Goal</p>
                  <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: '3px 0 0' }}>{profile.dailyProteinGoal}g</p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Current</p>
                  <p style={{ fontSize: 13, fontWeight: 900, color: '#fff', margin: '3px 0 0' }}>{consumedToday}g · {consumedPct}%</p>
                </div>
              </div>
            </div>

            {/* TODAY'S EGG BENEFIT — featured educational section */}
            <div style={{
              background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
              border: '1px solid #FCE8E8', animation: 'hiFadeIn 450ms ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {EGG_BENEFIT_ICON[eggBenefit.iconKey]}
                </div>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, color: '#D71920', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Today's Egg Benefit</p>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A', margin: '2px 0 0' }}>{eggBenefit.title}</p>
                </div>
              </div>
              <p style={{ fontSize: 12, color: '#666', margin: 0, lineHeight: 1.6 }}>{eggBenefit.body}</p>
            </div>

            {/* BODY STATUS — human copy */}
            <div style={{ background: statusMeta.bg, borderRadius: 20, padding: 18, border: `1.5px solid ${statusMeta.color}33`, animation: 'hiFadeIn 500ms ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusMeta.color, flexShrink: 0 }} />
                <p style={{ fontSize: 15, fontWeight: 900, color: '#1A1A1A', margin: 0, lineHeight: 1.3 }}>{bodyStatus.headline}</p>
              </div>
              <p style={{ fontSize: 12, color: '#666', margin: 0, lineHeight: 1.5 }}>{bodyStatus.sub}</p>
            </div>

            {/* Progress teaser → Insights tab */}
            {insights.length > 0 && (
              <button onClick={() => setTab('insights')} style={{
                background: '#fff', borderRadius: 20, padding: '14px 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                animation: 'hiFadeIn 550ms ease', transition: 'transform 120ms ease',
              }}
              onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
              onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={{ width: 30, height: 30, borderRadius: 9, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <TrendingUp size={15} color="#D71920" />
                </div>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#444', lineHeight: 1.4 }}>{insights[0]}</span>
                <ChevronRight size={16} color="#ccc" />
              </button>
            )}
          </>
        )}

        {tab === 'body' && (
          <>
            {/* BODY EVOLUTION */}
            <div style={{ background: 'linear-gradient(135deg,#1A1A1A,#2A2A2A)', borderRadius: 20, padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>Body Evolution</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <p style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: 0 }}>{level}</p>
                {nextLevel && <ChevronRight size={14} color="rgba(255,255,255,0.4)" />}
                {nextLevel && <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{nextLevel}</p>}
              </div>
              {nextLevel ? (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0, fontWeight: 600 }}>
                  {daysToNext} day{daysToNext === 1 ? '' : 's'} of streak to reach {nextLevel}
                </p>
              ) : (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: 0, fontWeight: 600 }}>You've reached the highest level — Legend status.</p>
              )}
            </div>

            {/* WEIGHT PROGRESS */}
            <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Scale size={16} color="#D71920" />
                <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Weight Progress</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <StatBox label="Current" value={`${profile.weightKg}kg`} />
                <StatBox label="Ideal Range" value={`${min}-${max}kg`} />
                <StatBox label="Streak" value={`${streakDays}d`} icon={<Flame size={13} color="#F59E0B" />} />
              </div>
              <p style={{ fontSize: 10, color: '#bbb', margin: '10px 0 0' }}>Update your weight any time — BMI, protein goal, and health score recalculate automatically.</p>
            </div>

            {/* BMI — small section, not the focus */}
            <SectionCard title="Body Mass Index">
              <InfoRow label="BMI" value={`${profile.bmi} · ${status}`} highlight />
              <InfoRow label="Height" value={`${profile.heightCm} cm`} />
              <InfoRow label="Weight" value={`${profile.weightKg} kg`} />
              <InfoRow label="Activity Level" value={profile.activityLevel} />
              <InfoRow label="Member Since" value={memberSince} />
            </SectionCard>
          </>
        )}

        {tab === 'goals' && (
          <>
            {/* PROTEIN RECOMMENDATION */}
            <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Target size={16} color="#D71920" />
                <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Protein Recommendation</p>
              </div>
              <p style={{ fontSize: 30, fontWeight: 900, color: '#D71920', margin: '0 0 6px' }}>{profile.dailyProteinGoal}g <span style={{ fontSize: 13, fontWeight: 700, color: '#999' }}>/ day</span></p>
              <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px', lineHeight: 1.5 }}>
                Based on your weight ({profile.weightKg}kg) and activity level ({profile.activityLevel}).
                {remainingG > 0 ? ` You're ${remainingG}g away from today's target.` : ' Today\'s target is complete.'}
              </p>
              <div style={{ height: 8, background: '#F0F0F0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${consumedPct}%`, background: 'linear-gradient(90deg,#D71920,#B31217)', borderRadius: 12, transition: 'width 400ms ease' }} />
              </div>
              <p style={{ fontSize: 10, color: '#999', margin: '6px 0 10px', fontWeight: 600 }}>{consumedToday}g consumed today ({consumedPct}%)</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <StatBox label="Weekly Goal" value={`${profile.weeklyProteinGoal}g`} />
                <StatBox label="Monthly Goal" value={`${profile.monthlyProteinGoal}g`} />
                <StatBox label="Water Target" value={`${(profile.waterIntakeMl / 1000).toFixed(1)}L`} />
              </div>
            </div>

            {/* MOTIVATION METER */}
            <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Motivation</p>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#D71920' }}>{profile.motivation}%</span>
              </div>
              <div style={{ height: 8, background: '#F0F0F0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${profile.motivation}%`, background: 'linear-gradient(90deg,#F59E0B,#D71920)', borderRadius: 12, transition: 'width 400ms ease' }} />
              </div>
              <p style={{ fontSize: 10, color: '#999', margin: '8px 0 0' }}>Scan an SKM egg to recharge — never punished for a rest day.</p>
            </div>

            {/* Recommendation */}
            <div style={{ background: 'linear-gradient(135deg,#FFF7ED,#FEF2F2)', borderRadius: 20, padding: 18, border: '1px solid #FED7AA' }}>
              <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>Recommendation</p>
              <p style={{ fontSize: 12, color: '#666', margin: 0, lineHeight: 1.5 }}>{getRecommendation(status)}</p>
            </div>
          </>
        )}

        {tab === 'insights' && (
          <>
            <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 10px' }}>Nutrition Insights</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {insights.map((line, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', background: '#FAFAFA', borderRadius: 12 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 7, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <TrendingUp size={12} color="#D71920" />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#444', lineHeight: 1.5 }}>{line}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* TODAY'S EGG BENEFIT — also surfaced here for context */}
            <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', border: '1px solid #FCE8E8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {EGG_BENEFIT_ICON[eggBenefit.iconKey]}
                </div>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, color: '#D71920', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Today's Egg Benefit</p>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A', margin: '2px 0 0' }}>{eggBenefit.title}</p>
                </div>
              </div>
              <p style={{ fontSize: 12, color: '#666', margin: 0, lineHeight: 1.6 }}>{eggBenefit.body}</p>
            </div>
          </>
        )}

      </div>
      <style>{`
        @keyframes hiFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 14, border: '1.5px solid #E8E8E8',
  fontSize: 16, fontWeight: 700, color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
  background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff',
  fontWeight: 900, fontSize: 14,
};

const secondaryBtnStyle: React.CSSProperties = {
  flex: 1, padding: '14px 0', borderRadius: 14, border: '1.5px solid #E8E8E8',
  background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};

function WizardField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px' }}>{label}</h3>
      {hint && <p style={{ fontSize: 12, color: '#999', margin: '0 0 16px' }}>{hint}</p>}
      {!hint && <div style={{ marginBottom: 16 }} />}
      {children}
    </div>
  );
}

function SelectTile({ label, sub, active, onClick }: { label: string; sub?: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', gap: 2, width: '100%', textAlign: 'left',
      padding: '13px 16px', borderRadius: 14, cursor: 'pointer',
      border: active ? '2px solid #D71920' : '1.5px solid #E8E8E8',
      background: active ? '#FEF2F2' : '#fff',
    }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: active ? '#D71920' : '#1A1A1A' }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: '#999', fontWeight: 500 }}>{sub}</span>}
    </button>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
      <p style={{ fontSize: 10, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, padding: '14px 16px 8px', margin: 0 }}>{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #F5F5F5' }}>
      <span style={{ fontSize: 12, color: '#999', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: highlight ? '#D71920' : '#1A1A1A' }}>{value}</span>
    </div>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={{ flex: 1, background: '#F8F8F8', borderRadius: 14, padding: '10px 8px', textAlign: 'center' }}>
      {icon && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{icon}</div>}
      <p style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>{value}</p>
      <p style={{ fontSize: 8, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.3, margin: '3px 0 0' }}>{label}</p>
    </div>
  );
}
