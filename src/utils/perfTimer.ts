/**
 * Dev-only perf timers. Unlike console.time/console.timeEnd, re-starting an
 * already-running label just resets it instead of logging a console warning —
 * needed because React 19 dev-mode double-invokes effects (mount → cleanup →
 * remount), which would otherwise start/end each label twice.
 */
const starts = new Map<string, number>();

export function startTimer(label: string): void {
  starts.set(label, performance.now());
}

export function endTimer(label: string): void {
  const start = starts.get(label);
  if (start === undefined) return;
  starts.delete(label);
  console.log(`${label}: ${(performance.now() - start).toFixed(1)}ms`);
}
