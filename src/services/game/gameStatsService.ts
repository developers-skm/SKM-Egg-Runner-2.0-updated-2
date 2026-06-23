/**
 * gameStatsService.ts
 *
 * Single source of truth for game run statistics shared between
 * the Egg Runner game and the Protein Tracker.
 *
 * Firestore path: users/{uid}/gameStats  (single document, merge-updated)
 */

import {
  doc, getDoc, setDoc, serverTimestamp, increment,
  type FieldValue,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface GameStats {
  gamesPlayed:     number;
  totalDistance:   number;
  bestDistance:    number;
  totalCoins:      number; // feeds earned across all runs
  totalXP:         number;
  eggsCollected:   number; // eggs rewarded in-game (NOT protein-scan eggs)
  skinsUnlocked:   number;
  bestScore:       number;
  lastPlayed:      string; // ISO date
  currentLevel:    number;
}

export interface RunSummary {
  distance:      number;
  score:         number;
  feedsEarned:   number; // feeds collected this run (used as coins)
  xpEarned:      number;
  eggsRewarded:  number; // eggs rewarded at run-end
  skinsUnlocked: number; // current total unlocked skins
  currentLevel:  number;
}

const EMPTY_STATS: GameStats = {
  gamesPlayed:   0,
  totalDistance: 0,
  bestDistance:  0,
  totalCoins:    0,
  totalXP:       0,
  eggsCollected: 0,
  skinsUnlocked: 0,
  bestScore:     0,
  lastPlayed:    '',
  currentLevel:  1,
};

// ─────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────

export async function getGameStats(uid: string): Promise<GameStats> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'gameStats', 'summary'));
    if (snap.exists()) return { ...EMPTY_STATS, ...(snap.data() as Partial<GameStats>) };
  } catch (e) {
    console.warn('[gameStatsService] getGameStats error:', e);
  }
  return { ...EMPTY_STATS };
}

// ─────────────────────────────────────────────────────────────
// Write — called once per run end
// ─────────────────────────────────────────────────────────────

export async function saveRunStats(uid: string, run: RunSummary): Promise<void> {
  if (!uid || uid === 'guest') return;

  try {
    // We use increment() for cumulative fields so concurrent writes are safe.
    // bestDistance and bestScore use a read-then-write pattern because
    // Firestore has no built-in "max" operation.
    const ref = doc(db, 'users', uid, 'gameStats', 'summary');

    // Read current best values first
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data() as Partial<GameStats>) : {};

    const newBestDistance = Math.max(existing.bestDistance ?? 0, run.distance);
    const newBestScore    = Math.max(existing.bestScore    ?? 0, run.score);

    const update: Record<string, number | string | FieldValue> = {
      gamesPlayed:   increment(1),
      totalDistance: increment(Math.round(run.distance)),
      bestDistance:  newBestDistance,
      totalCoins:    increment(run.feedsEarned),
      totalXP:       increment(run.xpEarned),
      eggsCollected: increment(run.eggsRewarded),
      skinsUnlocked: run.skinsUnlocked,
      bestScore:     newBestScore,
      lastPlayed:    new Date().toISOString().slice(0, 10),
      currentLevel:  run.currentLevel,
      updatedAt:     serverTimestamp() as unknown as string,
    };

    await setDoc(ref, update, { merge: true });
  } catch (e) {
    console.warn('[gameStatsService] saveRunStats error:', e);
    // Non-fatal — game continues even if Firestore write fails
  }
}
