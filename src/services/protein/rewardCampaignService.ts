/**
 * SKM Rewards Club — Seasonal Reward Campaign Service
 *
 * Firestore collections:
 *   rewardCampaigns/{id}                          — admin-managed campaign definitions (public read, developer write)
 *   campaignHistory/{uid}/periods/{campaignId}     — a user's archived progress snapshot for a finished campaign
 *
 * A campaign is a time-boxed set of objectives (egg scans / points / game stage /
 * protein streak / food logs) shown as the Rewards page's live event. Exactly like
 * promoEventService.ts, campaigns are admin-managed directly in Firestore or via
 * scripts/seedRewardCampaigns.mjs — there is no in-app admin UI.
 *
 * Rotation follows the same convention as coupon expiry (getUserCoupons) and promo
 * events (getActivePromoEvent): a pure client-side date-window check performed lazily
 * whenever the Rewards screen loads. No Cloud Function/cron is involved — if the
 * active campaign's endAt has passed, checkAndRotateCampaign() archives the caller's
 * progress snapshot and activates the next scheduled campaign (or, if autoRestart is
 * on and no next campaign exists, clones the just-ended one into a fresh dated copy).
 *
 * Additive only — does not touch reward wallet, transaction ledger, coupon
 * redemption, game stats, or protein tracking. Objective progress is always read
 * from those existing services, never duplicated or recalculated here.
 */

import {
  addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, limit,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import type { GameStage } from '../game/gameStatsService';

const CAMPAIGNS_COL = 'rewardCampaigns';
const HISTORY_COL   = 'campaignHistory';

export type CampaignObjectiveKind = 'eggScans' | 'points' | 'stage' | 'proteinStreak' | 'foodLogs';

export interface CampaignObjective {
  kind:   CampaignObjectiveKind;
  target: number;
  /** Only meaningful for kind === 'stage' — the GameStage the player must reach. */
  stage?: GameStage;
  /** Display label, e.g. "Champion Stage" — falls back to a generic label per kind if omitted. */
  label?: string;
}

export type CampaignDurationDays = 7 | 10 | 15;

export interface RewardCampaign {
  id:              string;
  name:            string;         // e.g. "SKM Weekly Rewards"
  description:     string;
  icon:            string;         // emoji, e.g. "🥚" | "🏆" | "🔥"
  startAt:         Timestamp;
  endAt:           Timestamp;
  durationDays:    CampaignDurationDays;
  objectives:      CampaignObjective[];
  active:          boolean;        // admin kill-switch, independent of the date window
  autoRestart:     boolean;        // if true and no next campaign is scheduled, clone this one forward on expiry
  createdAt?:      Timestamp;
}

export interface CampaignHistoryEntry {
  id:                  string;   // = the archived campaign's id
  campaignName:        string;
  startAt:             Timestamp;
  endAt:               Timestamp;
  completionPct:       number;   // 0-100 across the campaign's own objectives, at archive time
  couponsEarned:       number;
  couponsRedeemed:     number;
  eggsScanned:         number;   // lifetime egg-scan count *at archive time* (cumulative, not period-only)
  proteinEarned:       number;   // lifetime protein total *at archive time*
  highestStageReached: GameStage;
  status:              'completed' | 'expired'; // completed = every objective was met before archiving
  archivedAt:          Timestamp;
}

// ── Reads ─────────────────────────────────────────────────────────

/** Returns the single currently-active campaign (date window + active flag), or null if none is running. */
export async function getActiveCampaign(): Promise<RewardCampaign | null> {
  const now = Timestamp.now();
  const q = query(collection(db, CAMPAIGNS_COL), where('active', '==', true));
  const snap = await getDocs(q);

  const candidates = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as RewardCampaign))
    .filter(c => c.startAt.toMillis() <= now.toMillis() && now.toMillis() < c.endAt.toMillis());

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.endAt.toMillis() - b.endAt.toMillis());
  return candidates[0];
}

/** Returns the next campaign scheduled to start after the current one (soonest startAt in the future), or null. */
export async function getUpcomingCampaign(afterEndAt: Timestamp): Promise<RewardCampaign | null> {
  const q = query(collection(db, CAMPAIGNS_COL), where('active', '==', true));
  const snap = await getDocs(q);
  const upcoming = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as RewardCampaign))
    .filter(c => c.startAt.toMillis() >= afterEndAt.toMillis())
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
  return upcoming[0] ?? null;
}

export async function getCampaignHistory(uid: string, take = 20): Promise<CampaignHistoryEntry[]> {
  const colRef = collection(db, HISTORY_COL, uid, 'periods');
  const q = query(colRef, orderBy('archivedAt', 'desc'), limit(take));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as CampaignHistoryEntry));
}

