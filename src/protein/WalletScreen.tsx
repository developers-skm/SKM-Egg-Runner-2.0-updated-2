/**
 * PROTEIN TRACKER — Protein Wallet (Smart Egg Bank)
 *
 * Phase 2: capacity header + health-score stars, one Smart Insight card, one
 * Smart Recommendation line, per-item expiry progress bars (green→yellow→
 * orange→red — the only place that color ramp is used; the health score
 * itself always stays SKM red), a unified activity timeline (store/consume/
 * replace/expire, newest first, grouped by relative day), and a quick-actions
 * row. All derived from proteinWalletService's pure helpers plus the same
 * items/summary reads Phase 1 already used — no new Firestore reads.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  getWalletItems, getWalletSummary, consumeNextWalletEgg, sweepExpiredItems,
  getWalletHealthScore, getWalletInsight, getWalletRecommendation,
  WALLET_CAPACITY,
  type WalletEggItem, type WalletSummary, type ConsumeResult,
} from '../services/protein/proteinWalletService';
import { EggIcon, CheckCircleIcon } from './Icons';
import StatusBadge from './rewards/StatusBadge';
import { playChickSuccess } from '../services/audio/chickSound';
import { HapticService } from '../services/audio/hapticService';
import {
  notifyProteinAdded, notifyProteinGoalComplete,
  notifyStreakMilestone, notifyRewardPointsEarned, notifyMembershipTierUp,
} from '../services/notifications/notificationService';
import { recordStreakDay } from '../services/protein/eggStreakService';
import { getTodayStats, getTrackerSettings, PROTEIN_PER_EGG } from '../services/protein/proteinTrackerService';
import { logBackgroundFailure } from '../utils/errorHandling';

interface WalletScreenProps {
  user: User;
  refreshKey: number;
  onScanQR: () => void;
}

type TimelineKind = 'stored' | 'consumed' | 'expired' | 'replaced';

interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: { toMillis: () => number; toDate: () => Date };
  protein: number;
  qrId: string;
}

const RED = '#D71920';

function formatDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—';
  try { return ts.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); } catch { return '—'; }
}

function formatTime(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '';
  try { return ts.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

function relativeDay(ts: { toDate: () => Date }): string {
  const d = ts.toDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} Days Ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const TIMELINE_COPY: Record<TimelineKind, { icon: string; label: string; sub: string }> = {
  stored:    { icon: '🥚', label: 'Stored Egg',            sub: 'Added to wallet' },
  consumed:  { icon: '🍳', label: 'Consumed Egg',           sub: 'Reward progress updated' },
  replaced:  { icon: '🔄', label: 'Oldest Egg Replaced',    sub: 'Wallet maintained' },
  expired:   { icon: '⌛', label: 'Egg Expired',            sub: 'Moved to expired' },
};

/** Expiry bar color ramp — the only place in the wallet UI that uses this ramp. */
function expiryRampColor(daysRemaining: number): string {
  if (daysRemaining > 20) return '#22C55E';
  if (daysRemaining > 10) return '#EAB308';
  if (daysRemaining > 3)  return '#F97316';
  return '#DC2626';
}

