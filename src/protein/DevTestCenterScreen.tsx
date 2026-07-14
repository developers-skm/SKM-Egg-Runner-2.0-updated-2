import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  ChevronLeft, Wrench, Database, Bell, Egg, Coins, Flame, Calendar,
  Award, BookOpen, Ticket, Gift, Crown, Ruler,
  RefreshCw, Search, ChevronDown, X, CheckCircle2, XCircle,
  AlertTriangle, User as UserIcon, BarChart3, Trash2, Heart, Sparkles,
} from 'lucide-react';
import {
  getDevEnvSnapshot, type DevEnvSnapshot,
  getDevDebugSnapshot, type DevDebugSnapshot,
  devAddProtein, devResetProtein, devSetCustomProtein,
  devAddPoints, devRemovePoints, devResetPoints, devGenerateRewardTransaction,
  devAddStreak, devResetStreak, devSetCustomStreak,
  devCompleteCurrentWeek, devResetWeekly,
  devUnlockNextSticker, devUnlockRarity, devUnlockAllStickers, devResetStickers,
  devPreviewStickerUnlock, devPreviewMembershipUpgrade, devPreviewRewardUnlock,
  devUnlockNextPassport, devCompleteAllPassports, devResetPassport,
  devNotify, devClearNotifications, devGenerateSampleNotifications,
  devMarkAllNotificationsRead, devNotifyWeeklyReminder, devNotifyDailyReminder,
  devGenerateCoupon, devExpireCoupons, devResetCoupons,
  devResetRewards,
  devRedeemCatalogItemNear, devRedeemFeaturedProduct, devRestoreMostRecentCoupon, devResetRedeemStore,
  devSetMembership,
  devResetEggs, devSetTodayEggs, devSimulateLifetimeEggs, devGenerate365DayHistory,
  devGenerateBmi, devResetBmi, devSetCustomBmi,
  devCompleteDailyGoal, devFailDailyGoal, devPerfectWeek, devPerfectMonth, devResetHealthProgress,
  devFillLast7Days, devFillLast30Days, devRandomHistory, devPerfectHistory, devBrokenStreakHistory, devResetHistory,
  devSetRandomAvatar, devSetRandomUsername, devResetProfile,
  devSyncUser, devReloadUser, devClearCache, devRefreshCatalog,
  devFactoryReset,
} from '../services/protein/devTestCenterService';
import { MEMBERSHIP_TIERS, type MembershipTier } from '../constants/rewards';
import type { Rarity } from '../services/protein/milestoneRewardService';

interface DevTestCenterScreenProps {
  user: User;
  onBack: () => void;
  onDataChanged?: () => void;
}

// ── Premium dark palette (red accents, per brief) ──────────────────
const DEV = {
  bg:        '#0F0D14',
  surface:   '#1A1721',
  surface2:  '#221E2B',
  border:    '#322C3C',
  text:      '#F3F1F7',
  textSoft:  '#9C94AE',
  textFaint: '#6B647A',
  red:       '#EF4444',
  redDeep:   '#DC2626',
  accent:    '#EF4444',
};

type ToastKind = 'success' | 'error' | 'info';
interface ToastState { kind: ToastKind; message: string; }

