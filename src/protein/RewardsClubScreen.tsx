import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { User } from 'firebase/auth';
import QRCode from 'qrcode';
import {
  ChevronLeft, Gift, Coins, Crown, Ticket, TrendingUp, ShieldCheck,
  Clock, CheckCircle2, XCircle, Flame, Award, Sparkles, ChevronRight,
  Egg, Lock, Zap, ArrowRight, QrCode, Dumbbell, Timer, PartyPopper,
  Share2, Copy, Info, X, Gem, Star,
} from 'lucide-react';
import {
  getRewardWallet, calcTierProgress, type RewardWallet,
} from '../services/protein/rewardWalletService';
import {
  getRecentRewardTransactions, type RewardTransaction,
} from '../services/protein/rewardTransactionService';
import {
  getRewardCatalog, redeemReward, getUserCoupons, markCouponUsed,
  buildRequirementProgress, allRequirementsMet, overallRequirementPct,
  type RewardCatalogItem, type RewardCoupon, type CouponStatus, type RequirementProgress,
} from '../services/protein/rewardCouponService';
import { getTodayStats, getLifetimeEggScanCount, getStreakInfo } from '../services/protein/proteinTrackerService';
import { getActivePromoEvent, type PromoEvent } from '../services/protein/promoEventService';
import {
  getActiveCampaign, getUpcomingCampaign, checkAndRotateCampaign, getCampaignHistory,
  buildCampaignProgress, campaignCompletionPct, campaignTimeRemainingMs,
  type RewardCampaign, type CampaignHistoryEntry, type ObjectiveProgress,
} from '../services/protein/rewardCampaignService';
import { notifyCampaignStarted, notifyCampaignEndingSoon, notifyCampaignCompleted } from '../services/notifications/notificationService';
import { MEMBERSHIP_TIERS, POINTS_PER_SCAN, type MembershipTier } from '../constants/rewards';
import { useNavigation, type NavTarget } from '../context/NavigationContext';
import HighlightCard from './HighlightCard';
import RewardsTabSwitcher from './rewards/RewardsTabSwitcher';
import StatusBadge from './rewards/StatusBadge';
import PointsProgressBar from './rewards/PointsProgressBar';
import RewardProgressRow from './rewards/RewardProgressRow';
import MembershipTierCard from './rewards/MembershipTierCard';
import { HapticService } from '../services/audio/hapticService';
import { getGameStats, type GameStage } from '../services/game/gameStatsService';


interface RewardsClubScreenProps {
  user: User;
  onBack: () => void;
  onScanQR?: () => void;
  /** Navigates to the existing Egg Runner Home screen (main.tsx setScreen('GAME')) — never launches gameplay directly. */
  onPlayGame?: () => void;
  /** Set by ProteinTrackerScreen when a tapped notification targets this screen. */
  navTarget?: NavTarget | null;
}

type HubTab = 'overview' | 'rewards' | 'coupons' | 'history';
type CouponFilterTab = 'available' | 'used' | 'expired';

const HUB_TABS: { key: HubTab; label: string }[] = [
  { key: 'overview', label: 'Home' },
  { key: 'rewards',  label: 'Rewards' },
  { key: 'coupons',  label: 'Coupons' },
  { key: 'history',  label: 'History' },
];

// ── Premium warm-neutral palette — deep burgundy/refined red as primary,
// warm gold reserved for reward accents only, generous off-white surfaces.
// Same key names as before so every existing PALETTE.x usage in this file
// picks up the new values automatically. ──
const PALETTE = {
  cream:       '#F8F6F2', // page background
  eggshell:    '#FFF8F3', // warm surface (secondary cards, chips)
  warmWhite:   '#FFFFFF', // primary surface
  gold:        '#C98A2E', // reward gold accent
  goldDeep:    '#A6721F',
  lightOrange: '#E86A33', // accent (used sparingly — CTAs/highlights, not backgrounds)
  ink:         '#241A17', // text primary
  inkSoft:     '#74645E', // text secondary
  red:         '#B42318', // primary
  redDeep:     '#7A1F17', // primary dark
  border:      '#E9DED8',
  success:     '#2E7D5B',
};

// ── Egg-range visual identity (icon-based product art — no stock photos in repo) ──
const RANGE_THEME: Record<string, { color: string; color2: string; label: string }> = {
  'SKM Best Fresh': { color: '#C4290D', color2: '#951F0A', label: 'Fresh' },
  'SKM Best Plus':  { color: '#C9974A', color2: '#A9782F', label: 'Plus' },
  'SKM Best Brown': { color: '#92400E', color2: '#78350F', label: 'Brown' },
  'Premium Range':  { color: '#7C3AED', color2: '#5B21B6', label: 'Premium' },
};
function rangeTheme(range: string) {
  return RANGE_THEME[range] ?? { color: '#C4290D', color2: '#951F0A', label: range };
}

const TIER_ICON_COLOR: Record<MembershipTier, string> = {
  Bronze: '#A16207', Silver: '#94A3B8', Gold: '#D97706', Platinum: '#0EA5E9', Diamond: '#7C3AED',
};

/** Smoothly counts up to `target` whenever it changes. */
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

/** Ticks every second until `target` (Date) is reached; returns remaining ms (never negative). */
function useCountdown(target: Date): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, target.getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, target.getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [target]);
  return remaining;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Breaks a countdown into Days/Hours/Minutes/Seconds for the large digit-box display. */
