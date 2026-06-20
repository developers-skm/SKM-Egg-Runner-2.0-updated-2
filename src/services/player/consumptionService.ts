/**
 * SKM EGG RUNNER — Egg Consumption Service
 * Manages Firestore subcollection users/{uid}/consumptionLog and summary statistics.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

export interface ConsumptionLogEntry {
  id?: string;
  timestamp: any; // Firestore Timestamp or Date
  type: 'MANUAL' | 'QR_SCAN';
  qrCode?: string | null;
  quantity: number;
}

export interface ConsumptionStats {
  todayCount: number;
  weekCount: number;
  monthCount: number;
  lifetimeCount: number;
  currentStreak: number;
  bestStreak: number;
  lastConsumptionDate: string | null;
  totalQRCodesScanned: number;
  lastQRScanDate: string | null;
  recentScans: string[];
}

const USERS = 'users';
const CONSUMPTION_LOG = 'consumptionLog';

// Helper to get local date string YYYY-MM-DD
function getLocalDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('sv-SE'); // YYYY-MM-DD format
}

// ─────────────────────────────────────────────
// logEggConsumption — Adds a log and updates streaks/stats
// ─────────────────────────────────────────────
export async function logEggConsumption(
  uid: string,
  qrCode?: string | null
): Promise<ConsumptionStats> {
  const userRef = doc(db, USERS, uid);
  const logCollectionRef = collection(db, USERS, uid, CONSUMPTION_LOG);

  const todayStr = getLocalDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  // 1. Fetch current user doc for existing summary stats
  const userSnap = await getDoc(userRef);
  let lifetimeCount = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let lastConsumptionDate: string | null = null;
  let totalQRCodesScanned = 0;
  let lastQRScanDate: string | null = null;
  let recentScans: string[] = [];

  if (userSnap.exists()) {
    const data = userSnap.data();
    lifetimeCount = data.lifetimeConsumption ?? 0;
    currentStreak = data.currentConsumptionStreak ?? 0;
    bestStreak = data.bestConsumptionStreak ?? 0;
    lastConsumptionDate = data.lastConsumptionDate ?? null;
    totalQRCodesScanned = data.totalQRCodesScanned ?? 0;
    lastQRScanDate = data.lastQRScanDate ?? null;
    recentScans = data.recentScans ?? [];
  }

  // 2. Add log entry to subcollection
  const newLog: ConsumptionLogEntry = {
    timestamp: serverTimestamp(),
    type: qrCode ? 'QR_SCAN' : 'MANUAL',
    qrCode: qrCode || null,
    quantity: 1,
  };
  await addDoc(logCollectionRef, newLog);

  // 3. Recalculate Streak
  if (!lastConsumptionDate) {
    // First time logging
    currentStreak = 1;
    bestStreak = 1;
  } else if (lastConsumptionDate === todayStr) {
    // Already logged today, streak does not change
  } else if (lastConsumptionDate === yesterdayStr) {
    // Logged yesterday, increment streak
    currentStreak += 1;
  } else {
    // Streak broken, reset to 1
    currentStreak = 1;
  }
  bestStreak = Math.max(bestStreak, currentStreak);
  lastConsumptionDate = todayStr;

  // 4. Update stats
  lifetimeCount += 1;
  if (qrCode) {
    totalQRCodesScanned += 1;
    lastQRScanDate = new Date().toISOString();
    // Prepend to recent scans, keep unique, cap at 5
    recentScans = [qrCode, ...recentScans.filter(c => c !== qrCode)].slice(0, 5);
  }

  // 5. Write updated stats back to users/{uid}
  const summaryUpdates = {
    lifetimeConsumption: lifetimeCount,
    currentConsumptionStreak: currentStreak,
    bestConsumptionStreak: bestStreak,
    lastConsumptionDate,
    totalQRCodesScanned,
    lastQRScanDate,
    recentScans,
  };
  await updateDoc(userRef, summaryUpdates);

  // Hydrate local storage copy for the current user
  saveConsumptionStatsToLocal(uid, summaryUpdates);

  // 6. Return fully computed stats
  return await fetchConsumptionStats(uid);
}

// ─────────────────────────────────────────────
// fetchConsumptionStats — Aggregates stats from logs
// ─────────────────────────────────────────────
export async function fetchConsumptionStats(uid: string): Promise<ConsumptionStats> {
  const userRef = doc(db, USERS, uid);
  const logCollectionRef = collection(db, USERS, uid, CONSUMPTION_LOG);

  // Load summary stats from main user doc
  const userSnap = await getDoc(userRef);
  let lifetimeCount = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let lastConsumptionDate: string | null = null;
  let totalQRCodesScanned = 0;
  let lastQRScanDate: string | null = null;
  let recentScans: string[] = [];

  if (userSnap.exists()) {
    const data = userSnap.data();
    lifetimeCount = data.lifetimeConsumption ?? 0;
    currentStreak = data.currentConsumptionStreak ?? 0;
    bestStreak = data.bestConsumptionStreak ?? 0;
    lastConsumptionDate = data.lastConsumptionDate ?? null;
    totalQRCodesScanned = data.totalQRCodesScanned ?? 0;
    lastQRScanDate = data.lastQRScanDate ?? null;
    recentScans = data.recentScans ?? [];
  }

  // Load all logs from the last 30 days to compute ranges
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const q = query(
    logCollectionRef,
    orderBy('timestamp', 'desc')
  );

  let todayCount = 0;
  let weekCount = 0;
  let monthCount = 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(monthStart.getDate() - 30);
  monthStart.setHours(0, 0, 0, 0);

  try {
    const snap = await getDocs(q);
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      let date: Date;
      if (data.timestamp instanceof Timestamp) {
        date = data.timestamp.toDate();
      } else if (data.timestamp?.seconds) {
        date = new Date(data.timestamp.seconds * 1000);
      } else {
        date = new Date(data.timestamp);
      }

      if (isNaN(date.getTime())) return;

      if (date >= todayStart) todayCount += data.quantity ?? 1;
      if (date >= weekStart) weekCount += data.quantity ?? 1;
      if (date >= monthStart) monthCount += data.quantity ?? 1;
    });
  } catch (err) {
    console.error('Failed to fetch logs for aggregates:', err);
  }

  const stats = {
    todayCount,
    weekCount,
    monthCount,
    lifetimeCount,
    currentStreak,
    bestStreak,
    lastConsumptionDate,
    totalQRCodesScanned,
    lastQRScanDate,
    recentScans,
  };

  // Sync to local storage
  saveConsumptionStatsToLocal(uid, stats);

  return stats;
}

// ─────────────────────────────────────────────
// deleteConsumptionData — Clears logs and stats (Tab 5)
// ─────────────────────────────────────────────
export async function deleteConsumptionData(uid: string): Promise<void> {
  const logCollectionRef = collection(db, USERS, uid, CONSUMPTION_LOG);
  try {
    const snap = await getDocs(logCollectionRef);
    const batch = writeBatch(db);
    snap.docs.forEach(d => {
      batch.delete(d.ref);
    });
    await batch.commit();
  } catch (err) {
    console.error('Failed to delete consumption subcollection:', err);
  }

  const userRef = doc(db, USERS, uid);
  await updateDoc(userRef, {
    lifetimeConsumption: 0,
    currentConsumptionStreak: 0,
    bestConsumptionStreak: 0,
    lastConsumptionDate: null,
    totalQRCodesScanned: 0,
    lastQRScanDate: null,
    recentScans: [],
  });

  localStorage.removeItem(`skm_${uid}_consumption_stats`);
}

// ─────────────────────────────────────────────
// Local Storage caching utilities
// ─────────────────────────────────────────────
function saveConsumptionStatsToLocal(uid: string, data: any) {
  const key = `skm_${uid}_consumption_stats`;
  try {
    const existing = localStorage.getItem(key);
    const parsed = existing ? JSON.parse(existing) : {};
    localStorage.setItem(key, JSON.stringify({ ...parsed, ...data }));
  } catch (_) {}
}

export function loadConsumptionStatsFromLocal(uid: string): ConsumptionStats | null {
  const key = `skm_${uid}_consumption_stats`;
  try {
    const val = localStorage.getItem(key);
    if (!val) return null;
    return JSON.parse(val) as ConsumptionStats;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────
// getChartData — Prepares 7-day daily counts for SVG Chart
// ─────────────────────────────────────────────
export async function getChartData(uid: string): Promise<{ dayName: string; count: number }[]> {
  const logCollectionRef = collection(db, USERS, uid, CONSUMPTION_LOG);
  const q = query(logCollectionRef, orderBy('timestamp', 'desc'));
  
  const dailyCounts: { [key: string]: number } = {};
  
  // Initialize last 7 days
  const days = [];
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = getLocalDateString(d);
    dailyCounts[key] = 0;
    days.push({
      key,
      dayName: weekdayNames[d.getDay()],
    });
  }

  try {
    const snap = await getDocs(q);
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      let date: Date;
      if (data.timestamp instanceof Timestamp) {
        date = data.timestamp.toDate();
      } else if (data.timestamp?.seconds) {
        date = new Date(data.timestamp.seconds * 1000);
      } else {
        date = new Date(data.timestamp);
      }
      if (isNaN(date.getTime())) return;
      const key = getLocalDateString(date);
      if (key in dailyCounts) {
        dailyCounts[key] += data.quantity ?? 1;
      }
    });
  } catch (err) {
    console.error('Failed to get chart data:', err);
  }

  return days.map(d => ({
    dayName: d.dayName,
    count: dailyCounts[d.key],
  }));
}
