/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Developer Mode: a local-only testing toggle that bypasses QR verification
// so developers can start the game instantly. Strictly client-side —
// consumes no QR, writes no Firestore records, does not touch play counts,
// analytics, or the Protein Tracker. Persisted in localStorage so it
// survives reloads; must default OFF for every real user.

const STORAGE_KEY = 'skm_developer_mode';
const EVENT_NAME = 'skm_developer_mode_changed';

export function isDeveloperModeEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setDeveloperModeEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, 'true');
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { enabled } }));
}

// Components (SettingsModal, ModuleSelectScreen, App.tsx) subscribe to this
// so the toggle takes effect immediately without a reload.
export function subscribeDeveloperMode(cb: (enabled: boolean) => void): () => void {
  const handler = () => cb(isDeveloperModeEnabled());
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
