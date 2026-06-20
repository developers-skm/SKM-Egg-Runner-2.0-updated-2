import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import type { User } from 'firebase/auth';
import { validateAndUseQR } from '../services/qr/qrService';
import { logEggScan, PROTEIN_PER_EGG, COINS_PER_EGG, XP_PER_EGG } from '../services/protein/proteinTrackerService';
import { CameraIcon, EggIcon, ZapIcon, CheckCircleIcon, AlertIcon, CloseIcon } from './Icons';

type Phase = 'idle' | 'scanning' | 'success' | 'error';

interface QRScanScreenProps {
  user: User;
  onScanSuccess: () => void;
}

interface ScanResult {
  protein: number;
  xp: number;
  coins: number;
  streak: number;
}

export default function QRScanScreen({ user, onScanSuccess }: QRScanScreenProps) {
  const [phase,   setPhase]   = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [result,  setResult]  = useState<ScanResult | null>(null);
  const [dots,    setDots]    = useState(0);
  const scannerRef     = useRef<Html5Qrcode | null>(null);
  const processingRef  = useRef(false);

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        if (state === 2) await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch { /* ignore */ }
  }, []);

  const startScanner = useCallback(async () => {
    await stopScanner();
    processingRef.current = false;
    const el = document.getElementById('qr-reader');
    if (!el) return;
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setPhase('scanning');
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decoded) => {
          if (processingRef.current) return;
          processingRef.current = true;
          await handleScan(decoded);
        },
        () => {}
      );
    } catch {
      setMessage('Camera permission denied. Please allow camera access and try again.');
      setPhase('error');
    }
  }, [stopScanner]);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  // Animated dots for scanning state
  useEffect(() => {
    if (phase !== 'scanning') return;
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, [phase]);

  const handleScan = async (raw: string) => {
    try {
      await stopScanner();
      const qrResult = await validateAndUseQR(raw);
      if (!qrResult.ok) {
        setMessage('reason' in qrResult ? qrResult.message : 'Scan failed. Please try again.');
        setPhase('error');
        return;
      }
      const { streak: streakInfo, xpEarned, coinsEarned } = await logEggScan(user.uid, raw.trim().toUpperCase());
      setResult({ protein: PROTEIN_PER_EGG, xp: xpEarned, coins: coinsEarned, streak: streakInfo.currentStreak });
      setPhase('success');
      setTimeout(() => { onScanSuccess(); }, 3000);
    } catch {
      setMessage('Something went wrong. Please try again.');
      setPhase('error');
    }
  };

  const reset = async () => {
    await stopScanner();
    setPhase('idle');
    setMessage('');
    setResult(null);
    processingRef.current = false;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg,#D71920,#B31217)',
        padding: '20px 20px 20px', flexShrink: 0,
        boxShadow: '0 4px 20px rgba(215,25,32,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CameraIcon size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Scan SKM Egg QR</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>
              Each scan adds +{PROTEIN_PER_EGG}g protein, +{XP_PER_EGG} XP, +{COINS_PER_EGG} coins
            </p>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* IDLE */}
        {phase === 'idle' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#fff', borderRadius: 24, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: '#FCE8E8', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CameraIcon size={36} color="#D71920" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>Ready to Scan</h3>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 20px', lineHeight: 1.6 }}>
                Point your camera at an SKM Egg QR code to instantly log your protein intake.
              </p>

              {/* Benefits */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { icon: <EggIcon size={18} color="#D71920" />,     label: '+1 Egg logged',       bg: '#FCE8E8' },
                  { icon: <ZapIcon size={18} color="#F59E0B" />,     label: `+${XP_PER_EGG} XP earned`,      bg: '#FEF3C7' },
                  { icon: <CheckCircleIcon size={18} color="#22C55E" />, label: '+6g protein',     bg: '#F0FDF4' },
                  { icon: <ZapIcon size={18} color="#8B5CF6" />,     label: `+${COINS_PER_EGG} coins reward`, bg: '#F5F3FF' },
                ].map(b => (
                  <div key={b.label} style={{ background: b.bg, borderRadius: 14, padding: '12px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {b.icon}
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A' }}>{b.label}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={startScanner}
                style={{
                  width: '100%', padding: '15px 0', borderRadius: 18, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#D71920,#B31217)',
                  color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase',
                  boxShadow: '0 6px 20px rgba(215,25,32,0.4)',
                }}
              >
                Open Camera
              </button>
            </div>

            {/* How it works */}
            <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>How It Works</p>
              {[
                'Purchase an SKM Egg product',
                'Find the QR code on the packaging',
                'Tap "Open Camera" and scan the QR',
                'Protein and rewards are added instantly',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: i < 3 ? 10 : 0 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#D71920', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <p style={{ fontSize: 13, color: '#1A1A1A', margin: 0, paddingTop: 2, lineHeight: 1.4 }}>{step}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SCANNING */}
        {phase === 'scanning' && (
          <div style={{ padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
              {/* QR reader */}
              <div style={{ position: 'relative' }}>
                <div id="qr-reader" style={{ width: '100%' }} />
                {/* Corner overlays */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ position: 'relative', width: 200, height: 200 }}>
                    {[{top:0,left:0,bt:'t',bl:'l'},{top:0,right:0,bt:'t',bl:'r'},{bottom:0,left:0,bt:'b',bl:'l'},{bottom:0,right:0,bt:'b',bl:'r'}].map((c,i) => (
                      <div key={i} style={{
                        position: 'absolute', width: 22, height: 22,
                        ...(c.top !== undefined ? {top:0}:{}), ...(c.bottom !== undefined?{bottom:0}:{}),
                        ...(c.left !== undefined?{left:0}:{}), ...(c.right !== undefined?{right:0}:{}),
                        borderTop:    c.bt==='t' ? '3px solid #D71920' : 'none',
                        borderBottom: c.bt==='b' ? '3px solid #D71920' : 'none',
                        borderLeft:   c.bl==='l' ? '3px solid #D71920' : 'none',
                        borderRight:  c.bl==='r' ? '3px solid #D71920' : 'none',
                        borderTopLeftRadius:     i===0?6:0,
                        borderTopRightRadius:    i===1?6:0,
                        borderBottomLeftRadius:  i===2?6:0,
                        borderBottomRightRadius: i===3?6:0,
                      }} />
                    ))}
                    {/* Scan line */}
                    <div style={{
                      position: 'absolute', left: 0, right: 0, height: 2,
                      background: 'linear-gradient(90deg,transparent,#D71920,transparent)',
                      animation: 'scanline 2s ease-in-out infinite',
                    }} />
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', margin: '0 0 12px' }}>
                  Align QR code in the frame{'.'.repeat(dots)}
                </p>
                <button onClick={reset} style={{
                  width: '100%', padding: '12px 0', borderRadius: 14, border: '1.5px solid #E8E8E8',
                  background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {phase === 'success' && result && (
          <div style={{ padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 24, padding: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              {/* Success ring */}
              <div style={{
                width: 88, height: 88, borderRadius: '50%', margin: '0 auto 20px',
                background: 'linear-gradient(135deg,#D71920,#B31217)',
                boxShadow: '0 8px 28px rgba(215,25,32,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CheckCircleIcon size={44} color="#fff" />
              </div>

              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px' }}>Egg Logged!</h3>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 22px' }}>Excellent! Your protein intake has been recorded.</p>

              {/* Rewards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
                <RewardBox label="Protein Added" value={`+${result.protein}g`} color="#D71920" bg="#FCE8E8" />
                <RewardBox label="XP Earned"     value={`+${result.xp} XP`}   color="#F59E0B" bg="#FEF3C7" />
                <RewardBox label="Coins Earned"  value={`+${result.coins}`}   color="#8B5CF6" bg="#F5F3FF" />
                <RewardBox label="Current Streak" value={`${result.streak}d`}  color="#22C55E" bg="#F0FDF4" />
              </div>

              <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>Returning to dashboard in 3 seconds…</p>
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <div style={{ padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 24, padding: 28, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 18px',
                background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertIcon size={38} color="#D71920" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A', margin: '0 0 8px' }}>Scan Failed</h3>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 22px', lineHeight: 1.6 }}>{message}</p>
              <button onClick={reset} style={{
                width: '100%', padding: '14px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff',
                fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1,
                boxShadow: '0 6px 18px rgba(215,25,32,0.4)',
              }}>
                Try Again
              </button>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @keyframes scanline {
          0%   { top: 0%; }
          50%  { top: calc(100% - 2px); }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  );
}

function RewardBox({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: '14px 10px', textAlign: 'center' }}>
      <p style={{ fontSize: 20, fontWeight: 900, color, margin: 0, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 10, fontWeight: 700, color, opacity: 0.8, margin: 0, marginTop: 4 }}>{label}</p>
    </div>
  );
}
