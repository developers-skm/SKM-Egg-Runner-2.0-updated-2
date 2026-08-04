/**
 * PROTEIN TRACKER — QR Scan Screen
 *
 * Fix: camera div is always in the DOM during opening+scanning phases.
 * The spinner overlays on top during 'opening'. scanner.start() resolves
 * before we flip to 'scanning', so html5-qrcode always measures a real
 * sized container → no black screen.
 *
 * URL-encoded QR payloads (https://.../?qr=EGG-000001) are handled by
 * validateEggForProtein which now uses extractCode() shared with the game.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import type { User } from 'firebase/auth';
import {
  getRecentEntries, getTodayStats, getTrackerSettings,
  PROTEIN_PER_EGG,
  type ProteinLogEntry, type DailyStats, type TrackerSettings,
} from '../services/protein/proteinTrackerService';
import { storeEggInWallet, directConsumeEgg, getWalletSummary, WALLET_CAPACITY, type WalletEggItem } from '../services/protein/proteinWalletService';
import { CameraIcon, EggIcon, CheckCircleIcon, AlertIcon } from './Icons';
import { playChickSuccess, resumeAudioContext } from '../services/audio/chickSound';
import { HapticService } from '../services/audio/hapticService';
import {
  notifyDuplicateEgg, notifyWalletEggStored, notifyWalletFull,
  notifyProteinAdded, notifyProteinGoalComplete, notifyStreakMilestone,
  notifyRewardPointsEarned, notifyMembershipTierUp,
} from '../services/notifications/notificationService';
import { logBackgroundFailure } from '../utils/errorHandling';
import { validateEggForProtein } from '../services/qr/qrService';
import { recordStreakDay } from '../services/protein/eggStreakService';
import WalletFullModal from './WalletFullModal';

type Phase = 'idle' | 'opening' | 'scanning' | 'processing' | 'success' | 'duplicate' | 'consumed_other' | 'wallet_full' | 'error';

interface QRScanScreenProps {
  user: User;
  onScanSuccess: () => void;
  onOpenWallet?: () => void;
}

interface ScanResult {
  protein: number;
  consumedDirectly: boolean;
  eggsStored: number;
  capacity: number;
  goalJustMet?: boolean;
  todayProteinAfter: number;
}

const QR_ELEMENT_ID = 'protein-qr-reader';

export default function QRScanScreen({ user, onScanSuccess, onOpenWallet }: QRScanScreenProps) {
  const [phase,          setPhase]          = useState<Phase>('idle');
  const [errorMessage,   setErrorMessage]   = useState('');
  const [result,         setResult]         = useState<ScanResult | null>(null);
  const [dots,           setDots]           = useState(0);
  const [scanHistory,    setScanHistory]    = useState<ProteinLogEntry[]>([]);
  const [todayStats,     setTodayStats]     = useState<DailyStats | null>(null);
  const [settings,       setSettings]       = useState<TrackerSettings | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [fullModal,      setFullModal]      = useState<{ qrCode: string; oldestItem: WalletEggItem } | null>(null);

  const scannerRef    = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const mountedRef    = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Load today's history ──────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [entries, ts, stg] = await Promise.all([
        getRecentEntries(user.uid, 30),
        getTodayStats(user.uid),
        getTrackerSettings(user.uid),
      ]);
      if (!mountedRef.current) return;
      const today = new Date().toISOString().slice(0, 10);
      setScanHistory(entries.filter(e => e.type === 'qr_scan' && e.dateKey === today));
      setTodayStats(ts);
      setSettings(stg);
    } catch (e) {
      console.error('[SCAN] loadHistory error:', e);
    } finally {
      if (mountedRef.current) setLoadingHistory(false);
    }
  }, [user.uid]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Scanner lifecycle ─────────────────────────────────────────
  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      const state = scannerRef.current.getState();
      if (state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED) {
        await scannerRef.current.stop();
      }
      scannerRef.current.clear();
    } catch { /* ignore cleanup errors */ }
    scannerRef.current = null;
  }, []);

  useEffect(() => { return () => { stopScanner(); }; }, [stopScanner]);

  // Animated dots while scanning
  useEffect(() => {
    if (phase !== 'scanning') return;
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, [phase]);

  // ── Open camera ───────────────────────────────────────────────
  // KEY FIX: we set phase='opening' first (renders the camera div visible
  // and full-size), wait two animation frames for the DOM to paint, then
  // call scanner.start(). Only after start() resolves do we set 'scanning'.
  // This ensures html5-qrcode always measures a real-sized container.
  const openCamera = useCallback(async () => {
    console.log('[PROTEIN SCANNER OPEN]');
    resumeAudioContext(); // unlock AudioContext on this user gesture
    HapticService.selection(); // major button press — opening the scanner
    setPhase('opening');
    setErrorMessage('');
    processingRef.current = false;

    await stopScanner();

    // Two rAF + small timeout: let React paint the camera div at full size
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await new Promise(r => setTimeout(r, 120));

    const el = document.getElementById(QR_ELEMENT_ID);
    if (!el) {
      console.error('[SCAN] QR reader DOM element not found');
      if (mountedRef.current) { setErrorMessage('Camera view unavailable. Please try again.'); setPhase('error'); }
      return;
    }

    const rect = el.getBoundingClientRect();
    console.log('[CONTAINER SIZE] clientWidth:', el.clientWidth, 'clientHeight:', el.clientHeight);
    console.log('[CONTAINER SIZE] rect:', Math.round(rect.width), 'x', Math.round(rect.height));

    // If height is still 0, force an explicit height before handing to html5-qrcode
    if (el.clientHeight === 0) {
      console.warn('[CONTAINER SIZE] height=0 — forcing 320px');
      (el as HTMLElement).style.height = '320px';
      await new Promise(r => setTimeout(r, 80));
    }

    try {
      // Release any lingering tracks before html5-qrcode re-acquires the camera
      console.log('[CAMERA REQUESTED]');
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        console.log('[CAMERA GRANTED]');
        console.log('[STREAM RECEIVED] tracks:', probe.getTracks().length);
        probe.getTracks().forEach(t => t.stop());
      } catch (e: any) {
        console.warn('[CAMERA REQUESTED] probe failed (will retry inside scanner):', e?.message);
      }

      const scanner = new Html5Qrcode(QR_ELEMENT_ID, { verbose: false });
      scannerRef.current = scanner;

      // Use qrbox as a function — html5-qrcode calls it AFTER the video is
      // sized, so we get real viewfinder dimensions instead of 0×0.
      // Clamp to 80% of the smaller dimension, min 200px, max 350px.
      const qrboxFn = (w: number, h: number) => {
        console.log('[VIEWFINDER SIZE]', w, 'x', h);
        // If height is 0 (flex collapse not yet resolved), use width as fallback
        const effectiveH = h > 0 ? h : w;
        const side = Math.min(350, Math.max(200, Math.round(Math.min(w, effectiveH) * 0.80)));
        console.log('[VIEWFINDER SIZE] → qrbox:', side, 'x', side);
        return { width: side, height: side };
      };

      // Start FIRST — flip to 'scanning' only after camera is streaming
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: qrboxFn },
        async (decoded) => {
          if (processingRef.current) return;
          processingRef.current = true;
          console.log('[QR DETECTED]', decoded.slice(0, 80));
          await handleScan(decoded);
        },
        () => { /* no QR in frame — suppress */ }
      );

      console.log('[SCANNER STARTED] scanner.start() resolved');
      if (mountedRef.current) setPhase('scanning');

      setTimeout(() => {
        const video = document.querySelector(`#${QR_ELEMENT_ID} video`) as HTMLVideoElement | null;
        if (video) {
          console.log('[VIDEO PLAYING] videoWidth:', video.videoWidth, 'videoHeight:', video.videoHeight);
        } else {
          console.warn('[VIDEO PLAYING] no <video> element found');
        }
      }, 1500);

    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? String(err);
      console.error('[SCAN] Camera start error:', msg);
      if (mountedRef.current) {
        const isPerm = /permission|denied|notallowed/i.test(msg);
        setErrorMessage(
          isPerm
            ? 'Camera permission denied. Please allow camera access in your browser settings and try again.'
            : `Unable to open camera: ${msg}`
        );
        setPhase('error');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopScanner]);

  // ── Core scan handler ─────────────────────────────────────────
  const handleScan = async (raw: string) => {
    await stopScanner();
    if (mountedRef.current) setPhase('processing');

    try {
      console.log('[QR VALIDATED] starting validation…');
      const validation = await validateEggForProtein(raw);

      if (!validation.ok) {
        const failed = validation as { ok: false; reason: string; message: string };
        console.warn('[SCAN] Validation failed:', failed.reason, failed.message);
        if (mountedRef.current) { setErrorMessage(failed.message); setPhase('error'); }
        return;
      }

      console.log('[QR VALIDATED] accepted:', validation.eggCode);

      // ── Direct-consume-first pipeline ───────────────────────────────────
      // If today's first egg hasn't been consumed yet, award it immediately
      // (protein, daily goal, streak, points, challenges, notifications) and
      // skip the wallet entirely. Only the 2nd+ scan of the day gets stored
      // in the Protein Wallet for later consumption (see WalletScreen).
      const directResult = await directConsumeEgg(user.uid, validation.eggCode);

      if (directResult.ok) {
        console.log('[FIREBASE UPDATED] egg consumed directly, qrCodes marked consumed');
        playChickSuccess();
        if (!mountedRef.current) return;

        const streak = directResult.streak?.currentStreak ?? 0;
        const streakMilestoneHit = [3, 7, 14, 30, 60, 100].includes(streak);
        recordStreakDay(user.uid).catch(err => logBackgroundFailure('handleScan:recordStreakDay', err));

        const walletSummary = await getWalletSummary(user.uid);
        const todayProteinAfter = (todayStats?.totalProtein ?? 0) + directResult.protein;
        setResult({
          protein: directResult.protein, consumedDirectly: true, goalJustMet: directResult.goalJustMet,
          eggsStored: walletSummary.walletEggsStored, capacity: WALLET_CAPACITY, todayProteinAfter,
        });
        HapticService.success();
        setPhase('success');

        notifyProteinAdded(user.uid, directResult.protein, (todayStats?.totalProtein ?? 0) + directResult.protein)
          .catch(err => logBackgroundFailure('handleScan:notifyProteinAdded', err));
        if (directResult.goalJustMet) {
          notifyProteinGoalComplete(user.uid, settings?.dailyGoal ?? 60).catch(err => logBackgroundFailure('handleScan:notifyProteinGoalComplete', err));
        }
        if (streakMilestoneHit) {
          notifyStreakMilestone(user.uid, streak).catch(err => logBackgroundFailure('handleScan:notifyStreakMilestone', err));
        }
        if (directResult.pointsEarned && directResult.wallet) {
          notifyRewardPointsEarned(user.uid, directResult.pointsEarned, directResult.wallet.currentPoints).catch(err => logBackgroundFailure('handleScan:notifyRewardPointsEarned', err));
        }
        if (directResult.tierChanged && directResult.wallet) {
          notifyMembershipTierUp(user.uid, directResult.wallet.membership).catch(err => logBackgroundFailure('handleScan:notifyMembershipTierUp', err));
        }
        return;
      }

      if (directResult.reason === 'error') {
        console.error('[SCAN] directConsumeEgg error:', directResult.message);
        if (mountedRef.current) { setErrorMessage(directResult.message); setPhase('error'); }
        return;
      }
      if (directResult.reason === 'consumed_by_self') {
        console.warn('[SCAN] Already claimed by this user:', validation.eggCode);
        if (mountedRef.current) setPhase('duplicate');
        notifyDuplicateEgg(user.uid).catch(err => logBackgroundFailure('handleScan:notifyDuplicateEgg', err));
        return;
      }
      if (directResult.reason === 'consumed_by_other') {
        console.warn('[SCAN] Already claimed by another user:', validation.eggCode);
        if (mountedRef.current) setPhase('consumed_other');
        return;
      }

      // reason === 'already_consumed_today' — today's first egg is claimed,
      // fall through to the store-in-wallet pipeline for this (2nd+) scan.
      const storeResult = await storeEggInWallet(user.uid, validation.eggCode);

      if (!storeResult.ok) {
        if (storeResult.reason === 'error') {
          console.error('[SCAN] storeEggInWallet error:', storeResult.message);
          if (mountedRef.current) { setErrorMessage(storeResult.message); setPhase('error'); }
          return;
        }
        if (storeResult.reason === 'consumed_by_self') {
          console.warn('[WALLET STORE] Already claimed by this user:', validation.eggCode);
          if (mountedRef.current) setPhase('duplicate');
          notifyDuplicateEgg(user.uid).catch(err => logBackgroundFailure('handleScan:notifyDuplicateEgg', err));
          return;
        }
        if (storeResult.reason === 'wallet_full') {
          console.warn('[WALLET STORE] Wallet full — QR left unclaimed:', validation.eggCode);
          if (mountedRef.current) {
            setFullModal({ qrCode: validation.eggCode, oldestItem: storeResult.oldestItem });
            setPhase('wallet_full');
          }
          notifyWalletFull(user.uid).catch(err => logBackgroundFailure('handleScan:notifyWalletFull', err));
          return;
        }
        console.warn('[WALLET STORE] Already claimed by another user:', validation.eggCode);
        if (mountedRef.current) setPhase('consumed_other');
        return;
      }

      console.log('[FIREBASE UPDATED] proteinWallet item stored, qrCodes marked consumed');
      const item: WalletEggItem = storeResult.item;
      const summary = await getWalletSummary(user.uid);

      // Play chick chirp — only on genuine success, never on error/duplicate
      playChickSuccess();

      if (!mountedRef.current) return;

      setResult({
        protein: item.protein, consumedDirectly: false,
        eggsStored: summary.walletEggsStored, capacity: WALLET_CAPACITY,
        todayProteinAfter: todayStats?.totalProtein ?? 0,
      });
      HapticService.success();
      setPhase('success');

      notifyWalletEggStored(user.uid, summary.walletEggsStored, WALLET_CAPACITY).catch(err => logBackgroundFailure('handleScan:notifyWalletEggStored', err));

    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? String(err);
      console.error('[SCAN] handleScan error:', msg);
      if (!mountedRef.current) return;
      setErrorMessage('Something went wrong. Please try again.');
      setPhase('error');
    }
  };

  // ── UI actions ────────────────────────────────────────────────
  const reset = useCallback(async () => {
    await stopScanner();
    processingRef.current = false;
    if (!mountedRef.current) return;
    setPhase('idle');
    setErrorMessage('');
    setResult(null);
    await loadHistory();
  }, [stopScanner, loadHistory]);

  const scanAnother = useCallback(async () => {
    await stopScanner();
    processingRef.current = false;
    if (!mountedRef.current) return;
    setPhase('idle');
    setResult(null);
    await loadHistory();
    setTimeout(() => openCamera(), 150);
  }, [stopScanner, loadHistory, openCamera]);

  // ── Derived values ────────────────────────────────────────────
  const goal       = settings?.dailyGoal   ?? 60;
  const consumed   = todayStats?.totalProtein ?? 0;
  const eggs       = todayStats?.totalEggs    ?? 0;
  const pct        = Math.min(100, Math.round((consumed / goal) * 100));
  const remaining  = Math.max(0, goal - consumed);
  const eggsToGoal = Math.max(0, Math.ceil(remaining / PROTEIN_PER_EGG));

  const isCameraPhase = phase === 'opening' || phase === 'scanning';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header — hidden while camera is active or on the full-screen success page */}
      {!isCameraPhase && phase !== 'processing' && phase !== 'success' && (
        <div style={{
          background: 'linear-gradient(135deg,#D71920,#B31217)',
          padding: '18px 18px 16px', flexShrink: 0,
          boxShadow: '0 4px 20px rgba(215,25,32,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CameraIcon size={21} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: 0 }}>Scan SKM Egg</h2>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: 0, marginTop: 1 }}>
                Store now, consume whenever you're ready
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
              Today: {eggs} egg{eggs !== 1 ? 's' : ''} consumed
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
              {consumed}g / {goal}g
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: pct >= 100 ? '#4ade80' : 'rgba(255,255,255,0.9)',
              borderRadius: 3, transition: 'width 600ms ease',
            }} />
          </div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: '4px 0 0', fontWeight: 600 }}>
            {pct >= 100
              ? 'Daily goal reached! Great work.'
              : `${eggsToGoal} more egg${eggsToGoal !== 1 ? 's' : ''} (${remaining}g) to reach today's goal`}
          </p>
        </div>
      )}

      {/* ── IDLE (also the backdrop behind the wallet_full modal) ── */}
      {(phase === 'idle' || phase === 'wallet_full') && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ background: '#fff', borderRadius: 22, padding: 22, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, background: '#FCE8E8', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CameraIcon size={32} color="#D71920" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>Ready to Scan</h3>
              <p style={{ fontSize: 12, color: '#666', margin: '0 0 18px', lineHeight: 1.6 }}>
                Point your camera at the QR code on any SKM Egg package to store it in your Protein Wallet.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                {[
                  { label: '+1 Egg stored',                 bg: '#FCE8E8', color: '#D71920' },
                  { label: `${PROTEIN_PER_EGG}g when consumed`,  bg: '#F0FDF4', color: '#16A34A' },
                ].map(b => (
                  <div key={b.label} style={{ background: b.bg, borderRadius: 12, padding: '10px 8px' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: b.color }}>{b.label}</span>
                  </div>
                ))}
              </div>
              <button onClick={openCamera} style={{
                width: '100%', padding: '15px 0', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)',
                color: '#fff', fontWeight: 900, fontSize: 15, letterSpacing: 0.5,
                boxShadow: '0 6px 20px rgba(215,25,32,0.4)',
              }}>
                Open Camera
              </button>
            </div>

            {/* Today's scan history */}
            <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Today's Scans</p>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#D71920' }}>
                  {loadingHistory ? '…' : `${scanHistory.length} egg${scanHistory.length !== 1 ? 's' : ''}`}
                </span>
              </div>
              {loadingHistory ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2.5px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : scanHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '18px 0' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 13, background: '#F5F5F5', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <EggIcon size={20} color="#ccc" />
                  </div>
                  <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>No eggs scanned yet today.</p>
                  <p style={{ fontSize: 11, color: '#D71920', margin: '4px 0 0', fontWeight: 700 }}>Tap Open Camera to start!</p>
                </div>
              ) : (
                <>
                  {scanHistory.map((entry, i) => {
                    let timeStr = '';
                    try {
                      const ts = entry.loggedAt as unknown;
                      if (ts && typeof ts === 'object' && 'toDate' in (ts as object)) {
                        timeStr = (ts as { toDate: () => Date }).toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                      }
                    } catch { /* ignore */ }
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
                          <p style={{ fontSize: 10, color: '#bbb', margin: 0 }}>
                            {timeStr}{timeStr && entry.meal ? ' · ' : ''}{entry.meal}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 12, fontWeight: 900, color: '#D71920', margin: 0 }}>+{entry.protein}g</p>
                          <p style={{ fontSize: 9, color: '#bbb', margin: 0 }}>{entry.calories} kcal</p>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{
                    marginTop: 12, padding: '10px 12px', borderRadius: 12,
                    background: pct >= 100 ? '#F0FDF4' : '#FFF5F5',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: pct >= 100 ? '#16A34A' : '#D71920' }}>
                      {pct >= 100 ? 'Daily goal reached!' : `${remaining}g remaining`}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: pct >= 100 ? '#16A34A' : '#D71920' }}>
                      {consumed}g / {goal}g
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* How it works */}
            <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>How It Works</p>
              {[
                'Purchase any SKM Egg product',
                'Find the QR code on the packaging',
                'Tap "Open Camera" and scan the code',
                'Egg is stored in your Protein Wallet — consume it anytime',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: i < 3 ? 10 : 0 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#D71920', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                  <p style={{ fontSize: 12, color: '#1A1A1A', margin: 0, paddingTop: 2, lineHeight: 1.4 }}>{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CAMERA PHASE — opening + scanning share the same DOM node ──────────
          The QR_ELEMENT_ID div is always rendered at full size here.
          During 'opening' a black spinner overlay sits on top (z-index 20).
          scanner.start() resolves → we remove the overlay by flipping to 'scanning'.
          html5-qrcode always measures a real-sized container → no black screen. */}
      {isCameraPhase && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>

          {/* Camera viewport — explicit height so html5-qrcode always measures > 0.
              position:relative + explicit height avoids the flex-collapse where
              the child position:absolute gets clientHeight=0. */}
          <div style={{
            position: 'relative',
            width: '100%',
            height: 'calc(100vh - 130px)',
            minHeight: 320,
            maxHeight: 600,
            overflow: 'hidden',
            flexShrink: 0,
            background: '#000',
          }}>

            {/* Camera container — explicit 100% width+height (not inset:0) so
                html5-qrcode reads real clientWidth/clientHeight */}
            <div
              id={QR_ELEMENT_ID}
              style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}
            />

            {/* Spinner overlay during 'opening' — removed once scanning starts */}
            {phase === 'opening' && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 20, background: '#000',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: '3px solid rgba(215,25,32,0.3)', borderTopColor: '#D71920',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: 600, margin: 0 }}>
                  Opening camera…
                </p>
              </div>
            )}

            {/* Scan overlays — only shown once video is streaming */}
            {phase === 'scanning' && (
              <>
                {/* Dark vignette edges */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,0.5) 0%,transparent 22%,transparent 78%,rgba(0,0,0,0.5) 100%)' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right,rgba(0,0,0,0.35) 0%,transparent 18%,transparent 82%,rgba(0,0,0,0.35) 100%)' }} />
                </div>

                {/* Scan frame */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 3 }}>
                  <div style={{ position: 'relative', width: 'min(80vw,350px)', height: 'min(80vw,350px)', minWidth: 280, minHeight: 280 }}>
                    <div style={{ position: 'absolute', top: 0,    left: 0,  width: 52, height: 52, borderTop: '4px solid #fff', borderLeft: '4px solid #fff',   borderTopLeftRadius: 14 }} />
                    <div style={{ position: 'absolute', top: 0,    right: 0, width: 52, height: 52, borderTop: '4px solid #fff', borderRight: '4px solid #fff',  borderTopRightRadius: 14 }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0,  width: 52, height: 52, borderBottom: '4px solid #fff', borderLeft: '4px solid #fff',  borderBottomLeftRadius: 14 }} />
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 52, height: 52, borderBottom: '4px solid #fff', borderRight: '4px solid #fff', borderBottomRightRadius: 14 }} />
                    <div style={{ position: 'absolute', top: 0,    left: 0,  width: 28, height: 28, borderTop: '3px solid #D71920', borderLeft: '3px solid #D71920',   borderTopLeftRadius: 14 }} />
                    <div style={{ position: 'absolute', top: 0,    right: 0, width: 28, height: 28, borderTop: '3px solid #D71920', borderRight: '3px solid #D71920',  borderTopRightRadius: 14 }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0,  width: 28, height: 28, borderBottom: '3px solid #D71920', borderLeft: '3px solid #D71920',  borderBottomLeftRadius: 14 }} />
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderBottom: '3px solid #D71920', borderRight: '3px solid #D71920', borderBottomRightRadius: 14 }} />
                    <div style={{
                      position: 'absolute', left: 10, right: 10, height: 2,
                      background: 'linear-gradient(90deg,transparent,#D71920 30%,#FF6666 50%,#D71920 70%,transparent)',
                      boxShadow: '0 0 12px rgba(215,25,32,0.95)',
                      animation: 'scanline 2s ease-in-out infinite',
                    }} />
                  </div>
                </div>

                {/* Instruction pill */}
                <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 3 }}>
                  <div style={{ background: 'rgba(0,0,0,0.62)', borderRadius: 50, padding: '9px 24px', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: 0.2 }}>
                      Align QR code in the frame{'.'.repeat(dots)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Cancel bar */}
          <div style={{ flexShrink: 0, background: '#111', padding: '12px 20px 18px', display: 'flex', justifyContent: 'center' }}>
            <button onClick={reset} style={{
              width: '100%', maxWidth: 300, padding: '14px 0', borderRadius: 14,
              border: '1.5px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
              color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', letterSpacing: 0.3,
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── PROCESSING ── */}
      {phase === 'processing' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', border: '4px solid #FCE8E8', borderTopColor: '#D71920', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A', margin: '0 0 4px' }}>Storing Egg…</p>
            <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>Adding to your Protein Wallet…</p>
          </div>
        </div>
      )}

      {/* ── SUCCESS — full-screen premium result page, no header/goal card ── */}
      {phase === 'success' && result && (
        <div style={{
          flex: 1, overflowY: 'auto', paddingBottom: 28,
          background: 'linear-gradient(180deg,#FFF7F7 0%,#FFFFFF 220px)',
          animation: 'successFadeIn 250ms ease-out',
        }}>
          <div style={{ padding: '36px 18px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Success icon — red glow circle, animated checkmark */}
            <div style={{ position: 'relative', width: 108, height: 108, marginBottom: 20 }}>
              <div style={{
                position: 'absolute', inset: -14, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(215,25,32,0.22) 0%, rgba(215,25,32,0) 70%)',
                animation: 'successGlowPulse 1.8s ease-in-out infinite',
              }} />
              <div style={{
                position: 'relative', width: 108, height: 108, borderRadius: '50%',
                background: 'linear-gradient(135deg,#D71920,#B31217)',
                boxShadow: '0 10px 32px rgba(215,25,32,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'successIconPop 450ms cubic-bezier(0.34,1.56,0.64,1)',
              }}>
                <CheckCircleIcon size={54} color="#fff" />
              </div>
            </div>

            {/* Title + subtitle */}
            <h3 style={{
              fontSize: 24, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px', textAlign: 'center',
              animation: 'successSlideUp 400ms ease-out 80ms both',
            }}>
              {result.consumedDirectly ? 'Protein Logged!' : 'Egg Stored Successfully!'}
            </h3>
            <p style={{
              fontSize: 13, color: '#888', margin: '0 0 26px', textAlign: 'center', maxWidth: 280, lineHeight: 1.5,
              animation: 'successSlideUp 400ms ease-out 140ms both',
            }}>
              {result.consumedDirectly
                ? "Your first egg for today has been recorded."
                : "Your egg has been safely added to your Protein Wallet."}
            </p>

            {/* Status card — premium glass card with protein/status + wallet + today's progress */}
            <div style={{
              width: '100%', maxWidth: 380, background: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.04)',
              borderRadius: 24, padding: 20, marginBottom: 14,
              boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
              animation: 'successSlideUp 420ms ease-out 200ms both',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <RBox label="Protein" value={`+${result.protein}g`} color="#D71920" bg="#FCE8E8" />
                <RBox label="Status" value={result.consumedDirectly ? 'Consumed' : 'Stored'} color="#22C55E" bg="#F0FDF4" />
              </div>
              <div style={{ height: 1, background: '#F0F0F0', margin: '0 0 14px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#999' }}>Wallet</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A' }}>
                  {result.eggsStored} / {result.capacity} Eggs
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#999' }}>Today's Progress</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#D71920' }}>
                  {result.todayProteinAfter}g / {goal}g
                </span>
              </div>
            </div>

            {/* Bottom info card */}
            <div style={{
              width: '100%', maxWidth: 380, background: '#FAFAFA', border: '1px solid #F0F0F0',
              borderRadius: 16, padding: '12px 16px', marginBottom: 22,
              display: 'flex', alignItems: 'center', gap: 10,
              animation: 'successSlideUp 420ms ease-out 260ms both',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{result.consumedDirectly ? '✅' : 'ℹ️'}</span>
              <p style={{ fontSize: 11.5, color: '#888', margin: 0, lineHeight: 1.45 }}>
                {result.consumedDirectly
                  ? "Today's protein has been added successfully."
                  : 'Stored eggs expire after 30 days — consume them anytime before then.'}
              </p>
            </div>

            {/* Actions */}
            <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={scanAnother} style={{
                width: '100%', padding: '16px 0', borderRadius: 18, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff', fontWeight: 900, fontSize: 15,
                boxShadow: '0 6px 20px rgba(215,25,32,0.4)', letterSpacing: 0.3,
                animation: 'successFadeUp 400ms ease-out 320ms both',
              }}>Scan Another Egg</button>
              {onOpenWallet ? (
                <button onClick={onOpenWallet} style={{
                  width: '100%', padding: '15px 0', borderRadius: 18, border: '1.5px solid #F0F0F0', cursor: 'pointer',
                  background: '#fff', color: '#666', fontWeight: 800, fontSize: 14,
                  animation: 'successFadeUp 400ms ease-out 380ms both',
                }}>Open Protein Wallet</button>
              ) : (
                <button onClick={onScanSuccess} style={{
                  width: '100%', padding: '15px 0', borderRadius: 18, border: '1.5px solid #F0F0F0', cursor: 'pointer',
                  background: '#fff', color: '#666', fontWeight: 800, fontSize: 14,
                  animation: 'successFadeUp 400ms ease-out 380ms both',
                }}>Done</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── WALLET FULL — 5/5 stored, QR untouched, user can scan again later ──
          Falls back to the idle screen underneath (reset() already ran via
          stopScanner in handleScan), with the choice modal on top. */}
      {phase === 'wallet_full' && fullModal && (
        <WalletFullModal
          uid={user.uid}
          qrCode={fullModal.qrCode}
          oldestItem={fullModal.oldestItem}
          onConsume={() => { setFullModal(null); (onOpenWallet ?? onScanSuccess)(); }}
          onReplaced={() => {
            setFullModal(null);
            setResult({
              protein: PROTEIN_PER_EGG, consumedDirectly: false,
              eggsStored: WALLET_CAPACITY, capacity: WALLET_CAPACITY,
              todayProteinAfter: todayStats?.totalProtein ?? 0,
            });
            HapticService.success();
            setPhase('success');
          }}
          onCancel={() => { setFullModal(null); reset(); }}
        />
      )}

      {/* ── DUPLICATE — same user scanned again ── */}
      {phase === 'duplicate' && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
          <div style={{ padding: 14 }}>
            <div style={{ background: '#fff', borderRadius: 22, padding: 26, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
                background: 'linear-gradient(135deg,#FEF3C7,#FDE68A)',
                border: '2px solid #F59E0B',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                fontSize: 38,
              }}>
                🍳
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>
                This egg has already been consumed.
              </h3>
              <div style={{
                background: '#FFFBEB', border: '1px solid #FDE68A',
                borderRadius: 14, padding: '12px 16px', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>ℹ️</span>
                <p style={{ fontSize: 12, color: '#92400E', margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
                  You already recorded this egg. Each egg QR can only be added once.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={scanAnother} style={{
                  flex: 1, padding: '13px 0', borderRadius: 15, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff', fontWeight: 900, fontSize: 13,
                  boxShadow: '0 4px 16px rgba(215,25,32,0.4)',
                }}>Scan Another</button>
                <button onClick={reset} style={{
                  flex: 1, padding: '13px 0', borderRadius: 15, border: '1.5px solid #E8E8E8', cursor: 'pointer',
                  background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 13,
                }}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONSUMED_OTHER — already claimed by a different user ── */}
      {phase === 'consumed_other' && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
          <div style={{ padding: 14 }}>
            <div style={{ background: '#fff', borderRadius: 22, padding: 26, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 16px',
                background: 'linear-gradient(135deg,#FEE2E2,#FECACA)',
                border: '2px solid #F87171',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                fontSize: 38,
              }}>
                🚫
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>
                This egg has already been consumed by another account.
              </h3>
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 14, padding: '12px 16px', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>🔒</span>
                <p style={{ fontSize: 12, color: '#991B1B', margin: 0, lineHeight: 1.5, fontWeight: 600 }}>
                  Each egg QR can only be recorded once. This QR code cannot be used again.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={scanAnother} style={{
                  flex: 1, padding: '13px 0', borderRadius: 15, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff', fontWeight: 900, fontSize: 13,
                  boxShadow: '0 4px 16px rgba(215,25,32,0.4)',
                }}>Scan Another</button>
                <button onClick={reset} style={{
                  flex: 1, padding: '13px 0', borderRadius: 15, border: '1.5px solid #E8E8E8', cursor: 'pointer',
                  background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 13,
                }}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {phase === 'error' && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90 }}>
          <div style={{ padding: 14 }}>
            <div style={{ background: '#fff', borderRadius: 22, padding: 26, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <div style={{ width: 76, height: 76, borderRadius: '50%', margin: '0 auto 16px', background: '#FCE8E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertIcon size={36} color="#D71920" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A', margin: '0 0 8px' }}>Scan Failed</h3>
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 22px', lineHeight: 1.6 }}>{errorMessage}</p>
              <button onClick={reset} style={{
                width: '100%', padding: '14px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff',
                fontWeight: 900, fontSize: 13, letterSpacing: 0.5,
                boxShadow: '0 6px 18px rgba(215,25,32,0.4)',
              }}>Try Again</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes scanline { 0% { top: 0%; } 50% { top: calc(100% - 2px); } 100% { top: 0%; } }
        @keyframes popIn   { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        @keyframes successFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes successIconPop { 0% { transform: scale(0.8); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes successGlowPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
        @keyframes successSlideUp { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes successFadeUp  { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        /* html5-qrcode CSS — surgical overrides only.
           DO NOT set position:static on descendant divs: html5-qrcode needs
           position:relative on its inner wrapper as the video's containing block. */

        #${QR_ELEMENT_ID} {
          overflow: hidden !important;
          background: #000 !important;
        }
        #${QR_ELEMENT_ID} > div {
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          background: #000 !important;
        }
        #${QR_ELEMENT_ID} video {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          object-fit: cover !important;
          object-position: center !important;
          display: block !important;
          border: none !important;
          background: #000 !important;
          z-index: 1 !important;
        }
        #${QR_ELEMENT_ID} img,
        #${QR_ELEMENT_ID} button,
        #${QR_ELEMENT_ID} select,
        #${QR_ELEMENT_ID} span,
        #${QR_ELEMENT_ID} p,
        #${QR_ELEMENT_ID} #qr-shaded-region,
        #${QR_ELEMENT_ID} [id*="anchor"],
        #${QR_ELEMENT_ID} [id*="header"],
        #${QR_ELEMENT_ID} [id*="status"],
        #${QR_ELEMENT_ID} [id*="torch"],
        #${QR_ELEMENT_ID} [id*="dashboard"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

function RBox({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 13, padding: '13px 10px', textAlign: 'center' }}>
      <p style={{ fontSize: 19, fontWeight: 900, color, margin: 0, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 10, fontWeight: 700, color, opacity: 0.8, margin: 0, marginTop: 4 }}>{label}</p>
    </div>
  );
}
