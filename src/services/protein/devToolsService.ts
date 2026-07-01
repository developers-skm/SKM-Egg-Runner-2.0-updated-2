/**
 * Developer Tools Service
 *
 * Testing-only helpers. All functions are safe to call in production because
 * they are only reachable through the hidden Developer Mode panel, which is
 * gated behind a role check + secret gesture. No side-effects happen unless
 * an explicit dev action is triggered.
 */

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc,
  serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { todayKey, dateKeyFor } from '../../utils/dateHelpers';
import { logEggScan, PROTEIN_PER_EGG } from './proteinTrackerService';
import { MILESTONES } from './milestoneRewardService';

// ─── Role check ───────────────────────────────────────────────

export async function isDevUser(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return false;
    const role = snap.data().role;
    return role === 'developer' || role === 'admin';
  } catch {
    return false;
  }
}

// ─── Add Test Protein (+6g) ───────────────────────────────────

export async function devAddTestProtein(uid: string): Promise<void> {
  const fakeCode = `DEV-TEST-${Date.now()}`;
  // Write a fake qrCodes doc so logEggScan's flow doesn't choke
  await setDoc(doc(db, 'qrCodes', fakeCode), {
    active: true, playCount: 0, maxPlays: 999,
    proteinConsumed: false,
    createdAt: serverTimestamp(),
    _devTestEntry: true,
  });
  await logEggScan(uid, fakeCode);
}

// ─── Add N streak days ────────────────────────────────────────

export async function devAddStreakDays(uid: string, days: number): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const snap    = await getDoc(userRef);
  const data    = snap.exists() ? snap.data() : {};
  const current = (data.currentConsumptionStreak as number) ?? 0;
  const best    = (data.bestConsumptionStreak    as number) ?? 0;
  const newStreak = current + days;
  await updateDoc(userRef, {
    currentConsumptionStreak: newStreak,
    bestConsumptionStreak:    Math.max(best, newStreak),
    lastConsumptionDate:      todayKey(),
  });
  // Also stamp today in streak history
  await setDoc(
    doc(db, 'streakHistory', uid, 'days', todayKey()),
    { completed: true, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) },
    { merge: true }
  );
}

// ─── Reset today's egg (remove today's protein log entry) ─────

export async function devResetTodayEgg(uid: string): Promise<void> {
  const dk      = todayKey();
  const statsRef = doc(db, 'daily_stats', uid, 'days', dk);
  const entriesRef = collection(db, 'protein_logs', uid, 'entries');

  // Delete today's stat doc
  await deleteDoc(statsRef).catch(() => {});

  // Delete today's scan entries
  const snap = await getDocs(entriesRef);
  const toDelete = snap.docs.filter(d => d.data().dateKey === dk && d.data().type === 'qr_scan');
  await Promise.all(toDelete.map(d => deleteDoc(d.ref)));

  // Reset streak history for today
  await deleteDoc(doc(db, 'streakHistory', uid, 'days', dk)).catch(() => {});
}

// ─── Simulate Tomorrow ────────────────────────────────────────
// Stamps yesterday as completed (so tomorrow's scan extends streak)

export async function devSimulateTomorrow(uid: string): Promise<void> {
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dateKeyFor(d);
  })();
  await setDoc(
    doc(db, 'streakHistory', uid, 'days', yesterday),
    { completed: true, time: '12:00' },
    { merge: true }
  );
  await updateDoc(doc(db, 'users', uid), {
    lastConsumptionDate: yesterday,
  });
}

// ─── Unlock all milestones ────────────────────────────────────

export async function devUnlockAllMilestones(uid: string): Promise<void> {
  const allDays = MILESTONES.map(m => m.days);
  await setDoc(doc(db, 'milestone_rewards', uid), { claimed: allDays }, { merge: true });
}

// ─── Unlock one milestone by streak days ─────────────────────

export async function devUnlockMilestone(uid: string, days: number): Promise<void> {
  const snap = await getDoc(doc(db, 'milestone_rewards', uid));
  const existing: number[] = snap.exists() ? (snap.data().claimed ?? []) : [];
  if (!existing.includes(days)) {
    await setDoc(doc(db, 'milestone_rewards', uid), { claimed: [...existing, days] }, { merge: true });
  }
}

// ─── Reset streak data ────────────────────────────────────────

export async function devResetStreakData(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    currentConsumptionStreak: 0,
    bestConsumptionStreak:    0,
    lastConsumptionDate:      '',
  });

  // Delete all streak history docs
  const histSnap = await getDocs(collection(db, 'streakHistory', uid, 'days'));
  await Promise.all(histSnap.docs.map(d => deleteDoc(d.ref)));

  // Reset milestones
  await deleteDoc(doc(db, 'milestone_rewards', uid)).catch(() => {});
}

// ─── Trigger test notification ────────────────────────────────

export async function devTriggerTestNotification(uid: string): Promise<void> {
  await addDoc(collection(db, 'notifications'), {
    userId:    uid,
    type:      'dev_test',
    title:     '🛠 Developer Test',
    body:      'This is a test notification from Developer Mode.',
    read:      false,
    createdAt: serverTimestamp(),
  });
}