async function hasArchivedCampaign(uid: string, campaignId: string): Promise<boolean> {
  const ref = doc(db, HISTORY_COL, uid, 'periods', campaignId);
  const snap = await getDoc(ref);
  return snap.exists();
}

// ── Rotation (lazy, client-side — mirrors getUserCoupons' expiry check) ────

export interface CampaignRotationResult {
  campaign:  RewardCampaign | null; // the campaign now considered active for this user, if any
  rotated:   boolean;               // true if a previously-active campaign just got archived this call
}

/**
 * Call once per Rewards screen load. If the given campaign has expired for this
 * user and hasn't been archived yet, archives their progress snapshot and looks
 * for the next scheduled campaign (or, if autoRestart is set and none exists,
 * clones the expired campaign into a new dated copy starting now).
 *
 * `progress` is a snapshot the caller already has on hand (from existing reward/
 * game/protein services) — this function only decides *whether* to archive and
 * *what* to activate next; it never recomputes eligibility itself.
 */
export async function checkAndRotateCampaign(
  uid: string,
  campaign: RewardCampaign,
  progress: {
    completionPct: number;
    couponsEarned: number;
    couponsRedeemed: number;
    eggsScanned: number;
    proteinEarned: number;
    highestStageReached: GameStage;
  },
): Promise<CampaignRotationResult> {
  const expired = Timestamp.now().toMillis() >= campaign.endAt.toMillis();
  if (!expired) return { campaign, rotated: false };

  if (!(await hasArchivedCampaign(uid, campaign.id))) {
    await archiveCampaignForUser(uid, campaign, progress);
  }

  const next = await getUpcomingCampaign(campaign.endAt);
  if (next) return { campaign: next, rotated: true };

  if (campaign.autoRestart) {
    const cloned = await cloneCampaignForward(campaign);
    return { campaign: cloned, rotated: true };
  }

  return { campaign: null, rotated: true };
}

async function archiveCampaignForUser(
  uid: string,
  campaign: RewardCampaign,
  progress: {
    completionPct: number;
    couponsEarned: number;
    couponsRedeemed: number;
    eggsScanned: number;
    proteinEarned: number;
    highestStageReached: GameStage;
  },
): Promise<void> {
  const ref = doc(db, HISTORY_COL, uid, 'periods', campaign.id);
  const entry: Omit<CampaignHistoryEntry, 'id'> = {
    campaignName:        campaign.name,
    startAt:             campaign.startAt,
    endAt:               campaign.endAt,
    completionPct:       progress.completionPct,
    couponsEarned:        progress.couponsEarned,
    couponsRedeemed:      progress.couponsRedeemed,
    eggsScanned:          progress.eggsScanned,
    proteinEarned:        progress.proteinEarned,
    highestStageReached:  progress.highestStageReached,
    status:               progress.completionPct >= 100 ? 'completed' : 'expired',
    archivedAt:           serverTimestamp() as unknown as Timestamp,
  };
  await setDoc(ref, entry, { merge: true });
}

/** autoRestart fallback — only used when no admin-scheduled next campaign exists. Same objectives, same duration, starting now. */
async function cloneCampaignForward(campaign: RewardCampaign): Promise<RewardCampaign> {
  const durationMs = campaign.durationDays * 24 * 60 * 60 * 1000;
  const startAt = Timestamp.now();
  const endAt = Timestamp.fromMillis(startAt.toMillis() + durationMs);

  const ref = await addDoc(collection(db, CAMPAIGNS_COL), {
    name: campaign.name,
    description: campaign.description,
    icon: campaign.icon,
    startAt,
    endAt,
    durationDays: campaign.durationDays,
    objectives: campaign.objectives,
    active: true,
    autoRestart: campaign.autoRestart,
    createdAt: serverTimestamp(),
  });

  return {
    id: ref.id,
    name: campaign.name,
    description: campaign.description,
    icon: campaign.icon,
    startAt,
    endAt,
    durationDays: campaign.durationDays,
    objectives: campaign.objectives,
    active: true,
    autoRestart: campaign.autoRestart,
  };
}

// ── Display helpers ──────────────────────────────────────────────

export function campaignTimeRemainingMs(campaign: RewardCampaign): number {
  return Math.max(0, campaign.endAt.toMillis() - Date.now());
}

/** Urgency copy driven purely by time remaining — never fabricates a deadline that isn't real. */
export function campaignUrgencyMessage(remainingMs: number): string {
  const days = remainingMs / (24 * 60 * 60 * 1000);
  if (remainingMs <= 0) return 'This campaign has ended.';
  if (days > 7) return 'You have plenty of time to earn rewards.';
  if (days > 3) return 'Keep scanning to unlock more discounts.';
  if (days > 1) return 'Only a few days remaining!';
  if (remainingMs > 12 * 60 * 60 * 1000) return 'Last chance to claim your rewards!';
  return "Campaign ends soon! Don't miss your discounts.";
}

