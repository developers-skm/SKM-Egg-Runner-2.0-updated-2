import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { validateAndUseQR } from '../services/qr/qrService';
import { EggIcon, GamepadIcon, TargetIcon, FlameIcon, TrendUpIcon, ZapIcon, AwardIcon, CheckIcon } from '../protein/Icons';
import { SettingsModal } from '../frontend/modals/SettingsModal';

interface ModuleSelectScreenProps {
  onSelectGame:    () => void;
  onSelectTracker: () => void;
}

const LAST_MODULE_KEY  = 'skm_last_module';
const QR_ELEMENT_ID    = 'module-select-qr-reader';

// ─────────────────────────────────────────────────────────────
// System Update Gate — developer authentication modal
// Shown after 12 secret taps. Renders via portal over everything.
// ─────────────────────────────────────────────────────────────

const ENCODED_DEV_NAME = 'REVWRUxPUEVS'; // base64 → "DEVELOPER"
const ENCODED_DEV_PASS = 'bnBtIHJ1biBkZXY='; // base64 → "npm run dev"

function SystemUpdateGate({
  onAccessGranted,
  onCancel,
}: {
  onAccessGranted: () => void;
  onCancel: () => void;
}) {
  const [visible,   setVisible]   = useState(false);
  const [devId,     setDevId]     = useState('');
  const [devPass,   setDevPass]   = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const idRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    setTimeout(() => idRef.current?.focus(), 300);
    return () => cancelAnimationFrame(t);
  }, []);

  const closeWith = (cb?: () => void) => {
    setVisible(false);
    setTimeout(() => cb?.(), 250);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      try {
        const validId   = btoa(devId.trim())   === ENCODED_DEV_NAME;
        const validPass = btoa(devPass.trim())  === ENCODED_DEV_PASS;
        if (validId && validPass) {
          closeWith(onAccessGranted);
        } else {
          setError('Access Denied — Invalid credentials.');
          setDevPass('');
        }
      } catch {
        setError('Access Denied — Invalid credentials.');
      }
      setLoading(false);
    }, 400);
  };

  const overlay: React.CSSProperties = {
    opacity:    visible ? 1 : 0,
    transition: 'opacity 250ms ease',
  };
  const card: React.CSSProperties = {
    transform:  visible ? 'scale(1)' : 'scale(0.88)',
    opacity:    visible ? 1 : 0,
    transition: 'transform 250ms cubic-bezier(0.34,1.56,0.64,1), opacity 250ms ease',
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-auto" style={overlay}>
      {/* Blurred backdrop */}
      <div
        className="absolute inset-0"
        style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(0,0,0,0.65)' }}
        onClick={() => closeWith(onCancel)}
      />

      {/* Gate card */}
      <div
        className="relative z-10 w-full mx-5 rounded-3xl overflow-hidden shadow-2xl"
        style={{
          ...card,
          maxWidth: 360,
          background: 'linear-gradient(160deg,#1a0000 0%,#2d0000 40%,#1a0000 100%)',
          boxShadow: '0 0 0 1.5px rgba(215,25,32,0.5), 0 32px 80px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Glassmorphism highlight */}
        <div className="absolute inset-0 pointer-events-none rounded-3xl"
          style={{ background: 'linear-gradient(135deg,rgba(215,25,32,0.18) 0%,rgba(255,255,255,0.03) 55%,transparent 100%)' }}
        />

        <div className="relative p-6">
          {/* Header */}
          <div className="text-center mb-6">
            {/* Shield icon */}
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'rgba(215,25,32,0.2)', border: '1.5px solid rgba(215,25,32,0.4)' }}>
              <svg className="w-8 h-8" fill="none" stroke="#D71920" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
              </svg>
            </div>
            <p className="text-[10px] font-black tracking-[0.3em] uppercase font-mono mb-1"
              style={{ color: 'rgba(215,25,32,0.8)' }}>
              RESTRICTED ACCESS
            </p>
            <h2 className="text-xl font-black text-white tracking-tight">SYSTEM UPDATE GATE</h2>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Authorized Developer Access Required
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Developer ID */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
                style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                Developer ID
              </label>
              <input
                ref={idRef}
                type="text"
                value={devId}
                onChange={e => { setDevId(e.target.value); setError(''); }}
                placeholder="Enter Developer ID"
                autoComplete="off"
                className="w-full px-4 py-3 rounded-xl font-mono text-sm focus:outline-none transition"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1.5px solid rgba(255,255,255,0.12)',
                  color: 'white',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(215,25,32,0.7)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
                style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                Password
              </label>
              <input
                type="password"
                value={devPass}
                onChange={e => { setDevPass(e.target.value); setError(''); }}
                placeholder="Enter Password"
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl font-mono text-sm focus:outline-none transition"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1.5px solid rgba(255,255,255,0.12)',
                  color: 'white',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(215,25,32,0.7)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-2.5 text-center"
                style={{ background: 'rgba(215,25,32,0.15)', border: '1px solid rgba(215,25,32,0.3)' }}>
                <p className="text-xs font-bold font-mono" style={{ color: '#ff6b6b' }}>{error}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => closeWith(onCancel)}
                className="flex-1 py-3 rounded-2xl font-bold text-sm uppercase tracking-wide transition active:scale-95 cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !devId.trim() || !devPass.trim()}
                className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-wide transition active:scale-95 disabled:opacity-50 cursor-pointer"
                style={{ background: 'linear-gradient(135deg,#D71920,#8B0000)', color: 'white', boxShadow: '0 4px 16px rgba(215,25,32,0.4)' }}
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                ) : 'Access Controller'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────
// QR Access Modal
// ─────────────────────────────────────────────────────────────

function QRAccessModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel:  () => void;
}) {
  const [visible,     setVisible]     = useState(false);
  const [scanMsg,     setScanMsg]     = useState('');
  const [scanError,   setScanError]   = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState(false);
  const scannerRef  = useRef<Html5Qrcode | null>(null);
  const scanningRef = useRef(false);
  const handledRef  = useRef(false);

  // Fade + scale in, then immediately start scanner
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    if (visible) startScanner();
  }, [visible]);

  // Always clean up on unmount
  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  const stopScanner = async () => {
    if (scannerRef.current && scanningRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (_) {}
      scanningRef.current = false;
    }
  };

  const startScanner = async () => {
    handledRef.current = false;
    setScanError(null);
    setScanSuccess(false);
    setScanMsg('Initializing camera…');

    // Small delay so the DOM element is painted before html5-qrcode targets it
    await new Promise(r => setTimeout(r, 150));

    const el = document.getElementById(QR_ELEMENT_ID);
    if (!el) {
      setScanError('Camera view unavailable. Please try again.');
      return;
    }

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(QR_ELEMENT_ID);
      }
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decoded) => {
          if (handledRef.current) return;
          handledRef.current = true;
          await stopScanner();
          setScanMsg('Validating…');
          const result = await validateAndUseQR(decoded);
          if (result.ok === true) {
            // Persist Golden QR status so App.tsx can enable unlimited retry
            if (result.unlimited) {
              sessionStorage.setItem('skm_golden_qr', 'true');
              console.log('[QR] Golden QR detected — unlimited retry enabled');
            } else {
              sessionStorage.removeItem('skm_golden_qr');
              console.log('[QR] Normal QR detected — remaining:', result.remaining);
            }
            setScanSuccess(true);
            setScanMsg(result.unlimited ? 'Golden QR Verified — Unlimited Access!' : 'QR Verified — Starting game…');
            setScanError(null);
            closeWith(onConfirm);
          } else {
            handledRef.current = false;
            setScanError(result.message);
            setScanMsg('');
            setScanSuccess(false);
          }
        },
        () => {}
      );
      scanningRef.current = true;
      setScanMsg('Align QR code within the frame');
    } catch (err: any) {
      setScanError(
        err?.message?.includes('permission')
          ? 'Camera permission denied. Please allow camera access.'
          : 'Camera unavailable. Check device settings.'
      );
    }
  };

  const closeWith = (cb?: () => void) => {
    setVisible(false);
    setTimeout(() => {
      stopScanner();
      cb ? cb() : onCancel();
    }, 250);
  };

  const overlayStyle: React.CSSProperties = {
    opacity:    visible ? 1 : 0,
    transition: 'opacity 250ms ease',
  };

  const cardStyle: React.CSSProperties = {
    transform:  visible ? 'scale(1)' : 'scale(0.88)',
    opacity:    visible ? 1 : 0,
    transition: 'transform 250ms cubic-bezier(0.34,1.56,0.64,1), opacity 250ms ease',
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto"
      style={overlayStyle}
    >
      {/* Blurred backdrop */}
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          background: 'rgba(0,0,0,0.55)',
        }}
        onClick={() => closeWith()}
      />

      {/* Modal card — SKM Red + White */}
      <div
        className="relative z-10 w-full mx-4 rounded-3xl overflow-hidden shadow-2xl"
        style={{
          ...cardStyle,
          maxWidth: 360,
          background: 'linear-gradient(160deg,#D71920 0%,#A50F15 100%)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 32px 64px rgba(0,0,0,0.65)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Glassmorphism highlight */}
        <div
          className="absolute inset-0 pointer-events-none rounded-3xl"
          style={{
            background: 'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0.04) 55%,transparent 100%)',
          }}
        />

        <div className="relative p-5 flex flex-col gap-4">

          {/* Header row */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black tracking-widest text-white/60 uppercase font-mono leading-none">
                GAME ACCESS
              </p>
              <h2 className="text-lg font-black text-white tracking-tight leading-tight mt-1">
                Scan QR Code
              </h2>
              <p className="text-xs text-white/60 font-medium mt-0.5">
                Choose how you want to continue
              </p>
            </div>
            {/* X close */}
            <button
              onClick={() => closeWith()}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer flex-shrink-0 ml-2"
              style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.2)' }}
              aria-label="Cancel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Camera viewport */}
          <div
            className="relative w-full rounded-2xl overflow-hidden"
            style={{
              aspectRatio: '1 / 1',
              maxHeight: '58vw',
              background: 'rgba(0,0,0,0.55)',
            }}
          >
            <div id={QR_ELEMENT_ID} className="w-full h-full" />

            {/* Corner frame */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-44 h-44">
                {(['tl','tr','bl','br'] as const).map(c => (
                  <div
                    key={c}
                    className="absolute w-8 h-8"
                    style={{
                      borderColor: '#ffffff',
                      ...(c === 'tl' ? { top: 0, left: 0,  borderTopWidth: 3, borderLeftWidth: 3,  borderRadius: '6px 0 0 0' } : {}),
                      ...(c === 'tr' ? { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderRadius: '0 6px 0 0' } : {}),
                      ...(c === 'bl' ? { bottom: 0, left: 0,  borderBottomWidth: 3, borderLeftWidth: 3,  borderRadius: '0 0 0 6px' } : {}),
                      ...(c === 'br' ? { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderRadius: '0 0 6px 0' } : {}),
                    }}
                  />
                ))}
                {/* Animated scan line */}
                <div
                  className="absolute left-0 right-0 h-0.5"
                  style={{
                    background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.85),transparent)',
                    animation: 'qrScanLine 2s ease-in-out infinite',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Status text */}
          <div className="min-h-[18px] text-center">
            {scanError ? (
              <p className="text-red-200 text-xs font-semibold font-mono">{scanError}</p>
            ) : scanSuccess ? (
              <p className="text-emerald-300 text-xs font-bold font-mono">{scanMsg}</p>
            ) : (
              <p className="text-white/65 text-xs font-semibold font-mono">{scanMsg}</p>
            )}
          </div>

          {/* Cancel button */}
          <button
            onClick={() => closeWith()}
            className="w-full font-black py-3.5 rounded-2xl text-sm uppercase tracking-wider transition-all duration-150 active:scale-95 cursor-pointer"
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
          >
            Cancel
          </button>

        </div>
      </div>

      <style>{`
        @keyframes qrScanLine {
          0%   { top: 0%; }
          50%  { top: calc(100% - 2px); }
          100% { top: 0%; }
        }
      `}</style>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────
// Module Select Screen
// ─────────────────────────────────────────────────────────────

const TAP_REQUIRED  = 12;
const TAP_INTERVAL  = 1500; // ms max between taps

export default function ModuleSelectScreen({ onSelectGame, onSelectTracker }: ModuleSelectScreenProps) {
  const [visible,        setVisible]        = useState(false);
  const [pressing,       setPressing]       = useState<'game' | 'tracker' | null>(null);
  const [hovering,       setHovering]       = useState<'game' | 'tracker' | null>(null);
  const [showQRModal,    setShowQRModal]    = useState(false);
  const [showGate,       setShowGate]       = useState(false);
  const [showDevPanel,   setShowDevPanel]   = useState(false);

  // 12-tap secret counter
  const tapCountRef  = useRef(0);
  const tapTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSecretTap = () => {
    tapCountRef.current += 1;

    // Reset the inactivity timer on each tap
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, TAP_INTERVAL);

    if (tapCountRef.current >= TAP_REQUIRED) {
      tapCountRef.current = 0;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      setShowGate(true);
    }
  };

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleSelectTracker = () => {
    localStorage.setItem(LAST_MODULE_KEY, 'tracker');
    setVisible(false);
    setTimeout(() => onSelectTracker(), 280);
  };

  // Game card tap → open QR modal immediately (no intermediate screen)
  const handleSelectGame = () => {
    localStorage.setItem(LAST_MODULE_KEY, 'game');
    setShowQRModal(true);
  };

  // QR validated → fade out → enter game
  const handleQRConfirm = () => {
    setShowQRModal(false);
    setVisible(false);
    setTimeout(() => onSelectGame(), 280);
  };

  // QR cancelled → just close the modal, stay on module select
  const handleQRCancel = () => {
    setShowQRModal(false);
  };

  const cardScale = (card: 'game' | 'tracker') =>
    pressing === card ? 'scale(0.98)' : hovering === card ? 'scale(1.02)' : 'scale(1)';

  return (
    <>
      <div
        className="fixed inset-0 flex flex-col"
        style={{ background: '#F5F5F5', opacity: visible ? 1 : 0, transition: 'opacity 280ms ease' }}
        onClick={handleSecretTap}
      >
        {/* Top red accent bar */}
        <div style={{ height: 4, background: 'linear-gradient(90deg,#D71920,#B31217,#D71920)' }} />

        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-10 pb-6 text-center">
          <img
            src="/THUMBS_POSE__Egg_-removebg-preview.png"
            alt="SKM"
            style={{ width: 72, height: 72, objectFit: 'contain', margin: '0 auto 16px', filter: 'drop-shadow(0 4px 12px rgba(215,25,32,0.25))' }}
          />
          <h1 style={{ fontFamily: '"Arial Black", Impact, sans-serif', fontSize: 28, fontWeight: 900, color: '#1A1A1A', letterSpacing: '-0.5px', margin: 0 }}>
            SKM <span style={{ color: '#D71920' }}>EXPERIENCE</span>
          </h1>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#666', letterSpacing: 3, textTransform: 'uppercase', marginTop: 6 }}>
            Choose Your Mode
          </p>
        </div>

        {/* Cards */}
        <div
          className="flex-1 overflow-y-auto px-4 pb-8"
          style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480, width: '100%', margin: '0 auto' }}
        >

          {/* ── Protein Tracker Card ── */}
          <button
            onClick={handleSelectTracker}
            onPointerDown={() => setPressing('tracker')}
            onPointerUp={() => setPressing(null)}
            onPointerLeave={() => { setPressing(null); setHovering(null); }}
            onMouseEnter={() => setHovering('tracker')}
            onMouseLeave={() => setHovering(null)}
            style={{
              background: 'linear-gradient(145deg,#D71920 0%,#B31217 100%)',
              borderRadius: 24, padding: 0, border: 'none', cursor: 'pointer',
              transform: cardScale('tracker'),
              transition: 'transform 200ms ease, box-shadow 200ms ease',
              boxShadow: hovering === 'tracker' ? '0 16px 40px rgba(215,25,32,0.45)' : '0 8px 24px rgba(215,25,32,0.3)',
              overflow: 'hidden', textAlign: 'left', position: 'relative',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, borderRadius: 24, pointerEvents: 'none', background: 'linear-gradient(135deg,rgba(255,255,255,0.18) 0%,rgba(255,255,255,0.04) 60%,transparent 100%)' }} />
            <div style={{ padding: '24px 24px 20px', position: 'relative' }}>
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: 20 }}>
                  Module 01
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <EggIcon size={26} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: 0, fontFamily: '"Arial Black", Impact, sans-serif', letterSpacing: '-0.3px' }}>Protein Tracker</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, marginTop: 2, fontWeight: 500 }}>Build healthy protein habits</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                {[
                  { icon: <TargetIcon size={10} color="#fff" />, label: 'Daily Goals'  },
                  { icon: <FlameIcon  size={10} color="#fff" />, label: 'Streaks'      },
                  { icon: <TrendUpIcon size={10} color="#fff" />,label: 'Analytics'    },
                  { icon: <AwardIcon  size={10} color="#fff" />, label: 'Rewards'      },
                ].map(c => (
                  <span key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.15)', padding: '5px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)' }}>
                    {c.icon} {c.label}
                  </span>
                ))}
              </div>
              <div style={{ background: '#fff', borderRadius: 14, padding: '12px 0', textAlign: 'center', fontWeight: 900, fontSize: 13, color: '#D71920', letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                Open Protein Tracker
              </div>
            </div>
          </button>

          {/* ── Game Card ── */}
          <button
            onClick={handleSelectGame}
            onPointerDown={() => setPressing('game')}
            onPointerUp={() => setPressing(null)}
            onPointerLeave={() => { setPressing(null); setHovering(null); }}
            onMouseEnter={() => setHovering('game')}
            onMouseLeave={() => setHovering(null)}
            style={{
              background: 'linear-gradient(145deg,#1A1A1A 0%,#2D2D2D 100%)',
              borderRadius: 24, padding: 0, border: 'none', cursor: 'pointer',
              transform: cardScale('game'),
              transition: 'transform 200ms ease, box-shadow 200ms ease',
              boxShadow: hovering === 'game' ? '0 16px 40px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.25)',
              overflow: 'hidden', textAlign: 'left', position: 'relative',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, borderRadius: 24, pointerEvents: 'none', background: 'linear-gradient(135deg,rgba(215,25,32,0.25) 0%,rgba(215,25,32,0.05) 50%,transparent 100%)' }} />
            <div style={{ padding: '24px 24px 20px', position: 'relative' }}>
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: 20 }}>
                  Module 02
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(215,25,32,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <GamepadIcon size={26} color="#D71920" />
                </div>
                <div>
                  <p style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: 0, fontFamily: '"Arial Black", Impact, sans-serif', letterSpacing: '-0.3px' }}>SKM Egg Runner</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, marginTop: 2, fontWeight: 500 }}>Evolve from Egg to Champion</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                {[
                  { icon: <ZapIcon     size={10} color="rgba(255,255,255,0.6)" />, label: 'QR Verified'     },
                  { icon: <TrendUpIcon size={10} color="rgba(255,255,255,0.6)" />, label: 'Evolution System' },
                  { icon: <AwardIcon   size={10} color="rgba(255,255,255,0.6)" />, label: 'Achievements'    },
                  { icon: <CheckIcon   size={10} color="rgba(255,255,255,0.6)" />, label: 'Missions'        },
                ].map(c => (
                  <span key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.07)', padding: '5px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                    {c.icon} {c.label}
                  </span>
                ))}
              </div>
              <div style={{ background: 'linear-gradient(90deg,#D71920,#B31217)', borderRadius: 14, padding: '12px 0', textAlign: 'center', fontWeight: 900, fontSize: 13, color: '#fff', letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 4px 12px rgba(215,25,32,0.4)' }}>
                Play SKM Egg Runner
              </div>
            </div>
          </button>

        </div>

        <p style={{ textAlign: 'center', fontSize: 10, color: '#bbb', paddingBottom: 24, fontFamily: 'monospace', letterSpacing: 1 }}>
          SKM EGG RUNNER · ALL RIGHTS RESERVED
        </p>
      </div>

      {/* QR modal mounts over everything via portal */}
      {showQRModal && (
        <QRAccessModal
          onConfirm={handleQRConfirm}
          onCancel={handleQRCancel}
        />
      )}

      {/* System Update Gate — shown after 12 secret taps */}
      {showGate && !showDevPanel && (
        <SystemUpdateGate
          onAccessGranted={() => {
            setShowGate(false);
            setShowDevPanel(true);
          }}
          onCancel={() => setShowGate(false)}
        />
      )}

      {/* Developer Controller — full SettingsModal in DEV_PANEL mode */}
      {showDevPanel && (
        <SettingsModal
          isOpen={true}
          onClose={() => setShowDevPanel(false)}
          soundEnabled={true}
          musicEnabled={true}
          onToggleSound={() => {}}
          onToggleMusic={() => {}}
          onStartGame={() => {}}
          initialView="DEV_PANEL"
        />
      )}
    </>
  );
}