export default function WalletScreen({ user, refreshKey, onScanQR }: WalletScreenProps) {
  const [items, setItems] = useState<WalletEggItem[]>([]);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [consuming, setConsuming] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'already_counted' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await sweepExpiredItems(user.uid);
      const [its, sm] = await Promise.all([getWalletItems(user.uid), getWalletSummary(user.uid)]);
      setItems(its);
      setSummary(sm);
    } catch (e) {
      console.error('[Wallet]', e);
    } finally {
      setLoading(false);
    }
  }, [user.uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const stored = useMemo(() => items.filter(i => i.status === 'stored').sort((a, b) => a.storedAt.toMillis() - b.storedAt.toMillis()), [items]);
  const eggsStored = summary?.walletEggsStored ?? 0;
  const proteinAvailable = summary?.walletProteinAvailable ?? 0;

  const health = useMemo(() => getWalletHealthScore(eggsStored), [eggsStored]);
  const insight = useMemo(() => summary ? getWalletInsight(summary, items) : null, [summary, items]);
  const recommendation = useMemo(() => summary ? getWalletRecommendation(summary) : '', [summary]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    for (const item of items) {
      entries.push({ id: `${item.id}-stored`, kind: 'stored', at: item.storedAt, protein: item.protein, qrId: item.qrId });
      if (item.status === 'consumed' && item.consumedAt) {
        entries.push({ id: `${item.id}-consumed`, kind: 'consumed', at: item.consumedAt, protein: item.protein, qrId: item.qrId });
      }
      if (item.status === 'replaced' && item.replacedAt) {
        entries.push({ id: `${item.id}-replaced`, kind: 'replaced', at: item.replacedAt, protein: item.protein, qrId: item.qrId });
      }
      if (item.status === 'expired') {
        entries.push({ id: `${item.id}-expired`, kind: 'expired', at: item.expiresAt, protein: item.protein, qrId: item.qrId });
      }
    }
    return entries.sort((a, b) => b.at.toMillis() - a.at.toMillis()).slice(0, 25);
  }, [items]);

  const handleConsume = async () => {
    setConfirmOpen(false);
    setConsuming(true);
    setFeedback(null);
    try {
      const result: ConsumeResult = await consumeNextWalletEgg(user.uid);
      if (!result.ok) {
        setFeedback({ kind: 'error', message: result.reason === 'wallet_empty' ? 'No eggs available to consume.' : (result.message ?? 'Something went wrong.') });
        return;
      }

      playChickSuccess();

      if (!result.countedTowardStreak) {
        HapticService.light();
        setFeedback({ kind: 'already_counted', message: "Protein logged, but today's streak egg is already claimed." });
        await load();
        return;
      }

      recordStreakDay(user.uid).catch(err => logBackgroundFailure('WalletScreen:recordStreakDay', err));

      const [ts, stg] = await Promise.all([getTodayStats(user.uid), getTrackerSettings(user.uid)]);
      const todayProtein = ts?.totalProtein ?? 0;
      const goalJustHit = result.goalJustMet ?? false;
      const streak = result.streak?.currentStreak ?? 0;
      const streakMilestoneHit = [3, 7, 14, 30, 60, 100].includes(streak);

      if (streakMilestoneHit || goalJustHit) HapticService.success();
      else HapticService.medium();

      notifyProteinAdded(user.uid, PROTEIN_PER_EGG, todayProtein).catch(err => logBackgroundFailure('WalletScreen:notifyProteinAdded', err));
      if (goalJustHit) notifyProteinGoalComplete(user.uid, stg.dailyGoal).catch(err => logBackgroundFailure('WalletScreen:notifyProteinGoalComplete', err));
      if (streakMilestoneHit) notifyStreakMilestone(user.uid, streak).catch(err => logBackgroundFailure('WalletScreen:notifyStreakMilestone', err));
      if (result.pointsEarned && result.wallet) {
        notifyRewardPointsEarned(user.uid, result.pointsEarned, result.wallet.currentPoints).catch(err => logBackgroundFailure('WalletScreen:notifyRewardPointsEarned', err));
      }
      if (result.tierChanged && result.wallet) {
        notifyMembershipTierUp(user.uid, result.wallet.membership).catch(err => logBackgroundFailure('WalletScreen:notifyMembershipTierUp', err));
      }

      setFeedback({ kind: 'success', message: `+${PROTEIN_PER_EGG}g protein recorded successfully.` });
      await load();
    } catch (e) {
      console.error('[Wallet] consume error:', e);
      setFeedback({ kind: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setConsuming(false);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #FCE8E8', borderTopColor: RED, animation: 'wsSpin 0.8s linear infinite' }} />
        <style>{`@keyframes wsSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const isFull = eggsStored >= WALLET_CAPACITY;

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#D71920,#B31217)',
        padding: '18px 18px 20px',
        boxShadow: '0 4px 20px rgba(215,25,32,0.3)',
        border: isFull ? '2px solid #FCA5A5' : 'none',
        animation: isFull ? 'wsShake 0.5s ease' : 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: 0 }}>Protein Wallet</h2>
          <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} style={{
                fontSize: 14, color: i < health.stars ? '#fff' : 'rgba(255,255,255,0.35)',
                transition: `color 250ms ease ${i * 60}ms`,
              }}>★</span>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: '0 0 14px' }}>
          {isFull ? 'Wallet Full' : `${WALLET_CAPACITY - eggsStored} slot${WALLET_CAPACITY - eggsStored === 1 ? '' : 's'} remaining`}
          {' · '}{health.label}{health.subLabel ? ` · ${health.subLabel}` : ''}
        </p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {Array.from({ length: WALLET_CAPACITY }, (_, i) => (
            <div key={i} style={{
              flex: 1, height: 8, borderRadius: 4,
              background: i < eggsStored ? '#fff' : 'rgba(255,255,255,0.25)',
              transition: 'background 300ms ease',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{eggsStored}/{WALLET_CAPACITY} Eggs Stored</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{proteinAvailable}g Available</span>
        </div>
      </div>

      <div style={{ padding: 14 }}>

        {feedback && (
          <div style={{
            background: feedback.kind === 'error' ? '#FEF2F2' : feedback.kind === 'already_counted' ? '#FFFBEB' : '#F0FDF4',
            border: `1px solid ${feedback.kind === 'error' ? '#FECACA' : feedback.kind === 'already_counted' ? '#FDE68A' : '#BBF7D0'}`,
            borderRadius: 14, padding: '12px 14px', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {feedback.kind === 'success' && <CheckCircleIcon size={18} color="#16A34A" />}
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: feedback.kind === 'error' ? '#991B1B' : feedback.kind === 'already_counted' ? '#92400E' : '#166534' }}>
              {feedback.message}
            </p>
          </div>
        )}

        {/* Smart Insight card */}
        {insight && (
          <div style={{
            background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 14,
            padding: '11px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{insight.icon}</span>
            <p style={{ fontSize: 11.5, color: '#9A3412', margin: 0, fontWeight: 600, lineHeight: 1.4 }}>{insight.message}</p>
          </div>
        )}

        {/* Smart Recommendation line */}
        {recommendation && (
          <div style={{ padding: '0 4px', marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: '#999', margin: 0, fontStyle: 'italic' }}>💡 {recommendation}</p>
          </div>
        )}

        {/* Quick Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <QuickActionBtn label="Consume Today's Egg" primary disabled={stored.length === 0 || consuming} onClick={() => setConfirmOpen(true)} />
          <QuickActionBtn label="Scan Another Egg" onClick={onScanQR} />
        </div>

        {/* Stored list with expiry bars */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 10px' }}>Available Eggs</p>
          {stored.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '18px 0' }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: '#F5F5F5', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <EggIcon size={20} color="#ccc" />
              </div>
              <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>Wallet is empty.</p>
              <button onClick={onScanQR} style={{ fontSize: 11, color: RED, margin: '4px 0 0', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>
                Scan a fresh SKM egg
              </button>
            </div>
          ) : (
            stored.map((item, i) => {
              const daysRemaining = Math.max(0, Math.ceil((item.expiresAt.toMillis() - Date.now()) / 86400000));
              const pct = Math.min(100, Math.max(0, Math.round((daysRemaining / 30) * 100)));
              const rampColor = expiryRampColor(daysRemaining);
              return (
                <div key={item.id} style={{ paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 0, borderTop: i > 0 ? '1px solid #F8F8F8' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 11, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <EggIcon size={17} color={RED} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{item.eggType}</p>
                      <p style={{ fontSize: 10, color: '#bbb', margin: 0 }}>
                        Stored {formatDate(item.storedAt)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: RED }}>+{item.protein}g</span>
                      {i === 0 && <StatusBadge label="NEXT" bg="#FCE8E8" color={RED} size="sm" />}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 46 }}>
                    <div style={{ flex: 1, height: 5, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: rampColor, borderRadius: 3, transition: 'width 400ms ease, background-color 400ms ease' }} />
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: rampColor, whiteSpace: 'nowrap' }}>
                      {daysRemaining}d left
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Recent Activity timeline */}
        {timeline.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: '0 0 10px' }}>Recent Activity</p>
            {timeline.map((entry, i) => {
              const copy = TIMELINE_COPY[entry.kind];
              const showDayHeader = i === 0 || relativeDay(entry.at) !== relativeDay(timeline[i - 1].at);
              return (
                <div key={entry.id}>
                  {showDayHeader && (
                    <p style={{ fontSize: 9, fontWeight: 800, color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5, margin: i === 0 ? '0 0 8px' : '14px 0 8px' }}>
                      {relativeDay(entry.at)}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 4 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: '#F8F8F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
                      {copy.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11.5, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>{copy.label}</p>
                      <p style={{ fontSize: 9.5, color: '#bbb', margin: 0 }}>{copy.sub}{entry.protein ? ` · +${entry.protein}g` : ''}</p>
                    </div>
                    <span style={{ fontSize: 9.5, color: '#ccc', flexShrink: 0 }}>{formatTime(entry.at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {confirmOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setConfirmOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 22, maxWidth: 340, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FCE8E8', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EggIcon size={26} color={RED} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>Consume this egg today?</h3>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 18px' }}>
              This will add +{PROTEIN_PER_EGG}g protein and update your daily streak.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmOpen(false)} style={{
                flex: 1, padding: '12px 0', borderRadius: 14, border: '1.5px solid #E8E8E8', cursor: 'pointer',
                background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 13,
              }}>Cancel</button>
              <button onClick={handleConsume} style={{
                flex: 1, padding: '12px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff', fontWeight: 900, fontSize: 13,
              }}>Consume</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes wsShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
      `}</style>
    </div>
  );
}

function QuickActionBtn({ label, primary, disabled, onClick }: { label: string; primary?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '13px 10px', borderRadius: 15, border: primary ? 'none' : '1.5px solid #E8E8E8', cursor: disabled ? 'default' : 'pointer',
      background: disabled ? '#E8E8E8' : primary ? 'linear-gradient(135deg,#D71920,#B31217)' : '#fff',
      color: disabled ? '#999' : primary ? '#fff' : '#1A1A1A',
      fontWeight: 800, fontSize: 12, textAlign: 'center',
      boxShadow: !disabled && primary ? '0 4px 14px rgba(215,25,32,0.35)' : 'none',
    }}>
      {label}
    </button>
  );
}
