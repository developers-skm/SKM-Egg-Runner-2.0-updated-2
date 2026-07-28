/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Developer Mode: a local-only testing toggle that bypasses QR verification
// so developers can start the game instantly. The run itself still writes
// real gameStats via saveRunStats — this flag only skips the QR/session
// check, it doesn't make the run stats fake. Persisted in localStorage, so
// the flag alone is untrusted; App.tsx only honors it after independently
// confirming the account's Firestore role via isDevUser().

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
