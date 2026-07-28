import { Component, type ErrorInfo, type ReactNode } from 'react';
import { categorizeError, friendlyErrorMessage } from '../utils/errorHandling';

const RED = '#D71920';

interface Props {
  children: ReactNode;
  /** Label used in the console log so it's clear which boundary caught the error (e.g. "Game", "ProteinTracker"). */
  boundaryName: string;
  /** Called after a caught error, before the fallback renders — used to write an audit-log entry. */
  onError?: (error: unknown, category: string) => void;
}

interface State {
  error: unknown | null;
}

/**
 * Catches render/lifecycle errors in its subtree so a single broken screen
 * never blanks the whole app. Does NOT catch errors in event handlers or
 * async code (React boundaries can't) — those are handled by the global
 * window.onerror/unhandledrejection listeners installed in main.tsx instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const category = categorizeError(error);
    const e = error as { message?: string; stack?: string };
    console.error(`[ErrorBoundary:${this.props.boundaryName}] [${category.toUpperCase()}]`, {
      message: e?.message ?? String(error),
      stack: e?.stack,
      componentStack: info.componentStack,
    });
    this.props.onError?.(error, category);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const category = categorizeError(this.state.error);
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#FFFFFF', padding: 24, textAlign: 'center',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20, marginBottom: 20,
            background: 'rgba(215,25,32,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.02L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A', margin: '0 0 8px' }}>
            {friendlyErrorMessage(category)}
          </p>
          <p style={{ fontSize: 12, color: '#999', margin: '0 0 24px', maxWidth: 320 }}>
            The problem has been logged. Reloading usually fixes it.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '12px 28px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${RED}, #B31217)`, color: '#fff',
              fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
