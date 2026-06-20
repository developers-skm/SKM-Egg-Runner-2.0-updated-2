/**
 * SKM EGG RUNNER — Seed QR Codes into Firestore
 *
 * Run: node scripts/seedQRCodes.mjs
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON,
 * OR run from Firebase Admin context.
 *
 * Each QR document:
 *   code:      string   — document ID, e.g. "EGG-0001"
 *   maxPlays:  number   — total plays allowed (default 2)
 *   playCount: number   — starts at 0
 *   active:    boolean  — true = usable
 *   createdAt: Timestamp
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load service account ──────────────────────────────────────────────────────
// Place your Firebase service account JSON at the project root as serviceAccount.json
// Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key
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

// ── Define QR codes to seed ───────────────────────────────────────────────────
// Add as many as needed. maxPlays = how many game sessions each QR allows.
const QR_CODES = [
  { code: 'EGG-0001', maxPlays: 2 },
  { code: 'EGG-0002', maxPlays: 2 },
  { code: 'EGG-0003', maxPlays: 2 },
  { code: 'EGG-0004', maxPlays: 2 },
  { code: 'EGG-0005', maxPlays: 2 },
  { code: 'EGG-0006', maxPlays: 2 },
  { code: 'EGG-0007', maxPlays: 2 },
  { code: 'EGG-0008', maxPlays: 2 },
  { code: 'EGG-0009', maxPlays: 2 },
  { code: 'EGG-0010', maxPlays: 2 },
];

async function seed() {
  console.log(`\n🌱 Seeding ${QR_CODES.length} QR codes into Firestore...\n`);
  const batch = db.batch();

  for (const { code, maxPlays } of QR_CODES) {
    const ref = db.collection('qrCodes').doc(code);
    const snap = await ref.get();

    if (snap.exists) {
      console.log(`  ⏭  ${code} — already exists (skipping)`);
      continue;
    }

    batch.set(ref, {
      code,
      maxPlays,
      playCount: 0,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`  ✅ ${code} — queued (maxPlays: ${maxPlays})`);
  }

  await batch.commit();
  console.log('\n✅ Done! QR codes are live in Firestore.\n');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
