import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { User } from 'firebase/auth';
import {
  ChevronLeft, Gift, Coins, Crown, Ticket, TrendingUp, ShieldCheck,
  Clock, CheckCircle2, XCircle, Flame, Award, Sparkles, ChevronRight,
  Egg, Lock, Zap, ArrowRight, QrCode,
} from 'lucide-react';
import {
  getRewardWallet, type RewardWallet,
} from '../services/protein/rewardWalletService';
import {
  getRecentRewardTransactions, type RewardTransaction,
} from '../services/protein/rewardTransactionService';
import {
  getRewardCatalog, redeemReward, getUserCoupons, markCouponUsed,
  type RewardCatalogItem, type RewardCoupon, type CouponStatus,
} from '../services/protein/rewardCouponService';
import { getTodayStats } from '../services/protein/proteinTrackerService';
import { MEMBERSHIP_TIERS, type MembershipTier } from '../constants/rewards';

interface RewardsClubScreenProps {
  user: User;
  onBack: () => void;
  onScanQR?: () => void;
}

type HubTab = 'overview' | 'rewards' | 'coupons' | 'history';
type CouponFilterTab = 'available' | 'used' | 'expired';

const HUB_TABS: { key: HubTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'rewards',  label: 'Rewards' },
  { key: 'coupons',  label: 'Coupons' },
  { key: 'history',  label: 'History' },
];

// ── Egg-range visual identity (icon-based product art — no stock photos in repo) ──
const RANGE_THEME: Record<string, { color: string; color2: string; label: string }> = {
  'SKM Best Fresh': { color: '#D71920', color2: '#B31217', label: 'Fresh' },
  'SKM Best Plus':  { color: '#F59E0B', color2: '#D97706', label: 'Plus' },
  'SKM Best Brown': { color: '#92400E', color2: '#78350F', label: 'Brown' },
  'Premium Range':  { color: '#7C3AED', color2: '#5B21B6', label: 'Premium' },
};
function rangeTheme(range: string) {
  return RANGE_THEME[range] ?? { color: '#D71920', color2: '#B31217', label: range };
}

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

export default function RewardsClubScreen({ user, onBack, onScanQR }: RewardsClubScreenProps) {
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

  if (loading || !wallet) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const filteredCoupons = coupons.filter(c => c.status === couponFilter);
  const availableCoupons = coupons.filter(c => c.status === 'available');

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

          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.16)',
            borderRadius: 18, padding: '6px 12px 6px 9px',
          }}>
            <Coins size={13} color="#FFD97A" />
            <RewardPointPill points={wallet.currentPoints} />
          </div>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 90px', display: 'flex', flexDirection: 'column', gap: tab === 'overview' ? 0 : 14 }}>

        {tab === 'overview' && (
          <OverviewTab
            wallet={wallet}
            nextReward={nextReward}
            todayEggs={todayEggs}
            todayProtein={todayProtein}
            todayGoal={todayGoal}
            todayPointsEarned={todayPointsEarned}
            onScanQR={onScanQR}
            onViewRewards={() => setTab('rewards')}
          />
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
          />
        )}

        {tab === 'history' && (
          <HistoryTab transactions={transactions} />
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

      <style>{`
        @keyframes hiFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(215,25,32,0.35); } 50% { box-shadow: 0 0 0 6px rgba(215,25,32,0); } }
        @keyframes heroDrift { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes cardRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
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
      `}</style>
    </div>
  );
}

