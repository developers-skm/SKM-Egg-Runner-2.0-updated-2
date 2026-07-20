/**
 * SKM Rewards Club — Catalog & Coupon Redemption Service
 *
 * Firestore collections:
 *   rewardCatalog/{id}                       — admin-managed reward catalog (public read, developer write)
 *   rewardCoupons/{uid}/redemptions/{id}      — a user's redeemed coupons
 *
 * Additive to the protein tracker — does not touch any existing collection.
 * Catalog is loaded from Firestore (not hardcoded) so admins can add/edit/disable
 * rewards without a code change. Seed with scripts/seedRewardCatalog.mjs.
 */

import {
  addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp,
  Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { DEFAULT_COUPON_VALID_DAYS } from '../../constants/rewards';
import { spendPoints } from './rewardWalletService';
import { notifyRewardRedeemed } from '../notifications/notificationService';
import type { GameStage } from '../game/gameStatsService';

export interface RewardCatalogItem {
  id:              string;
  range:           string;  // e.g. "SKM Best Fresh", "SKM Best Plus", "Premium Range"
  productName:     string;  // e.g. "Fresh 6"
  mrp:             number;
  discountAmount:  number;
  minimumPurchase: number;
  pointsCost:      number;
  active:          boolean;
  sortOrder:       number;
  /** Optional Egg Runner gate — if set, the reward also requires this game stage before it can be claimed, in addition to pointsCost. Items without this behave exactly as before (points-only). */
  requiredStage?:      GameStage;
  requiredStageLabel?: string; // display label, e.g. "Stage 2" or "Champion Stage"
  /** Optional lifetime SKM egg-scan gate — if set, the reward also requires this many genuinely-new QR scans, read from users/{uid}.lifetimeConsumption. Items without this behave exactly as before. */
  requiredEggScans?: number;
}

// ── Smart Reward Requirements ────────────────────────────────────
// Generic multi-requirement model: a reward's eligibility is the AND of every
// requirement it declares (points always required; stage/eggs only if set).
// New requirement kinds (membership tier, protein streak, weekly challenge,
// special event, ...) can be added here by extending RequirementKind and
// pushing one more entry in buildRequirementProgress — no UI change needed,
// the card/progress components only ever iterate this array.

export type RequirementKind = 'points' | 'stage' | 'eggScans';

export interface RequirementProgress {
  kind:      RequirementKind;
  label:     string;   // e.g. "Reward Points", "Game Progress", "Egg Scans"
  icon:      string;   // emoji used by the UI, kept here so new kinds don't need UI edits
  current:   number;
  target:    number;
  met:       boolean;
  /** Human display of current/target for kinds where raw numbers aren't self-explanatory (e.g. stage names). */
  currentLabel?: string;
  targetLabel?:  string;
}

export interface RewardEligibilityContext {
  currentPoints: number;
  highestStage:  GameStage;
  lifetimeEggScans: number;
}

const STAGE_DISPLAY_LABEL: Record<GameStage, string> = {
  EGG: 'Stage 1', CHICK: 'Stage 2', ADULT: 'Stage 3', STAGE2: 'Champion Stage',
};

/** Builds the ordered list of requirements for a reward and the player's live progress against each. Pure — no reads/writes. */
export function buildRequirementProgress(item: RewardCatalogItem, ctx: RewardEligibilityContext): RequirementProgress[] {
  const reqs: RequirementProgress[] = [];

  if (item.requiredEggScans) {
    reqs.push({
      kind: 'eggScans', label: 'Egg Scans', icon: '🥚',
      current: ctx.lifetimeEggScans, target: item.requiredEggScans,
      met: ctx.lifetimeEggScans >= item.requiredEggScans,
    });
  }

  if (item.requiredStage) {
    const targetRank = stageRank(item.requiredStage);
    const currentRank = Math.min(stageRank(ctx.highestStage), targetRank);
    reqs.push({
      kind: 'stage', label: 'Game Progress', icon: '🎮',
      current: currentRank, target: targetRank,
      met: stageRank(ctx.highestStage) >= targetRank,
      currentLabel: STAGE_DISPLAY_LABEL[ctx.highestStage] ?? 'Stage 1',
      targetLabel: item.requiredStageLabel ?? STAGE_DISPLAY_LABEL[item.requiredStage],
    });
  }

  // Points is always a requirement, shown last so scan/stage progress leads.
  reqs.push({
    kind: 'points', label: 'Reward Points', icon: '⭐',
    current: Math.min(ctx.currentPoints, item.pointsCost), target: item.pointsCost,
    met: ctx.currentPoints >= item.pointsCost,
  });

  return reqs;
}

export function allRequirementsMet(reqs: RequirementProgress[]): boolean {
  return reqs.every(r => r.met);
}

/** Overall completion 0-100 across every requirement (average of each requirement's own %). */
export function overallRequirementPct(reqs: RequirementProgress[]): number {
  if (reqs.length === 0) return 100;
  const sum = reqs.reduce((acc, r) => acc + (r.target > 0 ? Math.min(100, (r.current / r.target) * 100) : 100), 0);
  return Math.round(sum / reqs.length);
}

const STAGE_ORDER: GameStage[] = ['EGG', 'CHICK', 'ADULT', 'STAGE2'];
function stageRank(stage: GameStage): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? 0 : i;
}

