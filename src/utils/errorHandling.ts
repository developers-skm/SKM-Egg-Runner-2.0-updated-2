/**
 * Structured logging for best-effort background operations (notifications,
 * ledger writes, calendar history) that must never block or fail the
 * user-facing result they're attached to, but also must never fail silently.
 */

export function logBackgroundFailure(context: string, err: unknown): void {
  const e = err as { code?: string; message?: string };
  console.error(`[BACKGROUND FAILURE] ${context}:`, {
    code: e?.code ?? 'unknown',
    message: e?.message ?? String(err),
  });
}
