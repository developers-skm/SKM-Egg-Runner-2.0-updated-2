/**
 * LIVE CONFIGURATION MANAGER
 * Single source of truth for all developer-controlled game balance settings.
 *
 * Real-time flow:
 *   Developer saves config in DevController
 *   → written to Firestore gameConfig/active + localStorage
 *   → onSnapshot fires on every connected client
 *   → localStorage updated immediately
 *   → game engine reads getActiveLiveConfig() on every spawn frame
 *   → immediate effect, no restart needed
 */

import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './services/firebase/firebase';

export interface LiveConfig {
  configVersion: string;
  updatedBy: string;
  lastUpdated: string;
  isActive: boolean;

  // GAMEPLAY — all are multipliers (1.0 = default) unless noted
  feedSpawnRate: number;        // 0 = no feed,    default 1.0
  obstacleSpawnRate: number;    // 0 = no obstacles, default 1.0
  vehicleSpawnRate: number;     // 0 = no vehicles,  default 1.0
  runSpeedMultiplier: number;   // default 1.0
  stage1EvolutionReq: number;   // grains needed for EGG→CHICK, default 100
  stage2EvolutionReq: number;   // grains needed for CHICK→ADULT, default 500

  // REWARDS
  crystalEggRewards: number;    // multiplier, default 1.0
  missionRewards: number;       // multiplier, default 1.0
  achievementRewards: number;   // multiplier, default 1.0

  // ENVIRONMENT
  envRotationRate: number;      // multiplier, default 1.0
  obstacleDensity: number;      // 0 = none, default 1.0
  trafficDensity: number;       // 0 = no traffic, default 1.0
}

export const DEFAULT_LIVE_CONFIG: LiveConfig = {
  configVersion: 'v1.0.0',
  updatedBy: 'SYSTEM',
  lastUpdated: new Date().toISOString().split('T')[0],
  isActive: true,

  feedSpawnRate: 1.0,
  obstacleSpawnRate: 1.0,
  vehicleSpawnRate: 1.0,
  runSpeedMultiplier: 1.0,
  stage1EvolutionReq: 100,
  stage2EvolutionReq: 500,

  crystalEggRewards: 1.0,
  missionRewards: 1.0,
  achievementRewards: 1.0,

  envRotationRate: 1.0,
  obstacleDensity: 1.0,
  trafficDensity: 1.0,
};

const LS_CLIENT_KEY = 'skm_local_client_config';
const LS_SERVER_KEY = 'skm_server_database_config';
const FIRESTORE_DOC = 'gameConfig/active';

// ─────────────────────────────────────────────────────────────
// getActiveLiveConfig
// Called on every spawn frame by the game engine.
// Reads from localStorage so it's synchronous + always fresh.
// ─────────────────────────────────────────────────────────────
export function getActiveLiveConfig(): LiveConfig {
  try {
    const raw = localStorage.getItem(LS_CLIENT_KEY);
    if (raw) return { ...DEFAULT_LIVE_CONFIG, ...JSON.parse(raw) };
  } catch {
    // corrupted — fall through to default
  }
  return { ...DEFAULT_LIVE_CONFIG };
}

// ─────────────────────────────────────────────────────────────
// saveConfigLocally — writes both localStorage keys and fires
// the skm_config_updated event so the game engine can react.
// ─────────────────────────────────────────────────────────────
export function saveConfigLocally(config: LiveConfig): void {
  localStorage.setItem(LS_CLIENT_KEY, JSON.stringify(config));
  localStorage.setItem(LS_SERVER_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent('skm_config_updated'));
  console.log('[DEV CONFIG UPDATED]', config);
}

// ─────────────────────────────────────────────────────────────
// publishConfigToFirestore — saves config to Firestore.
// The onSnapshot listener on all clients picks this up instantly.
// ─────────────────────────────────────────────────────────────
export async function publishConfigToFirestore(config: LiveConfig): Promise<void> {
  try {
    await setDoc(doc(db, FIRESTORE_DOC), {
      ...config,
      updatedAt: serverTimestamp(),
    }, { merge: false });
    console.log('[DEV CONFIG UPDATED] Published to Firestore:', config.configVersion);
  } catch (err) {
    console.error('[DEV CONFIG] Firestore publish failed (using localStorage only):', err);
  }
}

