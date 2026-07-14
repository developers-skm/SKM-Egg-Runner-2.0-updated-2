/**
 * Haptic Service — subtle vibration feedback via the Vibration API.
 * No file/library needed. Works on Chrome Android; silently unsupported
 * on iOS Safari and desktop browsers (no navigator.vibrate).
 *
 * Every method checks navigator.vibrate before attempting a call and
 * NEVER throws — a device with no vibration support (or a user who has
 * disabled haptics in-app) sees zero difference in behavior, only the
 * absence of vibration.
 */

const STORAGE_KEY = 'skm_haptics_enabled';

let enabled = true;
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) enabled = stored === 'true';
} catch { /* localStorage unavailable — default to enabled */ }

function supported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Fires a vibration pattern. Safe no-op if unsupported, disabled, or if vibrate() throws. */
function fire(pattern: number | number[]): void {
  if (!enabled || !supported()) return;
  try {
    navigator.vibrate(pattern);
  } catch { /* never let a haptic failure affect the app */ }
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
};
