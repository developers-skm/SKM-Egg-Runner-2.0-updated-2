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
  type RewardCatalogItem, type RewardCoupon, type CouponStatus,
} from '../services/protein/rewardCouponService';
import { getTodayStats } from '../services/protein/proteinTrackerService';
import { MEMBERSHIP_TIERS, POINTS_PER_SCAN, type MembershipTier } from '../constants/rewards';
import { useNavigation, type NavTarget } from '../context/NavigationContext';
import HighlightCard from './HighlightCard';

interface RewardsClubScreenProps {
  user: User;
  onBack: () => void;
  onScanQR?: () => void;
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

// ── Premium warm palette (brief: cream, warm white, soft gold, eggshell, SKM red as accent) ──
const PALETTE = {
  cream:       '#FBF6EE',
  eggshell:    '#F6EEE0',
  warmWhite:   '#FFFDF9',
  gold:        '#C9974A',
  goldDeep:    '#A9782F',
  lightOrange: '#F4A259',
  ink:         '#2B2420',
  inkSoft:     '#7A6F60',
  red:         '#C4290D',
  redDeep:     '#951F0A',
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

export default function RewardsClubScreen({ user, onBack, onScanQR, navTarget }: RewardsClubScreenProps) {
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

  const [confirmItem, setConfirmItem] = useState<RewardCatalogItem | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemErr, setRedeemErr] = useState('');
  const [successCoupon, setSuccessCoupon] = useState<RewardCoupon | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, cat, cp, tx, today] = await Promise.all([
        getRewardWallet(user.uid),
        getRewardCatalog(),
        getUserCoupons(user.uid),
        getRecentRewardTransactions(user.uid, 30),
        getTodayStats(user.uid),
      ]);
      setWallet(w); setCatalog(cat); setCoupons(cp); setTransactions(tx);
      setTodayEggs(today?.totalEggs ?? 0);
      setTodayProtein(today?.totalProtein ?? 0);
      setTodayGoal(today?.goal ?? 0);
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
  const highlightCouponId       = navTarget?.section === 'coupons' ? navTarget.entityId : undefined;
  const highlightMostRecentRedeem = navTarget?.section === 'history';

  useEffect(() => {
    if (highlightMembershipCard || highlightRewardBalance || highlightCouponId || highlightMostRecentRedeem) consumeTarget();
  }, [highlightMembershipCard, highlightRewardBalance, highlightCouponId, highlightMostRecentRedeem, consumeTarget]);

  const handleRedeem = async () => {
    if (!confirmItem || !wallet) return;
    setRedeeming(true); setRedeemErr('');
    try {
      const coupon = await redeemReward(user.uid, confirmItem);
      setConfirmItem(null);
      setSuccessCoupon(coupon);
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

      {/* ── Fixed header ── */}
      <div style={{
        background: `linear-gradient(160deg, ${PALETTE.red} 0%, ${PALETTE.redDeep} 60%, #6E1808 100%)`,
        padding: '14px 16px 0', flexShrink: 0, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onBack} style={{
              width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <ChevronLeft size={17} color="#fff" />
            </button>
            <h2 style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: 0.2 }}>SKM Rewards Club</h2>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.16)',
            borderRadius: 18, padding: '5px 11px 5px 8px',
          }}>
            <Coins size={12} color="#FFD97A" />
            <RewardPointPill points={wallet.currentPoints} />
          </div>
        </div>

