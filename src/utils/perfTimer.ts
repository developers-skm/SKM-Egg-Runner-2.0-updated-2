/**
 * Dev-only perf timers. Unlike console.time/console.timeEnd, re-starting an
 * already-running label just resets it instead of logging a console warning —
 * needed because React 19 dev-mode double-invokes effects (mount → cleanup →
 * remount), which would otherwise start/end each label twice.
 */
const starts = new Map<string, number>();

// Default threshold (ms) above which endTimer() flags an operation as slow.
// Callers can override per-label via endTimer(label, thresholdMs).
const DEFAULT_SLOW_THRESHOLD_MS = 2000;

export type SlowOpListener = (label: string, ms: number, thresholdMs: number) => void;
const slowOpListeners: SlowOpListener[] = [];

/** Subscribe to "operation exceeded its threshold" events — used by the dev health panel to surface bottlenecks live. */
export function onSlowOperation(listener: SlowOpListener): () => void {
  slowOpListeners.push(listener);
  return () => {
    const i = slowOpListeners.indexOf(listener);
    if (i !== -1) slowOpListeners.splice(i, 1);
  };
}

export function startTimer(label: string): void {
  starts.set(label, performance.now());
}

/** Ends the timer, logs the duration, and flags it (console.warn + onSlowOperation listeners) if it exceeded thresholdMs. */
export function endTimer(label: string, thresholdMs: number = DEFAULT_SLOW_THRESHOLD_MS): number {
  const start = starts.get(label);
  if (start === undefined) return -1;
  starts.delete(label);
  const ms = performance.now() - start;
  console.log(`${label}: ${ms.toFixed(1)}ms`);
  if (ms > thresholdMs) {
    console.warn(`[perf] SLOW: ${label} took ${ms.toFixed(0)}ms (threshold ${thresholdMs}ms)`);
    slowOpListeners.forEach(l => l(label, ms, thresholdMs));
  }
  return ms;
}
