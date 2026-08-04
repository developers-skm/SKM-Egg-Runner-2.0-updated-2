/**
 * PROTEIN TRACKER — Wallet Full Modal
 *
 * Shown when a scan finds the wallet at capacity (5/5). Replaces the old
 * flat rejection with three explicit choices: consume today's egg, replace
 * the oldest stored egg with the new one, or cancel (QR stays unclaimed —
 * storeEggInWallet never touches qrCodes on a wallet_full result, so the
 * same code can be scanned again later).
 */

import { useState } from 'react';
import { EggIcon } from './Icons';
import { replaceOldestEgg, type WalletEggItem } from '../services/protein/proteinWalletService';
import { notifyWalletReplaced } from '../services/notifications/notificationService';
import { logBackgroundFailure } from '../utils/errorHandling';
import { HapticService } from '../services/audio/hapticService';

interface WalletFullModalProps {
  uid: string;
  qrCode: string;
  oldestItem: WalletEggItem;
  onConsume: () => void;
  onReplaced: () => void;
  onCancel: () => void;
}

function formatDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—';
  try { return ts.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); } catch { return '—'; }
}

export default function WalletFullModal({ uid, qrCode, oldestItem, onConsume, onReplaced, onCancel }: WalletFullModalProps) {
  const [view, setView] = useState<'choices' | 'replace_confirm'>('choices');
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState('');

  const handleReplace = async () => {
    setReplacing(true);
    setError('');
    try {
      const result = await replaceOldestEgg(uid, qrCode);
      if (!result.ok) {
        setError(
          result.reason === 'nothing_to_replace' ? 'Nothing to replace — try scanning again.'
          : result.reason === 'consumed_by_self' ? 'This egg has already been consumed.'
          : result.reason === 'consumed_by_other' ? 'This QR code has already been used.'
          : result.message ?? 'Something went wrong. Please try again.'
        );
        return;
      }
      HapticService.medium();
      notifyWalletReplaced(uid).catch(err => logBackgroundFailure('WalletFullModal:notifyWalletReplaced', err));
      onReplaced();
    } catch (e) {
      console.error('[WalletFullModal] replace error:', e);
      setError('Something went wrong. Please try again.');
    } finally {
      setReplacing(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onCancel}>
      <div
        style={{ background: '#fff', borderRadius: 22, padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        {view === 'choices' ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', margin: '0 auto 12px',
                background: 'linear-gradient(135deg,#FEE2E2,#FECACA)', border: '2px solid #F87171',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
                animation: 'wfmShake 0.5s ease',
              }}>
                🥚
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>Protein Wallet Full</h3>
              <p style={{ fontSize: 12, color: '#666', margin: 0, lineHeight: 1.5 }}>
                Your wallet already contains the maximum number of stored eggs. Choose how you would like to continue.
              </p>
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
                <p style={{ fontSize: 11, color: '#991B1B', margin: 0, fontWeight: 600 }}>{error}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={onConsume} style={{
                padding: '14px 16px', borderRadius: 15, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff', fontWeight: 900, fontSize: 13,
                textAlign: 'left', boxShadow: '0 4px 16px rgba(215,25,32,0.35)',
              }}>
                Consume Today's Egg
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                  Open your wallet and consume a stored egg first
                </div>
              </button>
              <button onClick={() => setView('replace_confirm')} style={{
                padding: '14px 16px', borderRadius: 15, border: '1.5px solid #E8E8E8', cursor: 'pointer',
                background: '#F8F8F8', color: '#1A1A1A', fontWeight: 800, fontSize: 13, textAlign: 'left',
              }}>
                Replace Oldest Egg
                <div style={{ fontSize: 10, fontWeight: 600, color: '#999', marginTop: 2 }}>
                  Swap out your oldest stored egg for this one
                </div>
              </button>
              <button onClick={onCancel} style={{
                padding: '12px 16px', borderRadius: 15, border: 'none', cursor: 'pointer',
                background: 'none', color: '#999', fontWeight: 700, fontSize: 12,
              }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FCE8E8', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <EggIcon size={24} color="#D71920" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px' }}>Replace this egg?</h3>
            </div>

            <div style={{ background: '#F8F8F8', borderRadius: 14, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#999' }}>Oldest Egg</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#1A1A1A' }}>{oldestItem.eggType}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#999' }}>Stored Date</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#1A1A1A' }}>{formatDate(oldestItem.storedAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#999' }}>Protein Value</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#D71920' }}>+{oldestItem.protein}g</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#999' }}>Expiry Date</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#1A1A1A' }}>{formatDate(oldestItem.expiresAt)}</span>
              </div>
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
                <p style={{ fontSize: 11, color: '#991B1B', margin: 0, fontWeight: 600 }}>{error}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setView('choices')} disabled={replacing} style={{
                flex: 1, padding: '12px 0', borderRadius: 14, border: '1.5px solid #E8E8E8', cursor: 'pointer',
                background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 13,
              }}>Back</button>
              <button onClick={handleReplace} disabled={replacing} style={{
                flex: 1, padding: '12px 0', borderRadius: 14, border: 'none', cursor: replacing ? 'default' : 'pointer',
                background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff', fontWeight: 900, fontSize: 13,
                opacity: replacing ? 0.7 : 1,
              }}>{replacing ? 'Replacing…' : 'Replace'}</button>
            </div>
          </>
        )}
      </div>
      <style>{`
        @keyframes wfmShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
