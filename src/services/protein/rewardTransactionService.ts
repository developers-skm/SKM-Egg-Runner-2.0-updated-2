/**
 * SKM Rewards Club — Transaction Ledger Service
 *
 * Firestore collection:
 *   rewardTransactions/{uid}/entries/{entryId}   — immutable append-only ledger
 *
 * Additive to the protein tracker — does not touch any existing collection.
 */

import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export type RewardTransactionType =
  | 'scan'
  | 'streak_milestone'
  | 'sticker_milestone'
  | 'challenge'
  | 'redeem'
  | 'adjustment';

export interface RewardTransaction {
  id:          string;
  userId:      string;
  type:        RewardTransactionType;
  description: string;
  points:      number; // positive = earned, negative = spent
  createdAt:   Timestamp;
}

export async function addRewardTransaction(
  uid: string,
  entry: { type: RewardTransactionType; points: number; description: string },
): Promise<void> {
  const colRef = collection(db, 'rewardTransactions', uid, 'entries');
  await addDoc(colRef, {
    userId: uid,
    type: entry.type,
    points: entry.points,
    description: entry.description,
    createdAt: serverTimestamp(),
  });
}

export async function getRecentRewardTransactions(uid: string, take = 30): Promise<RewardTransaction[]> {
  const colRef = collection(db, 'rewardTransactions', uid, 'entries');
  const q = query(colRef, orderBy('createdAt', 'desc'), limit(take));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as RewardTransaction));
}
