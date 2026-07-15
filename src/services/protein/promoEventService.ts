/**
 * SKM Rewards Club — Promotional Event Service
 *
 * Firestore collection:
 *   promoEvents/{id}   — admin-managed promotional banners (public read, developer write)
 *
 * Drives the "Double Points Day" / weekend bonus / festival special card on the
 * Rewards overview. When no event is currently active, the card is hidden —
 * it is never shown just because "today" happens to match a hardcoded rule.
 *
 * Additive to the protein tracker — does not touch reward wallet, transaction
 * ledger, membership calculation, or coupon redemption logic in any way.
 * Seed/edit events with scripts/seedPromoEvents.mjs or directly in Firestore.
 */

import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export interface PromoEvent {
  id:          string;
  title:       string;
  description: string;
  startAt:     Timestamp;
  endAt:       Timestamp;
  multiplier:  number;  // e.g. 2 = double points
  bannerImage?: string;
  ctaText:     string;
  active:      boolean; // admin kill-switch, independent of the date window
}

/** Returns the single currently-active promo event, or null if none is running. */
export async function getActivePromoEvent(): Promise<PromoEvent | null> {
  const now = Timestamp.now();
  const colRef = collection(db, 'promoEvents');
  const q = query(colRef, where('active', '==', true));
  const snap = await getDocs(q);

  const candidates = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as PromoEvent))
    .filter(e => e.startAt.toMillis() <= now.toMillis() && now.toMillis() < e.endAt.toMillis());

  if (candidates.length === 0) return null;

  // If multiple events overlap, prefer the one ending soonest (most urgent).
  candidates.sort((a, b) => a.endAt.toMillis() - b.endAt.toMillis());
  return candidates[0];
}
