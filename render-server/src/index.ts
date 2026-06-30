/**
 * SKM Egg Runner — Render.com Notification Server
 *
 * Secure push notification delivery via Firebase Admin SDK.
 * The client NEVER touches FCM server credentials.
 *
 * Flow:
 *   Frontend (event occurs)
 *     → POST /notify/<type>   with Firebase ID Token header
 *     → Server verifies ID token (auth guard)
 *     → Reads FCM token from Firestore users/{uid}
 *     → Sends push via Admin SDK messaging.send()
 *     → Returns { success: true }
 *
 * Deploy on Render.com:
 *   Build command : npm install && npm run build
 *   Start command : npm start
 *   Environment   : NODE_ENV=production + FIREBASE_SERVICE_ACCOUNT_JSON (see README)
 */

import express from 'express';
import cors from 'cors';
import { initializeApp, cert } from 'firebase-admin/app';
import type { ServiceAccount } from 'firebase-admin/app';
import { notifyRoutes } from './routes/notify';

// ─── Firebase Admin init ────────────────────────────────────────────────────────

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('[SERVER] FATAL: FIREBASE_SERVICE_ACCOUNT_JSON env var is not set.');
  console.error('[SERVER] Set it in Render dashboard → Environment → Add Variable.');
  process.exit(1);
}

let serviceAccount: ServiceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
} catch {
  console.error('[SERVER] FATAL: FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
console.info('[SERVER] Firebase Admin SDK initialised.');

// ─── Express app ────────────────────────────────────────────────────────────────

const app = express();

const ALLOWED_ORIGINS = [
  'https://skm-egg-runner.web.app',
  'https://skm-egg-runner.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:4173',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '64kb' }));

// ─── Routes ─────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'skm-notification-server', ts: new Date().toISOString() });
});

app.use('/notify', notifyRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Start ───────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);
app.listen(PORT, () => {
  console.info(`[SERVER] SKM Notification Server listening on port ${PORT}`);
});