function RewardPointPill({ points }: { points: number }) {
  const animated = useCountUp(points);
  return (
    <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{animated} <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>pts</span></span>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 1 — Overview (motivate; fits ~one screen)
// ─────────────────────────────────────────────────────────────

function OverviewTab({
  wallet, nextReward, todayEggs, todayProtein, todayGoal, todayPointsEarned, onScanQR, onViewRewards,
}: {
  wallet: RewardWallet;
  nextReward: RewardCatalogItem | null;
  todayEggs: number;
  todayProtein: number;
  todayGoal: number;
  todayPointsEarned: number;
  onScanQR?: () => void;
  onViewRewards: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 1. HERO WALLET CARD — membership, balance, today's numbers, progress, CTA, all in one */}
      <HeroWalletCard
        wallet={wallet}
        nextReward={nextReward}
        todayEggs={todayEggs}
        todayProtein={todayProtein}
        todayGoal={todayGoal}
        todayPointsEarned={todayPointsEarned}
        onScanQR={onScanQR}
      />

      {/* 2. MEMBERSHIP PROGRESS — bare horizontal strip, no card wrapper */}
      <TierStrip currentTier={wallet.membership} />

      {/* 3. NEXT REWARD PREVIEW — single tap-through row */}
      {nextReward && <NextRewardRow item={nextReward} onViewRewards={onViewRewards} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero wallet card — the entire "current standing" in one place
// ─────────────────────────────────────────────────────────────

function HeroWalletCard({ wallet, nextReward, todayEggs, todayProtein, todayGoal, todayPointsEarned, onScanQR }: {
  wallet: RewardWallet;
  nextReward: RewardCatalogItem | null;
  todayEggs: number;
  todayProtein: number;
  todayGoal: number;
  todayPointsEarned: number;
  onScanQR?: () => void;
}) {
  const animatedPoints = useCountUp(wallet.currentPoints);
  const tierEmoji: Record<MembershipTier, string> = { Bronze: '🥉', Silver: '🥈', Gold: '🥇', Platinum: '💠', Diamond: '💎' };

  const pct = nextReward ? Math.min(100, Math.round((wallet.currentPoints / nextReward.pointsCost) * 100)) : 0;
  const remaining = nextReward ? Math.max(0, nextReward.pointsCost - wallet.currentPoints) : 0;
  const unlocked = nextReward ? wallet.currentPoints >= nextReward.pointsCost : false;

  return (
    <div style={{
      position: 'relative', overflow: 'hidden', borderRadius: 30, padding: '24px 22px 22px',
      background: 'linear-gradient(135deg,#B8280C 0%,#D71920 38%,#EA5A1F 78%,#F59E0B 130%)',
      backgroundSize: '180% 180%',
      animation: 'hiFadeIn 400ms ease, heroDrift 14s ease-in-out infinite',
      boxShadow: '0 16px 40px rgba(199,42,17,0.32)',
    }}>
      {/* ambient warmth */}
      <div style={{ position: 'absolute', top: -70, right: -50, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.09)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -60, left: -40, width: 170, height: 170, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', pointerEvents: 'none' }} />

      {/* Row 1: tier pill + wallet icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '5px 12px 5px 8px',
        }}>
          <span style={{ fontSize: 14 }}>{tierEmoji[wallet.membership]}</span>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>{wallet.membership} Member</span>
        </div>
        <ShieldCheck size={18} color="rgba(255,255,255,0.85)" />
      </div>

      {/* Row 2: the number that matters most */}
      <div style={{ marginTop: 14, position: 'relative' }}>
        <p style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 2px' }}>Reward Balance</p>
        <p style={{ fontSize: 46, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1, letterSpacing: -1 }}>
          {animatedPoints}<span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.75)', marginLeft: 6 }}>pts</span>
        </p>
      </div>

      {/* Row 3: today's 3 numbers — inline, no boxes, just typography + dividers */}
      <div style={{
        marginTop: 16, display: 'flex', position: 'relative',
        background: 'rgba(0,0,0,0.14)', borderRadius: 16, padding: '11px 4px',
      }}>
        <TodayFigure value={String(todayEggs)} label="Eggs Today" />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.18)', margin: '2px 0' }} />
        <TodayFigure value={`${todayProtein}${todayGoal ? `/${todayGoal}` : ''}g`} label="Protein" />
        <div style={{ width: 1, background: 'rgba(255,255,255,0.18)', margin: '2px 0' }} />
        <TodayFigure value={`+${todayPointsEarned}`} label="Points Today" />
      </div>

      {/* Row 4: progress to next coupon */}
      {nextReward && (
        <div style={{ marginTop: 16, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              Next: <span style={{ color: '#fff', fontWeight: 900 }}>₹{nextReward.discountAmount} OFF</span>
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#FFE9A8' }}>
              {unlocked ? 'Ready to redeem!' : `${remaining} pts to go`}
            </span>
          </div>
          <div style={{ height: 10, background: 'rgba(0,0,0,0.22)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 12, transition: 'width 700ms cubic-bezier(0.34,1.56,0.4,1)',
              background: 'linear-gradient(90deg,#FFE9A8,#FFB020)', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%', background: 'rgba(255,255,255,0.35)' }} />
            </div>
          </div>
        </div>
      )}

      {/* Row 5: CTA */}
      <button
        className="rc-btn-ripple"
        onClick={onScanQR}
        disabled={!onScanQR}
        style={{
          marginTop: 18, width: '100%', padding: '14px 0', borderRadius: 15, border: 'none',
          background: '#fff', color: '#C4290D', fontWeight: 900, fontSize: 14, position: 'relative',
          cursor: onScanQR ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 8px 18px rgba(0,0,0,0.18)',
        }}
      >
        <QrCode size={16} color="#C4290D" /> Continue Scanning <ArrowRight size={15} color="#C4290D" />
      </button>
    </div>
  );
}

function TodayFigure({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.68)', textTransform: 'uppercase', letterSpacing: 0.4, margin: '3px 0 0' }}>{label}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Membership tier strip — bare, no card wrapper
// ─────────────────────────────────────────────────────────────

function TierStrip({ currentTier }: { currentTier: MembershipTier }) {
  const currentIdx = MEMBERSHIP_TIERS.findIndex(t => t.tier === currentTier);

  return (
    <div style={{ animation: 'hiFadeIn 500ms ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 10px' }}>
        <p style={{ fontSize: 10.5, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.8, margin: 0 }}>Membership Progress</p>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#D71920' }}>{currentTier}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {MEMBERSHIP_TIERS.map((t, i) => {
          const reached = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={t.tier} style={{ display: 'flex', alignItems: 'center', flex: i === MEMBERSHIP_TIERS.length - 1 ? '0 0 auto' : 1, minWidth: 52 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: isCurrent ? 36 : 24, height: isCurrent ? 36 : 24, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: reached ? `linear-gradient(135deg, ${t.color}, ${t.color2})` : '#EFEFEF',
                  boxShadow: isCurrent ? `0 4px 12px ${t.color}55` : 'none',
                  animation: isCurrent ? 'glowPulse 2.2s ease-in-out infinite' : undefined,
                  transition: 'all 250ms ease',
                }}>
                  {reached ? <Crown size={isCurrent ? 16 : 11} color="#fff" /> : <Lock size={10} color="#bbb" />}
                </div>
                <span style={{ fontSize: 8.5, fontWeight: isCurrent ? 900 : 700, color: reached ? '#1A1A1A' : '#bbb', whiteSpace: 'nowrap' }}>
                  {t.tier}
                </span>
              </div>
              {i < MEMBERSHIP_TIERS.length - 1 && (
                <div style={{ flex: 1, height: 2.5, borderRadius: 2, margin: '0 2px', marginBottom: 14, background: i < currentIdx ? '#D71920' : '#EFEFEF', transition: 'background 250ms ease' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Next reward preview — single row, no section label card
// ─────────────────────────────────────────────────────────────

function NextRewardRow({ item, onViewRewards }: { item: RewardCatalogItem; onViewRewards: () => void }) {
  const theme = rangeTheme(item.range);
  return (
    <button onClick={onViewRewards} className="rc-btn-ripple" style={{
      width: '100%', textAlign: 'left', border: '1px solid #F5F0EA', cursor: 'pointer',
      background: '#fff', borderRadius: 20, padding: '14px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
      display: 'flex', alignItems: 'center', gap: 12, animation: 'hiFadeIn 550ms ease',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14, flexShrink: 0,
        background: `linear-gradient(135deg, ${theme.color}, ${theme.color2})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 12px ${theme.color}40`,
      }}>
        <Egg size={22} color="rgba(255,255,255,0.95)" strokeWidth={1.5} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 2px' }}>Next Reward</p>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>{item.productName}</p>
        <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', fontWeight: 600 }}>₹{item.discountAmount} OFF · {item.pointsCost} pts</p>
      </div>
      <ChevronRight size={16} color="#D71920" style={{ flexShrink: 0 }} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 2 — Rewards (Amazon-style shopping grid; nothing else)
// ─────────────────────────────────────────────────────────────

function RewardsTab({ catalog, categories, categoryFilter, onCategoryChange, wallet, onSelect }: {
  catalog: RewardCatalogItem[];
  categories: string[];
  categoryFilter: string;
  onCategoryChange: (c: string) => void;
  wallet: RewardWallet;
  onSelect: (item: RewardCatalogItem) => void;
}) {
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
                border: active ? 'none' : '1px solid #EFEFEF',
                background: active ? 'linear-gradient(135deg,#D71920,#B31217)' : '#fff',
                color: active ? '#fff' : '#666',
                fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap',
                boxShadow: active ? '0 4px 12px rgba(215,25,32,0.25)' : '0 1px 4px rgba(0,0,0,0.04)',
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
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {catalog.map((item, i) => (
            <ProductCard
              key={item.id}
              item={item}
              index={i}
              affordable={wallet.currentPoints >= item.pointsCost}
              onSelect={() => onSelect(item)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ProductCard({ item, index, affordable, onSelect }: {
  item: RewardCatalogItem;
  index: number;
  affordable: boolean;
  onSelect: () => void;
}) {
  const theme = rangeTheme(item.range);
  return (
    <div className="rc-product-card" style={{
      background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
      border: '1px solid #F5F5F5', display: 'flex', flexDirection: 'column',
      animation: `cardRise 420ms ease both`, animationDelay: `${Math.min(index, 8) * 60}ms`,
    }}>
      {/* Top accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${theme.color}, ${theme.color2})` }} />

      {/* Product art */}
      <div style={{
        height: 128, background: `linear-gradient(150deg, ${theme.color} 0%, ${theme.color2} 65%, ${theme.color2} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        {/* diagonal light sweep */}
        <div style={{ position: 'absolute', top: -30, left: -20, width: '140%', height: 60, background: 'rgba(255,255,255,0.1)', transform: 'rotate(-10deg)', pointerEvents: 'none' }} />
        <Egg size={50} color="rgba(255,255,255,0.97)" strokeWidth={1.4} style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.25))' }} />
        <span style={{
          position: 'absolute', top: 9, left: 9, fontSize: 9, fontWeight: 800, color: '#fff',
          background: 'rgba(0,0,0,0.28)', borderRadius: 8, padding: '3px 8px', textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          {theme.label}
        </span>
      </div>

      <div style={{ padding: '13px 13px 15px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#1A1A1A', margin: 0, lineHeight: 1.3 }}>{item.productName}</p>
        <p style={{ fontSize: 10, color: '#bbb', margin: '3px 0 10px', fontWeight: 600, textDecoration: 'line-through' }}>MRP ₹{item.mrp}</p>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: '#D71920' }}>₹{item.discountAmount}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#999' }}>OFF</span>
        </div>

        <button
          className="rc-btn-ripple"
          disabled={!affordable}
          onClick={onSelect}
          style={{
            marginTop: 'auto', padding: '9px 0', borderRadius: 12, border: affordable ? 'none' : '1.5px solid #E8E8E8',
            background: affordable ? 'linear-gradient(135deg,#D71920,#B31217)' : '#fff',
            color: affordable ? '#fff' : '#bbb',
            fontWeight: 800, fontSize: 11, cursor: affordable ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          {affordable ? <Zap size={12} color="#fff" /> : <Lock size={11} color="#bbb" />}
          {item.pointsCost} pts
        </button>
      </div>
    </div>
  );
}

function RewardsEmptyState() {
  return (
    <div style={{
      background: '#fff', borderRadius: 22, padding: '32px 24px', textAlign: 'center',
      boxShadow: '0 2px 10px rgba(0,0,0,0.06)', border: '1px dashed #F0D0D0',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#FEF2F2,#FFF7ED)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <Egg size={30} color="#D71920" strokeWidth={1.5} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 900, color: '#1A1A1A', margin: '0 0 8px' }}>Start Your Reward Journey</p>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px', lineHeight: 1.6 }}>
        Every SKM Egg you scan earns Protein, Reward Points, Sticker Progress, and Passport Progress.
      </p>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FEF2F2', borderRadius: 14, padding: '10px 16px' }}>
        <Sparkles size={14} color="#D71920" />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#D71920' }}>Complete 100 Points to unlock your first reward</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB 3 — Coupons (wallet; nothing else)
// ─────────────────────────────────────────────────────────────

const COUPON_FILTER_TABS: { key: CouponFilterTab; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'used',       label: 'Used' },
  { key: 'expired',    label: 'Expired' },
];

function CouponsTab({ coupons, filter, onFilterChange, onMarkUsed }: {
  coupons: RewardCoupon[];
  filter: CouponFilterTab;
  onFilterChange: (f: CouponFilterTab) => void;
  onMarkUsed: (couponId: string) => void;
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        {COUPON_FILTER_TABS.map(t => {
          const active = filter === t.key;
          return (
            <button key={t.key} onClick={() => onFilterChange(t.key)} style={{
              flex: 1, padding: '9px 0', borderRadius: 12, cursor: 'pointer',
              border: active ? '1.5px solid #D71920' : '1px solid #F0F0F0',
              background: active ? '#FEF2F2' : '#fff',
              color: active ? '#D71920' : '#666',
              fontWeight: 800, fontSize: 12,
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {coupons.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 20, padding: 24, textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <Ticket size={28} color="#ddd" />
          <p style={{ fontSize: 12, color: '#999', margin: '10px 0 0' }}>No {filter} coupons.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {coupons.map(c => (
            <CouponTicket key={c.id} coupon={c} onMarkUsed={() => onMarkUsed(c.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function CouponTicket({ coupon, onMarkUsed }: { coupon: RewardCoupon; onMarkUsed: () => void }) {
  const dim = coupon.status !== 'available';
  return (
    <div className="rc-coupon-card" style={{
      background: '#fff', borderRadius: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
      border: '1px solid #FCE8E8', overflow: 'hidden', opacity: dim ? 0.6 : 1,
    }}>
      <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg,#D71920,#B31217)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Ticket size={20} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>{coupon.rewardTitle}</p>
          <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0' }}>Min. purchase ₹{coupon.minimumPurchase} · Expires {coupon.expiryDate}</p>
        </div>
        <CouponStatusBadge status={coupon.status} />
      </div>
      <div style={{ borderTop: '1.5px dashed #F0D0D0', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 9, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Coupon Code</p>
          <p style={{ fontSize: 16, fontWeight: 900, color: '#D71920', letterSpacing: 1, margin: '2px 0 0', fontFamily: 'monospace' }}>{coupon.couponCode}</p>
        </div>
        <p style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>₹{coupon.discountAmount}</p>
      </div>
      {coupon.status === 'available' && (
        <button onClick={onMarkUsed} style={{
          width: '100%', padding: '10px 0', border: 'none', borderTop: '1px solid #F5F5F5',
          background: '#FAFAFA', color: '#666', fontWeight: 700, fontSize: 11, cursor: 'pointer',
        }}>
          Mark as Used
        </button>
      )}
    </div>
  );
}

function CouponStatusBadge({ status }: { status: CouponStatus }) {
  const meta: Record<CouponStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    available: { label: 'Available', color: '#16A34A', bg: '#F0FDF4', icon: <CheckCircle2 size={12} /> },
    used:      { label: 'Used',      color: '#666',     bg: '#F5F5F5', icon: <CheckCircle2 size={12} /> },
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
// TAB 4 — History (clean vertical timeline; nothing else)
// ─────────────────────────────────────────────────────────────

const TRANSACTION_ICON: Record<RewardTransaction['type'], React.ReactNode> = {
  scan:              <Gift size={13} color="#D71920" />,
  streak_milestone:  <Flame size={13} color="#F59E0B" />,
  sticker_milestone: <Award size={13} color="#7C3AED" />,
  challenge:         <Sparkles size={13} color="#0891B2" />,
  redeem:            <Ticket size={13} color="#DC2626" />,
  adjustment:        <TrendingUp size={13} color="#666" />,
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

function HistoryTab({ transactions }: { transactions: RewardTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 20, padding: 24, textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <Clock size={28} color="#ddd" />
        <p style={{ fontSize: 12, color: '#999', margin: '10px 0 0' }}>No point activity yet.</p>
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
          <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px 4px' }}>{label}</p>
          <div style={{ background: '#fff', borderRadius: 20, padding: 6, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <ActivityTimeline transactions={txs} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityTimeline({ transactions }: { transactions: RewardTransaction[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {transactions.map((t, i) => {
        const positive = t.points >= 0;
        const isLast = i === transactions.length - 1;
        return (
          <div key={t.id} style={{ display: 'flex', gap: 12, padding: '10px 10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9, background: positive ? '#F0FDF4' : '#FEF2F2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {TRANSACTION_ICON[t.type] ?? <Gift size={13} color="#D71920" />}
              </div>
              {!isLast && <div style={{ width: 2, flex: 1, background: '#F0F0F0', marginTop: 4 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>{t.description}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: positive ? '#16A34A' : '#DC2626', flexShrink: 0, marginLeft: 8 }}>
                  {positive ? '+' : ''}{t.points}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Redemption confirm dialog
// ─────────────────────────────────────────────────────────────

function ConfirmRedeemDialog({ item, currentPoints, saving, error, onConfirm, onCancel }: {
  item: RewardCatalogItem;
  currentPoints: number;
  saving: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const remaining = currentPoints - item.pointsCost;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: '#fff', borderRadius: '24px 24px 0 0',
          padding: 24, animation: 'hiFadeIn 250ms ease',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 4, background: '#E8E8E8', margin: '0 auto 18px' }} />
        <p style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px', textAlign: 'center' }}>Redeem {item.productName}?</p>
        <p style={{ fontSize: 12, color: '#999', margin: '0 0 18px', textAlign: 'center' }}>
          ₹{item.discountAmount} OFF · Min. purchase ₹{item.minimumPurchase}
        </p>

        <div style={{ background: '#FAFAFA', borderRadius: 14, padding: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#666' }}>Cost</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#1A1A1A' }}>{item.pointsCost} pts</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#666' }}>Remaining after redemption</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: remaining >= 0 ? '#1A1A1A' : '#DC2626' }}>{remaining} pts</span>
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#D71920', textAlign: 'center', margin: '0 0 14px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '14px 0', borderRadius: 14, border: '1.5px solid #E8E8E8',
            background: '#fff', color: '#D71920', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button className="rc-btn-ripple" disabled={saving} onClick={onConfirm} style={{
            flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff',
            fontWeight: 900, fontSize: 14, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Redeeming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Success screen
// ─────────────────────────────────────────────────────────────

function RedeemSuccessScreen({ coupon, onViewCoupons, onDone }: {
  coupon: RewardCoupon;
  onViewCoupons: () => void;
  onDone: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#FAFAFA', zIndex: 200,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(135deg,#22C55E,#16A34A)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
        animation: 'popIn 500ms cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <ShieldCheck size={52} color="#fff" />
      </div>
      <p style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px', textAlign: 'center' }}>Reward Redeemed!</p>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 24px', textAlign: 'center' }}>{coupon.rewardTitle}</p>

      <div style={{
        width: '100%', maxWidth: 340, background: '#fff', borderRadius: 20, padding: 22,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '1px solid #FCE8E8', textAlign: 'center', marginBottom: 24,
      }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Coupon Code</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#D71920', letterSpacing: 1.5, margin: '6px 0 14px', fontFamily: 'monospace' }}>{coupon.couponCode}</p>
        <div style={{ height: 1, background: '#F5F5F5', margin: '0 0 14px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#999', textTransform: 'uppercase', margin: 0 }}>Discount</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', margin: '3px 0 0' }}>₹{coupon.discountAmount}</p>
          </div>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#999', textTransform: 'uppercase', margin: 0 }}>Expires</p>
            <p style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', margin: '3px 0 0' }}>{coupon.expiryDate}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 340 }}>
        <button onClick={onDone} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: '1.5px solid #E8E8E8',
          background: '#fff', color: '#D71920', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}>
          Done
        </button>
        <button className="rc-btn-ripple" onClick={onViewCoupons} style={{
          flex: 1, padding: '14px 0', borderRadius: 14, border: 'none',
          background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff',
          fontWeight: 900, fontSize: 14, cursor: 'pointer',
        }}>
          View Coupons
        </button>
      </div>
    </div>
  );
}
