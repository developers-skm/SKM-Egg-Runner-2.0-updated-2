import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

// ─── Rarity tiers ─────────────────────────────────────────────

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export interface MilestoneDef {
  days:        number;
  label:       string;
  stickerName: string;
  stickerDesc: string;
  rarity:      Rarity;
  color:       string;  // gradient start
  color2:      string;  // gradient end
  // Legacy field — kept so existing code doesn't break
  sticker:     string;
}

// ─── PNG sticker assets ───────────────────────────────────────
// Each value is a public URL path to the PNG file in /public/.

export const STICKER_PNG: Record<number, string> = {
  3:   '/happy_chick.png.png',
  7:   '/fire_egg.png.png',
  14:  '/lucky_star_egg.png.png',
  21:  '/protein_hero.png.png',
  30:  '/crown_egg.png.png',
  50:  '/crystal_diamond.png.png',
  100: '/championn_trophy.png.png',
  365: '/skm_legend_badge.png.png',
};

// ─── Milestone definitions ────────────────────────────────────

export const MILESTONES: MilestoneDef[] = [
  { days: 3,   sticker: '🐣', label: 'Hatching',       stickerName: 'Happy Chick',     stickerDesc: 'Your journey begins. A new chick hatches from dedication!',  rarity: 'Common',    color: '#F59E0B', color2: '#D97706' },
  { days: 7,   sticker: '🔥', label: 'On Fire',        stickerName: 'Fire Egg',         stickerDesc: 'Seven days of fire. You are unstoppable momentum!',          rarity: 'Rare',      color: '#D71920', color2: '#B31217' },
  { days: 14,  sticker: '⭐', label: 'Double Fire',    stickerName: 'Lucky Star Egg',   stickerDesc: 'Two weeks strong. Luck and discipline are on your side!',    rarity: 'Rare',      color: '#7C3AED', color2: '#6D28D9' },
  { days: 21,  sticker: '🎯', label: 'Consistent',     stickerName: 'Protein Hero',     stickerDesc: 'Consistency is your superpower. A true Protein Hero!',       rarity: 'Rare',      color: '#0891B2', color2: '#0E7490' },
  { days: 30,  sticker: '👑', label: 'Egg Master',     stickerName: 'Crown Egg',        stickerDesc: 'A full month of dedication. The Crown belongs to you!',      rarity: 'Epic',      color: '#D97706', color2: '#B45309' },
  { days: 50,  sticker: '💎', label: 'Diamond Egg',    stickerName: 'Crystal Diamond',  stickerDesc: '50 days of crystal clarity. You are rare as a diamond!',     rarity: 'Epic',      color: '#0284C7', color2: '#0369A1' },
  { days: 100, sticker: '🏆', label: 'Century Streak', stickerName: 'Champion Trophy',  stickerDesc: '100 days! You are a true SKM Champion. Legendary status!',   rarity: 'Legendary', color: '#CA8A04', color2: '#A16207' },
  { days: 365, sticker: '🥇', label: 'SKM Legend',     stickerName: 'SKM Legend Badge', stickerDesc: 'A full year. You are an absolute SKM Legend. One of a kind.', rarity: 'Legendary', color: '#DC2626', color2: '#991B1B' },
];

export const MILESTONE_DAYS = MILESTONES.map(m => m.days);

export function getMilestone(days: number): MilestoneDef | undefined {
  return MILESTONES.find(m => m.days === days);
}

export const RARITY_COLOR: Record<Rarity, string> = {
  Common:    '#6B7280',
  Rare:      '#3B82F6',
  Epic:      '#7C3AED',
  Legendary: '#D97706',
};

export const RARITY_BG: Record<Rarity, string> = {
  Common:    '#F3F4F6',
  Rare:      '#EFF6FF',
  Epic:      '#F5F3FF',
  Legendary: '#FFFBEB',
};

// ─── Firestore: claimed stickers ─────────────────────────────

export interface ClaimedSticker {
  days:      number;
  claimedAt: unknown;
}

export async function getClaimedStickers(uid: string): Promise<Set<number>> {
  const snap = await getDoc(doc(db, 'milestone_rewards', uid));
  if (!snap.exists()) return new Set();
  const data = snap.data() as { claimed?: number[] };
  return new Set(data.claimed ?? []);
}

export async function getClaimedWithDates(uid: string): Promise<Map<number, string>> {
  const snap = await getDoc(doc(db, 'milestone_rewards', uid));
  if (!snap.exists()) return new Map();
  const data = snap.data() as { claimed?: number[]; claimedDates?: Record<string, string> };
  const dates = data.claimedDates ?? {};
  const result = new Map<number, string>();
  for (const days of (data.claimed ?? [])) {
    result.set(days, dates[String(days)] ?? '');
  }
  return result;
}

export async function claimMilestone(uid: string, days: number): Promise<void> {
  const ref  = doc(db, 'milestone_rewards', uid);
  const snap = await getDoc(ref);
  const existing: number[] = snap.exists() ? (snap.data().claimed ?? []) : [];
  if (existing.includes(days)) return;
  const today = new Date().toLocaleDateString('sv-SE');
  const existingDates: Record<string, string> = snap.exists() ? (snap.data().claimedDates ?? {}) : {};
  await setDoc(ref, {
    claimed:      [...existing, days],
    claimedDates: { ...existingDates, [String(days)]: today },
    updatedAt:    serverTimestamp(),
  }, { merge: true });
}
