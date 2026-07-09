import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  ChevronLeft, Wrench, Database, Bell, Egg, Coins, Flame, Calendar,
  Award, BookOpen, Ticket, Gift, Crown, Ruler, Target as TargetIcon,
  Trophy, RefreshCw,
} from 'lucide-react';
import {
  getDevEnvSnapshot, type DevEnvSnapshot,
  devAddProtein, devResetProtein,
  devAddPoints, devResetPoints,
  devAddStreak, devResetStreak,
  devCompleteCurrentWeek, devUnlockNextWeek, devResetWeekly,
  devUnlockNextSticker, devUnlockRarity, devUnlockAllStickers, devResetStickers,
  devCompleteCurrentPassport, devUnlockNextPassport, devCompleteAllPassports, devResetPassport,
  devNotify, devClearNotifications, devGenerateSampleNotifications,
  devGenerateCoupon, devExpireCoupons, devResetCoupons,
  devGenerateReward, devRedeemReward, devResetRewards,
  devSetMembership,
  devAddEggs, devResetEggs,
  devGenerateBmi, devResetBmi,
  devCompleteDailyGoal, devResetDailyGoal,
  devCompleteChallenge, devResetChallenges,
  devSyncUser, devReloadUser, devClearCache, devRefreshCatalog,
} from '../services/protein/devTestCenterService';
import { MEMBERSHIP_TIERS, type MembershipTier } from '../constants/rewards';
import type { Rarity } from '../services/protein/milestoneRewardService';

interface DevTestCenterScreenProps {
  user: User;
  onBack: () => void;
  onDataChanged?: () => void;
}

