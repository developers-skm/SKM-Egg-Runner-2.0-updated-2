import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { validateAndUseQR } from '../services/qr/qrService';
import { EggIcon, GamepadIcon, TargetIcon, FlameIcon, TrendUpIcon, ZapIcon, AwardIcon, CheckIcon } from '../protein/Icons';

interface ModuleSelectScreenProps {
  onSelectGame:    () => void;
  onSelectTracker: () => void;
}

const LAST_MODULE_KEY  = 'skm_last_module';
const QR_ELEMENT_ID    = 'module-select-qr-reader';

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
            setScanSuccess(true);
            setScanMsg('QR Verified — Starting game…');
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

export default function ModuleSelectScreen({ onSelectGame, onSelectTracker }: ModuleSelectScreenProps) {
  const [visible,      setVisible]      = useState(false);
  const [pressing,     setPressing]     = useState<'game' | 'tracker' | null>(null);
  const [hovering,     setHovering]     = useState<'game' | 'tracker' | null>(null);
  const [showQRModal,  setShowQRModal]  = useState(false);

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
    </>
  );
}