// ─────────────────────────────────────────────────────────────
// startRealtimeConfigSync
// Call once on app init. Subscribes to Firestore onSnapshot.
// When a developer publishes a new config, every connected
// client gets it immediately — no page refresh needed.
// Returns unsubscribe function.
// ─────────────────────────────────────────────────────────────
let _syncStarted = false;

export function startRealtimeConfigSync(): () => void {
  if (_syncStarted) return () => {};
  _syncStarted = true;

  const ref = doc(db, FIRESTORE_DOC);

  const unsub = onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      // First run — seed Firestore with defaults
      publishConfigToFirestore(DEFAULT_LIVE_CONFIG).catch(() => {});
      return;
    }

    const data = snap.data() as LiveConfig & { updatedAt?: unknown };
    const { updatedAt: _ts, ...config } = data;
    const merged: LiveConfig = { ...DEFAULT_LIVE_CONFIG, ...config };

    // Update localStorage so getActiveLiveConfig() picks it up instantly
    localStorage.setItem(LS_CLIENT_KEY, JSON.stringify(merged));
    localStorage.setItem(LS_SERVER_KEY, JSON.stringify(merged));

    // Signal the game engine and dev panel
    window.dispatchEvent(new CustomEvent('skm_config_updated'));

    console.log('[DEV CONFIG UPDATED] Received from Firestore:', merged.configVersion,
      `| Traffic=${merged.trafficDensity} Vehicle=${merged.vehicleSpawnRate}`,
      `| Obstacle=${merged.obstacleSpawnRate} Feed=${merged.feedSpawnRate}`);

    addDebugLog('CONFIG', `Synced config ${merged.configVersion} from Firestore — Traffic=${merged.trafficDensity}x Feed=${merged.feedSpawnRate}x`);
  }, (err) => {
    console.warn('[DEV CONFIG] onSnapshot error (offline? rules?):', err?.message);
  });

  return () => {
    unsub();
    _syncStarted = false;
  };
}

// ─────────────────────────────────────────────────────────────
// Legacy helpers — kept for compatibility with existing code
// ─────────────────────────────────────────────────────────────
export function syncConfigWithServer(): { synced: boolean; config: LiveConfig; message: string } {
  const raw = localStorage.getItem(LS_SERVER_KEY);
  if (!raw) {
    saveConfigLocally(DEFAULT_LIVE_CONFIG);
    return { synced: true, config: DEFAULT_LIVE_CONFIG, message: 'Initialized default config.' };
  }
  try {
    const serverConfig: LiveConfig = JSON.parse(raw);
    saveConfigLocally(serverConfig);
    return { synced: true, config: serverConfig, message: `Synced ${serverConfig.configVersion}` };
  } catch {
    return { synced: false, config: DEFAULT_LIVE_CONFIG, message: 'Sync error — using defaults.' };
  }
}

// ─────────────────────────────────────────────────────────────
// Debug log helpers
// ─────────────────────────────────────────────────────────────
export interface DebugLogEntry {
  timestamp: string;
  category: string;
  message: string;
}

export function addDebugLog(category: string, message: string): void {
  try {
    const raw = localStorage.getItem('skm_debug_event_logs');
    const logs: DebugLogEntry[] = raw ? JSON.parse(raw) : [];
    logs.unshift({ timestamp: new Date().toLocaleTimeString(), category, message });
    if (logs.length > 50) logs.splice(50);
    localStorage.setItem('skm_debug_event_logs', JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent('skm_debug_log_added'));
  } catch {
    // ignore
  }
}

export function getDebugLogs(): DebugLogEntry[] {
  try {
    const raw = localStorage.getItem('skm_debug_event_logs');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