export function formatCampaignCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'Ended';
  const totalMin = Math.floor(remainingMs / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days} Day${days === 1 ? '' : 's'} ${hours} Hour${hours === 1 ? '' : 's'}`;
  if (hours > 0) return `${hours} Hour${hours === 1 ? '' : 's'} Left`;
  return `${mins} Minute${mins === 1 ? '' : 's'} Left`;
}

export const OBJECTIVE_DISPLAY: Record<CampaignObjectiveKind, { icon: string; defaultLabel: string }> = {
  eggScans:      { icon: '🥚', defaultLabel: 'Egg Scans' },
  points:        { icon: '⭐', defaultLabel: 'Reward Points' },
  stage:         { icon: '🎮', defaultLabel: 'Game Progress' },
  proteinStreak: { icon: '🔥', defaultLabel: 'Protein Streak' },
  foodLogs:      { icon: '📝', defaultLabel: 'Food Logs' },
};

const STAGE_ORDER: GameStage[] = ['EGG', 'CHICK', 'ADULT', 'STAGE2'];
function stageRank(stage: GameStage): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? 0 : i;
}

const STAGE_DISPLAY_CAMPAIGN: Record<GameStage, string> = {
  EGG: 'Stage 1', CHICK: 'Stage 2', ADULT: 'Stage 3', STAGE2: 'Champion Stage',
};

export interface ObjectiveProgress {
  kind:    CampaignObjectiveKind;
  icon:    string;
  label:   string;
  current: number;
  target:  number;
  met:     boolean;
  /** Human display for kinds where raw numbers aren't self-explanatory (e.g. "Stage 1" / "Champion Stage"). */
  currentLabel?: string;
  targetLabel?:  string;
}

export interface CampaignProgressContext {
  lifetimeEggScans: number;
  currentPoints:    number;
  highestStage:     GameStage;
  currentProteinStreak: number;
  /** This app's food log entries are the same event as an egg scan — reuses lifetimeEggScans, never a separate counter. */
  lifetimeFoodLogs: number;
}

/** Builds live per-objective progress for a campaign. Pure — reads nothing, purely derives from ctx. */
export function buildCampaignProgress(campaign: RewardCampaign, ctx: CampaignProgressContext): ObjectiveProgress[] {
  return campaign.objectives.map(obj => {
    const display = OBJECTIVE_DISPLAY[obj.kind];
    switch (obj.kind) {
      case 'eggScans':
        return { kind: obj.kind, icon: display.icon, label: obj.label ?? display.defaultLabel, current: ctx.lifetimeEggScans, target: obj.target, met: ctx.lifetimeEggScans >= obj.target };
      case 'points':
        return { kind: obj.kind, icon: display.icon, label: obj.label ?? display.defaultLabel, current: Math.min(ctx.currentPoints, obj.target), target: obj.target, met: ctx.currentPoints >= obj.target };
      case 'proteinStreak':
        return { kind: obj.kind, icon: display.icon, label: obj.label ?? display.defaultLabel, current: Math.min(ctx.currentProteinStreak, obj.target), target: obj.target, met: ctx.currentProteinStreak >= obj.target };
      case 'foodLogs':
        return { kind: obj.kind, icon: display.icon, label: obj.label ?? display.defaultLabel, current: Math.min(ctx.lifetimeFoodLogs, obj.target), target: obj.target, met: ctx.lifetimeFoodLogs >= obj.target };
      case 'stage': {
        const targetRank = obj.stage ? stageRank(obj.stage) : obj.target;
        const currentRank = Math.min(stageRank(ctx.highestStage), targetRank);
        return {
          kind: obj.kind, icon: display.icon, label: obj.label ?? display.defaultLabel,
          current: currentRank, target: targetRank, met: stageRank(ctx.highestStage) >= targetRank,
          currentLabel: STAGE_DISPLAY_CAMPAIGN[ctx.highestStage] ?? 'Stage 1',
          targetLabel: obj.label ?? (obj.stage ? STAGE_DISPLAY_CAMPAIGN[obj.stage] : `Stage ${targetRank + 1}`),
        };
      }
    }
  });
}

export function campaignCompletionPct(progress: ObjectiveProgress[]): number {
  if (progress.length === 0) return 100;
  const sum = progress.reduce((acc, p) => acc + (p.target > 0 ? Math.min(100, (p.current / p.target) * 100) : 100), 0);
  return Math.round(sum / progress.length);
}
