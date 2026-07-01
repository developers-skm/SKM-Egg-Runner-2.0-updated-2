import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

// ─── Milestone definitions ────────────────────────────────────

export interface MilestoneDef {
  days:       number;
  label:      string;
  sticker:    string; // emoji
  stickerName: string;
  stickerDesc: string;
  color:      string; // hero gradient start
  color2:     string; // hero gradient end
}

export const MILESTONES: MilestoneDef[] = [
  { days: 3,   label: 'Hatching',       sticker: '🐣', stickerName: 'Happy Chick',    stickerDesc: 'Your journey begins. A new egg hatches!',         color: '#F59E0B', color2: '#D97706' },
  { days: 7,   label: 'On Fire',        sticker: '🔥', stickerName: 'Fire Egg',        stickerDesc: 'Seven days of fire. Unstoppable momentum!',        color: '#D71920', color2: '#B31217' },
  { days: 14,  label: 'Double Fire',    sticker: '⭐', stickerName: 'Lucky Egg',       stickerDesc: 'Two weeks strong. Luck is on your side!',          color: '#7C3AED', color2: '#6D28D9' },
  { days: 21,  label: 'Consistent',     sticker: '🎯', stickerName: 'Protein Hero',    stickerDesc: 'Consistency is a superpower. You proved it.',       color: '#0891B2', color2: '#0E7490' },
  { days: 30,  label: 'Egg Master',     sticker: '👑', stickerName: 'Egg King',        stickerDesc: 'A full month of dedication. You are Egg King!',    color: '#D97706', color2: '#B45309' },
  { days: 50,  label: 'Diamond Egg',    sticker: '💎', stickerName: 'Crystal Egg',     stickerDesc: '50 days of crystal clarity and discipline.',        color: '#0284C7', color2: '#0369A1' },
  { days: 100, label: 'Century Streak', sticker: '🏆', stickerName: 'Champion Egg',    stickerDesc: '100 days! You are a true SKM Champion.',            color: '#CA8A04', color2: '#A16207' },
  { days: 365, label: 'SKM Legend',     sticker: '🥇', stickerName: 'SKM Legend',      stickerDesc: 'A full year. You are an absolute SKM Legend.',      color: '#DC2626', color2: '#991B1B' },
];

export const MILESTONE_DAYS = MILESTONES.map(m => m.days);

export function getMilestone(days: number): MilestoneDef | undefined {
  return MILESTONES.find(m => m.days === days);
}

// ─── Firestore: claimed stickers ─────────────────────────────

export interface ClaimedSticker {
  days:        number;
  claimedAt:   unknown; // Firestore Timestamp
}

export async function getClaimedStickers(uid: string): Promise<Set<number>> {
  const snap = await getDoc(doc(db, 'milestone_rewards', uid));
  if (!snap.exists()) return new Set();
  const data = snap.data() as { claimed?: number[] };
  return new Set(data.claimed ?? []);
}

export async function claimMilestone(uid: string, days: number): Promise<void> {
  const ref  = doc(db, 'milestone_rewards', uid);
  const snap = await getDoc(ref);
  const existing: number[] = snap.exists() ? (snap.data().claimed ?? []) : [];
  if (existing.includes(days)) return; // already claimed
  await setDoc(ref, { claimed: [...existing, days], updatedAt: serverTimestamp() }, { merge: true });
}