function splitCountdownParts(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return {
    days:    Math.floor(totalSec / 86400),
    hours:   Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

export default function RewardsClubScreen({ user, onBack, onScanQR, onPlayGame, navTarget }: RewardsClubScreenProps) {
  const { consumeTarget } = useNavigation();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HubTab>('overview');
  const [wallet, setWallet] = useState<RewardWallet | null>(null);
  const [catalog, setCatalog] = useState<RewardCatalogItem[]>([]);
  const [coupons, setCoupons] = useState<RewardCoupon[]>([]);
  const [transactions, setTransactions] = useState<RewardTransaction[]>([]);
  const [todayEggs, setTodayEggs] = useState(0);
  const [todayProtein, setTodayProtein] = useState(0);
  const [todayGoal, setTodayGoal] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [couponFilter, setCouponFilter] = useState<CouponFilterTab>('available');
  const [highestStage, setHighestStage] = useState<GameStage>('EGG');
  const [lifetimeEggScans, setLifetimeEggScans] = useState(0);
  const [currentProteinStreak, setCurrentProteinStreak] = useState(0);
  const [activeCampaign, setActiveCampaign] = useState<RewardCampaign | null>(null);
  const [upcomingCampaign, setUpcomingCampaign] = useState<RewardCampaign | null>(null);
  const [campaignHistory, setCampaignHistory] = useState<CampaignHistoryEntry[]>([]);

  const [confirmItem, setConfirmItem] = useState<RewardCatalogItem | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemErr, setRedeemErr] = useState('');
  const [successCoupon, setSuccessCoupon] = useState<RewardCoupon | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, cat, cp, tx, today, gameStats, eggScans, streak, campaign] = await Promise.all([
        getRewardWallet(user.uid),
        getRewardCatalog(),
        getUserCoupons(user.uid),
        getRecentRewardTransactions(user.uid, 30),
        getTodayStats(user.uid),
        getGameStats(user.uid),
        getLifetimeEggScanCount(user.uid),
        getStreakInfo(user.uid),
        getActiveCampaign(),
      ]);
      setWallet(w); setCatalog(cat); setCoupons(cp); setTransactions(tx);
      setTodayEggs(today?.totalEggs ?? 0);
      setTodayProtein(today?.totalProtein ?? 0);
      setTodayGoal(today?.goal ?? 0);
      setHighestStage(gameStats.highestStage);
      setLifetimeEggScans(eggScans);
      setCurrentProteinStreak(streak.currentStreak);

      // ── Seasonal campaign rotation — lazy, client-side, mirrors coupon expiry ──
      let effectiveCampaign = campaign;
      if (campaign) {
        const progressCtx = {
          lifetimeEggScans: eggScans, currentPoints: w.currentPoints, highestStage: gameStats.highestStage,
          currentProteinStreak: streak.currentStreak, lifetimeFoodLogs: eggScans,
        };
        const progress = buildCampaignProgress(campaign, progressCtx);
        const pct = campaignCompletionPct(progress);
        const remainingMs = campaignTimeRemainingMs(campaign);

        if (remainingMs <= 0) {
          const result = await checkAndRotateCampaign(user.uid, campaign, {
            completionPct: pct,
            couponsEarned: cp.length,
            couponsRedeemed: cp.filter(c => c.status === 'used').length,
            eggsScanned: eggScans,
            proteinEarned: today?.totalProtein ?? 0,
            highestStageReached: gameStats.highestStage,
          });
          effectiveCampaign = result.campaign;
          if (result.rotated) {
            if (pct >= 100) notifyCampaignCompleted(user.uid, campaign.name, campaign.id).catch(() => {});
            if (effectiveCampaign) notifyCampaignStarted(user.uid, effectiveCampaign.name, effectiveCampaign.id).catch(() => {});
          }
        } else {
          const daysLeft = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
          if (daysLeft <= 3) {
            notifyCampaignEndingSoon(user.uid, campaign.name, campaign.id, daysLeft).catch(() => {});
            setUpcomingCampaign(await getUpcomingCampaign(campaign.endAt));
          } else {
            setUpcomingCampaign(null);
          }
        }
      }
      setActiveCampaign(effectiveCampaign);

      const history = await getCampaignHistory(user.uid);
      setCampaignHistory(history);
    } catch (e) { console.error('[RewardsClub]', e); }
    finally { setLoading(false); }
  }, [user.uid]);

  useEffect(() => { load(); }, [load]);

  // ── Smart notification navigation ──────────────────────────────────────
  useEffect(() => {
    if (!navTarget) return;
    if (navTarget.section === 'overview') setTab('overview');
    else if (navTarget.section === 'coupons') {
      setTab('coupons');
      const statusFilter = navTarget.metadata?.statusFilter;
      if (statusFilter === 'available' || statusFilter === 'used' || statusFilter === 'expired') {
        setCouponFilter(statusFilter);
      }
    } else if (navTarget.section === 'history') {
      setTab('history');
    }
  }, [navTarget]);

  const highlightMembershipCard = navTarget?.entityId === 'membership-card';
  const highlightRewardBalance  = navTarget?.entityId === 'reward-balance';
  const highlightCampaignBanner = navTarget?.entityId === 'campaign-banner';
  const highlightCouponId       = navTarget?.section === 'coupons' ? navTarget.entityId : undefined;
  const highlightMostRecentRedeem = navTarget?.section === 'history';

  useEffect(() => {
    if (highlightMembershipCard || highlightRewardBalance || highlightCampaignBanner || highlightCouponId || highlightMostRecentRedeem) consumeTarget();
  }, [highlightMembershipCard, highlightRewardBalance, highlightCampaignBanner, highlightCouponId, highlightMostRecentRedeem, consumeTarget]);

  const handleRedeem = async () => {
    if (!confirmItem || !wallet) return;
    setRedeeming(true); setRedeemErr('');
    HapticService.selection(); // major button press — Redeem confirm
    try {
      const coupon = await redeemReward(user.uid, confirmItem, highestStage, lifetimeEggScans);
      setConfirmItem(null);
      setSuccessCoupon(coupon);
      HapticService.success(); // Coupon Unlocked / Reward Redeemed
      await load();
    } catch {
      setRedeemErr('Failed to redeem. Please try again.');
    } finally {
      setRedeeming(false);
    }
  };

  const handleMarkUsed = async (couponId: string) => {
    await markCouponUsed(user.uid, couponId);
    await load();
  };

  const todayPointsEarned = useMemo(() => {
    const today = new Date().toLocaleDateString('sv-SE');
    return transactions
      .filter(t => t.points > 0 && t.createdAt?.toDate && t.createdAt.toDate().toLocaleDateString('sv-SE') === today)
      .reduce((sum, t) => sum + t.points, 0);
  }, [transactions]);

  // Recent scan-earning pace (distinct calendar days with a scan in the loaded ledger window)
  // — used only for a soft "estimated completion" hint, never to alter reward math.
  const scanDaysPerWeek = useMemo(() => {
    const days = new Set(
      transactions
        .filter(t => t.type === 'scan' && t.createdAt?.toDate)
        .map(t => t.createdAt.toDate().toLocaleDateString('sv-SE')),
    );
    return days.size;
  }, [transactions]);

  const categories = useMemo(() => {
    const ranges = Array.from(new Set(catalog.map(c => c.range)));
    return ['All', ...ranges];
  }, [catalog]);

  const visibleCatalog = useMemo(() => {
    if (categoryFilter === 'All') return catalog;
    return catalog.filter(c => c.range === categoryFilter);
  }, [catalog, categoryFilter]);

  // "Next reward" — cheapest item the user hasn't unlocked yet.
  const nextReward = useMemo(() => {
    if (!wallet || catalog.length === 0) return null;
    const locked = catalog.filter(c => c.pointsCost > wallet.currentPoints).sort((a, b) => a.pointsCost - b.pointsCost);
    if (locked.length > 0) return locked[0];
    return [...catalog].sort((a, b) => a.pointsCost - b.pointsCost)[0] ?? null;
  }, [catalog, wallet]);

  // "Second next reward" — the following locked tier, previewed even though still out of reach.
  const previewReward = useMemo(() => {
    if (!wallet || catalog.length === 0) return null;
    const locked = catalog.filter(c => c.pointsCost > wallet.currentPoints).sort((a, b) => a.pointsCost - b.pointsCost);
    return locked[1] ?? null;
  }, [catalog, wallet]);

  // "Featured reward" — the standout product shown just below the membership journey.
  const featuredReward = useMemo(() => {
    if (catalog.length === 0) return null;
    return [...catalog].sort((a, b) => b.discountAmount - a.discountAmount)[0] ?? null;
  }, [catalog]);

  // Carousel products — real catalog items, richest-value first.
  const carouselProducts = useMemo(() => {
    return [...catalog].sort((a, b) => a.pointsCost - b.pointsCost);
  }, [catalog]);

  if (loading || !wallet) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: PALETTE.cream }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${PALETTE.eggshell}`, borderTopColor: PALETTE.red, animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const filteredCoupons = coupons.filter(c => c.status === couponFilter);
  const isNewMember = wallet.lifetimePoints === 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: PALETTE.cream }}>

      {/* ── Fixed header (compact, warm-neutral) ── */}
      <div style={{
        background: PALETTE.warmWhite, borderBottom: `1px solid ${PALETTE.border}`,
        padding: '12px 16px 12px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onBack} aria-label="Go back" style={{
              width: 32, height: 32, borderRadius: '50%', background: PALETTE.cream, border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ChevronLeft size={17} color={PALETTE.ink} />
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: PALETTE.ink, margin: 0, letterSpacing: 0.1 }}>Rewards Club</h2>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, background: PALETTE.eggshell,
            borderRadius: 18, padding: '5px 11px 5px 8px', border: `1px solid ${PALETTE.border}`,
          }}>
            <Coins size={12} color={PALETTE.gold} />
            <RewardPointPill points={wallet.currentPoints} />
          </div>
        </div>

        {/* ── Segmented tab bar (sliding indicator) ── */}
        <RewardsTabSwitcher<HubTab>
          items={HUB_TABS}
          active={tab}
          onChange={setTab}
          trackColor={PALETTE.cream}
          activeSurface={PALETTE.redDeep}
          activeText="#fff"
          inactiveText={PALETTE.inkSoft}
        />
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 90px', display: 'flex', flexDirection: 'column', gap: tab === 'overview' ? 0 : 14 }}>

        {tab === 'overview' && (
          isNewMember ? (
            <WelcomeEmptyState onScanQR={onScanQR} />
          ) : (
            <OverviewTab
              wallet={wallet}
              nextReward={nextReward}
              previewReward={previewReward}
              featuredReward={featuredReward}
              carouselProducts={carouselProducts}
              scanDaysPerWeek={scanDaysPerWeek}
              todayEggs={todayEggs}
              todayProtein={todayProtein}
              todayGoal={todayGoal}
              todayPointsEarned={todayPointsEarned}
              onScanQR={onScanQR}
              onViewRewards={() => setTab('rewards')}
              onSelectReward={item => { setRedeemErr(''); setConfirmItem(item); }}
              onViewTiers={() => setTiersOpen(true)}
              highlightHero={highlightMembershipCard || highlightRewardBalance}
            />
          )
        )}

        {tab === 'rewards' && (
          <RewardsTab
            catalog={visibleCatalog}
            categories={categories}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            wallet={wallet}
            highestStage={highestStage}
            lifetimeEggScans={lifetimeEggScans}
            currentProteinStreak={currentProteinStreak}
            coupons={coupons}
            activeCampaign={activeCampaign}
            onSelect={item => { setRedeemErr(''); setConfirmItem(item); }}
            onScanQR={onScanQR}
            onPlayGame={onPlayGame}
          />
        )}

        {tab === 'coupons' && (
          <CouponsTab
            coupons={filteredCoupons}
            filter={couponFilter}
            onFilterChange={setCouponFilter}
            onMarkUsed={handleMarkUsed}
            highlightCouponId={highlightCouponId}
          />
        )}

        {tab === 'history' && (
          <HistoryTab transactions={transactions} campaignHistory={campaignHistory} highlightMostRecentRedeem={navTarget?.section === 'history'} />
        )}
      </div>

      {/* ── Redemption confirm dialog ── */}
      {confirmItem && (
        <ConfirmRedeemDialog
          item={confirmItem}
          currentPoints={wallet.currentPoints}
          highestStage={highestStage}
          lifetimeEggScans={lifetimeEggScans}
          saving={redeeming}
          error={redeemErr}
          onConfirm={handleRedeem}
          onCancel={() => setConfirmItem(null)}
          onPlayGame={onPlayGame}
          onScanQR={onScanQR}
        />
      )}

      {/* ── Success screen ── */}
      {successCoupon && (
        <RedeemSuccessScreen
          coupon={successCoupon}
          onViewCoupons={() => { setSuccessCoupon(null); setTab('coupons'); setCouponFilter('available'); }}
          onDone={() => setSuccessCoupon(null)}
        />
      )}

      {/* ── Membership tiers sheet ── */}
      {tiersOpen && (
        <MembershipTiersSheet wallet={wallet} onClose={() => setTiersOpen(false)} />
      )}

      <style>{`
        @keyframes hiFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(201,151,74,0.45); } 50% { box-shadow: 0 0 0 7px rgba(201,151,74,0); } }
        @keyframes cardRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes journeyLine { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes badgePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes couponUnlock { 0% { transform: scale(0.9) rotate(-1deg); opacity: 0; } 60% { transform: scale(1.02) rotate(0.5deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
        @keyframes livePulseDot { 0%,100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.55); } 50% { box-shadow: 0 0 0 6px rgba(74,222,128,0); } }
        .rc-hero-btn { transition: transform 220ms ease, box-shadow 220ms ease; }
        .rc-hero-btn:hover { transform: scale(1.02); }
        .rc-hero-btn:active { transform: scale(0.98); }
        .rc-product-card { transition: transform 300ms ease, box-shadow 300ms ease; }
        .rc-product-card:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 12px 26px rgba(0,0,0,0.12); }
        .rc-coupon-card { transition: transform 200ms ease, box-shadow 200ms ease; }
        .rc-coupon-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
        .rc-btn-ripple { position: relative; overflow: hidden; }
        .rc-btn-ripple:active::after {
          content: ''; position: absolute; inset: 0; background: rgba(255,255,255,0.35);
          animation: rcRipple 380ms ease-out;
        }
        @keyframes rcRipple { from { opacity: 1; } to { opacity: 0; } }
        .rc-carousel::-webkit-scrollbar { display: none; }
        .rc-product-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }
        @media (min-width: 640px) {
          .rc-product-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
        }
        @media (min-width: 1024px) {
          .rc-product-grid { grid-template-columns: repeat(4, 1fr); gap: 18px; }
        }
      `}</style>
    </div>
  );
}

function RewardPointPill({ points }: { points: number }) {
  const animated = useCountUp(points);
  return (
    <span style={{ fontSize: 12.5, fontWeight: 900, color: PALETTE.ink }}>{animated} <span style={{ fontSize: 9.5, fontWeight: 700, color: PALETTE.inkSoft }}>pts</span></span>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 1 — Overview: premium loyalty-app landing screen.
// First viewport = Hero + Today's Progress (membership, points,
// next reward, progress, CTA all visible without scrolling).
// Everything else (journey, countdown, featured, carousel, flash
// offers, coupon preview) sits below the fold.
// ─────────────────────────────────────────────────────────────

function OverviewTab({
  wallet, nextReward, previewReward, featuredReward, carouselProducts, scanDaysPerWeek,
  todayEggs, todayProtein, todayGoal, todayPointsEarned,
  onScanQR, onViewRewards, onSelectReward, onViewTiers, highlightHero,
}: {
  wallet: RewardWallet;
  nextReward: RewardCatalogItem | null;
  previewReward: RewardCatalogItem | null;
  featuredReward: RewardCatalogItem | null;
  carouselProducts: RewardCatalogItem[];
  scanDaysPerWeek: number;
  todayEggs: number;
  todayProtein: number;
  todayGoal: number;
  todayPointsEarned: number;
  onScanQR?: () => void;
  onViewRewards: () => void;
  onSelectReward: (item: RewardCatalogItem) => void;
  onViewTiers: () => void;
  highlightHero?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 1. HERO CARD — tier, balance, next reward, progress, eggs remaining, CTA */}
      <HeroCard wallet={wallet} nextReward={nextReward} onScanQR={onScanQR} highlight={highlightHero} />

      {/* 2. TODAY'S PROGRESS — premium stat chips, Lucide icons, no emojis */}
      <TodayChips todayEggs={todayEggs} todayProtein={todayProtein} todayGoal={todayGoal} todayPointsEarned={todayPointsEarned} />

      {/* 3. FEATURED REWARD — large premium single-product preview */}
      {featuredReward && (
        <FeaturedReward item={featuredReward} wallet={wallet} onSelect={() => onSelectReward(featuredReward)} />
      )}

      {/* 4. MEMBERSHIP JOURNEY — animated horizontal tier track */}
      <MembershipJourney wallet={wallet} onViewTiers={onViewTiers} />

      {/* 5. NEXT REWARD COUNTDOWN — dedicated motivational section */}
      {nextReward && (
        <NextRewardCountdown wallet={wallet} nextReward={nextReward} scanDaysPerWeek={scanDaysPerWeek} onScanQR={onScanQR} />
      )}

      {/* 6. FEATURED SKM PRODUCTS — horizontally scrollable carousel */}
      {carouselProducts.length > 0 && (
        <ProductCarousel products={carouselProducts} wallet={wallet} onSelect={onSelectReward} onViewAll={onViewRewards} />
      )}

      {/* 7. PROMO EVENT — shown only while a real event is active; otherwise a
             rotating healthy-tip card fills the slot (no backend logic changed) */}
      <PromoEventSection onScanQR={onScanQR} />

      {/* 8. COUPON PREVIEW — always show the next goal, even if still locked */}
      {previewReward && <CouponPreview item={previewReward} wallet={wallet} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero card — membership + balance + next reward + progress +
// estimated eggs remaining + CTA. ~30% shorter, denser typography.
// ─────────────────────────────────────────────────────────────

function HeroCard({ wallet, nextReward, onScanQR, highlight }: {
  wallet: RewardWallet;
  nextReward: RewardCatalogItem | null;
  onScanQR?: () => void;
  highlight?: boolean;
}) {
  const animatedPoints = useCountUp(wallet.currentPoints);
  const pct = nextReward ? Math.min(100, Math.round((wallet.currentPoints / nextReward.pointsCost) * 100)) : 0;
  const remaining = nextReward ? Math.max(0, nextReward.pointsCost - wallet.currentPoints) : 0;
  const unlocked = nextReward ? wallet.currentPoints >= nextReward.pointsCost : false;
  const eggsRemaining = Math.ceil(remaining / POINTS_PER_SCAN);
  const tierAccent = TIER_ICON_COLOR[wallet.membership] ?? PALETTE.gold;

  return (
    <HighlightCard active={!!highlight} glowColor={PALETTE.gold} style={{ borderRadius: 18 }}>
      <MembershipTierCard
        tierIcon={<Award size={17} color={tierAccent} />}
        tierLabel={wallet.membership}
        tierAccent={tierAccent}
        tierAccentSoft={`${tierAccent}1A`}
        brandAccent={PALETTE.red}
        points={animatedPoints}
        nextRewardLabel={nextReward ? `Next reward: ₹${nextReward.discountAmount} OFF ${nextReward.productName}` : undefined}
        remainingLabel={nextReward ? (unlocked ? 'Ready to redeem!' : `${remaining} pts to go`) : undefined}
        pct={pct}
        ctaLabel={nextReward ? `Scan Eggs to Unlock ₹${nextReward.discountAmount} OFF` : 'Scan Eggs to Earn Points'}
        ctaIcon={<QrCode size={14} color="#fff" />}
        onCta={onScanQR}
        surface={PALETTE.warmWhite}
        border={PALETTE.border}
        textPrimary={PALETTE.ink}
        textSecondary={PALETTE.inkSoft}
        trackColor={PALETTE.eggshell}
      />
      {nextReward && !unlocked && eggsRemaining > 0 && (
        <p style={{ fontSize: 10.5, fontWeight: 600, color: PALETTE.inkSoft, margin: '8px 2px 0' }}>
          ≈ Scan {eggsRemaining} more egg{eggsRemaining === 1 ? '' : 's'} · {wallet.currentPoints} / {nextReward.pointsCost} points
        </p>
      )}
    </HighlightCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Today's Progress — premium stat chips (Lucide icons only, no emoji)
// ─────────────────────────────────────────────────────────────

function TodayChips({ todayEggs, todayProtein, todayGoal, todayPointsEarned }: {
  todayEggs: number; todayProtein: number; todayGoal: number; todayPointsEarned: number;
}) {
  const chips = [
    { icon: <Egg size={16} color={PALETTE.red} strokeWidth={2} />, value: String(todayEggs), label: 'Eggs Today', bg: 'linear-gradient(135deg, #FDEDE8, #FBDCD3)' },
    { icon: <Dumbbell size={16} color={PALETTE.goldDeep} strokeWidth={2} />, value: `${todayProtein}${todayGoal ? `/${todayGoal}` : ''}g`, label: 'Protein Today', bg: `linear-gradient(135deg, ${PALETTE.eggshell}, #EFE2C8)` },
    { icon: <Gift size={16} color="#7C3AED" strokeWidth={2} />, value: `+${todayPointsEarned}`, label: 'Points Earned', bg: 'linear-gradient(135deg, #F1EBFB, #E6DAF7)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
      {chips.map(c => (
        <div key={c.label} style={{
          background: PALETTE.warmWhite, borderRadius: 16, padding: '11px 8px', textAlign: 'center',
          boxShadow: '0 2px 8px rgba(43,36,32,0.05)', border: `1px solid ${PALETTE.eggshell}`,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 10, background: c.bg, margin: '0 auto 6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {c.icon}
          </div>
          <p style={{ fontSize: 14, fontWeight: 900, color: PALETTE.ink, margin: 0, lineHeight: 1.1 }}>{c.value}</p>
          <p style={{ fontSize: 8, fontWeight: 700, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, margin: '3px 0 0' }}>{c.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Featured Reward — large premium single-product preview,
// directly below Today's Progress (product image, MRP, discount,
// points required, redeem preview).
// ─────────────────────────────────────────────────────────────

function FeaturedReward({ item, wallet, onSelect }: {
  item: RewardCatalogItem;
  wallet: RewardWallet;
  onSelect: () => void;
}) {
  const theme = rangeTheme(item.range);
  const affordable = wallet.currentPoints >= item.pointsCost;

  return (
    <button className="rc-btn-ripple" onClick={onSelect} style={{
      marginTop: 12, width: '100%', cursor: 'pointer', textAlign: 'left', padding: 0,
      background: PALETTE.warmWhite, borderRadius: 24, overflow: 'hidden',
      boxShadow: '0 6px 20px rgba(43,36,32,0.09)', border: `1px solid ${PALETTE.eggshell}`,
      animation: 'hiFadeIn 550ms ease',
    }}>
      {/* Large premium product image */}
      <div style={{
        height: 120, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(150deg, ${theme.color} 0%, ${theme.color2} 70%, ${theme.color2} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ position: 'absolute', top: -34, right: -30, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ position: 'absolute', top: -30, left: -20, width: '140%', height: 50, background: 'rgba(255,255,255,0.1)', transform: 'rotate(-9deg)', pointerEvents: 'none' }} />
        <Egg size={54} color="rgba(255,255,255,0.97)" strokeWidth={1.3} style={{ filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.22))' }} />
        <span style={{
          position: 'absolute', top: 10, left: 12, display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 9, fontWeight: 800, color: theme.color, background: 'rgba(255,255,255,0.92)',
          borderRadius: 20, padding: '4px 9px 4px 7px',
        }}>
          <Sparkles size={10} color={theme.color} /> Featured Reward
        </span>
      </div>

      <div style={{ padding: '13px 15px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 900, color: PALETTE.ink, margin: '0 0 4px' }}>{item.productName}</p>
          <p style={{ fontSize: 10.5, color: PALETTE.inkSoft, margin: '0 0 6px', fontWeight: 600, textDecoration: 'line-through' }}>MRP ₹{item.mrp}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: PALETTE.red }}>Save ₹{item.discountAmount}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: PALETTE.inkSoft }}>
              {affordable ? <Zap size={11} color={PALETTE.gold} /> : <Lock size={10} color={PALETTE.inkSoft} />}
              {item.pointsCost} pts
            </span>
          </div>
        </div>

        <div style={{
          flexShrink: 0, padding: '9px 14px', borderRadius: 13,
          background: affordable ? `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})` : PALETTE.eggshell,
          color: affordable ? '#fff' : PALETTE.inkSoft, fontWeight: 800, fontSize: 11,
        }}>
          {affordable ? 'Redeem' : 'Locked'}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Membership Journey — animated horizontal track. Current tier glows,
// future tiers stay locked. Premium connecting progress line.
// ─────────────────────────────────────────────────────────────

function MembershipJourney({ wallet, onViewTiers }: { wallet: RewardWallet; onViewTiers: () => void }) {
  const currentIdx = MEMBERSHIP_TIERS.findIndex(t => t.tier === wallet.membership);
  const progress = calcTierProgress(wallet.lifetimePoints);

  return (
    <button
      onClick={onViewTiers}
      style={{
        marginTop: 12, width: '100%', textAlign: 'left', cursor: 'pointer', border: `1px solid ${PALETTE.eggshell}`,
        background: PALETTE.warmWhite, borderRadius: 20, padding: '14px 14px 12px',
        boxShadow: '0 2px 8px rgba(43,36,32,0.05)',
        animation: 'hiFadeIn 500ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontSize: 11.5, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>Membership Journey</p>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {progress.next ? (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: PALETTE.inkSoft }}>{progress.pointsToNext} Points to {progress.next.tier}</span>
          ) : (
            <span style={{ fontSize: 9.5, fontWeight: 800, color: PALETTE.gold }}>Top Tier</span>
          )}
          <ChevronRight size={13} color={PALETTE.inkSoft} />
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {MEMBERSHIP_TIERS.map((t, i) => {
          const reached = i <= currentIdx;
          const isCurrent = i === currentIdx;
          const iconColor = TIER_ICON_COLOR[t.tier];
          return (
            <div key={t.tier} style={{ display: 'flex', alignItems: 'center', flex: i === MEMBERSHIP_TIERS.length - 1 ? '0 0 auto' : 1, minWidth: 50 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: isCurrent ? 38 : 26, height: isCurrent ? 38 : 26, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: reached ? `linear-gradient(135deg, ${t.color}, ${t.color2})` : PALETTE.eggshell,
                  boxShadow: isCurrent ? `0 4px 12px ${iconColor}55` : 'none',
                  animation: isCurrent ? 'glowPulse 2.2s ease-in-out infinite' : undefined,
                  transition: 'all 250ms ease',
                }}>
                  {reached ? <Crown size={isCurrent ? 17 : 12} color="#fff" /> : <Lock size={10} color="#C4B8A8" />}
                </div>
                <span style={{ fontSize: 8.5, fontWeight: isCurrent ? 900 : 700, color: reached ? PALETTE.ink : '#C4B8A8', whiteSpace: 'nowrap' }}>
                  {t.tier}
                </span>
              </div>
              {i < MEMBERSHIP_TIERS.length - 1 && (
                <div style={{
                  flex: 1, height: 2.5, borderRadius: 2, margin: '0 2px', marginBottom: 14,
                  background: i < currentIdx ? `linear-gradient(90deg, ${PALETTE.gold}, ${PALETTE.goldDeep})` : PALETTE.eggshell,
                  transformOrigin: 'left', animation: i < currentIdx ? 'journeyLine 600ms ease both' : undefined,
                  transition: 'background 250ms ease',
                }} />
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Membership Experience — full tier cards (benefits are editorial
// UI copy only, not tied to any backend entitlement system; unlock
// requirements and current status come from real MEMBERSHIP_TIERS /
// calcTierProgress data).
// ─────────────────────────────────────────────────────────────

const TIER_BENEFITS: Record<MembershipTier, string[]> = {
  Bronze:   ['Earn points on every SKM egg scan', 'Access to the full rewards catalog', 'Birthday bonus notification'],
  Silver:   ['Everything in Bronze', 'Priority customer support', 'Early access to new reward drops'],
  Gold:     ['Everything in Silver', 'Exclusive Gold-tier reward items', 'Higher-value flash offer eligibility'],
  Platinum: ['Everything in Gold', 'Dedicated support line', 'Invitations to SKM member events'],
  Diamond:  ['Everything in Platinum', 'Highest-tier exclusive rewards', 'Recognition as a top SKM member'],
};

function MembershipTiersSheet({ wallet, onClose }: { wallet: RewardWallet; onClose: () => void }) {
  const currentIdx = MEMBERSHIP_TIERS.findIndex(t => t.tier === wallet.membership);
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(43,36,32,0.55)', zIndex: 110,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, maxHeight: '86vh', overflowY: 'auto',
          background: PALETTE.cream, borderRadius: '26px 26px 0 0',
          animation: 'hiFadeIn 280ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div style={{ position: 'sticky', top: 0, background: PALETTE.cream, padding: '14px 20px 12px', zIndex: 1 }}>
          <div style={{ width: 40, height: 4, borderRadius: 4, background: PALETTE.eggshell, margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>Membership Tiers</p>
            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: '50%', background: 'rgba(43,36,32,0.06)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={15} color={PALETTE.inkSoft} />
            </button>
          </div>
        </div>

        <div style={{ padding: '4px 20px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MEMBERSHIP_TIERS.map((t, i) => {
            const reached = i <= currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <div key={t.tier} style={{
                background: PALETTE.warmWhite, borderRadius: 20, padding: '16px 18px', position: 'relative', overflow: 'hidden',
                border: isCurrent ? `1.5px solid ${t.color}` : `1px solid ${PALETTE.eggshell}`,
                boxShadow: isCurrent ? `0 4px 18px ${t.color}30` : '0 2px 8px rgba(43,36,32,0.05)',
                opacity: reached ? 1 : 0.85,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 13, flexShrink: 0,
                    background: reached ? `linear-gradient(135deg, ${t.color}, ${t.color2})` : PALETTE.eggshell,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isCurrent ? `0 4px 12px ${t.color}55` : 'none',
                  }}>
                    {reached ? <Crown size={18} color="#fff" /> : <Lock size={16} color="#C4B8A8" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <p style={{ fontSize: 14, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>{t.tier}</p>
                      {isCurrent && (
                        <span style={{
                          fontSize: 8.5, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${t.color}, ${t.color2})`,
                          borderRadius: 8, padding: '2px 7px', letterSpacing: 0.4,
                        }}>CURRENT</span>
                      )}
                    </div>
                    <p style={{ fontSize: 10.5, color: PALETTE.inkSoft, margin: '2px 0 0', fontWeight: 600 }}>
                      {t.minPoints === 0 ? 'Starting tier' : `Unlocks at ${t.minPoints.toLocaleString()} lifetime points`}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {TIER_BENEFITS[t.tier].map(b => (
                    <div key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                      <CheckCircle2 size={13} color={reached ? t.color : '#C4B8A8'} style={{ marginTop: 1, flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, color: reached ? PALETTE.inkSoft : '#C4B8A8', fontWeight: 500, lineHeight: 1.4 }}>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Next Reward Countdown — dedicated motivational section.
// "Only N Eggs Remaining to unlock ₹X OFF" + progress bar +
// a soft estimated-completion hint derived from real recent pace
// (never fabricated — falls back to a motivational nudge if the
// user doesn't have enough scan history yet).
// ─────────────────────────────────────────────────────────────

function NextRewardCountdown({ wallet, nextReward, scanDaysPerWeek, onScanQR }: {
  wallet: RewardWallet;
  nextReward: RewardCatalogItem;
  scanDaysPerWeek: number;
  onScanQR?: () => void;
}) {
  const remaining = Math.max(0, nextReward.pointsCost - wallet.currentPoints);
  const eggsRemaining = Math.ceil(remaining / POINTS_PER_SCAN);
  const pct = Math.min(100, Math.round((wallet.currentPoints / nextReward.pointsCost) * 100));
  const unlocked = remaining === 0;

  // Pace-based ETA from real recent activity — never fabricated.
  const etaLabel = useMemo(() => {
    if (unlocked) return null;
    if (scanDaysPerWeek <= 0) return 'Keep scanning to unlock!';
    const eggsPerDay = scanDaysPerWeek / 7;
    const daysNeeded = Math.ceil(eggsRemaining / Math.max(eggsPerDay, 1 / 7));
    if (daysNeeded <= 1) return 'Today';
    if (daysNeeded <= 2) return 'Tomorrow';
    if (daysNeeded <= 7) return `In ${daysNeeded} days`;
    return `In ~${Math.ceil(daysNeeded / 7)} weeks`;
  }, [unlocked, scanDaysPerWeek, eggsRemaining]);

  return (
    <div style={{
      marginTop: 12, borderRadius: 22, padding: '16px 18px',
      background: `linear-gradient(135deg, ${PALETTE.eggshell} 0%, #F1DFC0 100%)`,
      border: `1px solid ${PALETTE.gold}33`, position: 'relative', overflow: 'hidden',
      animation: 'hiFadeIn 600ms ease',
    }}>
      <div style={{ position: 'absolute', top: -30, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />

      {unlocked ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <PartyPopper size={22} color={PALETTE.goldDeep} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>Reward Unlocked!</p>
            <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: '2px 0 0', fontWeight: 600 }}>₹{nextReward.discountAmount} OFF is ready to redeem.</p>
          </div>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 11, fontWeight: 700, color: PALETTE.goldDeep, margin: '0 0 2px', position: 'relative' }}>Only</p>
          <p style={{ fontSize: 30, fontWeight: 900, color: PALETTE.ink, margin: 0, lineHeight: 1.05, position: 'relative' }}>
            {eggsRemaining} Egg{eggsRemaining === 1 ? '' : 's'} <span style={{ fontSize: 14, fontWeight: 700, color: PALETTE.inkSoft }}>Remaining</span>
          </p>
          <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: '2px 0 12px', fontWeight: 600, position: 'relative' }}>
            to unlock <span style={{ color: PALETTE.red, fontWeight: 800 }}>₹{nextReward.discountAmount} OFF</span>
          </p>

          <div style={{ height: 9, background: 'rgba(43,36,32,0.08)', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 12, transition: 'width 700ms cubic-bezier(0.34,1.56,0.4,1)',
              background: `linear-gradient(90deg, ${PALETTE.gold}, ${PALETTE.red})`,
            }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, position: 'relative' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: PALETTE.inkSoft }}>
              <Timer size={12} color={PALETTE.goldDeep} /> Est. completion: <strong style={{ color: PALETTE.ink }}>{etaLabel}</strong>
            </span>
          </div>

          <button className="rc-btn-ripple" onClick={onScanQR} disabled={!onScanQR} style={{
            marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 13, border: 'none',
            background: `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})`, color: '#fff',
            fontWeight: 900, fontSize: 12, cursor: onScanQR ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, position: 'relative',
            boxShadow: '0 6px 14px rgba(196,41,13,0.25)',
          }}>
            <QrCode size={13} color="#fff" /> Keep Scanning
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Featured SKM Products — horizontally scrollable premium carousel
// of real catalog products (image, MRP, discount, points, redeem).
// ─────────────────────────────────────────────────────────────

function ProductCarousel({ products, wallet, onSelect, onViewAll }: {
  products: RewardCatalogItem[];
  wallet: RewardWallet;
  onSelect: (item: RewardCatalogItem) => void;
  onViewAll: () => void;
}) {
  return (
    <div style={{ marginTop: 12, animation: 'hiFadeIn 650ms ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
        <p style={{ fontSize: 12.5, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>SKM Products</p>
        <button onClick={onViewAll} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, padding: 0 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: PALETTE.red }}>View All</span>
          <ChevronRight size={12} color={PALETTE.red} />
        </button>
      </div>

      <div className="rc-carousel" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
        {products.map(item => {
          const theme = rangeTheme(item.range);
          const affordable = wallet.currentPoints >= item.pointsCost;
          return (
            <button
              key={item.id}
              className="rc-btn-ripple rc-product-card"
              onClick={() => onSelect(item)}
              style={{
                flexShrink: 0, width: 132, border: `1px solid ${PALETTE.eggshell}`, cursor: 'pointer', padding: 0, textAlign: 'left',
                background: PALETTE.warmWhite, borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 10px rgba(43,36,32,0.06)',
              }}
            >
              <div style={{
                height: 74, background: `linear-gradient(150deg, ${theme.color}, ${theme.color2})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: -16, right: -16, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
                <Egg size={30} color="rgba(255,255,255,0.97)" strokeWidth={1.4} />
              </div>
              <div style={{ padding: '9px 10px 11px' }}>
                <p style={{ fontSize: 10.5, fontWeight: 800, color: PALETTE.ink, margin: '0 0 2px', lineHeight: 1.25 }}>{item.productName}</p>
                <p style={{ fontSize: 9, color: PALETTE.inkSoft, margin: '0 0 6px', fontWeight: 600, textDecoration: 'line-through' }}>MRP ₹{item.mrp}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: PALETTE.red }}>₹{item.discountAmount}</span>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 2, fontSize: 8.5, fontWeight: 800,
                    color: affordable ? '#fff' : PALETTE.inkSoft,
                    background: affordable ? `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})` : PALETTE.eggshell,
                    borderRadius: 8, padding: '3px 6px',
                  }}>
                    {affordable ? <Zap size={8} color="#fff" /> : <Lock size={8} color={PALETTE.inkSoft} />}
                    {item.pointsCost}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Flash Offers — presentational promo banners only. Real countdown
// timers (time-to-midnight / time-to-Sunday) but purely a UI teaser:
// no points are actually granted here, and nothing here touches the
// reward wallet, transaction ledger, or membership calculations.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Promo Event Section — event-driven replacement for the old
// hardcoded "Double Points Day" card. Only renders the promo
// banner while a real promoEvents/{id} doc is active (active ==
// true AND now is within [startAt, endAt)). New events (Weekend
// Bonus, Protein Week, Festival Special, admin-created promos,
// etc.) are added purely as Firestore docs — no UI code change
// needed. When nothing is active, shows a rotating healthy-tip
// card instead of a fake countdown.
// ─────────────────────────────────────────────────────────────

const HEALTHY_TIPS = [
  'Protein spread across meals is absorbed better than one big serving — pair your SKM eggs with breakfast and dinner.',
  'One SKM egg has about 6g of high-quality protein — a great way to hit your daily goal without extra calories.',
  'Boiled eggs keep their protein content intact and make a perfect on-the-go snack.',
  'Pairing eggs with vegetables adds fibre and micronutrients alongside your protein intake.',
  'Consistency beats intensity — a few eggs daily builds better long-term habits than an occasional binge.',
];

function useDailyTip(): string {
  return useMemo(() => {
    const dayIndex = Math.floor(Date.now() / 86400000);
    return HEALTHY_TIPS[dayIndex % HEALTHY_TIPS.length];
  }, []);
}

function PromoEventSection({ onScanQR }: { onScanQR?: () => void }) {
  const [event, setEvent] = useState<PromoEvent | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    let cancelled = false;
    getActivePromoEvent()
      .then(e => { if (!cancelled) setEvent(e); })
      .catch(() => { if (!cancelled) setEvent(null); });
    return () => { cancelled = true; };
  }, []);

  if (event === undefined) return null; // still loading — avoid a flash of tip content
  if (event) return <PromoEventCard event={event} onScanQR={onScanQR} />;
  return <HealthyTipCard />;
}

function PromoEventCard({ event, onScanQR }: { event: PromoEvent; onScanQR?: () => void }) {
  const endAt = useMemo(() => event.endAt.toDate(), [event.endAt]);
  const remainingMs = useCountdown(endAt);
  const [expired, setExpired] = useState(remainingMs <= 0);

  useEffect(() => { if (remainingMs <= 0) setExpired(true); }, [remainingMs]);

  if (expired) return <HealthyTipCard />;

  return (
    <div style={{ marginTop: 12, animation: 'hiFadeIn 700ms ease' }}>
      <div style={{
        borderRadius: 18, padding: '13px 15px', position: 'relative', overflow: 'hidden',
        background: `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})`,
      }}>
        <div style={{ position: 'absolute', top: -20, right: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ minWidth: 0 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, color: '#fff',
              background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '3px 8px', marginBottom: 6,
              animation: 'badgePulse 1.8s ease-in-out infinite',
            }}>
              <Zap size={9} color="#fff" /> {event.multiplier}× POINTS
            </span>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', margin: 0 }}>{event.title}</p>
            <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.8)', margin: '2px 0 0', fontWeight: 600 }}>{event.description}</p>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <Timer size={14} color="rgba(255,255,255,0.85)" style={{ marginBottom: 3 }} />
            <p style={{ fontSize: 11, fontWeight: 900, color: '#fff', margin: 0, fontFamily: 'monospace' }}>{formatCountdown(remainingMs)}</p>
          </div>
        </div>
        <button
          className="rc-btn-ripple"
          onClick={onScanQR}
          disabled={!onScanQR}
          style={{
            marginTop: 11, width: '100%', padding: '9px 0', borderRadius: 12, border: 'none',
            background: 'rgba(255,255,255,0.92)', color: PALETTE.red, fontWeight: 900, fontSize: 11.5,
            cursor: onScanQR ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            position: 'relative',
          }}
        >
          <QrCode size={12} color={PALETTE.red} /> {event.ctaText}
        </button>
      </div>
    </div>
  );
}

function HealthyTipCard() {
  const tip = useDailyTip();
  return (
    <div style={{
      marginTop: 12, borderRadius: 18, padding: '13px 15px', display: 'flex', alignItems: 'flex-start', gap: 10,
      background: PALETTE.warmWhite, border: `1px solid ${PALETTE.eggshell}`,
      animation: 'hiFadeIn 700ms ease',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: PALETTE.eggshell,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Sparkles size={15} color={PALETTE.goldDeep} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 9, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 3px' }}>Healthy Tip</p>
        <p style={{ fontSize: 11.5, color: PALETTE.ink, margin: 0, fontWeight: 600, lineHeight: 1.4 }}>{tip}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Coupon Preview — always show the next future goal, even while
// still locked, instead of hiding it.
// ─────────────────────────────────────────────────────────────

function CouponPreview({ item, wallet }: { item: RewardCatalogItem; wallet: RewardWallet }) {
  const remaining = Math.max(0, item.pointsCost - wallet.currentPoints);
  return (
    <div style={{
      marginTop: 12, borderRadius: 18, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12,
      background: PALETTE.warmWhite, border: `1.5px dashed ${PALETTE.eggshell}`,
      animation: 'hiFadeIn 750ms ease',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: PALETTE.eggshell,
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        <Ticket size={19} color="#C4B8A8" />
        <div style={{
          position: 'absolute', bottom: -3, right: -3, width: 16, height: 16, borderRadius: '50%',
          background: PALETTE.inkSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${PALETTE.warmWhite}`,
        }}>
          <Lock size={8} color="#fff" />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 9.5, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 2px' }}>Locked · Coming Up Next</p>
        <p style={{ fontSize: 13, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>₹{item.discountAmount} OFF <span style={{ fontWeight: 600, color: PALETTE.inkSoft, fontSize: 11 }}>{item.productName}</span></p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 9, color: PALETTE.inkSoft, margin: 0, fontWeight: 700 }}>Need</p>
        <p style={{ fontSize: 13, fontWeight: 900, color: PALETTE.red, margin: 0 }}>{remaining} pts</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Welcome / Empty State — shown instead of the Overview when the
// user has zero lifetime points (never an empty statistics grid).
// ─────────────────────────────────────────────────────────────

function WelcomeEmptyState({ onScanQR }: { onScanQR?: () => void }) {
  return (
    <div style={{
      marginTop: 20, textAlign: 'center', padding: '20px 12px', animation: 'hiFadeIn 500ms ease',
    }}>
      <div style={{
        width: 108, height: 108, borderRadius: '50%', margin: '0 auto 20px', position: 'relative',
        background: `linear-gradient(135deg, ${PALETTE.eggshell}, #F1DFC0)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 10px 26px ${PALETTE.gold}33`,
      }}>
        <div style={{
          width: 78, height: 78, borderRadius: '50%',
          background: `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 18px rgba(196,41,13,0.3)',
        }}>
          <Egg size={38} color="#fff" strokeWidth={1.4} />
        </div>
        <span style={{
          position: 'absolute', top: -2, right: 2, width: 30, height: 30, borderRadius: '50%',
          background: `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${PALETTE.cream}`,
        }}>
          <Sparkles size={13} color="#fff" />
        </span>
      </div>

      <p style={{ fontSize: 19, fontWeight: 900, color: PALETTE.ink, margin: '0 0 8px' }}>Welcome to SKM Rewards Club</p>
      <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '0 auto 22px', lineHeight: 1.6, maxWidth: 280, fontWeight: 500 }}>
        Start scanning SKM eggs to earn reward points and unlock real discounts on your favourite SKM products.
      </p>

      <button
        className="rc-btn-ripple"
        onClick={onScanQR}
        disabled={!onScanQR}
        style={{
          padding: '15px 28px', borderRadius: 16, border: 'none', margin: '0 auto',
          background: `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})`, color: '#fff',
          fontWeight: 900, fontSize: 14, cursor: onScanQR ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 8px 20px rgba(196,41,13,0.3)',
        }}
      >
        <QrCode size={16} color="#fff" /> Scan Your First Egg <ArrowRight size={15} color="#fff" />
      </button>

      <div style={{
        marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 8,
        background: PALETTE.warmWhite, border: `1px solid ${PALETTE.eggshell}`, borderRadius: 14, padding: '10px 16px',
      }}>
        <Gift size={14} color={PALETTE.red} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: PALETTE.inkSoft }}>Every egg scanned earns <strong style={{ color: PALETTE.ink }}>{POINTS_PER_SCAN} points</strong> toward your first reward</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 2 — Rewards: premium shopping catalog, sectioned like a
// real storefront (Featured / Fresh / Premium / Special / Exclusive),
// each section horizontally scrollable. Sections are derived purely
// from existing catalog fields (range, discountAmount, pointsCost,
// sortOrder) — no schema changes.
// ─────────────────────────────────────────────────────────────

interface CatalogSection { key: string; title: string; subtitle?: string; icon: React.ReactNode; items: RewardCatalogItem[] }

// "Almost ready" = not yet claimable but the player has cleared at least 70%
// of the combined requirement progress — surfaced first to motivate the final push.
const ALMOST_READY_THRESHOLD = 70;

function buildCatalogSections(catalog: RewardCatalogItem[], ctxFor: (item: RewardCatalogItem) => { current: number; target: number }[] | null, pctFor: (item: RewardCatalogItem) => number, metFor: (item: RewardCatalogItem) => boolean): CatalogSection[] {
  if (catalog.length === 0) return [];
  const byRange = (range: string) => catalog.filter(c => c.range === range);
  const sections: CatalogSection[] = [];

  const almostReady = catalog.filter(c => !metFor(c) && pctFor(c) >= ALMOST_READY_THRESHOLD);
  if (almostReady.length > 0) sections.push({ key: 'almost', title: 'Almost Ready', icon: <Flame size={14} color={PALETTE.red} />, items: almostReady });

  const featured = [...catalog].sort((a, b) => b.discountAmount - a.discountAmount).slice(0, 6);
  if (featured.length > 0) sections.push({
    key: 'featured', title: '🔥 Featured Rewards', subtitle: 'Limited-time rewards for this campaign.',
    icon: null, items: featured,
  });

  const fresh = byRange('SKM Best Fresh');
  if (fresh.length > 0) sections.push({ key: 'fresh', title: 'Fresh Eggs', icon: <Egg size={14} color={PALETTE.gold} />, items: fresh });

  const premium = [...byRange('SKM Best Plus'), ...byRange('Premium Range')];
  if (premium.length > 0) sections.push({ key: 'premium', title: 'Premium Eggs', icon: <Star size={14} color="#7C3AED" />, items: premium });

  const special = catalog.filter(c => c.pointsCost <= 100).sort((a, b) => a.pointsCost - b.pointsCost);
  if (special.length > 0) sections.push({ key: 'special', title: 'Special Offers', icon: <Sparkles size={14} color={PALETTE.goldDeep} />, items: special });

  const exclusive = catalog.filter(c => c.pointsCost >= 300).sort((a, b) => b.pointsCost - a.pointsCost);
  if (exclusive.length > 0) sections.push({ key: 'exclusive', title: 'Exclusive Rewards', icon: <Gem size={14} color="#0EA5E9" />, items: exclusive });

  return sections;
}

type RewardFilterTab = 'all' | 'almost' | 'available' | 'locked' | 'claimed';

const REWARD_FILTER_TABS: { key: RewardFilterTab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'almost',    label: 'Almost Ready' },
  { key: 'available', label: 'Available' },
  { key: 'locked',    label: 'Locked' },
];

function RewardsTab({ catalog, categories, categoryFilter, onCategoryChange, wallet, highestStage, lifetimeEggScans, currentProteinStreak, coupons, activeCampaign, onSelect, onScanQR, onPlayGame }: {
  catalog: RewardCatalogItem[];
  categories: string[];
  categoryFilter: string;
  onCategoryChange: (c: string) => void;
  wallet: RewardWallet;
  highestStage: GameStage;
  lifetimeEggScans: number;
  currentProteinStreak: number;
  coupons: RewardCoupon[];
  activeCampaign: RewardCampaign | null;
  onSelect: (item: RewardCatalogItem) => void;
  onScanQR?: () => void;
  onPlayGame?: () => void;
}) {
  const [rewardFilter, setRewardFilter] = useState<RewardFilterTab>('all');
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const cardsAnchorRef = useRef<HTMLDivElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const scrollToCards = useCallback(() => {
    cardsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Sticky bar shows only once the hero has scrolled out of view — single
  // IntersectionObserver, no scroll-event polling, no extra re-render sources.
  useEffect(() => {
    if (!activeCampaign) return;
    const el = heroSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeCampaign]);

  const ctx = useMemo(() => ({ currentPoints: wallet.currentPoints, highestStage, lifetimeEggScans }), [wallet.currentPoints, highestStage, lifetimeEggScans]);
  const reqsFor = useCallback((item: RewardCatalogItem) => buildRequirementProgress(item, ctx), [ctx]);
  const metFor = useCallback((item: RewardCatalogItem) => allRequirementsMet(reqsFor(item)), [reqsFor]);
  const pctFor = useCallback((item: RewardCatalogItem) => overallRequirementPct(reqsFor(item)), [reqsFor]);

  const filteredCatalog = useMemo(() => {
    switch (rewardFilter) {
      case 'available': return catalog.filter(c => metFor(c));
      case 'almost':    return catalog.filter(c => !metFor(c) && pctFor(c) >= ALMOST_READY_THRESHOLD);
      case 'locked':    return catalog.filter(c => !metFor(c) && pctFor(c) < ALMOST_READY_THRESHOLD);
      default:          return catalog;
    }
  }, [catalog, rewardFilter, metFor, pctFor]);

  const sections = useMemo(() => buildCatalogSections(filteredCatalog, () => null, pctFor, metFor), [filteredCatalog, pctFor, metFor]);

  const renderCard = (item: RewardCatalogItem, i: number) => (
    <ProductCard
      key={item.id} item={item} index={i}
      requirements={reqsFor(item)}
      onSelect={() => onSelect(item)}
      onScanQR={onScanQR}
      onPlayGame={onPlayGame}
    />
  );

  return (
    <>
      {/* Sticky compact countdown — fades in once the full hero scrolls out */}
      {activeCampaign && !heroVisible && (
        <StickyCampaignBar
          campaign={activeCampaign}
          wallet={wallet}
          lifetimeEggScans={lifetimeEggScans}
          highestStage={highestStage}
          currentProteinStreak={currentProteinStreak}
          onPlayGame={onPlayGame}
          onScanQR={onScanQR}
        />
      )}

      {/* Campaign Hero — first thing the user sees, before any reward card */}
      <div ref={heroSentinelRef}>
        {activeCampaign && (
          <CampaignHero
            campaign={activeCampaign}
            wallet={wallet}
            lifetimeEggScans={lifetimeEggScans}
            highestStage={highestStage}
            currentProteinStreak={currentProteinStreak}
            coupons={coupons}
            onPlayGame={onPlayGame}
            onScanQR={onScanQR}
            onViewRewards={scrollToCards}
          />
        )}
      </div>

      {/* Status filters — reward cards begin here; CampaignHero always renders above this point */}
      <div ref={cardsAnchorRef} style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {REWARD_FILTER_TABS.map(f => {
          const active = rewardFilter === f.key;
          return (
            <button key={f.key} onClick={() => setRewardFilter(f.key)} style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
              border: active ? 'none' : `1px solid ${PALETTE.eggshell}`,
              background: active ? `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})` : PALETTE.warmWhite,
              color: active ? '#fff' : PALETTE.inkSoft,
              fontWeight: 800, fontSize: 11.5, whiteSpace: 'nowrap',
              boxShadow: active ? '0 4px 12px rgba(196,41,13,0.25)' : '0 1px 4px rgba(0,0,0,0.04)',
              transition: 'all 180ms ease',
            }}>
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Category pills */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, marginTop: 8 }}>
          {categories.map(cat => {
            const active = categoryFilter === cat;
            return (
              <button key={cat} onClick={() => onCategoryChange(cat)} style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
                border: active ? 'none' : `1px solid ${PALETTE.eggshell}`,
                background: active ? `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})` : PALETTE.warmWhite,
                color: active ? '#fff' : PALETTE.inkSoft,
                fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap',
                boxShadow: active ? '0 4px 12px rgba(180,35,24,0.3)' : '0 1px 4px rgba(0,0,0,0.04)',
                transition: 'all 180ms ease',
              }}>
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {filteredCatalog.length === 0 ? (
        <RewardsEmptyState filter={rewardFilter} />
      ) : categoryFilter !== 'All' ? (
        // Filtered by category — flat responsive storefront grid
        <div className="rc-product-grid" style={{ marginTop: 12 }}>
          {catalog.filter(c => c.range === categoryFilter && filteredCatalog.includes(c)).map(renderCard)}
        </div>
      ) : (
        // Unfiltered — premium sectioned storefront, each section a responsive product grid
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 12 }}>
          {sections.map(section => (
            <div key={section.key}>
              <div style={{ marginBottom: 12, padding: '0 2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {section.icon}
                  <p style={{ fontSize: 14, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>{section.title}</p>
                </div>
                {section.subtitle && (
                  <p style={{ fontSize: 10.5, color: PALETTE.inkSoft, margin: '3px 0 0', fontWeight: 600 }}>{section.subtitle}</p>
                )}
              </div>
              <div className="rc-product-grid">
                {section.items.map(renderCard)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Campaign Hero — full-width premium countdown banner. First thing on the
// Rewards tab, before any filter/category/reward card. Large D/H/M/S digit
// boxes tick every second via useCountdown's single interval; everything
// else here (progress %, quick stats, urgency copy) is pure derived display
// — no reward/game/protein calculation happens in this component.
// ─────────────────────────────────────────────────────────────

function CampaignHero({ campaign, wallet, lifetimeEggScans, highestStage, currentProteinStreak, coupons, onPlayGame, onScanQR, onViewRewards }: {
  campaign: RewardCampaign;
  wallet: RewardWallet;
  lifetimeEggScans: number;
  highestStage: GameStage;
  currentProteinStreak: number;
  coupons: RewardCoupon[];
  onPlayGame?: () => void;
  onScanQR?: () => void;
  onViewRewards: () => void;
}) {
  const endDate = useMemo(() => campaign.endAt.toDate(), [campaign.endAt]);
  const remainingMs = useCountdown(endDate);
  const parts = useMemo(() => splitCountdownParts(remainingMs), [remainingMs]);
  const progress = useMemo(
    () => buildCampaignProgress(campaign, {
      lifetimeEggScans, currentPoints: wallet.currentPoints, highestStage,
      currentProteinStreak, lifetimeFoodLogs: lifetimeEggScans,
    }),
    [campaign, lifetimeEggScans, wallet.currentPoints, highestStage, currentProteinStreak],
  );
  const pct = campaignCompletionPct(progress);
  const claimedCount = coupons.filter(c => c.status !== 'expired').length;
  const allMet = progress.every(p => p.met);
  const nextObjective = progress.find(p => !p.met);

  const nextLabel = !nextObjective ? null
    : nextObjective.kind === 'eggScans' ? `Scan ${nextObjective.target - nextObjective.current} Eggs`
    : nextObjective.kind === 'stage' ? `Reach ${nextObjective.targetLabel}`
    : nextObjective.kind === 'points' ? `Earn ${nextObjective.target - nextObjective.current} Points`
    : nextObjective.kind === 'proteinStreak' ? `Streak ${nextObjective.target - nextObjective.current} More Days`
    : `Log ${nextObjective.target - nextObjective.current} More Meals`;

  // ── End-of-campaign transition — timer hit zero, rotation hasn't landed yet ──
  if (remainingMs <= 0) {
    return (
      <div style={{
        marginBottom: 18, borderRadius: 20, padding: '28px 22px', textAlign: 'center', position: 'relative', overflow: 'hidden',
        background: PALETTE.warmWhite, border: `1px solid ${PALETTE.border}`,
        boxShadow: '0 2px 10px rgba(36,26,23,0.05)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', margin: '0 auto 10px',
          border: `3px solid ${PALETTE.border}`, borderTopColor: PALETTE.red,
          animation: 'spin 0.9s linear infinite',
        }} />
        <p style={{ fontSize: 15, fontWeight: 800, color: PALETTE.ink, margin: '0 0 4px' }}>Campaign Completed</p>
        <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0, fontWeight: 500 }}>Preparing new rewards…</p>
      </div>
    );
  }

  // Task cards — fixed 4-slot layout matching the brief exactly (eggs / stage / points / coupons).
  const eggObj = progress.find(p => p.kind === 'eggScans');
  const stageObj = progress.find(p => p.kind === 'stage');
  const pointsObj = progress.find(p => p.kind === 'points');

  const countdownChips: { value: string; label: string }[] = [
    { value: String(parts.days), label: 'D' },
    { value: String(parts.hours).padStart(2, '0'), label: 'H' },
    { value: String(parts.minutes).padStart(2, '0'), label: 'M' },
    { value: String(parts.seconds).padStart(2, '0'), label: 'S' },
  ];

  return (
    <div style={{
      marginBottom: 18, position: 'relative', overflow: 'hidden', borderRadius: 20, padding: '18px',
      background: PALETTE.warmWhite, border: `1px solid ${PALETTE.border}`,
      boxShadow: '0 2px 12px rgba(36,26,23,0.06)',
      animation: 'hiFadeIn 400ms ease',
    }}>
      {/* Header row: title + live badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 17, flexShrink: 0 }}>{campaign.icon}</span>
          <p style={{ fontSize: 15.5, fontWeight: 800, color: PALETTE.ink, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{campaign.name}</p>
        </div>
        <StatusBadge label="LIVE" bg="#EAF6EF" color={PALETTE.success} pulseDot={PALETTE.success} size="sm" />
      </div>
      <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: '2px 0 14px', fontWeight: 500 }}>
        Complete challenges before the campaign ends.
      </p>

      {/* Countdown — compact panel, "Ends in" + chip row */}
      <div style={{
        background: PALETTE.eggshell, borderRadius: 14, padding: '10px 12px', marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: PALETTE.inkSoft, flexShrink: 0 }}>Ends in</span>
        <div style={{ display: 'flex', gap: 5, flex: 1 }}>
          {countdownChips.map(c => (
            <div key={c.label} style={{
              flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 2,
              background: PALETTE.warmWhite, borderRadius: 9, padding: '5px 0', border: `1px solid ${PALETTE.border}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: PALETTE.ink, fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: PALETTE.red }}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Progress — one bar, inline % + Next: label */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4 }}>Campaign Progress</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: PALETTE.red }}>{pct}%</span>
        </div>
        <PointsProgressBar pct={pct} trackColor={PALETTE.eggshell} fillColor={PALETTE.gold} height={7} />
        {nextLabel && (
          <p style={{ fontSize: 11, fontWeight: 600, color: PALETTE.inkSoft, margin: '8px 0 0' }}>
            Next: <span style={{ color: PALETTE.red, fontWeight: 800 }}>{nextLabel}</span>
          </p>
        )}
      </div>

      {/* Requirement rows */}
      {eggObj && (
        <RewardProgressRow
          icon={<Egg size={15} color={PALETTE.gold} />} label="Egg Scans" met={eggObj.met}
          valueLabel={`${eggObj.current} / ${eggObj.target}`}
          pct={eggObj.target > 0 ? Math.round((eggObj.current / eggObj.target) * 100) : 100}
          trackColor={PALETTE.eggshell} fillColor={PALETTE.red} metColor={PALETTE.success}
          labelColor={PALETTE.ink}
        />
      )}
      {stageObj && (
        <RewardProgressRow
          icon={<Gem size={15} color="#7C3AED" />} label={stageObj.label} met={stageObj.met}
          valueLabel={stageObj.currentLabel ?? `${stageObj.current} / ${stageObj.target}`}
          pct={stageObj.target > 0 ? Math.round((stageObj.current / stageObj.target) * 100) : 100}
          trackColor={PALETTE.eggshell} fillColor={PALETTE.red} metColor={PALETTE.success}
          labelColor={PALETTE.ink}
        />
      )}
      {pointsObj && (
        <RewardProgressRow
          icon={<Zap size={15} color={PALETTE.gold} />} label="Reward Points" met={pointsObj.met}
          valueLabel={`${pointsObj.current} / ${pointsObj.target}`}
          pct={pointsObj.target > 0 ? Math.round((pointsObj.current / pointsObj.target) * 100) : 100}
          trackColor={PALETTE.eggshell} fillColor={PALETTE.red} metColor={PALETTE.success}
          labelColor={PALETTE.ink}
        />
      )}

      {/* Completion / claimed summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 14px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.inkSoft }}>{pct}% complete</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.inkSoft }}>
          <Gift size={11} color={PALETTE.gold} style={{ verticalAlign: -2, marginRight: 4 }} />
          {claimedCount} coupon{claimedCount === 1 ? '' : 's'} earned
        </span>
      </div>

      {/* Buttons — single row, balanced split */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="rc-btn-ripple rc-hero-btn"
          onClick={allMet ? undefined : nextObjective?.kind === 'stage' ? onPlayGame : onScanQR}
          disabled={allMet ? true : !(nextObjective?.kind === 'stage' ? onPlayGame : onScanQR)}
          style={{
            flex: 2, padding: '12px 0', borderRadius: 13, border: 'none',
            background: PALETTE.red,
            color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: allMet ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {allMet ? <><Gift size={14} color="#fff" /> Claim Rewards</> : nextObjective?.kind === 'stage' ? <><Gem size={14} color="#fff" /> Continue Progress</> : <><QrCode size={14} color="#fff" /> Scan Eggs Now</>}
        </button>
        <button
          className="rc-hero-btn"
          onClick={onViewRewards}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 13,
            border: `1.5px solid ${PALETTE.border}`, background: PALETTE.warmWhite, color: PALETTE.ink,
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}
        >
          Rewards
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sticky compact countdown — appears once CampaignHero scrolls out of view
// (driven by an IntersectionObserver in RewardsTab, not a scroll listener).
// Same single useCountdown timer pattern, minimal footprint.
// ─────────────────────────────────────────────────────────────

function StickyCampaignBar({ campaign, wallet, lifetimeEggScans, highestStage, currentProteinStreak, onPlayGame, onScanQR }: {
  campaign: RewardCampaign;
  wallet: RewardWallet;
  lifetimeEggScans: number;
  highestStage: GameStage;
  currentProteinStreak: number;
  onPlayGame?: () => void;
  onScanQR?: () => void;
}) {
  const endDate = useMemo(() => campaign.endAt.toDate(), [campaign.endAt]);
  const remainingMs = useCountdown(endDate);
  const progress = useMemo(
    () => buildCampaignProgress(campaign, {
      lifetimeEggScans, currentPoints: wallet.currentPoints, highestStage,
      currentProteinStreak, lifetimeFoodLogs: lifetimeEggScans,
    }),
    [campaign, lifetimeEggScans, wallet.currentPoints, highestStage, currentProteinStreak],
  );
  const pct = campaignCompletionPct(progress);
  const allMet = progress.every(p => p.met);
  const nextObjective = progress.find(p => !p.met);
  const parts = splitCountdownParts(remainingMs);
  const label = parts.days > 0 ? `${parts.days} Day${parts.days === 1 ? '' : 's'} Left` : parts.hours > 0 ? `${parts.hours} Hour${parts.hours === 1 ? '' : 's'} Left` : `${parts.minutes} Min Left`;
  const continueAction = allMet ? undefined : nextObjective?.kind === 'stage' ? onPlayGame : onScanQR;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 5, marginBottom: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      borderRadius: 14, padding: '10px 14px', animation: 'hiFadeIn 220ms ease',
      background: PALETTE.redDeep,
      boxShadow: '0 4px 14px rgba(122,31,23,0.28)',
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <Clock size={13} color="#fff" /> {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 800, color: '#F4D8AA', flexShrink: 0 }}>{pct}% Complete</span>
      <button
        className="rc-btn-ripple rc-hero-btn"
        onClick={continueAction}
        disabled={!continueAction}
        style={{
          flexShrink: 0, padding: '6px 10px', borderRadius: 9, border: 'none', cursor: continueAction ? 'pointer' : 'default',
          background: 'rgba(255,255,255,0.16)', color: '#fff', fontWeight: 700, fontSize: 10.5,
          display: 'flex', alignItems: 'center', gap: 3,
        }}
      >
        {allMet ? 'Claim' : 'Continue'} →
      </button>
    </div>
  );
}

function ProductCard({ item, index, requirements, onSelect, onScanQR, onPlayGame }: {
  item: RewardCatalogItem;
  index: number;
  requirements: RequirementProgress[];
  onSelect: () => void;
  onScanQR?: () => void;
  onPlayGame?: () => void;
}) {
  const theme = rangeTheme(item.range);
  const affordable = allRequirementsMet(requirements);
  const unmet = requirements.filter(r => !r.met);
  // "Only missing requirement is Game Stage" → offer the Continue Game shortcut directly on the card.
  const onlyStageMissing = unmet.length === 1 && unmet[0].kind === 'stage';
  const eggsUnmet = unmet.find(r => r.kind === 'eggScans');

  return (
    <div
      className="rc-product-card"
      style={{
        position: 'relative', background: PALETTE.warmWhite, borderRadius: 20, overflow: 'hidden',
        boxShadow: affordable ? `0 6px 18px ${PALETTE.gold}30` : '0 2px 10px rgba(43,36,32,0.06)',
        border: affordable ? `1.5px solid ${PALETTE.gold}55` : `1px solid ${PALETTE.eggshell}`,
        display: 'flex', flexDirection: 'column', textAlign: 'left',
        animation: `cardRise 420ms ease both${affordable ? ', glowPulse 2.4s ease-in-out infinite' : ''}`,
        animationDelay: `${Math.min(index, 8) * 60}ms`,
      }}
    >
      <button
        className="rc-btn-ripple"
        onClick={onSelect}
        style={{ all: 'unset', display: 'flex', flexDirection: 'column', cursor: 'pointer', width: '100%' }}
      >
        {/* Status ribbon */}
        <span style={{
          position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 8.5, fontWeight: 900, color: '#fff', borderRadius: 20, padding: '3px 8px',
          background: affordable ? 'linear-gradient(135deg,#22C55E,#16A34A)' : 'rgba(43,36,32,0.55)',
          letterSpacing: 0.3,
        }}>
          {affordable ? <><CheckCircle2 size={9} color="#fff" /> Ready</> : <><Lock size={8} color="#fff" /> Locked</>}
        </span>

        {/* Product art — ~40% of card height */}
        <div style={{
          aspectRatio: '1.6 / 1', background: `linear-gradient(150deg, ${theme.color} 0%, ${theme.color2} 65%, ${theme.color2} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
          <div style={{ position: 'absolute', top: -34, left: -24, width: '150%', height: 70, background: 'rgba(255,255,255,0.1)', transform: 'rotate(-10deg)', pointerEvents: 'none' }} />
          <Egg size={50} color="rgba(255,255,255,0.97)" strokeWidth={1.3} style={{ filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.25))' }} />
          <span style={{
            position: 'absolute', bottom: 7, left: 7, fontSize: 8, fontWeight: 800, color: '#fff',
            background: 'rgba(0,0,0,0.28)', borderRadius: 8, padding: '3px 7px', textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            {theme.label}
          </span>
        </div>

        <div style={{ padding: '10px 12px 0', width: '100%' }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: PALETTE.ink, margin: 0, lineHeight: 1.25 }}>{item.productName}</p>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, margin: '5px 0 0' }}>
            <span style={{ fontSize: 9.5, color: PALETTE.inkSoft, fontWeight: 600, textDecoration: 'line-through' }}>₹{item.mrp}</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: PALETTE.red }}>Save ₹{item.discountAmount}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '2px 0 8px' }}>
            <span style={{ fontSize: 17, fontWeight: 900, color: PALETTE.ink }}>₹{Math.max(0, item.mrp - item.discountAmount)}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: PALETTE.inkSoft }}>you pay</span>
          </div>
        </div>
      </button>

      {/* Requirement progress bars — generic, one row per requirement */}
      <div style={{ padding: '0 12px' }}>
        {requirements.map(req => (
          <div key={req.kind} style={{ marginBottom: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: req.met ? '#16A34A' : PALETTE.inkSoft }}>
                {req.icon} {req.currentLabel ?? req.current} / {req.targetLabel ?? req.target}
              </span>
              {req.met && <CheckCircle2 size={10} color="#16A34A" />}
            </div>
            <div style={{ height: 5, background: PALETTE.eggshell, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${req.target > 0 ? Math.min(100, Math.round((req.current / req.target) * 100)) : 100}%`,
                borderRadius: 12, transition: 'width 700ms ease',
                background: req.met ? 'linear-gradient(90deg,#4ADE80,#16A34A)' : `linear-gradient(90deg, ${PALETTE.gold}, ${PALETTE.red})`,
              }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '2px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
        {/* Requirements Remaining — explicit, actionable list */}
        {!affordable && (
          <div style={{ marginBottom: 2 }}>
            <p style={{ fontSize: 8, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 3px' }}>
              Requirements Remaining
            </p>
            {unmet.map(r => (
              <p key={r.kind} style={{ fontSize: 9, fontWeight: 600, color: PALETTE.ink, margin: '0 0 1px' }}>
                • {r.kind === 'eggScans' ? `Scan ${r.target - r.current} more SKM Eggs`
                  : r.kind === 'stage' ? `Reach ${r.targetLabel}`
                  : `Earn ${r.target - r.current} more points`}
              </p>
            ))}
          </div>
        )}

        {/* Primary action — visually dominant, color-coded by state */}
        <button
          onClick={e => {
            e.stopPropagation();
            if (affordable) onSelect();
            else if (onlyStageMissing && onPlayGame) onPlayGame();
            else if (eggsUnmet && onScanQR) onScanQR();
            else onSelect();
          }}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 13, border: 'none', cursor: 'pointer',
            background: `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})`,
            color: '#fff', fontWeight: 900, fontSize: 12.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 4px 14px rgba(180,35,24,0.3)',
          }}
        >
          {affordable ? <>Claim Coupon</>
            : onlyStageMissing ? <>Continue Game</>
            : eggsUnmet ? <>Scan More Eggs</>
            : <>Locked</>}
        </button>
      </div>
    </div>
  );
}

function RewardsEmptyState({ filter }: { filter?: RewardFilterTab }) {
  const copy = filter === 'available'
    ? { title: 'No Rewards Ready Yet', body: 'Keep scanning SKM Eggs and playing Egg Runner to unlock your first coupon.' }
    : filter === 'almost'
    ? { title: 'Nothing Almost Ready Yet', body: 'Reach 70% of a reward’s requirements and it will show up here.' }
    : filter === 'locked'
    ? { title: 'No Locked Rewards', body: 'Every reward here is either already claimed or ready to redeem.' }
    : { title: 'Start Your Reward Journey', body: 'Every SKM Egg you scan earns Protein, Reward Points, Sticker Progress, and Passport Progress.' };

  return (
    <div style={{
      marginTop: 12, background: PALETTE.warmWhite, borderRadius: 22, padding: '32px 24px', textAlign: 'center',
      boxShadow: '0 2px 10px rgba(43,36,32,0.06)', border: `1px dashed ${PALETTE.eggshell}`,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%', background: `linear-gradient(135deg, #FDEDE8, ${PALETTE.eggshell})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <Egg size={30} color={PALETTE.red} strokeWidth={1.5} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 900, color: PALETTE.ink, margin: '0 0 8px' }}>{copy.title}</p>
      <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: '0 0 16px', lineHeight: 1.6 }}>
        {copy.body}
      </p>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FDEDE8', borderRadius: 14, padding: '10px 16px' }}>
        <Sparkles size={14} color={PALETTE.red} />
        <span style={{ fontSize: 12, fontWeight: 800, color: PALETTE.red }}>Buy SKM Eggs → Scan → Play → Unlock Coupons</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 3 — Coupons: premium digital-wallet ticket redesign.
// Available coupons glow softly, used coupons go grey, expired
// coupons show a red ribbon. Each ticket includes a real scannable
// QR (via the existing `qrcode` dependency), Share (Web Share API
// with clipboard fallback), and expandable redeem instructions.
// ─────────────────────────────────────────────────────────────

const COUPON_FILTER_TABS: { key: CouponFilterTab; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'used',       label: 'Used' },
  { key: 'expired',    label: 'Expired' },
];

function CouponsTab({ coupons, filter, onFilterChange, onMarkUsed, highlightCouponId }: {
  coupons: RewardCoupon[];
  filter: CouponFilterTab;
  onFilterChange: (f: CouponFilterTab) => void;
  onMarkUsed: (couponId: string) => void;
  highlightCouponId?: string;
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        {COUPON_FILTER_TABS.map(t => {
          const active = filter === t.key;
          return (
            <button key={t.key} onClick={() => onFilterChange(t.key)} style={{
              flex: 1, padding: '9px 0', borderRadius: 12, cursor: 'pointer',
              border: active ? `1.5px solid ${PALETTE.red}` : `1px solid ${PALETTE.eggshell}`,
              background: active ? '#FDEDE8' : PALETTE.warmWhite,
              color: active ? PALETTE.red : PALETTE.inkSoft,
              fontWeight: 800, fontSize: 12,
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {coupons.length === 0 ? (
        <CouponsEmptyState filter={filter} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {coupons.map((c, i) => (
            <CouponTicket key={c.id} coupon={c} index={i} onMarkUsed={() => onMarkUsed(c.id)} highlight={c.id === highlightCouponId} />
          ))}
        </div>
      )}
    </>
  );
}

function CouponsEmptyState({ filter }: { filter: CouponFilterTab }) {
  if (filter !== 'available') {
    return (
      <div style={{ background: PALETTE.warmWhite, borderRadius: 20, padding: 24, textAlign: 'center', boxShadow: '0 2px 10px rgba(43,36,32,0.06)' }}>
        <Ticket size={28} color={PALETTE.eggshell} />
        <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: '10px 0 0' }}>No {filter} coupons.</p>
      </div>
    );
  }
  return (
    <div style={{
      background: PALETTE.warmWhite, borderRadius: 22, padding: '32px 24px', textAlign: 'center',
      boxShadow: '0 2px 10px rgba(43,36,32,0.06)', border: `1px dashed ${PALETTE.eggshell}`,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%', background: `linear-gradient(135deg, ${PALETTE.eggshell}, #F1DFC0)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <Ticket size={28} color={PALETTE.goldDeep} strokeWidth={1.5} />
      </div>
      <p style={{ fontSize: 14.5, fontWeight: 900, color: PALETTE.ink, margin: '0 0 6px' }}>No Coupons Yet</p>
      <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0, lineHeight: 1.6 }}>
        Keep scanning SKM eggs to unlock your first coupon.
      </p>
    </div>
  );
}

function CouponTicket({ coupon, index, onMarkUsed, highlight }: { coupon: RewardCoupon; index: number; onMarkUsed: () => void; highlight?: boolean }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(coupon.couponCode, {
      width: 160, margin: 1,
      color: { dark: PALETTE.ink, light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    }).then(url => { if (!cancelled) setQrDataUrl(url); }).catch(() => {});
    return () => { cancelled = true; };
  }, [coupon.couponCode]);

  const handleShare = async () => {
    const text = `${coupon.rewardTitle} — ₹${coupon.discountAmount} OFF. Coupon code: ${coupon.couponCode} (valid until ${coupon.expiryDate})`;
    if (navigator.share) {
      try { await navigator.share({ title: 'SKM Rewards Coupon', text }); return; } catch { /* user cancelled or unsupported — fall through */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 1800);
    } catch { /* clipboard unavailable — silently ignore */ }
  };

  const isExpired = coupon.status === 'expired';
  const isUsed = coupon.status === 'used';
  const isAvailable = coupon.status === 'available';

  return (
    <HighlightCard
      active={!!highlight}
      glowColor={PALETTE.gold}
      className="rc-coupon-card"
      style={{
        background: isUsed ? '#F2EFEA' : PALETTE.warmWhite, overflow: 'hidden', position: 'relative',
        boxShadow: isAvailable ? `0 4px 20px ${PALETTE.gold}30, 0 0 0 1px ${PALETTE.gold}22` : '0 2px 10px rgba(43,36,32,0.06)',
        border: `1px solid ${isUsed ? '#E5DFD5' : PALETTE.eggshell}`,
        animation: `cardRise 420ms ease both`, animationDelay: `${Math.min(index, 8) * 60}ms`,
        filter: isUsed ? 'grayscale(0.6)' : 'none',
      }}
    >
      {/* Expired ribbon */}
      {isExpired && (
        <div style={{
          position: 'absolute', top: 12, right: -30, width: 120, textAlign: 'center',
          background: '#DC2626', color: '#fff', fontSize: 9, fontWeight: 900, letterSpacing: 0.5,
          padding: '4px 0', transform: 'rotate(40deg)', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', zIndex: 1,
        }}>
          EXPIRED
        </div>
      )}

      <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14, flexShrink: 0,
          background: isUsed || isExpired ? PALETTE.eggshell : `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Ticket size={20} color={isUsed || isExpired ? PALETTE.inkSoft : '#fff'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>{coupon.rewardTitle}</p>
          <p style={{ fontSize: 11, color: PALETTE.inkSoft, margin: '2px 0 0' }}>Min. purchase ₹{coupon.minimumPurchase} · Expires {coupon.expiryDate}</p>
        </div>
        <CouponStatusBadge status={coupon.status} />
      </div>

      <div style={{ borderTop: `1.5px dashed ${PALETTE.eggshell}`, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* QR code */}
        <div style={{
          width: 60, height: 60, borderRadius: 12, flexShrink: 0, background: '#fff', padding: 4,
          border: `1px solid ${PALETTE.eggshell}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          opacity: isUsed || isExpired ? 0.5 : 1,
        }}>
          {qrDataUrl ? <img src={qrDataUrl} alt="Coupon QR code" style={{ width: '100%', height: '100%' }} /> : <QrCode size={24} color={PALETTE.inkSoft} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 9, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Coupon Code</p>
          <p style={{ fontSize: 15, fontWeight: 900, color: isUsed || isExpired ? PALETTE.inkSoft : PALETTE.red, letterSpacing: 1, margin: '2px 0 0', fontFamily: 'monospace' }}>{coupon.couponCode}</p>
          <p style={{ fontSize: 9, color: PALETTE.inkSoft, margin: '3px 0 0' }}>ID: {coupon.id.slice(0, 10)}</p>
        </div>

        <p style={{ fontSize: 20, fontWeight: 900, color: PALETTE.ink, margin: 0, flexShrink: 0 }}>₹{coupon.discountAmount}</p>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', borderTop: `1px solid ${PALETTE.eggshell}` }}>
        <button onClick={() => setInstructionsOpen(o => !o)} style={{
          flex: 1, padding: '10px 0', border: 'none', borderRight: `1px solid ${PALETTE.eggshell}`,
          background: 'none', color: PALETTE.inkSoft, fontWeight: 700, fontSize: 10.5, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <Info size={12} color={PALETTE.inkSoft} /> Instructions
        </button>
        <button onClick={handleShare} style={{
          flex: 1, padding: '10px 0', border: 'none', borderRight: isAvailable ? `1px solid ${PALETTE.eggshell}` : 'none',
          background: 'none', color: PALETTE.inkSoft, fontWeight: 700, fontSize: 10.5, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          {shareState === 'copied' ? <Copy size={12} color="#16A34A" /> : <Share2 size={12} color={PALETTE.inkSoft} />}
          {shareState === 'copied' ? 'Copied' : 'Share'}
        </button>
        {isAvailable && (
          <button onClick={onMarkUsed} style={{
            flex: 1, padding: '10px 0', border: 'none', background: 'none',
            color: PALETTE.red, fontWeight: 800, fontSize: 10.5, cursor: 'pointer',
          }}>
            Mark as Used
          </button>
        )}
      </div>

      {instructionsOpen && (
        <div style={{ padding: '12px 18px 16px', background: PALETTE.cream, animation: 'hiFadeIn 220ms ease' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: PALETTE.ink, margin: '0 0 6px' }}>How to redeem</p>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: PALETTE.inkSoft, lineHeight: 1.7 }}>
            <li>Show the QR code or coupon code at the SKM counter.</li>
            <li>Minimum purchase of ₹{coupon.minimumPurchase} required.</li>
            <li>Valid until {coupon.expiryDate}. Cannot be combined with other offers.</li>
          </ul>
        </div>
      )}
    </HighlightCard>
  );
}

function CouponStatusBadge({ status }: { status: CouponStatus }) {
  const meta: Record<CouponStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    available: { label: 'Available', color: '#16A34A', bg: '#F0FDF4', icon: <CheckCircle2 size={12} /> },
    used:      { label: 'Used',      color: PALETTE.inkSoft, bg: PALETTE.cream, icon: <CheckCircle2 size={12} /> },
    expired:   { label: 'Expired',   color: '#DC2626',  bg: '#FEF2F2', icon: <XCircle size={12} /> },
  };
  const m = meta[status];
  return (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 20,
      background: m.bg, color: m.color, fontSize: 10, fontWeight: 800, flexShrink: 0,
    }}>
      {m.icon} {m.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 4 — History: premium activity timeline, richer per-entry
// detail (icon, title, description, date, time, points), grouped
// by Today / Yesterday / This Week / Earlier, staggered entrance.
// ─────────────────────────────────────────────────────────────

const TRANSACTION_META: Record<RewardTransaction['type'], { icon: React.ReactNode; label: string; bg: string }> = {
  scan:              { icon: <Egg size={14} color={PALETTE.red} />, label: 'Egg Scanned', bg: '#FDEDE8' },
  streak_milestone:  { icon: <Flame size={14} color={PALETTE.gold} />, label: 'Streak Milestone', bg: '#FEF3C7' },
  sticker_milestone: { icon: <Award size={14} color="#7C3AED" />, label: 'Sticker Unlocked', bg: '#F1EBFB' },
  challenge:         { icon: <Sparkles size={14} color="#0891B2" />, label: 'Challenge Complete', bg: '#E0F7FA' },
  redeem:            { icon: <Ticket size={14} color="#DC2626" />, label: 'Reward Redeemed', bg: '#FEF2F2' },
  adjustment:        { icon: <TrendingUp size={14} color={PALETTE.inkSoft} />, label: 'Points Adjusted', bg: PALETTE.eggshell },
};

function historyGroupLabel(date: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const d = new Date(date); d.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  if (d.getTime() > weekAgo.getTime()) return 'This Week';
  return 'Earlier';
}

function HistoryTab({ transactions, campaignHistory, highlightMostRecentRedeem }: { transactions: RewardTransaction[]; campaignHistory: CampaignHistoryEntry[]; highlightMostRecentRedeem?: boolean }) {
  const mostRecentRedeemId = highlightMostRecentRedeem
    ? transactions.find(t => t.type === 'redeem')?.id
    : undefined;

  if (transactions.length === 0 && campaignHistory.length === 0) {
    return (
      <div style={{
        background: PALETTE.warmWhite, borderRadius: 22, padding: '32px 24px', textAlign: 'center',
        boxShadow: '0 2px 10px rgba(43,36,32,0.06)', border: `1px dashed ${PALETTE.eggshell}`,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: `linear-gradient(135deg, ${PALETTE.eggshell}, #F1DFC0)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <Clock size={28} color={PALETTE.goldDeep} strokeWidth={1.5} />
        </div>
        <p style={{ fontSize: 14.5, fontWeight: 900, color: PALETTE.ink, margin: '0 0 6px' }}>No Reward History</p>
        <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: 0, lineHeight: 1.6 }}>
          Your reward journey starts with your first scan.
        </p>
      </div>
    );
  }

  const groups = new Map<string, RewardTransaction[]>();
  for (const t of transactions) {
    const label = t.createdAt?.toDate ? historyGroupLabel(t.createdAt.toDate()) : 'Earlier';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(t);
  }
  const order = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  const sortedGroups = order.filter(g => groups.has(g)).map(g => [g, groups.get(g)!] as const);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {campaignHistory.length > 0 && <CampaignHistorySection entries={campaignHistory} />}

      {sortedGroups.map(([label, txs]) => (
        <div key={label}>
          <p style={{ fontSize: 11, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 4px' }}>{label}</p>
          <div style={{ background: PALETTE.warmWhite, borderRadius: 20, padding: 6, boxShadow: '0 2px 10px rgba(43,36,32,0.06)' }}>
            <ActivityTimeline transactions={txs} highlightId={mostRecentRedeemId} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Campaign History — past seasonal campaigns, archived once each expires
// (see rewardCampaignService.checkAndRotateCampaign). Purely a display of
// data already snapshotted at archive time — no recalculation here.
// ─────────────────────────────────────────────────────────────

function CampaignHistorySection({ entries }: { entries: CampaignHistoryEntry[] }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 4px' }}>
        Campaign History
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(entry => {
          const start = entry.startAt.toDate();
          const end = entry.endAt.toDate();
          const dateRange = `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
          const completed = entry.status === 'completed';
          return (
            <div key={entry.id} style={{
              background: PALETTE.warmWhite, borderRadius: 18, padding: 14,
              boxShadow: '0 2px 10px rgba(43,36,32,0.06)', border: `1px solid ${PALETTE.eggshell}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>{entry.campaignName}</p>
                  <p style={{ fontSize: 10, color: PALETTE.inkSoft, margin: '2px 0 0', fontWeight: 600 }}>{dateRange}</p>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 800, borderRadius: 20, padding: '4px 9px',
                  background: completed ? '#E9F9EE' : '#FDEDE8', color: completed ? '#16A34A' : PALETTE.red,
                }}>
                  {completed ? '✅ Completed' : '⏱ Expired'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                <DetailStat label="Completion" value={`${entry.completionPct}%`} highlight={completed} />
                <DetailStat label="Coupons Earned" value={String(entry.couponsEarned)} />
                <DetailStat label="Redeemed" value={String(entry.couponsRedeemed)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <DetailStat label="Eggs Scanned" value={String(entry.eggsScanned)} />
                <DetailStat label="Protein" value={`${entry.proteinEarned}g`} />
                <DetailStat label="Stage Reached" value={STAGE_DISPLAY_HISTORY[entry.highestStageReached] ?? 'Stage 1'} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STAGE_DISPLAY_HISTORY: Record<GameStage, string> = {
  EGG: 'Stage 1', CHICK: 'Stage 2', ADULT: 'Stage 3', STAGE2: 'Champion',
};

function ActivityTimeline({ transactions, highlightId }: { transactions: RewardTransaction[]; highlightId?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {transactions.map((t, i) => {
        const positive = t.points >= 0;
        const isLast = i === transactions.length - 1;
        const meta = TRANSACTION_META[t.type] ?? { icon: <Gift size={14} color={PALETTE.red} />, label: 'Activity', bg: '#FDEDE8' };
        const date = t.createdAt?.toDate ? t.createdAt.toDate() : null;
        const timeLabel = date ? date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const dateLabel = date ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';
        return (
          <HighlightCard
            key={t.id}
            active={t.id === highlightId}
            glowColor={PALETTE.gold}
            style={{ display: 'flex', gap: 12, padding: '10px 10px', animation: 'cardRise 380ms ease both', animationDelay: `${Math.min(i, 10) * 40}ms` }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 10, background: meta.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {meta.icon}
              </div>
              {!isLast && <div style={{ width: 2, flex: 1, background: PALETTE.eggshell, marginTop: 4 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 11.5, fontWeight: 800, color: PALETTE.ink, margin: 0 }}>{meta.label}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: PALETTE.inkSoft, margin: '2px 0 0' }}>{t.description}</p>
                  {date && (
                    <p style={{ fontSize: 9.5, color: '#B8ADA0', margin: '3px 0 0', fontWeight: 600 }}>{dateLabel} · {timeLabel}</p>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 900, color: positive ? '#16A34A' : '#DC2626', flexShrink: 0 }}>
                  {positive ? '+' : ''}{t.points}
                </span>
              </div>
            </div>
          </HighlightCard>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Product Details — premium bottom sheet shown when a catalog item
// is tapped (image, description-equivalent, MRP, discount, points
// cost, current points, progress bar, estimated eggs remaining).
// Redeem here calls the same redeemReward() flow — no logic change.
// ─────────────────────────────────────────────────────────────

function ConfirmRedeemDialog({ item, currentPoints, highestStage, lifetimeEggScans, saving, error, onConfirm, onCancel, onPlayGame, onScanQR }: {
  item: RewardCatalogItem;
  currentPoints: number;
  highestStage: GameStage;
  lifetimeEggScans: number;
  saving: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
  onPlayGame?: () => void;
  onScanQR?: () => void;
}) {
  const theme = rangeTheme(item.range);
  const remaining = currentPoints - item.pointsCost;
  const requirements = useMemo(
    () => buildRequirementProgress(item, { currentPoints, highestStage, lifetimeEggScans }),
    [item, currentPoints, highestStage, lifetimeEggScans],
  );
  const affordable = allRequirementsMet(requirements);
  const unmet = requirements.filter(r => !r.met);
  const onlyStageMissing = unmet.length === 1 && unmet[0].kind === 'stage';
  const eggsUnmet = unmet.find(r => r.kind === 'eggScans');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(43,36,32,0.55)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto',
          background: PALETTE.warmWhite, borderRadius: '26px 26px 0 0',
          animation: 'hiFadeIn 280ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 4, background: PALETTE.eggshell, margin: '14px auto 0' }} />
        <button onClick={onCancel} style={{
          position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(43,36,32,0.06)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={15} color={PALETTE.inkSoft} />
        </button>

        {/* Large product image */}
        <div style={{
          margin: '14px 20px 0', height: 140, borderRadius: 20, position: 'relative', overflow: 'hidden',
          background: `linear-gradient(150deg, ${theme.color} 0%, ${theme.color2} 70%, ${theme.color2} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
          <Egg size={62} color="rgba(255,255,255,0.97)" strokeWidth={1.3} style={{ filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.25))' }} />
        </div>

        <div style={{ padding: '18px 22px 24px' }}>
          <p style={{ fontSize: 18, fontWeight: 900, color: PALETTE.ink, margin: '0 0 4px' }}>{item.productName}</p>
          <p style={{ fontSize: 12.5, color: PALETTE.inkSoft, margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
            Redeem your reward points for a real discount on {item.productName} at any SKM outlet. Minimum purchase of ₹{item.minimumPurchase} applies.
          </p>

          {/* MRP / Discount / Points row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            <DetailStat label="MRP" value={`₹${item.mrp}`} />
            <DetailStat label="Discount" value={`₹${item.discountAmount}`} highlight />
            <DetailStat label="Final Price" value={`₹${Math.max(0, item.mrp - item.discountAmount)}`} />
          </div>

          {/* Requirements checklist — generic, one row per requirement (points/stage/eggs/future kinds) */}
          <div style={{ background: PALETTE.cream, borderRadius: 16, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: PALETTE.inkSoft, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Reward Requirements
            </p>

            {requirements.map((req, i) => (
              <div key={req.kind}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {req.met ? <CheckCircle2 size={16} color="#16A34A" /> : <XCircle size={16} color="#DC2626" />}
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: PALETTE.ink, flex: 1 }}>{req.icon} {req.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: PALETTE.inkSoft }}>
                    {req.currentLabel ?? req.current} / {req.targetLabel ?? req.target}
                  </span>
                </div>
                <div style={{ height: 7, background: PALETTE.eggshell, borderRadius: 12, overflow: 'hidden', marginBottom: i < requirements.length - 1 ? 12 : 0 }}>
                  <div style={{
                    height: '100%',
                    width: `${req.target > 0 ? Math.min(100, Math.round((req.current / req.target) * 100)) : 100}%`,
                    borderRadius: 12, transition: 'width 700ms cubic-bezier(0.34,1.56,0.4,1)',
                    background: req.met ? 'linear-gradient(90deg,#4ADE80,#16A34A)' : `linear-gradient(90deg, ${PALETTE.gold}, ${PALETTE.red})`,
                  }} />
                </div>
              </div>
            ))}

            {/* Overall progress */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${PALETTE.eggshell}` }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.3 }}>Overall Progress</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: affordable ? '#16A34A' : PALETTE.goldDeep }}>{overallRequirementPct(requirements)}%</span>
            </div>

            {!affordable && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 10.5, fontWeight: 800, color: PALETTE.inkSoft, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  Requirements Remaining
                </p>
                {unmet.map(r => (
                  <p key={r.kind} style={{ fontSize: 11, fontWeight: 600, color: PALETTE.ink, margin: '0 0 2px' }}>
                    • {r.kind === 'eggScans' ? `Scan ${r.target - r.current} more SKM Eggs`
                      : r.kind === 'stage' ? `Reach ${r.targetLabel}`
                      : `Earn ${r.target - r.current} more points`}
                  </p>
                ))}
              </div>
            )}
          </div>

          {error && <p style={{ fontSize: 12, color: PALETTE.red, textAlign: 'center', margin: '0 0 14px' }}>{error}</p>}

          {affordable && (
            <p style={{ fontSize: 11, color: PALETTE.inkSoft, textAlign: 'center', margin: '0 0 14px' }}>
              {remaining} pts will remain after redemption
            </p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} style={{
              flex: 1, padding: '14px 0', borderRadius: 14, border: `1.5px solid ${PALETTE.eggshell}`,
              background: PALETTE.warmWhite, color: PALETTE.red, fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>
              Not Now
            </button>
            {affordable ? (
              <button className="rc-btn-ripple" disabled={saving} onClick={onConfirm} style={{
                flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
                background: `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})`,
                color: '#fff', fontWeight: 900, fontSize: 14, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {saving ? 'Claiming…' : 'Claim Coupon'}
              </button>
            ) : onlyStageMissing ? (
              <button className="rc-btn-ripple" disabled={!onPlayGame} onClick={onPlayGame} style={{
                flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
                background: onPlayGame ? `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})` : PALETTE.eggshell,
                color: onPlayGame ? '#fff' : PALETTE.inkSoft,
                fontWeight: 900, fontSize: 14, cursor: onPlayGame ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                Continue Game
              </button>
            ) : eggsUnmet ? (
              <button className="rc-btn-ripple" disabled={!onScanQR} onClick={onScanQR} style={{
                flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
                background: onScanQR ? `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})` : PALETTE.eggshell,
                color: onScanQR ? '#fff' : PALETTE.inkSoft,
                fontWeight: 900, fontSize: 14, cursor: onScanQR ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                📷 Scan More Eggs
              </button>
            ) : (
              <button disabled style={{
                flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
                background: PALETTE.eggshell, color: PALETTE.inkSoft,
                fontWeight: 900, fontSize: 14, cursor: 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Lock size={13} color={PALETTE.inkSoft} /> Locked
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: PALETTE.cream, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
      <p style={{ fontSize: 8.5, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 900, color: highlight ? PALETTE.red : PALETTE.ink, margin: 0 }}>{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Success screen — reward redeemed micro-interaction (glow + scale
// pop-in), shown after a successful redemption.
// ─────────────────────────────────────────────────────────────

function RedeemSuccessScreen({ coupon, onViewCoupons, onDone }: {
  coupon: RewardCoupon;
  onViewCoupons: () => void;
  onDone: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: PALETTE.cream, zIndex: 200,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%', background: `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
        animation: 'popIn 500ms cubic-bezier(0.34,1.56,0.64,1), glowPulse 1.8s ease-in-out infinite 500ms',
        boxShadow: '0 0 0 0 rgba(180,35,24,0.4)',
      }}>
        <ShieldCheck size={52} color="#fff" />
      </div>
      <p style={{ fontSize: 20, fontWeight: 900, color: PALETTE.ink, margin: '0 0 4px', textAlign: 'center' }}>Reward Redeemed!</p>
      <p style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '0 0 24px', textAlign: 'center' }}>{coupon.rewardTitle}</p>

      <div style={{
        width: '100%', maxWidth: 340, background: PALETTE.warmWhite, borderRadius: 20, padding: 22,
        boxShadow: '0 4px 20px rgba(43,36,32,0.08)', border: `1px solid ${PALETTE.eggshell}`, textAlign: 'center', marginBottom: 24,
        animation: 'couponUnlock 450ms cubic-bezier(0.34,1.3,0.64,1) 150ms both',
      }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Coupon Code</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: PALETTE.red, letterSpacing: 1.5, margin: '6px 0 14px', fontFamily: 'monospace' }}>{coupon.couponCode}</p>
        <div style={{ height: 1, background: PALETTE.eggshell, margin: '0 0 14px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', margin: 0 }}>Discount</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: PALETTE.ink, margin: '3px 0 0' }}>₹{coupon.discountAmount}</p>
          </div>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: PALETTE.inkSoft, textTransform: 'uppercase', margin: 0 }}>Expires</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: PALETTE.ink, margin: '3px 0 0' }}>{coupon.expiryDate}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 340 }}>
        <button onClick={() => { HapticService.selection(); onDone(); }} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: `1.5px solid ${PALETTE.eggshell}`,
          background: PALETTE.warmWhite, color: PALETTE.red, fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}>
          Done
        </button>
        <button className="rc-btn-ripple" onClick={onViewCoupons} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
          background: `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})`, color: '#fff',
          fontWeight: 900, fontSize: 14, cursor: 'pointer',
        }}>
          View Coupons
        </button>
      </div>
    </div>
  );
}
