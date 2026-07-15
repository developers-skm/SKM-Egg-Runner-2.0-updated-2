/**
 * Haptic Service — subtle vibration feedback via the Vibration API.
 * No file/library needed. Works on Chrome Android; silently unsupported
 * on iOS Safari and desktop browsers (no navigator.vibrate).
 *
 * Every method checks navigator.vibrate before attempting a call and
 * NEVER throws — a device with no vibration support (or a user who has
 * disabled haptics in-app) sees zero difference in behavior, only the
 * absence of vibration.
 *
 * IMPORTANT (Android Chrome): navigator.vibrate() silently returns `false`
 * (no exception) once the page's "sticky user activation" window has
 * lapsed — a few seconds after the user's last tap/click/touch. Any
 * caller sitting behind several `await`s (Firestore round-trips, artificial
 * setTimeout delays, etc.) can miss that window with zero visible symptom
 * unless debug mode is on. See markGesture()/fire() below.
 */

import { isDeveloperModeEnabled } from '../dev/devModeService';

const STORAGE_KEY = 'skm_haptics_enabled';

let enabled = true;
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) enabled = stored === 'true';
} catch { /* localStorage unavailable — default to enabled */ }

function supported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** True if the page currently has an unexpired user-activation window (best-effort — falls back to true if the UA doesn't expose the API). */
function hasActivation(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  if (!ua) return true; // API not exposed (e.g. older browsers) — don't block on an unknown
  return ua.isActive;
}

function log(pattern: number | number[], sent: boolean, reason?: string): void {
  if (!isDeveloperModeEnabled()) return;
  console.log(
    '[HAPTIC]',
    `\n  Device supports vibration: ${supported()}`,
    `\n  navigator.vibrate exists: ${typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'}`,
    `\n  Haptic enabled in settings: ${enabled}`,
    `\n  User activation active: ${hasActivation()}`,
    `\n  Requested pattern: ${JSON.stringify(pattern)}`,
    sent ? '\n  Vibration request sent.' : `\n  Vibration request BLOCKED (${reason ?? 'unknown'}).`,
  );
}

/** Fires a vibration pattern. Safe no-op if unsupported, disabled, or if vibrate() throws. */
function fire(pattern: number | number[]): void {
  if (!enabled) { log(pattern, false, 'haptics disabled in settings'); return; }
  if (!supported()) { log(pattern, false, 'navigator.vibrate unsupported'); return; }
  try {
    const accepted = navigator.vibrate(pattern);
    log(pattern, accepted, accepted ? undefined : 'navigator.vibrate() returned false — likely expired user-activation window');
  } catch (e) {
    log(pattern, false, `navigator.vibrate() threw: ${(e as Error)?.message ?? e}`);
  }
}

export const HapticService = {
  /** Very light tap — minor UI feedback (major button presses). */
  light(): void {
    fire(10);
  },

  /** Medium tap — a meaningful but routine event (streak day, coupon unlock). */
  medium(): void {
    fire(25);
  },

  /** Heavy tap — a significant/rare event (membership upgrade, challenge complete). */
  heavy(): void {
    fire(50);
  },

  /** Success pattern — short double-pulse for a positive completion event. */
  success(): void {
    fire([15, 60, 25]);
  },

  /** Warning pattern — a single firmer pulse, distinct from success/error. */
  warning(): void {
    fire([30, 40, 30]);
  },

  /** Error pattern — three short sharp pulses. */
  error(): void {
    fire([20, 40, 20, 40, 20]);
  },

  /** Selection tick — the lightest possible feedback, for toggles/pickers. */
  selection(): void {
    fire(8);
  },

  /** Notification pattern — a gentle double-tap, distinct from success. */
  notification(): void {
    fire([12, 80, 12]);
  },

  /** Whether haptics are currently enabled (user preference). */
  isEnabled(): boolean {
    return enabled;
  },

  /** Updates and persists the user's haptic preference. */
  setEnabled(on: boolean): void {
    enabled = on;
    try { localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false'); } catch { /* ignore */ }
  },

  /** Whether this device/browser exposes the Vibration API at all. */
  isSupported: supported,

  /** Whether the page currently has an unexpired user-activation window (debug/diagnostic use). */
  hasActivation,
};
