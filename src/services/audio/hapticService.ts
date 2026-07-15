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

/**
 * Chrome silently no-ops navigator.vibrate() (no exception, returns false)
 * when the page isn't a secure context — plain HTTP origins other than
 * localhost/127.0.0.1. This is a common, otherwise-invisible cause of
 * "haptics never work" reports, so it gets its own check rather than
 * being lumped into supported().
 */
function isSecureContext(): boolean {
  return typeof window === 'undefined' || window.isSecureContext !== false;
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
    `\n  Secure context: ${isSecureContext()}`,
    `\n  Haptic enabled in settings: ${enabled}`,
    `\n  User activation active: ${hasActivation()}`,
    `\n  Requested pattern: ${JSON.stringify(pattern)}`,
    sent ? '\n  Vibration request sent.' : `\n  Vibration request BLOCKED (${reason ?? 'unknown'}).`,
  );
}

/** Fires a vibration pattern. Returns true only if navigator.vibrate() actually accepted the request. Safe no-op if unsupported, disabled, insecure context, or if vibrate() throws. */
function fire(pattern: number | number[]): boolean {
  if (!enabled) { log(pattern, false, 'haptics disabled in settings'); return false; }
  if (!supported()) { log(pattern, false, 'navigator.vibrate unsupported'); return false; }
  if (!isSecureContext()) { log(pattern, false, 'page is not a secure context (HTTPS/localhost required)'); return false; }
  try {
    const accepted = navigator.vibrate(pattern);
    log(pattern, accepted, accepted ? undefined : 'navigator.vibrate() returned false — likely expired user-activation window');
    return accepted;
  } catch (e) {
    log(pattern, false, `navigator.vibrate() threw: ${(e as Error)?.message ?? e}`);
    return false;
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

  /**
   * Manual verification test — always attempts a 200ms pulse regardless of
   * the user's enabled/disabled preference (that's the point: confirming
   * the underlying capability, not the current setting). Returns whether
   * navigator.vibrate() actually accepted the request, plus a reason when
   * it didn't, so the caller can show a precise message instead of guessing.
   */
  test(): { supported: boolean; fired: boolean; reason?: string } {
    if (!supported()) return { supported: false, fired: false, reason: 'This device or browser does not support vibration.' };
    if (!isSecureContext()) return { supported: true, fired: false, reason: 'Vibration requires a secure (HTTPS) connection.' };
    try {
      const accepted = navigator.vibrate(200);
      log(200, accepted, accepted ? undefined : 'navigator.vibrate() returned false on manual test');
      return {
        supported: true,
        fired: accepted,
        reason: accepted ? undefined : 'Vibration was blocked by the browser. Try tapping the button again.',
      };
    } catch (e) {
      const reason = (e as Error)?.message ?? String(e);
      log(200, false, `navigator.vibrate() threw: ${reason}`);
      return { supported: true, fired: false, reason: 'Vibration failed unexpectedly.' };
    }
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
