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

const STAGE_ORDER: GameStage[] = ['EGG', 'CHICK', 'ADULT', 'STAGE2'];
function stageRank(stage: GameStage): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? 0 : i;
}

/** True once the player's highest-reached game stage meets or exceeds the reward's requiredStage (if any). */
export function meetsStageRequirement(item: RewardCatalogItem, highestStage: GameStage): boolean {
  if (!item.requiredStage) return true;
  return stageRank(highestStage) >= stageRank(item.requiredStage);
}

/**
 * Spends points and issues a new coupon for the given catalog item.
 * Throws if the user has insufficient points, or if the item has a game-stage
 * gate that hasn't been reached yet — caller should catch and show an error.
 */
export async function redeemReward(uid: string, item: RewardCatalogItem, highestStage: GameStage): Promise<RewardCoupon> {
  if (!meetsStageRequirement(item, highestStage)) {
    throw new Error(`Reach ${item.requiredStageLabel ?? item.requiredStage} in Egg Runner to unlock this reward.`);
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
