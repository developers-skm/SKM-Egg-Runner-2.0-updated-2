/**
 * PROTEIN TRACKER — Consume Egg Modal
 *
 * Standalone confirm dialog shown when the user taps "Consume Today's Egg"
 * on the Protein Wallet screen. Rendered via a portal straight into
 * document.body so it always sits above everything else, regardless of
 * any stacking-context/overflow quirks in ancestor screens.
 */

import { createPortal } from 'react-dom';
import { EggIcon } from './Icons';

const RED = '#D71920';

interface ConsumeEggModalProps {
  proteinPerEgg: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConsumeEggModal({ proteinPerEgg, onConfirm, onCancel }: ConsumeEggModalProps) {
  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2147483000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        style={{ background: '#fff', borderRadius: 20, padding: 22, maxWidth: 340, width: '100%', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FCE8E8', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EggIcon size={26} color={RED} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', margin: '0 0 6px' }}>Consume this egg today?</h3>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 18px' }}>
          This will add +{proteinPerEgg}g protein and update your daily streak.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px 0', borderRadius: 14, border: '1.5px solid #E8E8E8', cursor: 'pointer',
            background: '#F5F5F5', color: '#666', fontWeight: 700, fontSize: 13,
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '12px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff', fontWeight: 900, fontSize: 13,
          }}>Consume</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