        {/* ── Segmented tab bar ── */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.18)', borderRadius: 13, padding: 4 }}>
          {HUB_TABS.map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: active ? PALETTE.warmWhite : 'transparent',
                color: active ? PALETTE.red : 'rgba(255,255,255,0.75)',
                fontWeight: 800, fontSize: 11.5, transition: 'all 150ms ease',
              }}>
                {t.label}
              </button>
            );
          })}
        </div>
        <div style={{ height: 12 }} />
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
            onSelect={item => { setRedeemErr(''); setConfirmItem(item); }}
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
          <HistoryTab transactions={transactions} highlightMostRecentRedeem={navTarget?.section === 'history'} />
        )}
      </div>

      {/* ── Redemption confirm dialog ── */}
      {confirmItem && (
        <ConfirmRedeemDialog
          item={confirmItem}
          currentPoints={wallet.currentPoints}
          saving={redeeming}
          error={redeemErr}
          onConfirm={handleRedeem}
          onCancel={() => setConfirmItem(null)}
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
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(201,151,74,0.45); } 50% { box-shadow: 0 0 0 7px rgba(201,151,74,0); } }
        @keyframes cardRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes journeyLine { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes badgePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes couponUnlock { 0% { transform: scale(0.9) rotate(-1deg); opacity: 0; } 60% { transform: scale(1.02) rotate(0.5deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
        .rc-product-card { transition: transform 200ms ease, box-shadow 200ms ease; }
        .rc-product-card:hover { transform: translateY(-3px) scale(1.015); box-shadow: 0 10px 24px rgba(0,0,0,0.1); }
        .rc-coupon-card { transition: transform 200ms ease, box-shadow 200ms ease; }
        .rc-coupon-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
        .rc-btn-ripple { position: relative; overflow: hidden; }
        .rc-btn-ripple:active::after {
          content: ''; position: absolute; inset: 0; background: rgba(255,255,255,0.35);
          animation: rcRipple 380ms ease-out;
        }
        @keyframes rcRipple { from { opacity: 1; } to { opacity: 0; } }
        .rc-carousel::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function RewardPointPill({ points }: { points: number }) {
  const animated = useCountUp(points);
  return (
    <span style={{ fontSize: 12.5, fontWeight: 900, color: '#fff' }}>{animated} <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>pts</span></span>
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

      {/* 7. FLASH OFFERS — presentational promo banners (no backend logic changed) */}
      <FlashOffers />

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

  return (
    <HighlightCard active={!!highlight} glowColor="#FFE9A8" style={{
      position: 'relative', overflow: 'hidden', padding: '14px 16px 13px',
      background: `linear-gradient(135deg, ${PALETTE.redDeep} 0%, ${PALETTE.red} 45%, ${PALETTE.lightOrange} 130%)`,
      animation: 'hiFadeIn 400ms ease',
      boxShadow: '0 10px 24px rgba(196,41,13,0.26)',
    }}>
      <div style={{ position: 'absolute', top: -46, right: -36, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />

      {/* Row 1: tier + balance, side by side for density */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative' }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '4px 10px 4px 7px', marginBottom: 7,
          }}>
            <Crown size={11} color="#FFE9A8" />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>{wallet.membership} Member</span>
          </div>
          <p style={{ fontSize: 30, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1, letterSpacing: -1 }}>
            {animatedPoints}<span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', marginLeft: 5 }}>Reward Points</span>
          </p>
        </div>
        <ShieldCheck size={16} color="rgba(255,255,255,0.6)" />
      </div>

      {/* Row 2: Next reward — coupon + product, single dense line */}
      {nextReward && (
        <div style={{ marginTop: 10, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              <Gift size={10} color="#FFE9A8" /> Next Reward
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#FFE9A8' }}>
              {unlocked ? 'Ready to redeem!' : `${remaining} pts to go`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 7 }}>
            <span style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>₹{nextReward.discountAmount} OFF</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{nextReward.productName}</span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 7, background: 'rgba(0,0,0,0.22)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 12, transition: 'width 700ms cubic-bezier(0.34,1.56,0.4,1)',
              background: 'linear-gradient(90deg,#FFE9A8,#FFB020)', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%', background: 'rgba(255,255,255,0.35)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.65)', margin: 0 }}>
              {wallet.currentPoints} / {nextReward.pointsCost} Points
            </p>
            {!unlocked && eggsRemaining > 0 && (
              <p style={{ fontSize: 9, fontWeight: 800, color: '#FFE9A8', margin: 0 }}>
                ≈ Scan {eggsRemaining} More Egg{eggsRemaining === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Row 3: motivational CTA */}
      <button
        className="rc-btn-ripple"
        onClick={onScanQR}
        disabled={!onScanQR}
        style={{
          marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 14, border: 'none',
          background: PALETTE.warmWhite, color: PALETTE.red, fontWeight: 900, fontSize: 12, position: 'relative',
          cursor: onScanQR ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          boxShadow: '0 6px 16px rgba(0,0,0,0.16)',
        }}
      >
        <QrCode size={14} color={PALETTE.red} />
        {nextReward ? `Scan Eggs to Unlock ₹${nextReward.discountAmount} OFF` : 'Scan Eggs to Earn Points'}
        <ArrowRight size={13} color={PALETTE.red} />
      </button>
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

function FlashOffers() {
  const midnight = useMemo(() => {
    const d = new Date(); d.setHours(24, 0, 0, 0); return d;
  }, []);
  const sundayEnd = useMemo(() => {
    const d = new Date();
    const daysUntilSunday = (7 - d.getDay()) % 7;
    d.setDate(d.getDate() + daysUntilSunday);
    d.setHours(24, 0, 0, 0);
    return d;
  }, []);
  const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;

  const dailyMs = useCountdown(midnight);
  const weekendMs = useCountdown(sundayEnd);

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, animation: 'hiFadeIn 700ms ease' }}>
      <p style={{ fontSize: 12.5, fontWeight: 900, color: PALETTE.ink, margin: '0 0 2px 2px' }}>Flash Offers</p>

      <div style={{
        borderRadius: 18, padding: '13px 15px', position: 'relative', overflow: 'hidden',
        background: `linear-gradient(135deg, #7C3AED, #5B21B6)`,
      }}>
        <div style={{ position: 'absolute', top: -20, right: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, color: '#fff',
              background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '3px 8px', marginBottom: 6,
              animation: 'badgePulse 1.8s ease-in-out infinite',
            }}>
              <Zap size={9} color="#fff" /> TODAY ONLY
            </span>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', margin: 0 }}>Double Points Day</p>
            <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.8)', margin: '2px 0 0', fontWeight: 600 }}>Protein Week Bonus — scan today to celebrate</p>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <Timer size={14} color="rgba(255,255,255,0.85)" style={{ marginBottom: 3 }} />
            <p style={{ fontSize: 11, fontWeight: 900, color: '#fff', margin: 0, fontFamily: 'monospace' }}>{formatCountdown(dailyMs)}</p>
          </div>
        </div>
      </div>

      {isWeekend && (
        <div style={{
          borderRadius: 18, padding: '13px 15px', position: 'relative', overflow: 'hidden',
          background: `linear-gradient(135deg, ${PALETTE.gold}, ${PALETTE.goldDeep})`,
        }}>
          <div style={{ position: 'absolute', top: -20, right: -16, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            <div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, color: '#fff',
                background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '3px 8px', marginBottom: 6,
              }}>
                <Sparkles size={9} color="#fff" /> WEEKEND SPECIAL
              </span>
              <p style={{ fontSize: 14, fontWeight: 900, color: '#fff', margin: 0 }}>Extra Reward Points</p>
              <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', fontWeight: 600 }}>Scan more this weekend to celebrate with us</p>
            </div>
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <Timer size={14} color="rgba(255,255,255,0.85)" style={{ marginBottom: 3 }} />
              <p style={{ fontSize: 11, fontWeight: 900, color: '#fff', margin: 0, fontFamily: 'monospace' }}>{formatCountdown(weekendMs)}</p>
            </div>
          </div>
        </div>
      )}
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

interface CatalogSection { key: string; title: string; icon: React.ReactNode; items: RewardCatalogItem[] }

function buildCatalogSections(catalog: RewardCatalogItem[]): CatalogSection[] {
  if (catalog.length === 0) return [];
  const byRange = (range: string) => catalog.filter(c => c.range === range);
  const sections: CatalogSection[] = [];

  const featured = [...catalog].sort((a, b) => b.discountAmount - a.discountAmount).slice(0, 6);
  if (featured.length > 0) sections.push({ key: 'featured', title: 'Featured Rewards', icon: <Flame size={14} color={PALETTE.red} />, items: featured });

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

function RewardsTab({ catalog, categories, categoryFilter, onCategoryChange, wallet, onSelect }: {
  catalog: RewardCatalogItem[];
  categories: string[];
  categoryFilter: string;
  onCategoryChange: (c: string) => void;
  wallet: RewardWallet;
  onSelect: (item: RewardCatalogItem) => void;
}) {
  const sections = useMemo(() => buildCatalogSections(catalog), [catalog]);

  return (
    <>
      {/* Category pills */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {categories.map(cat => {
            const active = categoryFilter === cat;
            return (
              <button key={cat} onClick={() => onCategoryChange(cat)} style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
                border: active ? 'none' : `1px solid ${PALETTE.eggshell}`,
                background: active ? `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})` : PALETTE.warmWhite,
                color: active ? '#fff' : PALETTE.inkSoft,
                fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap',
                boxShadow: active ? '0 4px 12px rgba(196,41,13,0.25)' : '0 1px 4px rgba(0,0,0,0.04)',
                transition: 'all 180ms ease',
              }}>
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {catalog.length === 0 ? (
        <RewardsEmptyState />
      ) : categoryFilter !== 'All' ? (
        // Filtered by category — flat grid (sections don't make sense once filtered)
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 4 }}>
          {catalog.map((item, i) => (
            <ProductCard key={item.id} item={item} index={i} affordable={wallet.currentPoints >= item.pointsCost} onSelect={() => onSelect(item)} />
          ))}
        </div>
      ) : (
        // Unfiltered — premium sectioned storefront, horizontally scrollable
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 6 }}>
          {sections.map(section => (
            <div key={section.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '0 2px' }}>
                {section.icon}
                <p style={{ fontSize: 13, fontWeight: 900, color: PALETTE.ink, margin: 0 }}>{section.title}</p>
              </div>
              <div className="rc-carousel" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                {section.items.map((item, i) => (
                  <ProductCard key={item.id} item={item} index={i} affordable={wallet.currentPoints >= item.pointsCost} onSelect={() => onSelect(item)} compact />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProductCard({ item, index, affordable, onSelect, compact }: {
  item: RewardCatalogItem;
  index: number;
  affordable: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const theme = rangeTheme(item.range);
  return (
    <button
      className="rc-product-card rc-btn-ripple"
      onClick={onSelect}
      style={{
        background: PALETTE.warmWhite, borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 10px rgba(43,36,32,0.06)',
        border: `1px solid ${PALETTE.eggshell}`, display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 0, cursor: 'pointer',
        animation: `cardRise 420ms ease both`, animationDelay: `${Math.min(index, 8) * 60}ms`,
        flexShrink: 0, width: compact ? 152 : undefined,
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${theme.color}, ${theme.color2})` }} />

      {/* Product art */}
      <div style={{
        height: compact ? 96 : 128, background: `linear-gradient(150deg, ${theme.color} 0%, ${theme.color2} 65%, ${theme.color2} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        {/* diagonal light sweep */}
        <div style={{ position: 'absolute', top: -30, left: -20, width: '140%', height: 60, background: 'rgba(255,255,255,0.1)', transform: 'rotate(-10deg)', pointerEvents: 'none' }} />
        <Egg size={compact ? 36 : 50} color="rgba(255,255,255,0.97)" strokeWidth={1.4} style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.25))' }} />
        <span style={{
          position: 'absolute', top: 8, left: 8, fontSize: 8.5, fontWeight: 800, color: '#fff',
          background: 'rgba(0,0,0,0.28)', borderRadius: 8, padding: '3px 7px', textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          {theme.label}
        </span>
      </div>

      <div style={{ padding: compact ? '10px 11px 12px' : '13px 13px 15px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p style={{ fontSize: compact ? 11 : 12, fontWeight: 800, color: PALETTE.ink, margin: 0, lineHeight: 1.3 }}>{item.productName}</p>
        <p style={{ fontSize: compact ? 9 : 10, color: PALETTE.inkSoft, margin: compact ? '2px 0 8px' : '3px 0 10px', fontWeight: 600, textDecoration: 'line-through' }}>MRP ₹{item.mrp}</p>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: compact ? 8 : 10 }}>
          <span style={{ fontSize: compact ? 15 : 17, fontWeight: 900, color: PALETTE.red }}>₹{item.discountAmount}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: PALETTE.inkSoft }}>OFF</span>
        </div>

        <div
          style={{
            marginTop: 'auto', padding: compact ? '8px 0' : '9px 0', borderRadius: 12, border: affordable ? 'none' : `1.5px solid ${PALETTE.eggshell}`,
            background: affordable ? `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})` : PALETTE.warmWhite,
            color: affordable ? '#fff' : PALETTE.inkSoft,
            fontWeight: 800, fontSize: compact ? 10 : 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          {affordable ? <Zap size={11} color="#fff" /> : <Lock size={10} color={PALETTE.inkSoft} />}
          {item.pointsCost} pts
        </div>
      </div>
    </button>
  );
}

function RewardsEmptyState() {
  return (
    <div style={{
      background: PALETTE.warmWhite, borderRadius: 22, padding: '32px 24px', textAlign: 'center',
      boxShadow: '0 2px 10px rgba(43,36,32,0.06)', border: `1px dashed ${PALETTE.eggshell}`,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%', background: `linear-gradient(135deg, #FDEDE8, ${PALETTE.eggshell})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <Egg size={30} color={PALETTE.red} strokeWidth={1.5} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 900, color: PALETTE.ink, margin: '0 0 8px' }}>Start Your Reward Journey</p>
      <p style={{ fontSize: 12, color: PALETTE.inkSoft, margin: '0 0 16px', lineHeight: 1.6 }}>
        Every SKM Egg you scan earns Protein, Reward Points, Sticker Progress, and Passport Progress.
      </p>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FDEDE8', borderRadius: 14, padding: '10px 16px' }}>
        <Sparkles size={14} color={PALETTE.red} />
        <span style={{ fontSize: 12, fontWeight: 800, color: PALETTE.red }}>Complete 100 Points to unlock your first reward</span>
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

function HistoryTab({ transactions, highlightMostRecentRedeem }: { transactions: RewardTransaction[]; highlightMostRecentRedeem?: boolean }) {
  const mostRecentRedeemId = highlightMostRecentRedeem
    ? transactions.find(t => t.type === 'redeem')?.id
    : undefined;

  if (transactions.length === 0) {
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

function ConfirmRedeemDialog({ item, currentPoints, saving, error, onConfirm, onCancel }: {
  item: RewardCatalogItem;
  currentPoints: number;
  saving: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = rangeTheme(item.range);
  const remaining = currentPoints - item.pointsCost;
  const pointsShort = Math.max(0, item.pointsCost - currentPoints);
  const eggsRemaining = Math.ceil(pointsShort / POINTS_PER_SCAN);
  const pct = Math.min(100, Math.round((currentPoints / item.pointsCost) * 100));
  const affordable = currentPoints >= item.pointsCost;

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
            <DetailStat label="Points Required" value={String(item.pointsCost)} />
          </div>

          {/* Progress */}
          <div style={{ background: PALETTE.cream, borderRadius: 16, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.inkSoft }}>Your Current Points</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: PALETTE.ink }}>{currentPoints} / {item.pointsCost}</span>
            </div>
            <div style={{ height: 8, background: PALETTE.eggshell, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`, borderRadius: 12, transition: 'width 700ms cubic-bezier(0.34,1.56,0.4,1)',
                background: `linear-gradient(90deg, ${PALETTE.gold}, ${PALETTE.red})`,
              }} />
            </div>
            {!affordable && eggsRemaining > 0 && (
              <p style={{ fontSize: 10.5, fontWeight: 700, color: PALETTE.goldDeep, margin: '8px 0 0' }}>
                ≈ Scan {eggsRemaining} more egg{eggsRemaining === 1 ? '' : 's'} to unlock this reward
              </p>
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
              Cancel
            </button>
            <button className="rc-btn-ripple" disabled={saving || !affordable} onClick={onConfirm} style={{
              flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
              background: affordable ? `linear-gradient(135deg, ${PALETTE.red}, ${PALETTE.redDeep})` : PALETTE.eggshell,
              color: affordable ? '#fff' : PALETTE.inkSoft,
              fontWeight: 900, fontSize: 14, opacity: saving ? 0.6 : 1, cursor: saving || !affordable ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {!affordable ? <Lock size={13} color={PALETTE.inkSoft} /> : null}
              {saving ? 'Redeeming…' : affordable ? 'Redeem Now' : 'Not Enough Points'}
            </button>
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
        width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(135deg,#22C55E,#16A34A)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
        animation: 'popIn 500ms cubic-bezier(0.34,1.56,0.64,1), glowPulse 1.8s ease-in-out infinite 500ms',
        boxShadow: '0 0 0 0 rgba(34,197,94,0.4)',
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
        <button onClick={onDone} style={{
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
