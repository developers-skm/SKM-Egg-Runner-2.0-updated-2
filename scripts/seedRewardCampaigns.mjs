/**
 * SKM Rewards Club — Seed / Manage Seasonal Reward Campaigns in Firestore
 *
 * Run: node scripts/seedRewardCampaigns.mjs
 *
 * Requires serviceAccount.json at project root (same as scripts/seedQRCodes.mjs).
 *
 * Each rewardCampaigns document:
 *   name:          string   — e.g. "SKM Weekly Rewards"
 *   description:   string
 *   icon:          string   — emoji, e.g. "🥚" | "🏆" | "🔥"
 *   startAt:       Timestamp
 *   endAt:         Timestamp
 *   durationDays:  number   — 7 | 10 | 15 (informational; startAt/endAt are authoritative)
 *   objectives:    array of { kind, target, stage?, label? }
 *                    kind: 'eggScans' | 'points' | 'stage' | 'proteinStreak' | 'foodLogs'
 *   active:        boolean  — admin kill-switch; only shows when active AND now is within [startAt, endAt)
 *   autoRestart:   boolean  — if true and no next campaign is scheduled, the app clones this
 *                             one forward into a fresh dated copy once it expires
 *
 * This script seeds/skips existing docs (merge: true) — safe to re-run.
 * By default it seeds THREE campaigns back-to-back (Campaign 1 active now,
 * Campaign 2 starting when Campaign 1 ends, Campaign 3 after that) so the
 * rotation and "Upcoming Campaign" UI can be exercised immediately.
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

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();

function addDays(base, days) {
  return new Date(base.getTime() + days * DAY_MS);
}

const campaign1Start = now;
const campaign1End   = addDays(campaign1Start, 7);
const campaign2Start = campaign1End;
const campaign2End   = addDays(campaign2Start, 10);
const campaign3Start = campaign2End;
const campaign3End   = addDays(campaign3Start, 15);

const CAMPAIGNS = [
  {
    slug: 'campaign-1-weekly-rewards',
    name: 'SKM Weekly Rewards',
    description: 'Scan eggs, reach Stage 2, and earn points for exclusive weekly discounts.',
    icon: '🥚',
    startAt: campaign1Start,
    endAt: campaign1End,
    durationDays: 7,
    objectives: [
      { kind: 'eggScans', target: 40 },
      { kind: 'stage', target: 2, stage: 'CHICK', label: 'Stage 2' },
      { kind: 'points', target: 300 },
    ],
    active: true,
    autoRestart: true,
  },
  {
    slug: 'campaign-2-egg-challenge',
    name: 'SKM Egg Challenge',
    description: 'Scan 60 eggs, keep a 7-day protein streak, and reach Champion Stage.',
    icon: '🏆',
    startAt: campaign2Start,
    endAt: campaign2End,
    durationDays: 10,
    objectives: [
      { kind: 'eggScans', target: 60 },
      { kind: 'proteinStreak', target: 7 },
      { kind: 'stage', target: 4, stage: 'STAGE2', label: 'Champion Stage' },
    ],
    active: true,
    autoRestart: true,
  },
  {
    slug: 'campaign-3-limited-time',
    name: 'Limited Time Rewards',
    description: 'Scan 100 eggs, earn 600 points, and log 10 meals to unlock top-tier discounts.',
    icon: '🔥',
    startAt: campaign3Start,
    endAt: campaign3End,
    durationDays: 15,
    objectives: [
      { kind: 'eggScans', target: 100 },
      { kind: 'points', target: 600 },
      { kind: 'foodLogs', target: 10 },
    ],
    active: true,
    autoRestart: true,
  },
];

async function seed() {
  console.log(`\n🌱 Seeding ${CAMPAIGNS.length} reward campaign(s) into Firestore...\n`);
  const batch = db.batch();

  CAMPAIGNS.forEach(c => {
    const ref = db.collection('rewardCampaigns').doc(c.slug);
    batch.set(ref, {
      name:         c.name,
      description:  c.description,
      icon:         c.icon,
      startAt:      Timestamp.fromDate(c.startAt),
      endAt:        Timestamp.fromDate(c.endAt),
      durationDays: c.durationDays,
      objectives:   c.objectives,
      active:       c.active,
      autoRestart:  c.autoRestart,
      createdAt:    Timestamp.now(),
    }, { merge: true });
    console.log(`  ✅ ${c.slug} — "${c.name}" (${c.startAt.toLocaleDateString()} → ${c.endAt.toLocaleDateString()}, ${c.objectives.length} objectives)`);
  });

  await batch.commit();
  console.log('\n✅ Done! Reward campaigns are live in Firestore.\n');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
