/**
 * SKM Rewards Club — Seed Reward Catalog into Firestore
 *
 * Run: node scripts/seedRewardCatalog.mjs
 *
 * Requires serviceAccount.json at project root (same as scripts/seedQRCodes.mjs).
 *
 * Each rewardCatalog document (id = deterministic slug):
 *   range:           string   — product line, e.g. "SKM Best Fresh"
 *   productName:     string   — e.g. "Fresh 6"
 *   mrp:             number   — current SKM product MRP in rupees
 *   discountAmount:  number   — coupon discount value in rupees
 *   minimumPurchase: number   — minimum cart value to use the coupon
 *   pointsCost:      number   — reward points required to redeem
 *   active:          boolean  — true = shown in the Rewards Club catalog
 *   sortOrder:       number   — display order
 *   createdAt:       Timestamp
 *   requiredStage:      string (optional) — Egg Runner gate: 'EGG'|'CHICK'|'ADULT'|'STAGE2'.
 *                                            If set, the reward also requires the player's
 *                                            highest-reached game stage to meet/exceed this,
 *                                            in addition to pointsCost.
 *   requiredStageLabel: string (optional) — display label, e.g. "Stage 2", "Champion Stage"
 *   requiredEggScans:   number (optional) — Smart Reward Requirement: lifetime SKM egg-scan
 *                                            count the player must reach (read from
 *                                            users/{uid}.lifetimeConsumption), in addition
 *                                            to pointsCost and any requiredStage.
 *
 * pointsCost is set at 10 points per ₹1 of discount as the default conversion rate.
 * Admins can edit any field directly in Firestore afterwards — this script only
 * seeds/skips existing docs, it never overwrites.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

const POINTS_PER_RUPEE_DISCOUNT = 10;

// ── Catalog data ───────────────────────────────────────────────
const CATALOG = [
  // SKM BEST FRESH — Smart Reward Requirements: points + egg scans + game stage
  { slug: 'fresh-6',  range: 'SKM Best Fresh', productName: 'Fresh 6',  mrp: 84,  discountAmount: 10, minimumPurchase: 100, requiredEggScans: 20, requiredStage: 'CHICK', requiredStageLabel: 'Stage 2' },
  { slug: 'fresh-12', range: 'SKM Best Fresh', productName: 'Fresh 12', mrp: 165, discountAmount: 20, minimumPurchase: 200, requiredEggScans: 40, requiredStage: 'ADULT', requiredStageLabel: 'Stage 3' },
  { slug: 'fresh-15', range: 'SKM Best Fresh', productName: 'Fresh 15', mrp: 204, discountAmount: 20, minimumPurchase: 250 },
  { slug: 'fresh-30', range: 'SKM Best Fresh', productName: 'Fresh 30', mrp: 405, discountAmount: 40, minimumPurchase: 400, requiredEggScans: 60, requiredStage: 'CHICK', requiredStageLabel: 'Stage 2' },

  // SKM BEST PLUS
  { slug: 'plus-6',   range: 'SKM Best Plus', productName: 'Plus 6',  mrp: 96,  discountAmount: 10, minimumPurchase: 100 },
  { slug: 'plus-12',  range: 'SKM Best Plus', productName: 'Plus 12', mrp: 189, discountAmount: 20, minimumPurchase: 200, requiredStage: 'CHICK', requiredStageLabel: 'Stage 2' },
  { slug: 'plus-24',  range: 'SKM Best Plus', productName: 'Plus 24', mrp: 372, discountAmount: 35, minimumPurchase: 350 },
  { slug: 'plus-30',  range: 'SKM Best Plus', productName: 'Plus 30', mrp: 462, discountAmount: 45, minimumPurchase: 450, requiredStage: 'STAGE2', requiredStageLabel: 'Champion Stage' },

  // SKM BEST BROWN
  { slug: 'brown-6',  range: 'SKM Best Brown', productName: 'Brown 6',  mrp: 105, discountAmount: 10, minimumPurchase: 100 },
  { slug: 'brown-12', range: 'SKM Best Brown', productName: 'Brown 12', mrp: 207, discountAmount: 20, minimumPurchase: 200, requiredStage: 'ADULT', requiredStageLabel: 'Stage 4' },
  { slug: 'brown-30', range: 'SKM Best Brown', productName: 'Brown 30', mrp: 510, discountAmount: 50, minimumPurchase: 500, pointsCost: 800, requiredEggScans: 100, requiredStage: 'STAGE2', requiredStageLabel: 'Champion Stage' },

  // PREMIUM RANGE
  { slug: 'cardio',   range: 'Premium Range', productName: 'Cardio',   mrp: 108, discountAmount: 10, minimumPurchase: 100 },
  { slug: 'diabet',   range: 'Premium Range', productName: 'Diabet',   mrp: 108, discountAmount: 10, minimumPurchase: 100 },
  { slug: 'omega-3',  range: 'Premium Range', productName: 'Omega-3', mrp: 108, discountAmount: 10, minimumPurchase: 100 },
  { slug: 'elite',    range: 'Premium Range', productName: 'Elite',   mrp: 108, discountAmount: 10, minimumPurchase: 100 },
];

async function seed() {
  console.log(`\n🌱 Seeding ${CATALOG.length} reward catalog items into Firestore...\n`);
  const batch = db.batch();

  CATALOG.forEach((item, i) => {
    const ref = db.collection('rewardCatalog').doc(item.slug);
    const pointsCost = item.pointsCost ?? (item.discountAmount * POINTS_PER_RUPEE_DISCOUNT);
    batch.set(ref, {
      range:           item.range,
      productName:     item.productName,
      mrp:             item.mrp,
      discountAmount:  item.discountAmount,
      minimumPurchase: item.minimumPurchase,
      pointsCost,
      active:          true,
      sortOrder:       i,
      createdAt:       FieldValue.serverTimestamp(),
      ...(item.requiredStage ? { requiredStage: item.requiredStage, requiredStageLabel: item.requiredStageLabel } : {}),
      ...(item.requiredEggScans ? { requiredEggScans: item.requiredEggScans } : {}),
    }, { merge: true });
    const gate = item.requiredStage ? `, gate: ${item.requiredStageLabel}` : '';
    const eggs = item.requiredEggScans ? `, scans: ${item.requiredEggScans}` : '';
    console.log(`  ✅ ${item.slug} — ${item.productName} (₹${item.discountAmount} OFF, ${pointsCost} pts${eggs}${gate})`);
  });

  await batch.commit();
  console.log('\n✅ Done! Reward catalog is live in Firestore.\n');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