export type CouponStatus = 'available' | 'used' | 'expired';

export interface RewardCoupon {
  id:              string;
  userId:          string;
  couponCode:      string;
  rewardTitle:     string;
  discountAmount:  number;
  minimumPurchase: number;
  pointsCost:      number;
  expiryDate:      string; // YYYY-MM-DD
  status:          CouponStatus;
  createdAt:       Timestamp;
  usedAt?:         Timestamp;
}

// ── Catalog reads ───────────────────────────────────────────────

export async function getRewardCatalog(): Promise<RewardCatalogItem[]> {
  const colRef = collection(db, 'rewardCatalog');
  const q = query(colRef, where('active', '==', true), orderBy('sortOrder', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RewardCatalogItem));
}

// ── Coupon code generation ──────────────────────────────────────

export function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
  let code = 'SKM-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('sv-SE'); // YYYY-MM-DD
}

// ── Redemption flow ──────────────────────────────────────────────

/** True once the player's highest-reached game stage meets or exceeds the reward's requiredStage (if any). */
export function meetsStageRequirement(item: RewardCatalogItem, highestStage: GameStage): boolean {
  if (!item.requiredStage) return true;
  return stageRank(highestStage) >= stageRank(item.requiredStage);
}

/** True once the player's lifetime egg-scan count meets or exceeds the reward's requiredEggScans (if any). */
export function meetsEggScanRequirement(item: RewardCatalogItem, lifetimeEggScans: number): boolean {
  if (!item.requiredEggScans) return true;
  return lifetimeEggScans >= item.requiredEggScans;
}

/**
 * Spends points and issues a new coupon for the given catalog item.
 * Throws if the user has insufficient points, or if the item has a game-stage
 * or egg-scan gate that hasn't been reached yet — caller should catch and show an error.
 */
export async function redeemReward(uid: string, item: RewardCatalogItem, highestStage: GameStage, lifetimeEggScans: number = Infinity): Promise<RewardCoupon> {
  if (!meetsStageRequirement(item, highestStage)) {
    throw new Error(`Reach ${item.requiredStageLabel ?? item.requiredStage} in Egg Runner to unlock this reward.`);
  }
  if (!meetsEggScanRequirement(item, lifetimeEggScans)) {
    throw new Error(`Scan ${item.requiredEggScans} SKM eggs to unlock this reward.`);
  }
  await spendPoints(uid, item.pointsCost, `Redeemed ${item.discountAmount > 0 ? `₹${item.discountAmount} OFF` : item.productName} — ${item.productName}`);

  const couponCode = generateCouponCode();
  const expiryDate = addDays(DEFAULT_COUPON_VALID_DAYS);

  const colRef = collection(db, 'rewardCoupons', uid, 'redemptions');
  const ref = await addDoc(colRef, {
    userId: uid,
    couponCode,
    rewardTitle: item.productName,
    discountAmount: item.discountAmount,
    minimumPurchase: item.minimumPurchase,
    pointsCost: item.pointsCost,
    expiryDate,
    status: 'available' as CouponStatus,
    createdAt: serverTimestamp(),
  });

  notifyRewardRedeemed(uid, item.productName, ref.id).catch(() => {});

  return {
    id: ref.id,
    userId: uid,
    couponCode,
    rewardTitle: item.productName,
    discountAmount: item.discountAmount,
    minimumPurchase: item.minimumPurchase,
    pointsCost: item.pointsCost,
    expiryDate,
    status: 'available',
    createdAt: Timestamp.now(),
  };
}

// ── Coupon reads ─────────────────────────────────────────────────

/** Reads all coupons for a user and lazily flips any past-expiry "available" coupons to "expired". */
export async function getUserCoupons(uid: string): Promise<RewardCoupon[]> {
  const colRef = collection(db, 'rewardCoupons', uid, 'redemptions');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  const today = new Date().toLocaleDateString('sv-SE');

  const coupons = snap.docs.map(d => ({ id: d.id, ...d.data() } as RewardCoupon));

  const expiredUpdates = coupons
    .filter(c => c.status === 'available' && c.expiryDate < today)
    .map(c => updateDoc(doc(db, 'rewardCoupons', uid, 'redemptions', c.id), { status: 'expired' }));
  if (expiredUpdates.length > 0) await Promise.all(expiredUpdates);

  return coupons.map(c => (c.status === 'available' && c.expiryDate < today ? { ...c, status: 'expired' as CouponStatus } : c));
}

export async function markCouponUsed(uid: string, couponId: string): Promise<void> {
  const ref = doc(db, 'rewardCoupons', uid, 'redemptions', couponId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, { status: 'used', usedAt: serverTimestamp() });
}
