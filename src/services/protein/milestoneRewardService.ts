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

// ─── Inline SVG sticker art ───────────────────────────────────
// Each sticker is a self-contained SVG string rendered via dangerouslySetInnerHTML.
// No external assets required; transparent background; SKM brand colours.

export const STICKER_SVG: Record<number, string> = {
  // ── 3 days: Happy Chick (Common) ─────────────────────────────
  3: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="chick3" cx="50%" cy="40%" r="55%">
        <stop offset="0%" stop-color="#FBBF24"/>
        <stop offset="100%" stop-color="#D97706"/>
      </radialGradient>
      <filter id="s3"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#D97706" flood-opacity="0.4"/></filter>
    </defs>
    <ellipse cx="50" cy="56" rx="28" ry="26" fill="url(#chick3)" filter="url(#s3)"/>
    <circle cx="50" cy="34" r="22" fill="url(#chick3)" filter="url(#s3)"/>
    <ellipse cx="50" cy="55" rx="16" ry="14" fill="#FDE68A" opacity="0.6"/>
    <circle cx="42" cy="30" r="4" fill="#1A1A1A"/>
    <circle cx="58" cy="30" r="4" fill="#1A1A1A"/>
    <circle cx="43" cy="29" r="1.5" fill="#fff"/>
    <circle cx="59" cy="29" r="1.5" fill="#fff"/>
    <path d="M46 38 Q50 42 54 38" stroke="#D97706" stroke-width="2" fill="none" stroke-linecap="round"/>
    <polygon points="50,35 47,39 53,39" fill="#F97316"/>
    <ellipse cx="35" cy="50" rx="10" ry="6" fill="#FBBF24" transform="rotate(-30,35,50)"/>
    <ellipse cx="65" cy="50" rx="10" ry="6" fill="#FBBF24" transform="rotate(30,65,50)"/>
    <circle cx="50" cy="15" r="4" fill="#FFD700"/>
    <path d="M46 10 Q50 5 54 10" stroke="#FFD700" stroke-width="2" fill="none"/>
  </svg>`,

  // ── 7 days: Fire Egg (Rare) ───────────────────────────────────
  7: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="egg7" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stop-color="#FEF3C7"/>
        <stop offset="40%" stop-color="#F97316"/>
        <stop offset="100%" stop-color="#DC2626"/>
      </radialGradient>
      <radialGradient id="glow7" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FBBF24" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#DC2626" stop-opacity="0"/>
      </radialGradient>
      <filter id="s7"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#DC2626" flood-opacity="0.6"/></filter>
    </defs>
    <ellipse cx="50" cy="52" rx="34" ry="34" fill="url(#glow7)"/>
    <ellipse cx="50" cy="56" rx="22" ry="26" fill="url(#egg7)" filter="url(#s7)"/>
    <path d="M50 18 C44 28 36 32 38 42 C40 52 48 54 50 52 C52 54 60 52 62 42 C64 32 56 28 50 18Z" fill="#FBBF24" opacity="0.85"/>
    <path d="M45 25 C42 31 38 34 40 40 C41 44 45 46 47 44" fill="#F97316" opacity="0.7"/>
    <ellipse cx="43" cy="60" rx="5" ry="7" fill="#FEF3C7" opacity="0.35" transform="rotate(-15,43,60)"/>
    <circle cx="29" cy="38" r="5" fill="#FBBF24" opacity="0.6"/>
    <circle cx="71" cy="38" r="5" fill="#FBBF24" opacity="0.6"/>
    <circle cx="22" cy="50" r="3" fill="#F97316" opacity="0.5"/>
    <circle cx="78" cy="50" r="3" fill="#F97316" opacity="0.5"/>
  </svg>`,

  // ── 14 days: Lucky Star Egg (Rare) ───────────────────────────
  14: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="egg14" cx="40%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#DDD6FE"/>
        <stop offset="50%" stop-color="#7C3AED"/>
        <stop offset="100%" stop-color="#4C1D95"/>
      </radialGradient>
      <filter id="s14"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#6D28D9" flood-opacity="0.6"/></filter>
    </defs>
    <ellipse cx="50" cy="56" rx="22" ry="26" fill="url(#egg14)" filter="url(#s14)"/>
    <ellipse cx="43" cy="60" rx="5" ry="7" fill="#EDE9FE" opacity="0.3" transform="rotate(-15,43,60)"/>
    <polygon points="50,24 52,30 59,30 53,34 55,40 50,36 45,40 47,34 41,30 48,30" fill="#FFD700" filter="url(#s14)"/>
    <circle cx="50" cy="32" r="3" fill="#FDE68A"/>
    <circle cx="25" cy="44" r="3" fill="#C4B5FD" opacity="0.8"/>
    <circle cx="75" cy="44" r="3" fill="#C4B5FD" opacity="0.8"/>
    <circle cx="22" cy="62" r="2" fill="#A78BFA" opacity="0.6"/>
    <circle cx="78" cy="62" r="2" fill="#A78BFA" opacity="0.6"/>
    <path d="M30 30 L33 27 M70 30 L67 27 M30 70 L33 73 M70 70 L67 73" stroke="#C4B5FD" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
  </svg>`,

  // ── 21 days: Protein Hero Shield (Rare) ──────────────────────
  21: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shield21" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38BDF8"/>
        <stop offset="100%" stop-color="#0369A1"/>
      </linearGradient>
      <filter id="s21"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0369A1" flood-opacity="0.5"/></filter>
    </defs>
    <path d="M50 12 L78 24 L78 52 Q78 74 50 88 Q22 74 22 52 L22 24 Z" fill="url(#shield21)" filter="url(#s21)"/>
    <path d="M50 18 L72 28 L72 52 Q72 70 50 82 Q28 70 28 52 L28 28 Z" fill="#0EA5E9" opacity="0.4"/>
    <ellipse cx="50" cy="48" rx="14" ry="17" fill="#BFDBFE" opacity="0.25"/>
    <text x="50" y="54" font-size="22" text-anchor="middle" font-family="Arial Black" fill="#fff" font-weight="900">P</text>
    <circle cx="50" cy="28" r="5" fill="#FDE68A"/>
    <path d="M38 62 Q44 68 50 64 Q56 68 62 62" stroke="#BAE6FD" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>
  </svg>`,

  // ── 30 days: Crown Egg (Epic) ─────────────────────────────────
  30: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="egg30" cx="40%" cy="35%" r="65%">
        <stop offset="0%" stop-color="#FEF9C3"/>
        <stop offset="40%" stop-color="#D97706"/>
        <stop offset="100%" stop-color="#92400E"/>
      </radialGradient>
      <filter id="s30"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#92400E" flood-opacity="0.6"/></filter>
      <linearGradient id="crown30" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFD700"/>
        <stop offset="50%" stop-color="#FCD34D"/>
        <stop offset="100%" stop-color="#B45309"/>
      </linearGradient>
    </defs>
    <ellipse cx="50" cy="58" rx="24" ry="28" fill="url(#egg30)" filter="url(#s30)"/>
    <ellipse cx="43" cy="62" rx="6" ry="9" fill="#FEF9C3" opacity="0.3" transform="rotate(-15,43,62)"/>
    <path d="M32 38 L32 22 L40 30 L50 18 L60 30 L68 22 L68 38 Z" fill="url(#crown30)" filter="url(#s30)"/>
    <rect x="32" y="36" width="36" height="6" rx="3" fill="url(#crown30)"/>
    <circle cx="50" cy="18" r="4" fill="#fff" opacity="0.9"/>
    <circle cx="32" cy="22" r="3" fill="#FCD34D"/>
    <circle cx="68" cy="22" r="3" fill="#FCD34D"/>
    <circle cx="40" cy="30" r="2" fill="#FEF9C3"/>
    <circle cx="60" cy="30" r="2" fill="#FEF9C3"/>
  </svg>`,

  // ── 50 days: Crystal Diamond Egg (Epic) ──────────────────────
  50: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="crystal50" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E0F2FE"/>
        <stop offset="30%" stop-color="#7DD3FC"/>
        <stop offset="70%" stop-color="#0284C7"/>
        <stop offset="100%" stop-color="#0C4A6E"/>
      </linearGradient>
      <filter id="s50"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#0284C7" flood-opacity="0.7"/></filter>
    </defs>
    <polygon points="50,12 80,38 70,80 30,80 20,38" fill="url(#crystal50)" filter="url(#s50)"/>
    <polygon points="50,12 80,38 50,32" fill="#BAE6FD" opacity="0.6"/>
    <polygon points="20,38 50,32 30,80" fill="#0369A1" opacity="0.5"/>
    <polygon points="80,38 70,80 50,32" fill="#38BDF8" opacity="0.35"/>
    <polygon points="30,80 70,80 50,32" fill="#0C4A6E" opacity="0.4"/>
    <line x1="50" y1="12" x2="50" y2="80" stroke="#BAE6FD" stroke-width="0.8" opacity="0.5"/>
    <line x1="20" y1="38" x2="80" y2="38" stroke="#BAE6FD" stroke-width="0.8" opacity="0.5"/>
    <circle cx="50" cy="12" r="4" fill="#fff" opacity="0.9"/>
    <circle cx="80" cy="38" r="3" fill="#7DD3FC" opacity="0.8"/>
    <circle cx="20" cy="38" r="3" fill="#7DD3FC" opacity="0.8"/>
  </svg>`,

  // ── 100 days: Champion Trophy Egg (Legendary) ─────────────────
  100: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="trophy100" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FEF9C3"/>
        <stop offset="40%" stop-color="#FBBF24"/>
        <stop offset="100%" stop-color="#92400E"/>
      </linearGradient>
      <radialGradient id="glow100" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FCD34D" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#D97706" stop-opacity="0"/>
      </radialGradient>
      <filter id="s100"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#B45309" flood-opacity="0.7"/></filter>
    </defs>
    <ellipse cx="50" cy="55" rx="40" ry="40" fill="url(#glow100)"/>
    <path d="M30 20 L70 20 L70 50 Q70 72 50 78 Q30 72 30 50 Z" fill="url(#trophy100)" filter="url(#s100)"/>
    <path d="M20 22 Q20 42 30 48 L30 22 Z" fill="url(#trophy100)" filter="url(#s100)"/>
    <path d="M80 22 Q80 42 70 48 L70 22 Z" fill="url(#trophy100)" filter="url(#s100)"/>
    <rect x="38" y="78" width="24" height="6" rx="3" fill="url(#trophy100)" filter="url(#s100)"/>
    <rect x="32" y="82" width="36" height="6" rx="3" fill="url(#trophy100)"/>
    <ellipse cx="50" cy="46" rx="14" ry="16" fill="#FEF9C3" opacity="0.25"/>
    <polygon points="50,28 52.5,35.5 60,35.5 54,40 56.5,47 50,43 43.5,47 46,40 40,35.5 47.5,35.5" fill="#FEF9C3" opacity="0.9"/>
    <path d="M36 62 Q43 68 50 65 Q57 68 64 62" stroke="#FEF9C3" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.6"/>
  </svg>`,

  // ── 365 days: SKM Legend Golden Chicken (Legendary) ───────────
  365: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="legend365" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stop-color="#FEF9C3"/>
        <stop offset="40%" stop-color="#FBBF24"/>
        <stop offset="100%" stop-color="#DC2626"/>
      </radialGradient>
      <radialGradient id="aura365" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FCD34D" stop-opacity="0.7"/>
        <stop offset="60%" stop-color="#D97706" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#991B1B" stop-opacity="0"/>
      </radialGradient>
      <filter id="s365"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#B45309" flood-opacity="0.8"/></filter>
    </defs>
    <ellipse cx="50" cy="50" rx="44" ry="44" fill="url(#aura365)"/>
    <circle cx="50" cy="50" r="35" fill="url(#legend365)" filter="url(#s365)"/>
    <circle cx="50" cy="50" r="28" fill="#FEF9C3" opacity="0.15"/>
    <text x="50" y="44" font-size="11" text-anchor="middle" font-family="Arial Black" fill="#92400E" font-weight="900" opacity="0.9">SKM</text>
    <text x="50" y="58" font-size="9" text-anchor="middle" font-family="Arial Black" fill="#92400E" font-weight="900" opacity="0.8">LEGEND</text>
    <text x="50" y="68" font-size="7" text-anchor="middle" font-family="Arial" fill="#B45309" opacity="0.7">365 DAYS</text>
    <polygon points="50,10 52,17 59,17 53.5,21 55.5,28 50,24 44.5,28 46.5,21 41,17 48,17" fill="#FFD700" opacity="0.95" filter="url(#s365)"/>
    <circle cx="26" cy="26" r="5" fill="#FFD700" opacity="0.8"/>
    <circle cx="74" cy="26" r="5" fill="#FFD700" opacity="0.8"/>
    <circle cx="19" cy="50" r="4" fill="#FBBF24" opacity="0.6"/>
    <circle cx="81" cy="50" r="4" fill="#FBBF24" opacity="0.6"/>
    <circle cx="26" cy="74" r="5" fill="#F59E0B" opacity="0.7"/>
    <circle cx="74" cy="74" r="5" fill="#F59E0B" opacity="0.7"/>
  </svg>`,
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
