/**
 * SKM Rewards Club — Seed / Manage Promotional Events in Firestore
 *
 * Run: node scripts/seedPromoEvents.mjs
 *
 * Requires serviceAccount.json at project root (same as scripts/seedQRCodes.mjs).
 *
 * Each promoEvents document:
 *   title:       string    — e.g. "Double Points Today"
 *   description: string    — e.g. "Earn 2x Reward Points on every eligible egg scan"
 *   startAt:     Timestamp
 *   endAt:       Timestamp
 *   multiplier:  number    — e.g. 2 for double points
 *   bannerImage: string    — optional, empty string if unused
 *   ctaText:     string    — e.g. "Scan Eggs Now"
 *   active:      boolean   — admin kill-switch; the event only shows when
 *                            active AND the current time is within [startAt, endAt)
 *
 * This script seeds/skips existing docs (merge: true) — safe to re-run.
 * Edit dates/fields directly in the Firebase console for one-off promotions;
 * use this file as a template for recurring ones (e.g. re-run weekly).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const serviceAccountPath = resolve(__dirname, '../serviceAccount.json');
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch {
  console.error('❌ serviceAccount.json not found at project root.');
  console.error('   Download it from Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

// ── Example event — edit dates before running, or add more entries ──────
// By default this seeds ONE example "Double Points Today" event ending at
// midnight tonight, so you can see the card render immediately after seeding.
const now = new Date();
const midnightTonight = new Date(now);
midnightTonight.setHours(24, 0, 0, 0);

const EVENTS = [
  {
    slug:        'double-points-today',
    title:       'Double Points Today',
    description: 'Earn 2× Reward Points on every eligible egg scan.',
    startAt:     now,
    endAt:       midnightTonight,
    multiplier:  2,
    bannerImage: '',
    ctaText:     'Scan Eggs Now',
    active:      true,
  },
];

async function seed() {
  console.log(`\n🌱 Seeding ${EVENTS.length} promo event(s) into Firestore...\n`);
  const batch = db.batch();

  EVENTS.forEach(e => {
    const ref = db.collection('promoEvents').doc(e.slug);
    batch.set(ref, {
      title:       e.title,
      description: e.description,
      startAt:     Timestamp.fromDate(e.startAt),
      endAt:       Timestamp.fromDate(e.endAt),
      multiplier:  e.multiplier,
      bannerImage: e.bannerImage,
      ctaText:     e.ctaText,
      active:      e.active,
    }, { merge: true });
    console.log(`  ✅ ${e.slug} — "${e.title}" (${e.startAt.toLocaleString()} → ${e.endAt.toLocaleString()})`);
  });

  await batch.commit();
  console.log('\n✅ Done! Promo event(s) live in Firestore.\n');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
