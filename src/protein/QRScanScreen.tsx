import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import type { User } from 'firebase/auth';
import { validateAndUseQR } from '../services/qr/qrService';
import {
  logEggScan, getRecentEntries, getTodayStats, getTrackerSettings,
  PROTEIN_PER_EGG, COINS_PER_EGG, XP_PER_EGG,
  type ProteinLogEntry, type DailyStats, type TrackerSettings,
} from '../services/protein/proteinTrackerService';
import { CameraIcon, EggIcon, ZapIcon, CheckCircleIcon, AlertIcon } from './Icons';

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
  todayEggs: number;
  todayProtein: number;
  goal: number;
}

export default function QRScanScreen({ user, onScanSuccess }: QRScanScreenProps) {
  const [phase,       setPhase]       = useState<Phase>('idle');
  const [message,     setMessage]     = useState('');
  const [result,      setResult]      = useState<ScanResult | null>(null);
  const [dots,        setDots]        = useState(0);
  const [scanHistory, setScanHistory] = useState<ProteinLogEntry[]>([]);
  const [todayStats,  setTodayStats]  = useState<DailyStats | null>(null);
  const [settings,    setSettings]    = useState<TrackerSettings | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scannerRef    = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [entries, ts, stg] = await Promise.all([
        getRecentEntries(user.uid, 20),
        getTodayStats(user.uid),
        getTrackerSettings(user.uid),
      ]);
      // Filter to today's egg scans only
      const today = new Date().toISOString().slice(0, 10);
      setScanHistory(entries.filter(e => e.type === 'qr_scan' && e.dateKey === today));
      setTodayStats(ts);
      setSettings(stg);
    } catch { /* ignore */ }
    finally { setLoadingHistory(false); }
  }, [user.uid]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

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

  useEffect(() => { return () => { stopScanner(); }; }, [stopScanner]);

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
      // Reload stats to get updated values
      const [ts, stg] = await Promise.all([getTodayStats(user.uid), getTrackerSettings(user.uid)]);
      setResult({
        protein: PROTEIN_PER_EGG,
        xp: xpEarned,
        coins: coinsEarned,
        streak: streakInfo.currentStreak,
        todayEggs: ts?.totalEggs ?? 0,
        todayProtein: ts?.totalProtein ?? 0,
        goal: stg.dailyGoal,
      });
      setPhase('success');
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
    await loadHistory();
  };

  const handleScanAnother = async () => {
    await stopScanner();
    setPhase('idle');
    setMessage('');
    setResult(null);
    processingRef.current = false;
    await loadHistory();
    // Small delay then reopen camera
    setTimeout(() => startScanner(), 300);
  };

  const handleDone = () => {
    onScanSuccess();
  };

  const goal = settings?.dailyGoal ?? 60;
  const consumed = todayStats?.totalProtein ?? 0;
  const eggs = todayStats?.totalEggs ?? 0;
  const pct = Math.min(100, Math.round((consumed / goal) * 100));
  const eggsToGoal = Math.max(0, Math.ceil((goal - consumed) / PROTEIN_PER_EGG));
  const remaining = Math.max(0, goal - consumed);

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
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0 }}>Scan SKM Egg QR</h2>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 2 }}>
              Each scan: +{PROTEIN_PER_EGG}g protein  +{XP_PER_EGG} XP  +{COINS_PER_EGG} coins
            </p>
          </div>
        </div>

        {/* Today's progress bar in header */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
              Today: {eggs} egg{eggs !== 1 ? 's' : ''} scanned
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
              {consumed}g / {goal}g
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: pct >= 100 ? '#22C55E' : 'rgba(255,255,255,0.9)',
              borderRadius: 3, transition: 'width 600ms ease',
            }} />
          </div>
          {eggsToGoal > 0 && (
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0', fontWeight: 600 }}>
              {eggsToGoal} more egg{eggsToGoal !== 1 ? 's' : ''} ({remaining}g) to reach today's goal
            </p>
          )}
          {pct >= 100 && (
            <p style={{ fontSize: 10, color: '#86efac', margin: '4px 0 0', fontWeight: 700 }}>
              Goal reached! Keep going for bonus XP.
            </p>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>

        {/* IDLE */}
        {phase === 'idle' && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Main scan card */}
            <div style={{ background: '#fff', borderRadius: 24, padding: 22, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <div style={{ width: 76, height: 76, borderRadius: 22, background: '#FCE8E8', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CameraIcon size={34} color="#D71920" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>Ready to Scan</h3>
              <p style={{ fontSize: 12, color: '#666', margin: '0 0 18px', lineHeight: 1.6 }}>
                Point your camera at the QR code on any SKM Egg package to instantly log protein and earn rewards.
              </p>

              {/* Reward chips */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                {[
                  { label: '+1 Egg logged',        bg: '#FCE8E8', color: '#D71920' },
                  { label: `+${XP_PER_EGG} XP earned`,      bg: '#FEF3C7', color: '#D97706' },
                  { label: `+${PROTEIN_PER_EGG}g protein`,         bg: '#F0FDF4', color: '#16A34A' },
                  { label: `+${COINS_PER_EGG} coins`,              bg: '#F5F3FF', color: '#7C3AED' },
                ].map(b => (
                  <div key={b.label} style={{ background: b.bg, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: b.color }}>{b.label}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={startScanner}
                style={{
                  width: '100%', padding: '15px 0', borderRadius: 18, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#D71920,#B31217)',
                  color: '#fff', fontWeight: 900, fontSize: 15, letterSpacing: 1, textTransform: 'uppercase',
                  boxShadow: '0 6px 20px rgba(215,25,32,0.4)',
                }}
              >
                Open Camera
              </button>
            </div>

            {/* Today's scan history */}
            {!loadingHistory && (
              <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Today's Scans</p>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#D71920' }}>
                    {scanHistory.length} egg{scanHistory.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {scanHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: '#F5F5F5', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <EggIcon size={22} color="#ccc" />
                    </div>
                    <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>No eggs scanned yet today.</p>
                    <p style={{ fontSize: 11, color: '#D71920', margin: '4px 0 0', fontWeight: 700 }}>
                      Scan your first egg to start earning!
                    </p>
                  </div>
                ) : (
                  <div>
                    {scanHistory.map((entry, i) => {
                      const time = entry.loggedAt instanceof Object && 'toDate' in entry.loggedAt
                        ? (entry.loggedAt as any).toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                        : '';
                      return (
                        <div key={entry.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0,
                          borderTop: i > 0 ? '1px solid #F8F8F8' : 'none',
                        }}>
                          <div style={{ width: 36, height: 36, borderRadius: 11, background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <EggIcon size={17} color="#D71920" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>SKM Egg</p>
                            <p style={{ fontSize: 10, color: '#bbb', margin: 0 }}>{time} · {entry.meal}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: 12, fontWeight: 900, color: '#D71920', margin: 0 }}>+{entry.protein}g</p>
                            <p style={{ fontSize: 9, color: '#bbb', margin: 0 }}>+{XP_PER_EGG} XP</p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Cumulative today total */}
                    <div style={{
                      marginTop: 12, padding: '10px 12px', borderRadius: 12,
                      background: pct >= 100 ? '#F0FDF4' : '#FCE8E8',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pct >= 100 ? '#16A34A' : '#D71920' }}>
                        {pct >= 100 ? 'Daily goal reached!' : `${remaining}g remaining to goal`}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 900, color: pct >= 100 ? '#16A34A' : '#D71920' }}>
                        {consumed}g / {goal}g
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* How it works */}
            <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>How It Works</p>
              {[
                'Purchase any SKM Egg product',
                'Find the QR code on the packaging',
                'Tap "Open Camera" and scan the code',
                'Protein and rewards are added instantly',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: i < 3 ? 10 : 0 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#D71920', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {i + 1}
                  </div>
                  <p style={{ fontSize: 12, color: '#1A1A1A', margin: 0, paddingTop: 2, lineHeight: 1.4 }}>{step}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SCANNING */}
        {phase === 'scanning' && (
          <div style={{ padding: 14 }}>
            <div style={{ background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
              <div style={{ position: 'relative' }}>
                <div id="qr-reader" style={{ width: '100%' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ position: 'relative', width: 200, height: 200 }}>
                    {[
                      { top: 0, left: 0, bt: 't', bl: 'l' },
                      { top: 0, right: 0, bt: 't', bl: 'r' },
                      { bottom: 0, left: 0, bt: 'b', bl: 'l' },
                      { bottom: 0, right: 0, bt: 'b', bl: 'r' },
                    ].map((c, i) => (
                      <div key={i} style={{
                        position: 'absolute', width: 22, height: 22,
                        top:    c.top    !== undefined ? 0 : undefined,
                        bottom: c.bottom !== undefined ? 0 : undefined,
                        left:   c.left   !== undefined ? 0 : undefined,
                        right:  c.right  !== undefined ? 0 : undefined,
                        borderTop:    c.bt === 't' ? '3px solid #D71920' : 'none',
                        borderBottom: c.bt === 'b' ? '3px solid #D71920' : 'none',
                        borderLeft:   c.bl === 'l' ? '3px solid #D71920' : 'none',
                        borderRight:  c.bl === 'r' ? '3px solid #D71920' : 'none',
                        borderTopLeftRadius:     i === 0 ? 6 : 0,
                        borderTopRightRadius:    i === 1 ? 6 : 0,
                        borderBottomLeftRadius:  i === 2 ? 6 : 0,
                        borderBottomRightRadius: i === 3 ? 6 : 0,
                      }} />
                    ))}
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
          <div style={{ padding: 14 }}>
            <div style={{ background: '#fff', borderRadius: 24, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              {/* Animated success ring */}
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
                background: 'linear-gradient(135deg,#D71920,#B31217)',
                boxShadow: '0 8px 28px rgba(215,25,32,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <CheckCircleIcon size={40} color="#fff" />
              </div>

              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px' }}>Egg Logged!</h3>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 18px' }}>Protein intake recorded successfully.</p>

              {/* Reward grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                <RewardBox label="Protein Added"   value={`+${result.protein}g`}  color="#D71920" bg="#FCE8E8" />
                <RewardBox label="XP Earned"       value={`+${result.xp} XP`}    color="#D97706" bg="#FEF3C7" />
                <RewardBox label="Coins Earned"    value={`+${result.coins}`}     color="#7C3AED" bg="#F5F3FF" />
                <RewardBox label="Current Streak"  value={`${result.streak}d`}   color="#16A34A" bg="#F0FDF4" />
              </div>

              {/* Today's progress after scan */}
              <div style={{ background: '#F8F8F8', borderRadius: 16, padding: '14px 16px', marginBottom: 16, textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1A1A1A' }}>Today's Progress</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#D71920' }}>
                    {result.todayProtein}g / {result.goal}g
                  </span>
                </div>
                <div style={{ height: 8, background: '#E8E8E8', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, Math.round((result.todayProtein / result.goal) * 100))}%`,
                    background: result.todayProtein >= result.goal ? '#22C55E' : 'linear-gradient(90deg,#D71920,#B31217)',
                    borderRadius: 4, transition: 'width 800ms ease',
                  }} />
                </div>
                {result.todayProtein >= result.goal ? (
                  <p style={{ fontSize: 11, color: '#16A34A', margin: 0, fontWeight: 700 }}>
                    Daily goal reached! Bonus XP unlocked.
                  </p>
                ) : (
                  <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
                    {Math.max(0, Math.ceil((result.goal - result.todayProtein) / PROTEIN_PER_EGG))} more egg{Math.ceil((result.goal - result.todayProtein) / PROTEIN_PER_EGG) !== 1 ? 's' : ''} to reach today's goal
                  </p>
                )}
              </div>

              {/* Eggs today count */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
                <EggIcon size={16} color="#D71920" />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A' }}>
                  {result.todayEggs} egg{result.todayEggs !== 1 ? 's' : ''} scanned today
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleScanAnother} style={{
                  flex: 1, padding: '13px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#D71920,#B31217)',
                  color: '#fff', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5,
                  boxShadow: '0 4px 16px rgba(215,25,32,0.4)',
                }}>
                  Scan Another
                </button>
                <button onClick={handleDone} style={{
                  flex: 1, padding: '13px 0', borderRadius: 16, border: '1.5px solid #E8E8E8', cursor: 'pointer',
                  background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 13,
                }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <div style={{ padding: 14 }}>
            <div style={{ background: '#fff', borderRadius: 24, padding: 28, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 18px', background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        @keyframes scanline { 0% { top:0%; } 50% { top:calc(100% - 2px); } 100% { top:0%; } }
        @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
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
