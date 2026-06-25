import { useState, useEffect, useRef, useCallback } from 'react';

const RED   = '#D71920';
const GREEN = '#22C55E';

const STATUS_MESSAGES = [
  'Trying to restore connection...',
  'Looking for a stable network...',
  'Checking connection status...',
  'Reconnecting SKM services...',
  'Getting things back on track...',
  'Searching for a stronger signal...',
  'Almost ready...',
  'Restoring your SKM experience...',
  'Preparing to reconnect...',
  'Waiting for internet access...',
  'Verifying network availability...',
  'Checking service health...',
  'Attempting to reconnect...',
  'Connection recovery in progress...',
  'We\'ll be back online shortly...'
];
function fmt12h(d: Date) {
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── SVGs ─────────────────────────────────────────────────────────────────────

function WifiOffIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
    </svg>
  );
}

function WifiOnIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function EngineerEgg({ success }: { success: boolean }) {
  return (
    <img
      src="/signal-lost.png"
      alt="SKM Offline"
      style={{
        width: 160, height: 160, objectFit: 'contain', display: 'block',
        filter: success ? 'grayscale(1) brightness(1.1)' : 'none',
        transition: 'filter 600ms ease',
      }}
    />
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      width: 16, height: 16, borderRadius: '50%',
      border: '2.5px solid rgba(255,255,255,0.35)',
      borderTopColor: '#fff',
      animation: 'skm-spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OfflineScreen() {
  const [msgIdx,       setMsgIdx]       = useState(0);
  const [retrying,     setRetrying]     = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [lastOnline,   setLastOnline]   = useState(() => fmt12h(new Date()));
  const [firebaseOk,   setFirebaseOk]   = useState<boolean | null>(null);
  const [successPulse, setSuccessPulse] = useState(false);
  const autoRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rotate status messages every 3 s
  useEffect(() => {
    msgRef.current = setInterval(() => setMsgIdx(i => (i + 1) % STATUS_MESSAGES.length), 3000);
    return () => { if (msgRef.current) clearInterval(msgRef.current); };
  }, []);

  // Check Firebase reachability (no auth, just a lightweight HEAD to Google)
  const checkFirebase = useCallback(async (): Promise<boolean> => {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 4000);
      const res  = await fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=ping', {
        method: 'HEAD', signal: ctrl.signal, mode: 'no-cors',
      });
      clearTimeout(tid);
      return res.type === 'opaque' || res.ok;
    } catch {
      return false;
    }
  }, []);

  const handleRestored = useCallback(() => {
    setSuccess(true);
    setSuccessPulse(true);
    if (autoRef.current)  clearInterval(autoRef.current);
    if (msgRef.current)   clearInterval(msgRef.current);
    setTimeout(() => window.location.reload(), 1400);
  }, []);

  const doCheck = useCallback(async () => {
    if (success) return;
    const online = navigator.onLine;
    if (online) {
      const fb = await checkFirebase();
      setFirebaseOk(fb);
      handleRestored();
    } else {
      setFirebaseOk(false);
    }
  }, [success, checkFirebase, handleRestored]);

  // Auto-retry every 5 s
  useEffect(() => {
    autoRef.current = setInterval(doCheck, 5000);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [doCheck]);

  // Record last-online time when component mounts
  useEffect(() => { setLastOnline(fmt12h(new Date())); }, []);

  const handleRetry = async () => {
    if (retrying || success) return;
    setRetrying(true);
    await doCheck();
    await new Promise(r => setTimeout(r, 600));
    setRetrying(false);
  };

  const internetStatus = success        ? 'Online'       : navigator.onLine ? 'Online' : 'Offline';
  const firebaseStatus = firebaseOk === null ? '—' : firebaseOk ? 'Available' : 'Unavailable';
  const internetColor  = internetStatus === 'Online'     ? GREEN : RED;
  const firebaseColor  = firebaseOk === true             ? GREEN : firebaseOk === false ? RED : '#999';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(170deg,#ffffff 0%,#fff4f4 55%,#ffffff 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      overflowY: 'auto', padding: '20px 0 80px',
    }}>

      {/* Top accent bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 4,
        background: success
          ? `linear-gradient(90deg,${GREEN},#16A34A)`
          : `linear-gradient(90deg,${RED},#B51218)`,
        transition: 'background 600ms ease',
        zIndex: 1,
      }} />

      {/* ── Mascot ── */}
      <div style={{
        marginBottom: 4,
        transform: successPulse ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 500ms cubic-bezier(0.34,1.56,0.64,1)',
        filter: `drop-shadow(0 10px 28px ${success ? 'rgba(34,197,94,0.22)' : 'rgba(215,25,32,0.18)'})`,
      }}>
        <EngineerEgg success={success} />
      </div>

      {/* ── Wi-Fi status badge ── */}
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: success
          ? `linear-gradient(135deg,${GREEN},#16A34A)`
          : `linear-gradient(135deg,${RED},#B51218)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
        boxShadow: `0 4px 18px ${success ? 'rgba(34,197,94,0.4)' : 'rgba(215,25,32,0.35)'}`,
        color: '#fff',
        transition: 'all 600ms ease',
        animation: !success ? 'skm-pulse 2s ease-in-out infinite' : 'none',
      }}>
        {success ? <WifiOnIcon /> : <WifiOffIcon />}
      </div>

      {/* ── Title ── */}
      <h1 style={{
        fontSize: 24, fontWeight: 900, margin: '0 0 6px', textAlign: 'center',
        color: success ? '#15803D' : '#1A1A1A',
        letterSpacing: '-0.5px',
        transition: 'color 400ms ease',
      }}>
        {success ? 'Connection Restored' : "You're Offline"}
      </h1>

      {/* ── Sub-title ── */}
      <p style={{
        fontSize: 15, fontWeight: 700, margin: '0 0 6px', textAlign: 'center',
        color: success ? GREEN : RED,
        transition: 'color 400ms ease',
      }}>
        {success ? '🎉 Welcome Back!' : ''}
      </p>

      {/* ── Rotating status message ── */}
      {!success && (
        <p style={{
          fontSize: 13, color: '#888', fontWeight: 500,
          margin: '0 0 6px', textAlign: 'center', minHeight: 20,
          padding: '0 32px',
          transition: 'opacity 300ms ease',
        }}>
          {STATUS_MESSAGES[msgIdx]}
        </p>
      )}

      {/* ── Fun tag ── */}
      {!success && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          margin: '8px 0 20px',
          padding: '7px 14px', borderRadius: 20,
          background: 'rgba(215,25,32,0.07)',
          border: '1px solid rgba(215,25,32,0.12)',
        }}>
          <span style={{ fontSize: 15 }}>🥚</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>
            Our egg is waiting for the internet to hatch.
          </span>
        </div>
      )}

      {/* ── Retry button ── */}
      {!success && (
        <button
          onClick={handleRetry}
          disabled={retrying}
          style={{
            width: 230, height: 52, borderRadius: 16, border: 'none',
            background: retrying ? '#ccc' : `linear-gradient(135deg,${RED},#B51218)`,
            color: '#fff', fontSize: 15, fontWeight: 800,
            cursor: retrying ? 'not-allowed' : 'pointer',
            boxShadow: retrying ? 'none' : `0 6px 22px rgba(215,25,32,0.38)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 12, transition: 'all 200ms ease',
          }}
        >
          {retrying ? <><Spinner /> Checking...</> : <><RetryIcon /> Retry Connection</>}
        </button>
      )}

      {/* ── Diagnostics card ── */}
      <div style={{
        width: 'min(320px, calc(100vw - 40px))',
        background: '#fff',
        borderRadius: 18,
        padding: '16px 20px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
        border: '1px solid rgba(0,0,0,0.06)',
        margin: success ? '16px 0 0' : '4px 0 0',
      }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase',
          letterSpacing: 1, margin: '0 0 12px' }}>
          Connection Diagnostics
        </p>

        {/* Internet */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: internetColor,
              boxShadow: `0 0 6px ${internetColor}` }} />
            <span style={{ fontSize: 13, color: '#444', fontWeight: 600 }}>Internet Status</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: internetColor }}>{internetStatus}</span>
        </div>

        {/* Firebase */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: firebaseColor,
              boxShadow: `0 0 6px ${firebaseColor}` }} />
            <span style={{ fontSize: 13, color: '#444', fontWeight: 600 }}>App Services</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: firebaseColor }}>{firebaseStatus}</span>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #F5F5F5', margin: '10px 0' }} />

        {/* Last connected */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>Last Connected</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>{lastOnline}</span>
        </div>

        {/* Auto-retry notice */}
        {!success && (
          <div style={{ marginTop: 12, padding: '7px 10px', borderRadius: 10,
            background: 'rgba(215,25,32,0.05)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: RED,
              flexShrink: 0, animation: 'skm-blink 1.2s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>
              Auto-checking every 5 seconds
            </span>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <p style={{
        position: 'fixed', bottom: 16,
        fontSize: 9, color: 'rgba(0,0,0,0.2)',
        letterSpacing: 2, textTransform: 'uppercase', margin: 0,
      }}>
        SKM © 2024 · All Rights Reserved
      </p>

      <style>{`
        @keyframes skm-spin  { to { transform: rotate(360deg); } }
        @keyframes skm-pulse { 0%,100% { box-shadow: 0 4px 18px rgba(215,25,32,0.35); }
                                50%    { box-shadow: 0 4px 28px rgba(215,25,32,0.6);  } }
        @keyframes skm-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}
