# SKM Egg Runner 2.0 — Optimization Report

**Prepared by:** Senior Web Application Developer review
**Scope:** Full codebase audit — `src/`, `functions/`, `render-server/`, `api/`, `scripts/`, build/config
**Stats:** ~45,300 lines of TS/TSX across 112 files, single 3.0MB production JS bundle, zero code splitting, no ESLint configured

This report is organized as phases in priority order. Each phase is independently shippable — you don't need to finish Phase 1 before starting Phase 2, but earlier phases unblock/simplify later ones (e.g., removing dead files before extracting shared components reduces churn).

---

## Executive summary — top 5 issues by impact

1. **Zero code splitting.** The entire app — game engine (11,223-line `gameEngine.ts` + `three`), Firebase, QR scanner, admin panels — ships in one 3.0MB JS file loaded on first paint, regardless of which screen the user lands on.
2. **The game HUD re-renders the whole `App.tsx` tree ~60 times/second.** `onDistanceUpdated` fires every animation frame and triggers 6+ `setState` calls, none of which are isolated behind `React.memo` or refs (there are **zero** `React.memo` usages anywhere in the codebase).
3. **No linter.** `npm run lint` only runs `tsc --noEmit` — there is no ESLint config, so there are no "lint errors" to fix in the traditional sense; the real gap is unenforced code-quality rules (unused vars, hook deps, etc.) and a non-strict `tsconfig.json`.
4. **Heavy duplicate UI code**: modal backdrops, headers, spinners, action buttons, and confirm dialogs are copy-pasted across 15+ files with no shared components.
5. **A broken npm script and orphaned serverless file**: `setup:qr` points to a nonexistent `scripts/setup.mjs`, and `api/send-notification.js` appears to be dead infra superseded by Firebase Cloud Functions.

---

## Phase 0 — Housekeeping (dead code & broken config) ✅ COMPLETED

Low-risk, do first. Removes noise before refactoring so later diffs are clean.

**Status:** Done — `setup:qr` now points to `scripts/seedQRCodes.mjs` (added `seed:qr` alias too), `clean` no longer references nonexistent `server.js`, `api/` directory and its `vercel.json` rewrite were deleted, all 7 confirmed-dead files were removed, and `tsc --noEmit` / `vite build` both verified clean (pre-existing `QRValidationResult` errors in `App.tsx` are unrelated and untouched).

### 0.1 Confirmed dead / broken references
| Item | Path | Action |
|---|---|---|
| Broken npm script | `package.json` → `"setup:qr": "node scripts/setup.mjs"` | File doesn't exist; only `scripts/seedQRCodes.mjs` does. Fix the script path or rename the target file. |
| Stale clean script | `package.json` → `"clean": "rm -rf dist server.js"` | `server.js` never existed in this repo (leftover template artifact). Remove `server.js` from the command. |
| Orphaned serverless function | `api/send-notification.js` | Wired into `vercel.json` but the app's actual push-notification path is Firebase Cloud Functions (`functions/index.ts` → `onNotificationCreated`) + `render-server` (Render.com, wired via `VITE_RENDER_API_URL`). Confirm this isn't live on Vercel, then delete `api/` and the corresponding rewrite in `vercel.json`. |
| Unreferenced dev script | `scripts/test-push.mjs` | Not called by any npm script or CI. Keep only if used manually for testing — otherwise delete or document it in README. |

### 0.2 Confirmed unused files (never imported anywhere — safe to delete)

A full import-graph sweep of all 102 TypeScript files in `src/` found 7 files with zero references outside themselves:

