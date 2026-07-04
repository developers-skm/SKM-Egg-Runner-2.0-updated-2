import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  ChevronLeft, Gift, Coins, Crown, Ticket, TrendingUp, ShieldCheck,
  Clock, CheckCircle2, XCircle, Flame, Award, Sparkles, ChevronRight,
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
interface RewardsClubScreenProps {
  user: User;
  onBack: () => void;
}

type HubTab = 'overview' | 'rewards' | 'coupons' | 'history';
type CouponFilterTab = 'available' | 'used' | 'expired';

const HUB_TABS: { key: HubTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'rewards',  label: 'Rewards' },
  { key: 'coupons',  label: 'Coupons' },
  { key: 'history',  label: 'History' },
];

export default function RewardsClubScreen({ user, onBack }: RewardsClubScreenProps) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HubTab>('overview');
  const [wallet, setWallet] = useState<RewardWallet | null>(null);
  const [catalog, setCatalog] = useState<RewardCatalogItem[]>([]);
  const [coupons, setCoupons] = useState<RewardCoupon[]>([]);
  const [transactions, setTransactions] = useState<RewardTransaction[]>([]);
  const [couponFilter, setCouponFilter] = useState<CouponFilterTab>('available');

  const [confirmItem, setConfirmItem] = useState<RewardCatalogItem | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemErr, setRedeemErr] = useState('');
  const [successCoupon, setSuccessCoupon] = useState<RewardCoupon | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, cat, cp, tx] = await Promise.all([
        getRewardWallet(user.uid),
        getRewardCatalog(),
        getUserCoupons(user.uid),
        getRecentRewardTransactions(user.uid, 30),
      ]);
      setWallet(w); setCatalog(cat); setCoupons(cp); setTransactions(tx);
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

  if (loading || !wallet) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const progress = calcTierProgress(wallet.lifetimePoints);
  const filteredCoupons = coupons.filter(c => c.status === couponFilter);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAFAFA' }}>

      {/* ── Fixed header ── */}
      <div style={{
        background: 'linear-gradient(160deg,#D71920 0%,#B31217 55%,#7C1015 100%)',
        padding: '18px 18px 0', flexShrink: 0, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={onBack} style={{
            width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ChevronLeft size={18} color="#fff" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Gift size={20} color="#fff" />
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>SKM Rewards Club</h2>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {tab === 'overview' && (
          <OverviewTab wallet={wallet} progress={progress} coupons={coupons} transactions={transactions} onViewCoupons={() => setTab('coupons')} />
        )}

        {tab === 'rewards' && (
          <RewardsTab catalog={catalog} wallet={wallet} onSelect={item => { setRedeemErr(''); setConfirmItem(item); }} />
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
        @keyframes hiFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────

function OverviewTab({ wallet, progress, coupons, transactions, onViewCoupons }: {
  wallet: RewardWallet;
  progress: ReturnType<typeof calcTierProgress>;
  coupons: RewardCoupon[];
  transactions: RewardTransaction[];
  onViewCoupons: () => void;
}) {
  const available = coupons.filter(c => c.status === 'available');
  const grad = `linear-gradient(135deg, ${progress.tier.color}, ${progress.tier.color2})`;

  return (
    <>
      {/* MEMBERSHIP CARD */}
      <div style={{ background: grad, borderRadius: 22, padding: 18, animation: 'hiFadeIn 400ms ease', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Crown size={20} color="#fff" />
            <span style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{progress.tier.tier}</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Member</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 900, color: '#fff' }}>{wallet.currentPoints}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>points available</span>
        </div>

        {progress.next ? (
          <>
            <div style={{ height: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 12, overflow: 'hidden', marginTop: 10 }}>
              <div style={{ height: '100%', width: `${progress.pctToNext}%`, background: '#fff', borderRadius: 12, transition: 'width 500ms ease' }} />
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: '8px 0 0', fontWeight: 700 }}>
              {progress.tier.tier} {wallet.lifetimePoints} / {progress.next.minPoints} — {progress.pointsToNext} Points to {progress.next.tier}
            </p>
          </>
        ) : (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: '8px 0 0', fontWeight: 700 }}>
            You've reached the highest membership tier — Diamond.
          </p>
        )}
      </div>

      {/* STATS ROW */}
      <div style={{ display: 'flex', gap: 10 }}>
        <StatBox label="Lifetime Points" value={String(wallet.lifetimePoints)} icon={<TrendingUp size={13} color="#D71920" />} />
        <StatBox label="Redeemed" value={String(wallet.totalRedeemed)} icon={<Coins size={13} color="#D97706" />} />
        <StatBox label="Coupons" value={String(available.length)} icon={<Ticket size={13} color="#16A34A" />} />
      </div>

      {/* AVAILABLE COUPONS TEASER */}
      {available.length > 0 && (
        <button onClick={onViewCoupons} style={{
          background: '#fff', borderRadius: 20, padding: '14px 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
          animation: 'hiFadeIn 500ms ease',
        }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ticket size={15} color="#D71920" />
          </div>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#444' }}>
            You have {available.length} coupon{available.length === 1 ? '' : 's'} ready to use.
          </span>
          <ChevronRight size={16} color="#ccc" />
        </button>
      )}

      {/* RECENT REWARDS */}
      <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', animation: 'hiFadeIn 550ms ease' }}>
        <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 10px' }}>Recent Rewards</p>
        {transactions.length === 0 ? (
          <p style={{ fontSize: 12, color: '#999', margin: 0 }}>Scan an SKM egg to start earning points.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {transactions.slice(0, 5).map(t => (
              <TransactionRow key={t.id} tx={t} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Rewards catalog
// ─────────────────────────────────────────────────────────────

function RewardsTab({ catalog, wallet, onSelect }: {
  catalog: RewardCatalogItem[];
  wallet: RewardWallet;
  onSelect: (item: RewardCatalogItem) => void;
}) {
  const groups = new Map<string, RewardCatalogItem[]>();
  for (const item of catalog) {
    if (!groups.has(item.range)) groups.set(item.range, []);
    groups.get(item.range)!.push(item);
  }

  if (catalog.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 20, padding: 24, textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <Gift size={28} color="#ccc" />
        <p style={{ fontSize: 12, color: '#999', margin: '10px 0 0' }}>No rewards available right now. Check back soon.</p>
      </div>
    );
  }

  return (
    <>
      {[...groups.entries()].map(([range, items]) => (
        <div key={range} style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>{range}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(item => {
              const affordable = wallet.currentPoints >= item.pointsCost;
              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderRadius: 14, border: '1px solid #F0F0F0', background: '#FAFAFA',
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>{item.productName}</p>
                    <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0' }}>
                      MRP ₹{item.mrp} · ₹{item.discountAmount} OFF · Min. purchase ₹{item.minimumPurchase}
                    </p>
                  </div>
                  <button
                    disabled={!affordable}
                    onClick={() => onSelect(item)}
                    style={{
                      padding: '9px 14px', borderRadius: 12, border: 'none', flexShrink: 0,
                      background: affordable ? 'linear-gradient(135deg,#D71920,#B31217)' : '#E8E8E8',
                      color: affordable ? '#fff' : '#999',
                      fontWeight: 800, fontSize: 12, cursor: affordable ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {item.pointsCost} pts
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Coupons
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
          <Ticket size={28} color="#ccc" />
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
    <div style={{
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
// History
// ─────────────────────────────────────────────────────────────

function HistoryTab({ transactions }: { transactions: RewardTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 20, padding: 24, textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <Clock size={28} color="#ccc" />
        <p style={{ fontSize: 12, color: '#999', margin: '10px 0 0' }}>No point activity yet.</p>
      </div>
    );
  }
  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
      <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 10px' }}>Point History</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {transactions.map(t => <TransactionRow key={t.id} tx={t} />)}
      </div>
    </div>
  );
}

const TRANSACTION_ICON: Record<RewardTransaction['type'], React.ReactNode> = {
  scan:              <Gift size={13} color="#D71920" />,
  streak_milestone:  <Flame size={13} color="#F59E0B" />,
  sticker_milestone: <Award size={13} color="#7C3AED" />,
  challenge:         <Sparkles size={13} color="#0891B2" />,
  redeem:            <Ticket size={13} color="#DC2626" />,
  adjustment:        <TrendingUp size={13} color="#666" />,
};

function TransactionRow({ tx }: { tx: RewardTransaction }) {
  const positive = tx.points >= 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#FAFAFA', borderRadius: 12 }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {TRANSACTION_ICON[tx.type] ?? <Gift size={13} color="#D71920" />}
      </div>
      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#444' }}>{tx.description}</span>
      <span style={{ fontSize: 13, fontWeight: 900, color: positive ? '#16A34A' : '#DC2626' }}>
        {positive ? '+' : ''}{tx.points}
      </span>
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
            background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button disabled={saving} onClick={onConfirm} style={{
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
          background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}>
          Done
        </button>
        <button onClick={onViewCoupons} style={{
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

// ─────────────────────────────────────────────────────────────
// Small subcomponents
// ─────────────────────────────────────────────────────────────

function StatBox({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={{ flex: 1, background: '#F8F8F8', borderRadius: 14, padding: '10px 8px', textAlign: 'center' }}>
      {icon && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>{icon}</div>}
      <p style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>{value}</p>
      <p style={{ fontSize: 8, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.3, margin: '3px 0 0' }}>{label}</p>
    </div>
  );
}