export default function DevTestCenterScreen({ user, onBack, onDataChanged }: DevTestCenterScreenProps) {
  const [env, setEnv] = useState<DevEnvSnapshot | null>(null);
  const [debug, setDebug] = useState<DevDebugSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [search, setSearch] = useState('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['User Progress', 'Debug Information']));
  const [confirmAction, setConfirmAction] = useState<{ label: string; danger: boolean; fn: () => Promise<void> } | null>(null);
  const [customStreak, setCustomStreak] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customBmi, setCustomBmi] = useState('');
  const [customPoints, setCustomPoints] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [snap, dbg] = await Promise.all([
        getDevEnvSnapshot(user.uid, user.email),
        getDevDebugSnapshot(user.uid),
      ]);
      setEnv(snap);
      setDebug(dbg);
    } catch (e) { console.error('[DevTestCenter]', e); }
  }, [user.uid, user.email]);

  useEffect(() => { refresh(); }, [refresh]);

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setToast({ kind: 'success', message: `${label} — done` });
      await refresh();
      onDataChanged?.();
    } catch (e: unknown) {
      setToast({ kind: 'error', message: `${label} failed: ${(e as Error).message ?? String(e)}` });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const requestConfirm = (label: string, danger: boolean, fn: () => Promise<void>) => {
    setConfirmAction({ label, danger, fn });
  };

  const toggleSection = (title: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  };

  const matches = (haystack: string) => search.trim() === '' || haystack.toLowerCase().includes(search.trim().toLowerCase());

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: DEV.bg }}>

      {/* ── Sticky header ── */}
      <div style={{
        background: `linear-gradient(150deg, ${DEV.redDeep} 0%, #7F1D1D 60%, ${DEV.bg} 130%)`,
        padding: '16px 16px 14px', flexShrink: 0, position: 'relative', overflow: 'hidden',
        borderBottom: `1px solid ${DEV.border}`,
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={onBack} style={{
            width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.12)', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ChevronLeft size={18} color="#fff" />
          </button>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wrench size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: 0 }}>Developer Test Center</h2>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: 0, fontWeight: 700 }}>Internal QA only — never shipped to production</p>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 900, color: DEV.redDeep, background: '#fff', borderRadius: 20,
            padding: '4px 9px', flexShrink: 0, letterSpacing: 0.5,
          }}>
            ACTIVE
          </span>
        </div>

        {/* Search bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.28)',
          borderRadius: 12, padding: '9px 12px',
        }}>
          <Search size={14} color="rgba(255,255,255,0.6)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search test sections…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff',
              fontSize: 12.5, fontWeight: 600,
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <X size={13} color="rgba(255,255,255,0.6)" />
            </button>
          )}
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && <Toast toast={toast} />}

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 90px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── Debug Information (live panel, always near top) ── */}
        {matches('debug information user id firestore status') && (
          <DebugPanel env={env} debug={debug} uid={user.uid} email={user.email} onRefresh={refresh} />
        )}

        {/* ── User Progress ── */}
        <DevSection title="User Progress" icon={<UserIcon size={14} color={DEV.accent} />} open={openSections.has('User Progress')} onToggle={() => toggleSection('User Progress')} visible={matches('user progress egg scan')}>
          {[1, 5, 10, 50, 100].map(n => (
            <DevBtn key={n} disabled={busy} label={`+${n} Egg Scan${n > 1 ? 's' : ''}`} onClick={() => runAction(`+${n} Egg Scan(s)`, () => devAddProtein(user.uid, n * 6))} />
          ))}
        </DevSection>

        {/* ── Streak Testing ── */}
        <DevSection title="Streak Testing" icon={<Flame size={14} color={DEV.accent} />} open={openSections.has('Streak Testing')} onToggle={() => toggleSection('Streak Testing')} visible={matches('streak testing weekly batch monthly')}>
          {[1, 7, 30, 60, 90, 180, 365].map(d => (
            <DevBtn key={d} disabled={busy} label={`+${d} Day${d > 1 ? 's' : ''}`} onClick={() => runAction(`+${d} Streak Day(s)`, () => devAddStreak(user.uid, d))} />
          ))}
          <CustomValueRow
            placeholder="Set custom streak (days)"
            value={customStreak}
            onChange={setCustomStreak}
            disabled={busy}
            onSubmit={() => {
              const n = parseInt(customStreak, 10);
              if (!Number.isFinite(n) || n < 0) return;
              runAction(`Set Streak to ${n}`, () => devSetCustomStreak(user.uid, n));
              setCustomStreak('');
            }}
          />
          <DevBtn disabled={busy} danger label="Reset Streak" onClick={() => requestConfirm('Reset Streak', true, () => devResetStreak(user.uid))} />
        </DevSection>

        {/* ── Protein Testing ── */}
        <DevSection title="Protein Testing" icon={<Egg size={14} color={DEV.accent} />} open={openSections.has('Protein Testing')} onToggle={() => toggleSection('Protein Testing')} visible={matches('protein testing daily weekly monthly goals insights')}>
          {[6, 12, 24, 60, 120].map(g => (
            <DevBtn key={g} disabled={busy} label={`+${g}g Protein`} onClick={() => runAction(`+${g}g Protein`, () => devAddProtein(user.uid, g))} />
          ))}
          <CustomValueRow
            placeholder="Set custom protein (g)"
            value={customProtein}
            onChange={setCustomProtein}
            disabled={busy}
            onSubmit={() => {
              const n = parseInt(customProtein, 10);
              if (!Number.isFinite(n) || n < 0) return;
              runAction(`Set Protein +${n}g`, () => devSetCustomProtein(user.uid, n));
              setCustomProtein('');
            }}
          />
          <DevBtn disabled={busy} danger label="Reset Protein" onClick={() => requestConfirm('Reset Protein', true, () => devResetProtein(user.uid))} />
        </DevSection>

        {/* ── Reward Testing ── */}
        <DevSection title="Reward Testing" icon={<Coins size={14} color={DEV.accent} />} open={openSections.has('Reward Testing')} onToggle={() => toggleSection('Reward Testing')} visible={matches('reward points wallet membership coupons store add remove generate transaction preview unlock animation')}>
          {[10, 25, 50, 100, 250, 500, 1000].map(p => (
            <DevBtn key={p} disabled={busy} label={`+${p} Points`} onClick={() => runAction(`+${p} Points`, () => devAddPoints(user.uid, p))} />
          ))}
          <CustomValueRow
            placeholder="Remove reward points"
            value={customPoints}
            onChange={setCustomPoints}
            disabled={busy}
            submitLabel="Remove"
            onSubmit={() => {
              const n = parseInt(customPoints, 10);
              if (!Number.isFinite(n) || n <= 0) return;
              runAction(`Remove ${n} Points`, () => devRemovePoints(user.uid, n));
              setCustomPoints('');
            }}
          />
          <DevBtn disabled={busy} label="Generate Reward Transaction" onClick={() => runAction('Generate Reward Transaction', () => devGenerateRewardTransaction(user.uid))} />
          <DevBtn disabled={busy} label="Preview Reward Unlock Animation" onClick={() => runAction('Preview Reward Unlock Animation', () => devPreviewRewardUnlock(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Reward Wallet" onClick={() => requestConfirm('Reset Reward Wallet', true, () => devResetPoints(user.uid))} />
        </DevSection>

        {/* ── Sticker Testing ── */}
        <DevSection title="Sticker Testing" icon={<Award size={14} color={DEV.accent} />} open={openSections.has('Sticker Testing')} onToggle={() => toggleSection('Sticker Testing')} visible={matches('sticker testing collection profile notifications reward progress preview unlock animation modal share flow')}>
          <DevBtn disabled={busy} label="Unlock Next Sticker" onClick={() => runAction('Unlock Next Sticker', () => devUnlockNextSticker(user.uid))} />
          {(['Common', 'Rare', 'Epic', 'Legendary'] as Rarity[]).map(r => (
            <DevBtn key={r} disabled={busy} label={`Unlock ${r}`} onClick={() => runAction(`Unlock All ${r}`, () => devUnlockRarity(user.uid, r))} />
          ))}
          <DevBtn disabled={busy} label="Unlock All Stickers" onClick={() => runAction('Unlock All Stickers', () => devUnlockAllStickers(user.uid))} />
          <DevBtn disabled={busy} label="Preview Sticker Unlock Animation" onClick={() => runAction('Preview Sticker Unlock Animation', () => devPreviewStickerUnlock(user.uid))} />
          <p style={{ fontSize: 10, color: DEV.textFaint, margin: '2px 0 4px', lineHeight: 1.5 }}>
            Preview Modal / Share Flow: open Profile → Sticker Collection → tap any unlocked sticker to view the real detail modal and its Share action.
          </p>
          <DevBtn disabled={busy} danger label="Reset Sticker Collection" onClick={() => requestConfirm('Reset Sticker Collection', true, () => devResetStickers(user.uid))} />
        </DevSection>

        {/* ── Membership Testing ── */}
        <DevSection title="Membership Testing" icon={<Crown size={14} color={DEV.accent} />} open={openSections.has('Membership Testing')} onToggle={() => toggleSection('Membership Testing')} visible={matches('membership testing bronze silver gold platinum diamond auto recalculate preview upgrade animation')}>
          {MEMBERSHIP_TIERS.map(t => (
            <DevBtn key={t.tier} disabled={busy} label={`Set ${t.tier}`} onClick={() => runAction(`Switch to ${t.tier}`, () => devSetMembership(user.uid, t.tier as MembershipTier))} />
          ))}
          <DevBtn disabled={busy} label="Auto Recalculate Membership" onClick={() => runAction('Recalculate Membership', () => devSyncUser(user.uid))} />
          <DevBtn disabled={busy} label="Preview Membership Upgrade Animation" onClick={() => runAction('Preview Membership Upgrade Animation', () => devPreviewMembershipUpgrade(user.uid))} />
        </DevSection>

        {/* ── Coupon Testing ── */}
        <DevSection title="Coupon Testing" icon={<Ticket size={14} color={DEV.accent} />} open={openSections.has('Coupon Testing')} onToggle={() => toggleSection('Coupon Testing')} visible={matches('coupon testing generate expire redeem reset')}>
          {[10, 20, 50].map(v => (
            <DevBtn key={v} disabled={busy} label={`Generate ₹${v} Coupon`} onClick={() => runAction(`Generate ₹${v} Coupon`, () => devGenerateCoupon(user.uid, v))} />
          ))}
          <DevBtn disabled={busy} label="Generate All Coupons" onClick={() => runAction('Generate All Coupons', async () => { await devGenerateCoupon(user.uid, 10); await devGenerateCoupon(user.uid, 20); await devGenerateCoupon(user.uid, 50); })} />
          <DevBtn disabled={busy} danger label="Expire All Coupons" onClick={() => requestConfirm('Expire All Coupons', false, () => devExpireCoupons(user.uid))} />
          <DevBtn disabled={busy} label="Redeem Coupon" onClick={() => runAction('Redeem Coupon', async () => { await devRedeemCatalogItemNear(user.uid, 10); })} />
          <DevBtn disabled={busy} danger label="Reset Coupons" onClick={() => requestConfirm('Reset Coupons', true, () => devResetCoupons(user.uid))} />
        </DevSection>

        {/* ── Notifications ── */}
        <DevSection title="Notifications" icon={<Bell size={14} color={DEV.accent} />} open={openSections.has('Notifications')} onToggle={() => toggleSection('Notifications')} visible={matches('notifications create scan reward sticker membership coupon reminder weekly daily clear mark read')}>
          <DevBtn disabled={busy} label="Create Scan Notification" onClick={() => runAction('Create Scan Notification', () => devNotify.welcome(user.uid))} />
          <DevBtn disabled={busy} label="Create Reward Notification" onClick={() => runAction('Create Reward Notification', () => devNotify.reward(user.uid))} />
          <DevBtn disabled={busy} label="Create Sticker Notification" onClick={() => runAction('Create Sticker Notification', () => devNotify.sticker(user.uid))} />
          <DevBtn disabled={busy} label="Create Membership Notification" onClick={() => runAction('Create Membership Notification', () => devNotify.test(user.uid))} />
          <DevBtn disabled={busy} label="Create Coupon Notification" onClick={() => runAction('Create Coupon Notification', () => devNotify.coupon(user.uid))} />
          <DevBtn disabled={busy} label="Create Reminder Notification" onClick={() => runAction('Create Reminder Notification', () => devNotify.reminder(user.uid))} />
          <DevBtn disabled={busy} label="Create Weekly Reminder" onClick={() => runAction('Create Weekly Reminder', () => devNotifyWeeklyReminder(user.uid))} />
          <DevBtn disabled={busy} label="Create Daily Reminder" onClick={() => runAction('Create Daily Reminder', () => devNotifyDailyReminder(user.uid))} />
          <DevBtn disabled={busy} label="Generate Sample Set" onClick={() => runAction('Generate Sample Notifications', () => devGenerateSampleNotifications(user.uid))} />
          <DevBtn disabled={busy} label="Mark All Read" onClick={() => runAction('Mark All Notifications Read', () => devMarkAllNotificationsRead(user.uid))} />
          <DevBtn disabled={busy} danger label="Clear Notifications" onClick={() => requestConfirm('Clear All Notifications', true, () => devClearNotifications(user.uid))} />
        </DevSection>

        {/* ── BMI ── */}
        <DevSection title="BMI" icon={<Ruler size={14} color={DEV.accent} />} open={openSections.has('BMI')} onToggle={() => toggleSection('BMI')} visible={matches('bmi health intelligence recommendations insights athlete')}>
          <DevBtn disabled={busy} label="Healthy" onClick={() => runAction('Generate Healthy BMI', async () => { await devGenerateBmi(user.uid, 'healthy'); })} />
          <DevBtn disabled={busy} label="Underweight" onClick={() => runAction('Generate Underweight BMI', async () => { await devGenerateBmi(user.uid, 'underweight'); })} />
          <DevBtn disabled={busy} label="Overweight" onClick={() => runAction('Generate Overweight BMI', async () => { await devGenerateBmi(user.uid, 'overweight'); })} />
          <DevBtn disabled={busy} label="Obese" onClick={() => runAction('Generate Obese BMI', async () => { await devGenerateBmi(user.uid, 'obese'); })} />
          <DevBtn disabled={busy} label="Athlete" onClick={() => runAction('Generate Athlete BMI', async () => { await devGenerateBmi(user.uid, 'athlete'); })} />
          <CustomValueRow
            placeholder="Set custom BMI"
            value={customBmi}
            onChange={setCustomBmi}
            disabled={busy}
            onSubmit={() => {
              const n = parseFloat(customBmi);
              if (!Number.isFinite(n) || n <= 0) return;
              runAction(`Set BMI to ${n}`, async () => { await devSetCustomBmi(user.uid, n); });
              setCustomBmi('');
            }}
          />
          <DevBtn disabled={busy} danger label="Reset BMI" onClick={() => requestConfirm('Reset BMI', true, () => devResetBmi(user.uid))} />
        </DevSection>

        {/* ── Health Testing ── */}
        <DevSection title="Health Testing" icon={<Heart size={14} color={DEV.accent} />} open={openSections.has('Health Testing')} onToggle={() => toggleSection('Health Testing')} visible={matches('health testing daily goal complete fail perfect week month reset progress')}>
          <DevBtn disabled={busy} label="Complete Daily Goal" onClick={() => runAction('Complete Daily Goal', () => devCompleteDailyGoal(user.uid))} />
          <DevBtn disabled={busy} label="Fail Daily Goal" onClick={() => runAction('Fail Daily Goal', () => devFailDailyGoal(user.uid))} />
          <DevBtn disabled={busy} label="Perfect Week" onClick={() => runAction('Perfect Week', () => devPerfectWeek(user.uid))} />
          <DevBtn disabled={busy} label="Perfect Month" onClick={() => runAction('Perfect Month', () => devPerfectMonth(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Health Progress" onClick={() => requestConfirm('Reset Health Progress', true, () => devResetHealthProgress(user.uid))} />
        </DevSection>

        {/* ── Weekly Batch ── */}
        <DevSection title="Weekly Batch" icon={<Calendar size={14} color={DEV.accent} />} open={openSections.has('Weekly Batch')} onToggle={() => toggleSection('Weekly Batch')} visible={matches('weekly batch complete week month all preview completion animation')}>
          <DevBtn disabled={busy} label="Complete Current Week" onClick={() => runAction('Complete Current Week', () => devCompleteCurrentWeek(user.uid))} />
          <DevBtn disabled={busy} label="Complete Current Month" onClick={() => runAction('Complete Current Month', async () => { for (let i = 0; i < 4; i++) await devCompleteCurrentWeek(user.uid); })} />
          <DevBtn disabled={busy} label="Complete All Weekly Batches" onClick={() => runAction('Complete All Weekly Batches', async () => { for (let i = 0; i < 12; i++) await devCompleteCurrentWeek(user.uid); })} />
          <DevBtn disabled={busy} label="Preview Weekly Completion Animation" onClick={() => runAction('Preview Weekly Completion Animation', () => devCompleteCurrentWeek(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Weekly Batches" onClick={() => requestConfirm('Reset Weekly Batches', true, () => devResetWeekly(user.uid))} />
        </DevSection>

        {/* ── 30-Day History Testing ── */}
        <DevSection title="30-Day History Testing" icon={<Sparkles size={14} color={DEV.accent} />} open={openSections.has('30-Day History Testing')} onToggle={() => toggleSection('30-Day History Testing')} visible={matches('30-day history testing fill last random perfect broken streak reset')}>
          <DevBtn disabled={busy} label="Fill Last 7 Days" onClick={() => runAction('Fill Last 7 Days', () => devFillLast7Days(user.uid))} />
          <DevBtn disabled={busy} label="Fill Last 30 Days" onClick={() => runAction('Fill Last 30 Days', () => devFillLast30Days(user.uid))} />
          <DevBtn disabled={busy} label="Random History" onClick={() => runAction('Random History', () => devRandomHistory(user.uid))} />
          <DevBtn disabled={busy} label="Perfect History" onClick={() => runAction('Perfect History', () => devPerfectHistory(user.uid))} />
          <DevBtn disabled={busy} label="Broken Streak" onClick={() => runAction('Broken Streak', () => devBrokenStreakHistory(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset History" onClick={() => requestConfirm('Reset History', true, () => devResetHistory(user.uid))} />
        </DevSection>

        {/* ── Redeem Store Testing ── */}
        <DevSection title="Redeem Store Testing" icon={<Gift size={14} color={DEV.accent} />} open={openSections.has('Redeem Store Testing')} onToggle={() => toggleSection('Redeem Store Testing')} visible={matches('redeem store testing unlock products generate discount redeem restore reset')}>
          <DevBtn disabled={busy} label="Unlock Products" onClick={() => runAction('Unlock Products', async () => { await devRefreshCatalog(); })} />
          <DevBtn disabled={busy} label="Generate Discount" onClick={() => runAction('Generate Discount', () => devGenerateCoupon(user.uid, 15))} />
          <DevBtn disabled={busy} label="Redeem Product" onClick={() => runAction('Redeem Product', async () => { await devRedeemFeaturedProduct(user.uid); })} />
          <DevBtn disabled={busy} label="Restore Product" onClick={() => runAction('Restore Most Recent Coupon', () => devRestoreMostRecentCoupon(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Redeem Store" onClick={() => requestConfirm('Reset Redeem Store', true, () => devResetRedeemStore(user.uid))} />
        </DevSection>

        {/* ── Passport ── */}
        <DevSection title="Passport Testing" icon={<BookOpen size={14} color={DEV.accent} />} open={openSections.has('Passport Testing')} onToggle={() => toggleSection('Passport Testing')} visible={matches('passport testing unlock stamp complete reset')}>
          <DevBtn disabled={busy} label="Unlock Stamp" onClick={() => runAction('Unlock Next Passport Stamp', () => devUnlockNextPassport(user.uid))} />
          <DevBtn disabled={busy} label="Complete Passport" onClick={() => runAction('Complete Passport', () => devCompleteAllPassports(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Passport" onClick={() => requestConfirm('Reset Passport', true, () => devResetPassport(user.uid))} />
        </DevSection>

        {/* ── Profile Testing ── */}
        <DevSection title="Profile Testing" icon={<UserIcon size={14} color={DEV.accent} />} open={openSections.has('Profile Testing')} onToggle={() => toggleSection('Profile Testing')} visible={matches('profile testing change avatar random username reset')}>
          <DevBtn disabled={busy} label="Change Avatar" onClick={() => runAction('Change Avatar', () => devSetRandomAvatar(user.uid))} />
          <DevBtn disabled={busy} label="Random Avatar" onClick={() => runAction('Random Avatar', () => devSetRandomAvatar(user.uid))} />
          <DevBtn disabled={busy} label="Random Username" onClick={() => runAction('Random Username', () => devSetRandomUsername(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Profile" onClick={() => requestConfirm('Reset Profile', true, () => devResetProfile(user.uid))} />
        </DevSection>

        {/* ── Statistics ── */}
        <DevSection title="Statistics" icon={<BarChart3 size={14} color={DEV.accent} />} open={openSections.has('Statistics')} onToggle={() => toggleSection('Statistics')} visible={matches('statistics eggs history activity timeline')}>
          <DevBtn disabled={busy} label="100 Eggs Today" onClick={() => runAction('Set 100 Eggs Today', () => devSetTodayEggs(user.uid, 100))} />
          <DevBtn disabled={busy} label="1000 Eggs" onClick={() => runAction('Simulate 1000 Lifetime Eggs', () => devSimulateLifetimeEggs(user.uid, 1000))} />
          <DevBtn disabled={busy} label="365 Day History" onClick={() => runAction('Generate 365-Day History', () => devGenerate365DayHistory(user.uid))} />
          <DevBtn disabled={busy} label="Generate Activity Timeline" onClick={() => runAction('Generate Activity Timeline', () => devGenerateSampleNotifications(user.uid))} />
        </DevSection>

        {/* ── Data Reset ── */}
        <DevSection title="Data Reset" icon={<Trash2 size={14} color={DEV.accent} />} open={openSections.has('Data Reset')} onToggle={() => toggleSection('Data Reset')} visible={matches('data reset factory dashboard')}>
          <DevBtn disabled={busy} danger label="Reset Rewards" onClick={() => requestConfirm('Reset Rewards', true, () => devResetRewards(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Streak" onClick={() => requestConfirm('Reset Streak', true, () => devResetStreak(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Protein" onClick={() => requestConfirm('Reset Protein', true, () => devResetProtein(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Coupons" onClick={() => requestConfirm('Reset Coupons', true, () => devResetCoupons(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Stickers" onClick={() => requestConfirm('Reset Stickers', true, () => devResetStickers(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Membership" onClick={() => requestConfirm('Reset Membership (→ Bronze)', true, () => devSetMembership(user.uid, 'Bronze'))} />
          <DevBtn disabled={busy} danger label="Reset Notifications" onClick={() => requestConfirm('Reset Notifications', true, () => devClearNotifications(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Weekly Batches" onClick={() => requestConfirm('Reset Weekly Batches', true, () => devResetWeekly(user.uid))} />
          <DevBtn disabled={busy} danger label="Reset Dashboard" onClick={() => requestConfirm('Reset Dashboard (Eggs, Protein, Streak)', true, async () => { await devResetEggs(user.uid); await devResetProtein(user.uid); await devResetStreak(user.uid); })} />
          <DevBtn disabled={busy} danger label="Factory Reset (Everything)" onClick={() => requestConfirm('Factory Reset — wipes ALL dev test data for this account', true, () => devFactoryReset(user.uid))} />
        </DevSection>

        {/* ── Firestore ── */}
        <DevSection title="Firestore" icon={<Database size={14} color={DEV.accent} />} open={openSections.has('Firestore')} onToggle={() => toggleSection('Firestore')} visible={matches('firestore sync reload cache refresh')}>
          <DevBtn disabled={busy} label="Sync User" onClick={() => runAction('Sync User', () => devSyncUser(user.uid))} />
          <DevBtn disabled={busy} label="Reload User" onClick={() => runAction('Reload User', () => devReloadUser(user.uid))} />
          <DevBtn disabled={busy} label="Clear Cache" onClick={() => runAction('Clear Cache', () => devClearCache(user.uid))} />
          <DevBtn disabled={busy} label="Refresh Catalog" onClick={() => runAction('Refresh Rewards Catalog', async () => { await devRefreshCatalog(); })} />
        </DevSection>

      </div>

      {/* ── Confirmation dialog ── */}
      {confirmAction && (
        <ConfirmDialog
          label={confirmAction.label}
          danger={confirmAction.danger}
          onConfirm={() => { const a = confirmAction; setConfirmAction(null); runAction(a.label, a.fn); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      <style>{`
        @keyframes devToastIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes devSpin { to { transform: rotate(360deg); } }
        @keyframes devPopIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function Toast({ toast }: { toast: ToastState }) {
  const meta: Record<ToastKind, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
    success: { bg: 'rgba(22,163,74,0.15)', border: '#16A34A', color: '#4ADE80', icon: <CheckCircle2 size={14} color="#4ADE80" /> },
    error:   { bg: 'rgba(239,68,68,0.15)', border: DEV.red, color: '#FCA5A5', icon: <XCircle size={14} color="#FCA5A5" /> },
    info:    { bg: 'rgba(148,163,184,0.15)', border: '#64748B', color: '#CBD5E1', icon: <AlertTriangle size={14} color="#CBD5E1" /> },
  };
  const m = meta[toast.kind];
  return (
    <div style={{
      margin: '10px 14px 0', padding: '10px 14px', borderRadius: 12,
      background: m.bg, border: `1px solid ${m.border}`,
      display: 'flex', alignItems: 'center', gap: 8,
      animation: 'devToastIn 200ms ease',
    }}>
      {m.icon}
      <span style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{toast.message}</span>
    </div>
  );
}

function ConfirmDialog({ label, danger, onConfirm, onCancel }: { label: string; danger: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 360, background: DEV.surface, borderRadius: 20, padding: 22,
        border: `1px solid ${DEV.border}`, animation: 'devPopIn 200ms cubic-bezier(0.34,1.4,0.64,1)',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: 'rgba(239,68,68,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
        }}>
          <AlertTriangle size={20} color={DEV.red} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 800, color: DEV.text, margin: '0 0 6px' }}>Confirm Action</p>
        <p style={{ fontSize: 12.5, color: DEV.textSoft, margin: '0 0 20px', lineHeight: 1.6 }}>
          {label}. This action calls real production write paths — proceed?
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px 0', borderRadius: 12, border: `1px solid ${DEV.border}`,
            background: 'none', color: DEV.textSoft, fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
            background: danger ? `linear-gradient(135deg, ${DEV.red}, ${DEV.redDeep})` : `linear-gradient(135deg, #7C3AED, #6D28D9)`,
            color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
          }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function DebugPanel({ env, debug, uid, email, onRefresh }: {
  env: DevEnvSnapshot | null;
  debug: DevDebugSnapshot | null;
  uid: string;
  email: string | null;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: DEV.surface, borderRadius: 18, border: `1px solid ${DEV.border}`, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
        background: DEV.surface2, border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <Database size={14} color={DEV.accent} />
        <p style={{ fontSize: 12, fontWeight: 900, color: DEV.text, margin: 0, flex: 1 }}>Debug Information</p>
        <button
          onClick={e => { e.stopPropagation(); onRefresh(); }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}
        >
          <RefreshCw size={13} color={DEV.textSoft} />
        </button>
        <ChevronDown size={14} color={DEV.textSoft} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
      </button>
      {open && (
        <div style={{ padding: '12px 14px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <DebugTile label="User ID" value={uid.slice(0, 12) + '…'} mono />
            <DebugTile label="Email" value={email ?? '—'} />
            <DebugTile label="Developer Mode" value="ON" highlight />
            <DebugTile label="Membership" value={debug?.membership ?? '—'} highlight />
            <DebugTile label="Reward Points" value={String(debug?.rewardPoints ?? 0)} highlight />
            <DebugTile label="Lifetime Points" value={String(debug?.lifetimePoints ?? 0)} />
            <DebugTile label="Current Streak" value={`${debug?.currentStreak ?? 0}d`} />
            <DebugTile label="Best Streak" value={`${debug?.bestStreak ?? 0}d`} />
            <DebugTile label="Protein Today" value={`${debug?.proteinToday ?? 0}g`} />
            <DebugTile label="Eggs Today" value={String(debug?.eggsToday ?? 0)} />
            <DebugTile label="Weekly Progress" value={`${debug?.weeklyBatchProgress ?? 0}/7 (Wk ${debug?.weeklyBatchNumber ?? 1})`} />
            <DebugTile label="30-Day History" value={`${debug?.historyDaysRecorded ?? 0}/30 days`} />
            <DebugTile label="Sticker Count" value={`${debug?.stickerCount ?? 0}/${debug?.stickerTotal ?? 8}`} />
            <DebugTile label="Coupons" value={`${debug?.availableCouponCount ?? 0} avail / ${debug?.couponCount ?? 0} total`} />
            <DebugTile label="Notification Count" value={String(debug?.notificationCount ?? 0)} />
            <DebugTile label="BMI" value={debug?.bmi != null ? debug.bmi.toFixed(1) : '—'} />
            <DebugTile label="Health Score" value={debug?.healthScore != null ? String(debug.healthScore) : '—'} />
            <DebugTile
              label="Reward Wallet Status"
              value={debug?.rewardWalletStatus === 'ok' ? 'OK' : 'Missing'}
              status={debug?.rewardWalletStatus === 'ok' ? 'connected' : 'error'}
            />
            <DebugTile
              label="Firestore Status"
              value={debug?.firestoreStatus === 'connected' ? 'Connected' : 'Error'}
              status={debug?.firestoreStatus}
            />
            <DebugTile label="Last Sync Time" value={debug?.lastSyncTime ?? '—'} />
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${DEV.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <DebugTile label="Build" value={env?.environment ?? '—'} />
            <DebugTile label="Version" value={env?.version ?? '—'} />
            <DebugTile label="Notify Server" value={env?.notification ?? '—'} />
          </div>
        </div>
      )}
    </div>
  );
}

function DebugTile({ label, value, highlight, mono, status }: { label: string; value: string; highlight?: boolean; mono?: boolean; status?: 'connected' | 'error' }) {
  const statusColor = status === 'connected' ? '#4ADE80' : status === 'error' ? DEV.red : undefined;
  return (
    <div style={{ background: DEV.surface2, borderRadius: 10, padding: '8px 10px' }}>
      <p style={{ fontSize: 8, fontWeight: 800, color: DEV.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{label}</p>
      <p style={{
        fontSize: 12, fontWeight: 800, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: statusColor ?? (highlight ? DEV.accent : DEV.text),
        fontFamily: mono ? 'monospace' : undefined,
      }}>
        {value}
      </p>
    </div>
  );
}

function DevSection({ title, icon, children, open, onToggle, visible }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; open: boolean; onToggle: () => void; visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div style={{ background: DEV.surface, borderRadius: 18, border: `1px solid ${DEV.border}`, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
        background: DEV.surface2, border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        {icon}
        <p style={{ fontSize: 12, fontWeight: 900, color: DEV.text, margin: 0, flex: 1 }}>{title}</p>
        <ChevronDown size={14} color={DEV.textSoft} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
      </button>
      {open && (
        <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function DevBtn({ label, onClick, disabled, danger }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  const color = danger ? DEV.red : DEV.accent;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '11px 14px', borderRadius: 12,
        border: `1px solid ${color}44`,
        background: disabled ? 'rgba(255,255,255,0.03)' : `${color}14`,
        color: disabled ? DEV.textFaint : color,
        fontWeight: 700, fontSize: 12.5, cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left', opacity: disabled ? 0.6 : 1,
        transition: 'background 120ms',
      }}
    >
      {label}
    </button>
  );
}

function CustomValueRow({ placeholder, value, onChange, onSubmit, disabled, submitLabel = 'Set' }: {
  placeholder: string; value: string; onChange: (v: string) => void; onSubmit: () => void; disabled?: boolean; submitLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1, padding: '10px 12px', borderRadius: 12, border: `1px solid ${DEV.border}`,
          background: DEV.surface2, color: DEV.text, fontSize: 12, outline: 'none',
        }}
      />
      <button
        onClick={onSubmit}
        disabled={disabled || value.trim() === ''}
        style={{
          padding: '0 16px', borderRadius: 12, border: 'none',
          background: disabled || value.trim() === '' ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${DEV.accent}, ${DEV.redDeep})`,
          color: disabled || value.trim() === '' ? DEV.textFaint : '#fff',
          fontWeight: 800, fontSize: 12, cursor: disabled || value.trim() === '' ? 'not-allowed' : 'pointer',
        }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