| File | Size | Notes |
|---|---|---|
| `src/services/protein/retentionService.ts` | 30 KB | Retention engine for login streaks/missions/shields/XP — zero references anywhere |
| `src/services/player/consumptionService.ts` | 11 KB | Manages `users/{uid}/consumptionLog` subcollection — zero references anywhere |
| `src/components/qr-management/QRActions.tsx` | 13 KB | Bulk QR action controls; functionality appears superseded by `QRBulkControl` (which **is** used) |
| `src/components/qr-management/GoldenQRControl.tsx` | 6.6 KB | Golden QR pause/resume/disable controls; overlaps with the unused `QRActions` above, itself unused |
| `src/components/notifications/AdminNotificationManager.tsx` | 13 KB | Admin notification-sending panel — never imported |
| `src/components/notifications/AchievementPopup.tsx` | 682 B | Intentional no-op stub (comment: "removed", kept only so stale imports don't break) |
| `src/components/notifications/InAppToast.tsx` | 220 B | Intentional no-op stub (comment: "removed", returns `null`) — notifications now go through FCM push only |

**Action:** Delete the first 5 (real dead code, ~74 KB). For the two no-op stubs, first grep for any remaining `import` of `AchievementPopup`/`InAppToast` — if none exist, delete them too; if stale imports still exist elsewhere, remove those call sites in the same pass rather than keeping permanent dead stubs around.

Note: `ActionBtn` in `QRActions.tsx`/`GoldenQRControl.tsx` (Phase 3 below) becomes moot for these two files once they're deleted — only the `ActionBtn` copies in `StickerDetailModal.tsx` and `QRBulkControl.tsx` need consolidating.

### 0.3 Verify before deleting (needs a human decision)
- `render-server/` — **do not delete**, confirmed active (deployed independently to Render.com per `render.yaml`, called from `src/services/notifications/renderNotificationService.ts` and `adminBroadcastService.ts:169` via `VITE_RENDER_API_URL`). Just note it's easy to mistake for dead code since it's invisible from `firebase.json`/root `package.json` — worth a one-line note in README.
- `scripts/seedQRCodes.mjs` / `.html` — legitimate manual seeding utilities, not orphaned, just not npm-script-wired. Fine to leave; optionally add an npm script for discoverability (`"seed:qr": "node scripts/seedQRCodes.mjs"`).

### 0.4 Uncommitted change in flight
`src/protein/StickerDetailModal.tsx` currently shows modified in `git status`. Land or stash that work before starting Phase 2 (it's one of the files targeted for the `ActionBtn`/modal-backdrop extraction below), to avoid merge pain.

**Effort:** ~30 minutes. **Risk:** near zero.

---

## Phase 1 — Stop the render storm (highest performance ROI)

This is the single highest-impact fix in the whole report — it affects every second of actual gameplay, not just load time.

### 1.1 Isolate per-frame HUD state
`src/App.tsx:410-433` — `onDistanceUpdated` is invoked unconditionally every RAF tick from `src/gameEngine.ts:8433` and fires **6 separate `setState` calls** (`setCurrentStage`, `setGrainsCollected`, `setIsNearCornerTurn`, `setCornerTurnDirection`, `setIsNearGate`, `setIsHatching`, `setRunStats`). Because `App.tsx` is a 1265-line component with no `React.memo` boundaries anywhere in its subtree, this re-renders the entire app tree ~60×/sec during play.

**Fix:**
- Move fast-changing values (distance, grains, stage, near-corner/near-gate flags) into a dedicated `HUDStats` component that either:
  - subscribes to the engine via a ref + `useSyncExternalStore`/custom event, rendering independently of `App.tsx`, or
  - is driven by direct imperative DOM updates (textContent/style) from the engine, bypassing React entirely for the hottest path (typical pattern for game HUDs).
- Wrap `GameHUD` and its static children in `React.memo`.
- `setFps` (`gameEngine.ts:7667-7669`, ~1/sec) is lower priority but should move into the same isolated component while you're in there.

### 1.2 Stabilize callback identity
`src/App.tsx:1070-1073` — `onSwipeLeft`, `onSwipeRight`, `onJump`, `onSlide` are recreated as new arrow functions every render, which defeats memoization on `GameHUD` even after adding `React.memo`. Wrap these in `useCallback` with stable deps (or store the engine ref call directly with no closure over changing state).

### 1.3 Merge the two independent timers
`src/App.tsx:496-508` runs a `setInterval` every 100ms to decay `activePowerUps`, while the RAF loop in `gameEngine.ts` already tracks overlapping power-up state. Consolidate into a single source of truth (preferably engine-owned, read by React only when needed) to remove a second independent re-render cadence.

### 1.4 Broader memoization pass
Zero `React.memo`, and no `useMemo`/`useCallback` usage was found in `src/protein/*` or `src/frontend/hud/*` (spot-checked `GameHUD.tsx`, `ConsumptionScreen.tsx`, `DashboardScreen.tsx`). After 1.1–1.3 land, do a follow-up pass:
- Memoize list-rendering components (leaderboard rows, mission lists, sticker grids).
- Hoist inline style objects (e.g. `GameHUD.tsx:65,173`) to module-level constants where they don't depend on props.

**Effort:** 2-3 days. **Risk:** medium (touches the game's hottest path — test thoroughly with `/verify` or manual play-testing after each change, not just type-checking).

---

## Phase 2 — Bundle size & code splitting

### 2.1 Route/screen-level splitting
`src/main.tsx` eagerly imports every top-level screen (`WelcomeScreen`, `ProfileSetupScreen`, `ModuleSelectScreen`, `ProteinTrackerScreen`, `QRManagementPage`, `LoadingScreen`, `OfflineScreen`) at module load. Convert these to `React.lazy` + `Suspense` boundaries so a user opening the QR-management admin panel doesn't download the game engine, and vice versa.

### 2.2 Dynamically import the game engine
`src/gameEngine.ts` is **11,223 lines** and pulls in all of `three`, yet is imported eagerly by `App.tsx` regardless of whether the user ever presses "play". This is the single biggest bundle-size win available:

```ts
// instead of a top-level import
const { SKMRunnerEngine } = await import('./gameEngine');
```

Trigger the dynamic import when `gameState` first transitions toward `PLAYING` (show `LoadingScreen` while it resolves — that component already exists).

### 2.3 Extend the existing lazy-load pattern
`src/auth/ProteinTrackerScreen.tsx:40` already does `import('html5-qrcode').catch(() => {})` — this is the right pattern, just applied to only one dependency. Extend the same approach to `@google/genai` (only needed if/when AI features are invoked) and confirm `three` isn't pulled in anywhere outside the lazy-loaded engine boundary.

### 2.4 Vite build config
Add `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split vendor chunks (`three`, `firebase`, `motion`) from app code, so browser caching survives app-code deploys without invalidating vendor chunks:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        three: ['three'],
        firebase: ['firebase/app', 'firebase/firestore', 'firebase/auth'],
        motion: ['motion'],
      },
    },
  },
},
```

### 2.5 Confirm no server-only deps leak into the client bundle
`firebase-admin`, `express`, `dotenv` sit in the same `dependencies` block as client code in root `package.json` (they belong to `functions`/`render-server`, which have their own `package.json`s). Verify none of these are accidentally reachable via a shared import path from `src/` — run `vite build` and grep the output bundle for `firebase-admin`/`express` string literals as a sanity check.

### 2.6 GLB asset compression
`public/models/Big Tree.glb` (3.3MB) is the only 3D asset and is already well-cached/deduped in the engine (`glbCache`/`glbPending` in `gameEngine.ts:5149-5180` — no changes needed there). For mobile/3G load times, consider Draco or meshopt compression via `gltf-transform` to shrink this file; not urgent, but cheap to do while touching this area.

**Effort:** 2-4 days depending on how cleanly `gameEngine.ts` separates from `App.tsx`. **Expected result:** initial JS payload drops from ~3.0MB to a fraction of that for non-game screens (QR admin, protein tracker).

---

## Phase 3 — Shared component extraction (duplicate UI code)

~2,000+ lines of copy-pasted markup were found across modals and buttons. Extract to `src/components/common/`:

| New shared component | Replaces duplicates in | Notes |
|---|---|---|
| `ModalOverlay.tsx` | `ProfileModal`, `SettingsModal`, `BagPanel`, `LeaderboardPanel`, `MilestoneRewardModal`, `StickerDetailModal` (6 files) | Backdrop blur + centering + z-index, currently copy-pasted with inconsistent opacity values (`0.75`, `0.82`, `0.85`, `0.90`) |
| `ModalHeader.tsx` | `ProfileModal`, `BagPanel`, `LeaderboardPanel`, `MissionsPanel`, `SkinShop` (5 files) | Title + optional icon/description + close (X) button; currently each file hand-rolls its own close-button SVG/`lucide-react` icon |
| `LoadingSpinner.tsx` | 11+ files (`WelcomeScreen`, `ProfileSetupScreen`, `ProfileModal`, `OtpScreen`, `ModuleSelectScreen`, `LoginScreen`, `OfflineScreen`, `SettingsModal` ×2, `QRActions`) | Props: `size`, `color`, `thickness`, `speed` — consolidates at least 4 visibly different inline implementations |
| `ActionBtn.tsx` (in `common/`) | `StickerDetailModal`, `QRActions`, `QRBulkControl`, `GoldenQRControl` (4 files, **same component name, different signatures** — a real footgun for future maintainers) | Unify to one prop contract: `variant`, `icon`, `label`, `onClick`, `loading`, `disabled`, `fullWidth`, `size` |
| `ConfirmDialog.tsx` | `QRActions`, `QRBulkControl` (`DeleteConfirmModal`), `ProfileModal` (`DELETE_CONFIRM` view) (3 files) | Props: `title`, `message`, `confirmLabel`/`cancelLabel`, `onConfirm`/`onCancel`, `variant` |
| `IconButton.tsx` | ~6 files with repeated `<Icon/> + label` button markup | Lower priority polish item |

**Suggested order:** `LoadingSpinner` → `ModalOverlay` → `ActionBtn` (highest-risk one, since the 4 existing versions have genuinely different prop shapes — needs a proper superset API) → `ModalHeader` → `ConfirmDialog` → `IconButton`.

### 3.1 Firebase service-layer duplication
14 service files (`leaderboardService`, `playerService`, `achievementService`, `missionService`, `settingsService`, `configService`, `qrService`, etc.) repeat the same try/catch + `getDoc`/`setDoc` boilerplate with per-file `console.error('[serviceName] x failed:', err)` logging. Extract shared helpers into `src/services/firebase/firestoreHelpers.ts`:

```ts
export async function safeGetDoc<T>(path: string): Promise<T | null>
export async function safeGetDocs<T>(path: string, constraints?: QueryConstraint[]): Promise<T[]>
export async function safeUpsert<T>(path: string, data: T, compareFn?: (existing: T, incoming: T) => boolean): Promise<void>
```

This is a moderate-risk refactor (touches every data-access path) — do it file-by-file with tests/manual verification per service, not as one giant sweep.

**Effort:** 3-5 days for the full component + service extraction, can be parallelized across files once the shared component APIs are agreed.

---

## Phase 4 — Firebase query correctness & efficiency

### 4.1 Fix O(n) leaderboard rank lookup (high impact)
`src/services/leaderboard/leaderboardService.ts:123-145` (`getPlayerRank`) runs:
```ts
getDocs(query(collection(db, 'leaderboard'), where('score', '>', playerRecord.score)))
```
then uses `snap.size` — this **downloads every document with a higher score** just to count them. This scales linearly (and expensively, in Firestore billing terms) with leaderboard depth. Replace with `getCountFromServer`, which is already imported and used elsewhere in this codebase (`qrManagementService.ts:16`):

```ts
const snap = await getCountFromServer(aboveQuery);
const rank = snap.data().count + 1;
```

### 4.2 Gate debug logging behind a flag
Several `console.log` calls sit in hot Firebase paths that fire on every snapshot event: `'[GLB] Loaded'`, `'[DEV CONFIG UPDATED]'`, `'[QR Dashboard] onSnapshot fired'` (`qrManagementService.ts:265`). Wrap these in a `if (import.meta.env.DEV)` guard or a dedicated debug logger so production doesn't pay the console overhead on every real-time update.

### 4.3 Confirm cleanup in `QRDashboard`
`subscribeDashboardStats` and the protein-scan-count listener in `qrManagementService.ts:153-159, 264-269` correctly return an `Unsubscribe`. All other `onSnapshot` call sites checked (`liveConfig.ts`, `App.tsx`, `notificationService.ts`) properly clean up in `useEffect` returns — but `src/components/qr-management/QRDashboard.tsx` (the consumer of `subscribeDashboardStats`) wasn't directly verified in this pass. Confirm it invokes the returned unsubscribe on unmount.

**Effort:** 1 day. **Risk:** low, isolated changes.

---

## Phase 5 — TypeScript strictness & "lint" (no ESLint currently exists)

Important clarification: **there is no ESLint config in this repo** (`.eslintrc*`, `eslint.config.js` all absent). The `"lint"` npm script is just `tsc --noEmit`. So "fixing lint errors" first requires deciding whether to:
- (a) add real ESLint (recommended), or
- (b) treat `tsc --noEmit` as the lint gate and tighten `tsconfig.json`.

Recommended: do both, in this order.

### 5.1 Add ESLint
Install `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` (standard Vite+React 19 setup) and add a flat `eslint.config.js`. Enable at minimum:
- `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` (there are existing `eslint-disable-next-line react-hooks/exhaustive-deps` comments in `App.tsx:485-486` suggesting the team already thinks in these terms — codifying it will catch the same class of bug automatically elsewhere).
- `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any` (start as `warn`, see 5.2).
- `no-console` as `warn` (surfaces the debug-logging cleanup from 4.2 automatically).

Run once, triage output, fix incrementally per-directory rather than in one massive commit.

### 5.2 Tighten `tsconfig.json`
Current config has no `strict` mode and no individual safety flags. Given the scale of `any` usage already present (see below), enable incrementally rather than flipping `strict: true` in one PR (it will likely produce hundreds of new errors in `gameEngine.ts`):

1. Start with `"noImplicitAny": true` — surfaces untyped parameters first.
2. Add `"strictNullChecks": true` next — highest-value flag for catching real bugs (undefined/null access).
3. Finish with full `"strict": true` once 1–2 are clean.

### 5.3 Reduce `any` usage in the hottest file
- **67** `: any` annotations and **120** `as any` casts across `src/**/*.ts(x)`, heavily clustered in `gameEngine.ts` (e.g. lines 7872-7875, 9967, 10082 — casting `.geometry`/`.material`/`.parameters` to bypass three.js's typing). This is the single most performance-critical file in the app; untyped access here is exactly where a typo turns into a runtime crash mid-gameplay instead of a compile error.
- Good news: **zero** `@ts-ignore`/`@ts-expect-error` suppressions exist — the codebase isn't hiding type errors, it's just not typing certain three.js interop points. Prioritize typing the `gameEngine.ts` three.js casts first (likely fixable with proper `THREE.Mesh`/`THREE.BufferGeometry` types instead of `any`), then sweep the rest opportunistically.

**Effort:** ESLint setup ~1 day; tsconfig tightening + any-reduction is an ongoing effort, budget 1-2 weeks spread across other work rather than a dedicated sprint.

---

## Suggested execution order & rough timeline

| Phase | Focus | Effort | Do before |
|---|---|---|---|
| 0 | Dead code/config cleanup | 0.5 day | Everything else |
| 1 | Fix 60fps render storm | 2-3 days | — (highest ROI, do first) |
| 2 | Code splitting / bundle size | 2-4 days | — |
| 3 | Shared component extraction | 3-5 days | Phase 0 (avoid touching soon-to-be-deleted files) |
| 4 | Firebase query fixes | 1 day | — (can run anytime, fully isolated) |
| 5 | ESLint + TS strictness | 1 day setup, ongoing after | Ideally after Phase 3 (fewer files to re-lint) |

**Total dedicated effort:** roughly 2-3 developer-weeks for Phases 0-4; Phase 5's strictness tightening is intentionally open-ended and best absorbed into regular feature work.

---

## Verification checklist per phase

- **Phase 1**: Manual play-test (not just `tsc`/build) — confirm HUD still updates correctly (distance, grains, stage transitions, corner-turn prompts) after moving state out of the render path. Use `/verify` or the `run` skill to launch and observe.
- **Phase 2**: Run `vite build`, inspect `dist/assets` chunk sizes before/after, confirm lazy screens still load (network tab shows separate chunk fetch on navigation).
- **Phase 3**: Visual diff each replaced modal/button against its original screenshot; confirm no behavior regression in delete-confirmation flows especially (destructive actions).
- **Phase 4**: Confirm leaderboard rank numbers match pre-change values for a few known accounts before/after switching to `getCountFromServer`.
- **Phase 5**: Run new ESLint config against full repo, confirm `tsc --noEmit` still passes after each incremental strictness flag.