export default function DevTestCenterScreen({ user, onBack, onDataChanged }: DevTestCenterScreenProps) {
  const [env, setEnv] = useState<DevEnvSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const refreshEnv = useCallback(async () => {
    try {
      const snap = await getDevEnvSnapshot(user.uid, user.email);
      setEnv(snap);
    } catch (e) { console.error('[DevTestCenter]', e); }
  }, [user.uid, user.email]);

  useEffect(() => { refreshEnv(); }, [refreshEnv]);

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setStatusMsg(`Running: ${label}…`);
    try {
      await fn();
      setStatusMsg(`✅ ${label} done`);
      await refreshEnv();
      onDataChanged?.();
    } catch (e: unknown) {
      setStatusMsg(`❌ Error: ${(e as Error).message ?? String(e)}`);
    } finally {
      setBusy(false);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAFAFA' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(150deg,#7C3AED 0%,#6D28D9 55%,#4C1D95 100%)',
        padding: '18px 18px 20px', flexShrink: 0, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{
            width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ChevronLeft size={18} color="#fff" />
          </button>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wrench size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: 0 }}>Developer Test Center</h2>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: 0, fontWeight: 700 }}>Temporary — dev builds only</p>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 900, color: '#4C1D95', background: '#fff', borderRadius: 20,
            padding: '4px 9px', flexShrink: 0, letterSpacing: 0.5,
          }}>
            ACTIVE
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 90px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Dashboard ── */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>Dashboard</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <DashTile label="Version" value={env?.version ?? '—'} />
            <DashTile label="Environment" value={env?.environment ?? '—'} />
            <DashTile label="Database" value={env?.database ?? '—'} />
            <DashTile label="Notifications" value={env?.notification ?? '—'} />
            <DashTile label="Current Points" value={String(env?.currentPoints ?? 0)} highlight />
            <DashTile label="Membership" value={env?.membership ?? '—'} highlight />
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F5F5F5' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>{env?.userEmail ?? user.email}</p>
            <p style={{ fontSize: 9, color: '#bbb', margin: '2px 0 0', fontFamily: 'monospace' }}>{env?.userUid ?? user.uid}</p>
          </div>
        </div>

        {/* ── Status banner ── */}
        {statusMsg && (
          <div style={{
            background: statusMsg.startsWith('✅') ? '#F0FDF4' : statusMsg.startsWith('❌') ? '#FEF2F2' : '#F5F3FF',
            border: `1px solid ${statusMsg.startsWith('✅') ? '#86EFAC' : statusMsg.startsWith('❌') ? '#FECACA' : '#C4B5FD'}`,
            borderRadius: 12, padding: '10px 14px', fontSize: 12, fontWeight: 700,
            color: statusMsg.startsWith('✅') ? '#166534' : statusMsg.startsWith('❌') ? '#991B1B' : '#5B21B6',
            position: 'sticky', top: 0, zIndex: 5,
          }}>
            {statusMsg}
          </div>
        )}

        {/* ── Protein ── */}
        <DevSection title="Protein" icon={<Egg size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="🥚 +6g Protein" onClick={() => runAction('+6g Protein', () => devAddProtein(user.uid, 6))} />
          <DevBtn disabled={busy} label="🥚 +12g Protein" onClick={() => runAction('+12g Protein', () => devAddProtein(user.uid, 12))} />
          <DevBtn disabled={busy} label="🥚 +30g Protein" onClick={() => runAction('+30g Protein', () => devAddProtein(user.uid, 30))} />
          <DevBtn disabled={busy} label="🗑 Reset Protein" color="#EF4444" onClick={() => runAction('Reset Protein', () => devResetProtein(user.uid))} />
        </DevSection>

        {/* ── Reward Points ── */}
        <DevSection title="Reward Points" icon={<Coins size={14} color="#7C3AED" />}>
          {[10, 50, 100, 500, 1000].map(p => (
            <DevBtn key={p} disabled={busy} label={`🎁 +${p} Points`} onClick={() => runAction(`+${p} Points`, () => devAddPoints(user.uid, p))} />
          ))}
          <DevBtn disabled={busy} label="🗑 Reset Points" color="#EF4444" onClick={() => runAction('Reset Points', () => devResetPoints(user.uid))} />
        </DevSection>

        {/* ── Daily Streak ── */}
        <DevSection title="Daily Streak" icon={<Flame size={14} color="#7C3AED" />}>
          {[1, 7, 30, 100].map(d => (
            <DevBtn key={d} disabled={busy} label={`🔥 +${d} Day${d > 1 ? 's' : ''}`} onClick={() => runAction(`+${d} Streak Day(s)`, () => devAddStreak(user.uid, d))} />
          ))}
          <DevBtn disabled={busy} label="🗑 Reset Streak" color="#EF4444" onClick={() => runAction('Reset Streak', () => devResetStreak(user.uid))} />
        </DevSection>

        {/* ── Weekly Batch ── */}
        <DevSection title="Weekly Batch" icon={<Calendar size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="✅ Complete Current Week" onClick={() => runAction('Complete Current Week', () => devCompleteCurrentWeek(user.uid))} />
          <DevBtn disabled={busy} label="🔓 Unlock Next Week" onClick={() => runAction('Unlock Next Week', () => devUnlockNextWeek(user.uid))} />
          <DevBtn disabled={busy} label="🗑 Reset Weekly Progress" color="#EF4444" onClick={() => runAction('Reset Weekly Progress', () => devResetWeekly(user.uid))} />
        </DevSection>

        {/* ── Sticker Testing ── */}
        <DevSection title="Sticker Testing" icon={<Award size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="🏆 Unlock Next Sticker" onClick={() => runAction('Unlock Next Sticker', () => devUnlockNextSticker(user.uid))} />
          {(['Common', 'Rare', 'Epic', 'Legendary'] as Rarity[]).map(r => (
            <DevBtn key={r} disabled={busy} label={`⭐ Unlock All ${r}`} onClick={() => runAction(`Unlock All ${r}`, () => devUnlockRarity(user.uid, r))} />
          ))}
          <DevBtn disabled={busy} label="🪪 Unlock All Stickers" onClick={() => runAction('Unlock All Stickers', () => devUnlockAllStickers(user.uid))} />
          <DevBtn disabled={busy} label="🗑 Reset Sticker Collection" color="#EF4444" onClick={() => runAction('Reset Sticker Collection', () => devResetStickers(user.uid))} />
        </DevSection>

        {/* ── Passport ── */}
        <DevSection title="Passport" icon={<BookOpen size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="✅ Complete Current Passport" onClick={() => runAction('Complete Current Passport', () => devCompleteCurrentPassport(user.uid))} />
          <DevBtn disabled={busy} label="🔓 Unlock Next Passport" onClick={() => runAction('Unlock Next Passport', () => devUnlockNextPassport(user.uid))} />
          <DevBtn disabled={busy} label="🎉 Complete All" onClick={() => runAction('Complete All Passports', () => devCompleteAllPassports(user.uid))} />
          <DevBtn disabled={busy} label="🗑 Reset Passport" color="#EF4444" onClick={() => runAction('Reset Passport', () => devResetPassport(user.uid))} />
        </DevSection>

        {/* ── Notifications ── */}
        <DevSection title="Notifications" icon={<Bell size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="🛠 Send Test Notification" onClick={() => runAction('Test Notification', () => devNotify.test(user.uid))} />
          <DevBtn disabled={busy} label="👋 Send Welcome Notification" onClick={() => runAction('Welcome Notification', () => devNotify.welcome(user.uid))} />
          <DevBtn disabled={busy} label="🥚 Send Reminder Notification" onClick={() => runAction('Reminder Notification', () => devNotify.reminder(user.uid))} />
          <DevBtn disabled={busy} label="🎁 Send Reward Notification" onClick={() => runAction('Reward Notification', () => devNotify.reward(user.uid))} />
          <DevBtn disabled={busy} label="🎫 Send Coupon Notification" onClick={() => runAction('Coupon Notification', () => devNotify.coupon(user.uid))} />
          <DevBtn disabled={busy} label="⭐ Send Sticker Notification" onClick={() => runAction('Sticker Notification', () => devNotify.sticker(user.uid))} />
          <DevBtn disabled={busy} label="💪 Send Daily Goal Reminder" onClick={() => runAction('Daily Goal Reminder', () => devNotify.dailyGoal(user.uid))} />
          <DevBtn disabled={busy} label="✨ Generate Sample Notifications" onClick={() => runAction('Generate Sample Notifications', () => devGenerateSampleNotifications(user.uid))} />
          <DevBtn disabled={busy} label="🗑 Clear All Notifications" color="#EF4444" onClick={() => runAction('Clear All Notifications', () => devClearNotifications(user.uid))} />
        </DevSection>

        {/* ── Coupons ── */}
        <DevSection title="Coupons" icon={<Ticket size={14} color="#7C3AED" />}>
          {[10, 20, 50].map(v => (
            <DevBtn key={v} disabled={busy} label={`🎫 Generate ₹${v} Coupon`} onClick={() => runAction(`Generate ₹${v} Coupon`, () => devGenerateCoupon(user.uid, v))} />
          ))}
          <DevBtn disabled={busy} label="⏰ Expire Coupons" color="#EF4444" onClick={() => runAction('Expire Coupons', () => devExpireCoupons(user.uid))} />
          <DevBtn disabled={busy} label="🗑 Reset Coupons" color="#EF4444" onClick={() => runAction('Reset Coupons', () => devResetCoupons(user.uid))} />
        </DevSection>

        {/* ── Rewards ── */}
        <DevSection title="Rewards" icon={<Gift size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="🎁 Generate Reward" onClick={() => runAction('Generate Reward', () => devGenerateReward(user.uid))} />
          <DevBtn disabled={busy} label="✅ Redeem Reward" onClick={() => runAction('Redeem Reward', () => devRedeemReward(user.uid))} />
          <DevBtn disabled={busy} label="🗑 Reset Rewards" color="#EF4444" onClick={() => runAction('Reset Rewards', () => devResetRewards(user.uid))} />
        </DevSection>

        {/* ── Membership ── */}
        <DevSection title="Membership" icon={<Crown size={14} color="#7C3AED" />}>
          {MEMBERSHIP_TIERS.map(t => (
            <DevBtn
              key={t.tier}
              disabled={busy}
              label={`👑 ${t.tier}`}
              color={t.color}
              onClick={() => runAction(`Switch to ${t.tier}`, () => devSetMembership(user.uid, t.tier as MembershipTier))}
            />
          ))}
        </DevSection>

        {/* ── Egg Consumption ── */}
        <DevSection title="Egg Consumption" icon={<Egg size={14} color="#7C3AED" />}>
          {[1, 5, 10, 30].map(n => (
            <DevBtn key={n} disabled={busy} label={`🥚 +${n} Egg${n > 1 ? 's' : ''}`} onClick={() => runAction(`+${n} Egg(s)`, () => devAddEggs(user.uid, n))} />
          ))}
          <DevBtn disabled={busy} label="🗑 Reset Consumption" color="#EF4444" onClick={() => runAction('Reset Consumption', () => devResetEggs(user.uid))} />
        </DevSection>

        {/* ── BMI ── */}
        <DevSection title="BMI" icon={<Ruler size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="💚 Generate Healthy BMI" onClick={() => runAction('Generate Healthy BMI', async () => { await devGenerateBmi(user.uid, 'healthy'); })} />
          <DevBtn disabled={busy} label="🔵 Generate Underweight" onClick={() => runAction('Generate Underweight', async () => { await devGenerateBmi(user.uid, 'underweight'); })} />
          <DevBtn disabled={busy} label="🟠 Generate Overweight" onClick={() => runAction('Generate Overweight', async () => { await devGenerateBmi(user.uid, 'overweight'); })} />
          <DevBtn disabled={busy} label="🔴 Generate Obese" onClick={() => runAction('Generate Obese', async () => { await devGenerateBmi(user.uid, 'obese'); })} />
          <DevBtn disabled={busy} label="🗑 Reset BMI" color="#EF4444" onClick={() => runAction('Reset BMI', () => devResetBmi(user.uid))} />
        </DevSection>

        {/* ── Daily Goal ── */}
        <DevSection title="Daily Goal" icon={<TargetIcon size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="✅ Complete Daily Goal" onClick={() => runAction('Complete Daily Goal', () => devCompleteDailyGoal(user.uid))} />
          <DevBtn disabled={busy} label="🗑 Reset Daily Goal" color="#EF4444" onClick={() => runAction('Reset Daily Goal', () => devResetDailyGoal(user.uid))} />
        </DevSection>

        {/* ── Challenges ── */}
        <DevSection title="Challenges" icon={<Trophy size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="✅ Complete Daily Challenge" onClick={() => runAction('Complete Daily Challenge', () => devCompleteChallenge(user.uid, 'daily'))} />
          <DevBtn disabled={busy} label="✅ Complete Weekly Challenge" onClick={() => runAction('Complete Weekly Challenge', () => devCompleteChallenge(user.uid, 'weekly'))} />
          <DevBtn disabled={busy} label="✅ Complete Monthly Challenge" onClick={() => runAction('Complete Monthly Challenge', () => devCompleteChallenge(user.uid, 'monthly'))} />
          <DevBtn disabled={busy} label="🗑 Reset Challenges" color="#EF4444" onClick={() => runAction('Reset Challenges', () => devResetChallenges(user.uid))} />
        </DevSection>

        {/* ── Firestore ── */}
        <DevSection title="Firestore" icon={<Database size={14} color="#7C3AED" />}>
          <DevBtn disabled={busy} label="🔄 Sync User" onClick={() => runAction('Sync User', () => devSyncUser(user.uid))} />
          <DevBtn disabled={busy} label="🔄 Reload User" onClick={() => runAction('Reload User', () => devReloadUser(user.uid))} />
          <DevBtn disabled={busy} label="🔄 Clear Cache" onClick={() => runAction('Clear Cache', () => devClearCache(user.uid))} />
          <DevBtn disabled={busy} label="🔄 Refresh Rewards" onClick={() => runAction('Refresh Rewards', async () => { await devRefreshCatalog(); })} />
          <DevBtn disabled={busy} label="🔄 Refresh Stickers" onClick={() => runAction('Refresh Stickers', async () => { onDataChanged?.(); })} />
          <DevBtn disabled={busy} label="🔄 Refresh Passport" onClick={() => runAction('Refresh Passport', async () => { onDataChanged?.(); })} />
        </DevSection>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function DashTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: '#FAFAFA', borderRadius: 12, padding: '8px 10px' }}>
      <p style={{ fontSize: 8, fontWeight: 800, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 800, color: highlight ? '#7C3AED' : '#1A1A1A', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
    </div>
  );
}

function DevSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 18, border: '1.5px solid #EDE9FE', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: '#F9F7FF', borderBottom: '1px solid #EDE9FE' }}>
        {icon}
        <p style={{ fontSize: 12, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>{title}</p>
      </div>
      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function DevBtn({ label, onClick, disabled, color = '#7C3AED' }: { label: string; onClick: () => void; disabled?: boolean; color?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '11px 14px', borderRadius: 12,
        border: `1.5px solid ${color}33`,
        background: disabled ? '#F5F5F5' : `${color}10`,
        color: disabled ? '#bbb' : color,
        fontWeight: 700, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left', opacity: disabled ? 0.7 : 1,
        transition: 'background 120ms',
      }}
    >
      {label}
    </button>
  );
}
