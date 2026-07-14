/**
 * SKM Notification Navigation Context
 *
 * Bridges "user tapped a notification" to "app switches screen/tab and
 * highlights the relevant card" across two independent local state trees
 * that otherwise can't see each other:
 *   - AppRoot's `screen` state (main.tsx)        — MODULE_SELECT/GAME/PROTEIN_TRACKER/QR_MANAGEMENT
 *   - ProteinTrackerScreen's `tab` state          — dashboard/scan/log/stats/streaks/rewards/profile
 *   - each destination screen's own internal sub-tab/sub-view state
 *
 * Flow: NotificationItem taps a row → calls `navigateTo(target)` from this
 * context → AppRoot's effect reads `pendingTarget` and switches to
 * PROTEIN_TRACKER → ProteinTrackerScreen reads it and switches its own tab →
 * the destination screen reads it (via a `navTarget` prop) to open the right
 * internal sub-tab and highlight/scroll to the right card, then calls
 * `consumeTarget()` once applied so it doesn't re-trigger on a later re-render.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

// Top-level screen a notification can route into. Only 'PROTEIN_TRACKER' is
// used today — the union stays open in case game-side notifications route
// into 'GAME' later without another context redesign.
export type NavScreen = 'PROTEIN_TRACKER';

// Tabs inside ProteinTrackerScreen (mirrors ProteinTrackerScreen's own `Tab`
// type — duplicated here rather than imported to keep this context free of
// a dependency on a screen component).
export type NavTab = 'dashboard' | 'scan' | 'log' | 'stats' | 'profile' | 'streaks' | 'rewards';

export interface NavTarget {
  screen: NavScreen;
  tab: NavTab;
  /** Sub-view inside the destination screen, e.g. RewardsClubScreen's HubTab or ProfileScreen's sticker view. Meaning is screen-specific. */
  section?: string;
  /** Stable id of the item to highlight/scroll to (milestone `days`, batch `batchNumber`, coupon `id`, etc.). Meaning is screen-specific. */
  entityId?: string;
  /** Free-form extra data a destination screen may need (e.g. coupon status filter). */
  metadata?: Record<string, string | number | boolean>;
}

interface NavigationContextValue {
  pendingTarget: NavTarget | null;
  navigateTo: (target: NavTarget) => void;
  consumeTarget: () => void;
}

const NavigationContext = createContext<NavigationContextValue>({
  pendingTarget: null,
  navigateTo: () => {},
  consumeTarget: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [pendingTarget, setPendingTarget] = useState<NavTarget | null>(null);

  const navigateTo = useCallback((target: NavTarget) => {
    setPendingTarget(target);
  }, []);

  // Called by the screen that actually applied the target, so a subsequent
  // re-render (e.g. user taps a bottom-nav tab afterwards) doesn't re-fire it.
  const consumeTarget = useCallback(() => {
    setPendingTarget(null);
  }, []);

  return (
    <NavigationContext.Provider value={{ pendingTarget, navigateTo, consumeTarget }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
