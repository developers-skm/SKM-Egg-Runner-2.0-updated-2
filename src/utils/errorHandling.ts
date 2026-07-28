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

// ─────────────────────────────────────────────────────────────
// Error categorization — used by the global ErrorBoundary and by
// call sites that want a user-friendly message for a caught error.
// ─────────────────────────────────────────────────────────────

export type ErrorCategory = 'network' | 'firebase' | 'auth' | 'qr' | 'reward' | 'game' | 'unknown';

const FRIENDLY_MESSAGE: Record<ErrorCategory, string> = {
  network:  "Connection trouble. Check your internet and try again.",
  firebase: "We're having trouble reaching the server. Please try again in a moment.",
  auth:     "Your session needs attention. Try signing in again.",
  qr:       "This QR code couldn't be validated. Please rescan or try a different code.",
  reward:   "We couldn't process that reward right now. Please try again.",
  game:     "The game ran into a problem. Returning you to the menu.",
  unknown:  "Something went wrong. Please try again.",
};

/** Best-effort classification of a caught error/rejection into a fixed category, for logging and user messaging. */
export function categorizeError(err: unknown): ErrorCategory {
  const e = err as { code?: string; message?: string; name?: string } | undefined;
  const code = (e?.code ?? '').toLowerCase();
  const message = (e?.message ?? String(err ?? '')).toLowerCase();
  const name = (e?.name ?? '').toLowerCase();

  if (!navigator.onLine || code.includes('unavailable') || code === 'network-request-failed'
      || message.includes('network') || message.includes('fetch failed') || name === 'networkerror') {
    return 'network';
  }
  if (code.startsWith('auth/') || message.includes('auth/') || message.includes('unauthenticated')
      || message.includes('permission-denied') || code === 'permission-denied') {
    return 'auth';
  }
  if (code.startsWith('firestore/') || code.includes('firestore') || message.includes('firestore')
      || message.includes('cloud firestore')) {
    return 'firebase';
  }
  if (message.includes('qr') || message.includes('scan')) {
    return 'qr';
  }
  if (message.includes('reward') || message.includes('coupon') || message.includes('redeem') || message.includes('points')) {
    return 'reward';
  }
  if (message.includes('gamestats') || message.includes('game engine') || message.includes('webgl')) {
    return 'game';
  }
  return 'unknown';
}

/** User-friendly copy for a given category — never exposes raw error internals to the user. */
export function friendlyErrorMessage(category: ErrorCategory): string {
  return FRIENDLY_MESSAGE[category];
}

/** One-call convenience: classify + log with full developer detail + return the user-facing message. */
export function reportError(context: string, err: unknown): { category: ErrorCategory; message: string } {
  const category = categorizeError(err);
  const e = err as { code?: string; message?: string; stack?: string };
  console.error(`[${category.toUpperCase()}] ${context}:`, {
    code: e?.code ?? 'unknown',
    message: e?.message ?? String(err),
    stack: e?.stack,
  });
  return { category, message: friendlyErrorMessage(category) };
}
