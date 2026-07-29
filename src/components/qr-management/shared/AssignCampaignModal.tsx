import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  X, Megaphone, CheckCircle2, Clock, Calendar, Target, QrCode as QrCodeIcon,
  ShieldCheck, AlertTriangle,
} from 'lucide-react';
import type { RewardCampaign } from '../../../services/protein/rewardCampaignService';
import { fetchAllCampaigns } from '../../../services/protein/rewardCampaignService';
import { bulkAssignCampaign, writeOpLog } from '../../../services/qr/qrManagementService';
import type { QRCodeRecord } from '../../../types/qr/qrManagementTypes';

const RED = '#D71920';

function fmtDate(ts: { toDate: () => Date }): string {
  return ts.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function objectiveLabel(o: RewardCampaign['objectives'][number]): string {
  if (o.label) return o.label;
  const kindLabel: Record<string, string> = {
    eggScans: 'egg scans', points: 'points', stage: 'reach stage',
    proteinStreak: 'day protein streak', foodLogs: 'food logs',
  };
  return `${o.target} ${kindLabel[o.kind] ?? o.kind}`;
}

// ─── Loading (progress) view — mirrors QRGenerator.tsx's LoadingView ────────

function LoadingView({ progress, done, total, etaSecs }: {
  progress: number; done: number; total: number; etaSecs: number | null;
}) {
  return (
    <>
      <div style={{
        width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
        background: `${RED}12`, border: `1px solid ${RED}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'glowPulse 2s ease-in-out infinite',
      }}>
        <Megaphone size={30} color={RED} strokeWidth={2} />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', margin: '0 0 4px' }}>Assigning campaign to QR codes…</p>
        <p style={{ fontSize: 28, fontWeight: 900, color: '#1A1A1A', margin: 0, letterSpacing: '-0.5px', lineHeight: 1 }}>
          {done.toLocaleString()} <span style={{ fontSize: 16, color: '#9CA3AF', fontWeight: 600 }}>/ {total.toLocaleString()}</span>
        </p>
      </div>

      <div style={{ width: '100%', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>Assigning Campaign</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: RED }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 6, background: '#F3F4F6', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 6,
            background: `linear-gradient(90deg, ${RED}, #FF4D4D)`,
            width: `${progress}%`, transition: 'width 400ms ease',
            backgroundSize: '200% auto', animation: 'gradientSlide 1.5s linear infinite',
          }} />
        </div>
        {etaSecs !== null && (
          <p style={{ fontSize: 10, color: '#9CA3AF', margin: '5px 0 0', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
            <Clock size={10} /> ~{etaSecs}s remaining
          </p>
        )}
      </div>
    </>
  );
}

// ─── Success view ─────────────────────────────────────────────────────────────

function SuccessView({ count, campaignName, actor, onClose }: {
  count: number; campaignName: string; actor: string; onClose: () => void;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 40); return () => clearTimeout(t); }, []);
  const assignedTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={{
      width: '100%', opacity: show ? 1 : 0,
      transform: show ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
      transition: 'opacity 350ms ease, transform 350ms cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
        background: '#F0FDF4', border: '1px solid #BBF7D0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: show ? 'shieldPop 0.4s 0.1s cubic-bezier(0.34,1.56,0.64,1) both' : 'none',
      }}>
        <CheckCircle2 size={32} color="#16A34A" strokeWidth={2} />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 17, fontWeight: 900, color: '#1A1A1A', margin: '0 0 5px', letterSpacing: '-0.3px' }}>
          Campaign assigned successfully
        </h3>
        <p style={{ fontSize: 12, color: '#6B7280', margin: 0, fontWeight: 500 }}>
          {count.toLocaleString()} QR code{count === 1 ? '' : 's'} updated.
        </p>
      </div>

      <div style={{ width: '100%', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        {[
          { icon: <Megaphone size={12} />, label: 'Campaign',   value: campaignName },
          { icon: <QrCodeIcon size={12} />, label: 'QR Codes',  value: `${count.toLocaleString()} updated` },
          { icon: <ShieldCheck size={12} />, label: 'Assigned By', value: actor },
          { icon: <Clock size={12} />, label: 'Time',           value: assignedTime },
        ].map((row, i, arr) => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
            <span style={{ color: RED, flexShrink: 0, marginTop: 1 }}>{row.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', minWidth: 100, flexShrink: 0 }}>{row.label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A', flex: 1, wordBreak: 'break-word' }}>{row.value}</span>
          </div>
        ))}
      </div>

      <button onClick={onClose} style={{
        width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
        background: `linear-gradient(135deg, ${RED}, #B51218)`, color: '#fff',
        fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: `0 4px 16px ${RED}35`,
      }}>
        Done
      </button>
    </div>
  );
}

// ─── Select phase ─────────────────────────────────────────────────────────────

function SelectView({
  campaigns, loadingCampaigns, selectedId, onSelect, count, duplicateWarning, error, onCancel, onAssign,
}: {
  campaigns: RewardCampaign[]; loadingCampaigns: boolean; selectedId: string; onSelect: (id: string) => void;
  count: number; duplicateWarning: string | null; error: string | null;
  onCancel: () => void; onAssign: () => void;
}) {
  const selected = campaigns.find(c => c.id === selectedId) ?? null;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${RED}12`, border: `1px solid ${RED}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RED, flexShrink: 0 }}>
          <Megaphone size={19} strokeWidth={2} />
        </div>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: '#1A1A1A', margin: 0 }}>Assign Campaign</h3>
          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0', fontWeight: 600 }}>
            {count.toLocaleString()} QR Code{count === 1 ? '' : 's'} Selected
          </p>
        </div>
      </div>

      <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, display: 'block' }}>Campaign</label>
      {loadingCampaigns ? (
        <div style={{ height: 40, borderRadius: 10, background: '#F3F4F6', marginBottom: 14 }} />
      ) : campaigns.length === 0 ? (
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 14px', padding: '10px 12px', background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
          No campaigns found in Firestore. Create one in <code style={{ fontFamily: 'monospace' }}>rewardCampaigns</code> to assign it here.
        </p>
      ) : (
        <select
          value={selectedId}
          onChange={e => onSelect(e.target.value)}
          style={{ width: '100%', padding: '10px 13px', borderRadius: 10, fontSize: 13, background: '#F9FAFB', border: '1.5px solid #E5E7EB', color: '#1A1A1A', outline: 'none', boxSizing: 'border-box', marginBottom: 14, cursor: 'pointer' }}
        >
          <option value="">Select a campaign…</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.active ? 'Active' : 'Inactive'} · {fmtDate(c.startAt)}–{fmtDate(c.endAt)}
            </option>
          ))}
        </select>
      )}

      {selected && (
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: '0 0 8px' }}>{selected.icon} {selected.name}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Calendar size={12} color="#9CA3AF" />
              <span style={{ fontSize: 11, color: '#374151' }}>{fmtDate(selected.startAt)} – {fmtDate(selected.endAt)} ({selected.durationDays} days)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <Target size={12} color="#9CA3AF" style={{ marginTop: 2 }} />
              <span style={{ fontSize: 11, color: '#374151' }}>
                {selected.objectives.length === 0 ? 'No objectives set' : selected.objectives.map(objectiveLabel).join(', ')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <QrCodeIcon size={12} color="#9CA3AF" />
              <span style={{ fontSize: 11, color: '#374151' }}>{count.toLocaleString()} QR code{count === 1 ? '' : 's'} will be assigned</span>
            </div>
          </div>
        </div>
      )}

      {duplicateWarning && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color="#D97706" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 11, color: '#92400E', margin: 0, fontWeight: 600 }}>{duplicateWarning}</p>
        </div>
      )}
      {error && (
        <p style={{ color: '#DC2626', fontSize: 12, margin: '0 0 14px', fontWeight: 600, background: '#FEF2F2', padding: '8px 12px', borderRadius: 8 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          onClick={onAssign}
          disabled={!selectedId}
          style={{
            flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
            background: selectedId ? `linear-gradient(135deg,${RED},#B51218)` : '#E5E7EB',
            color: '#fff', fontSize: 12, fontWeight: 800, cursor: selectedId ? 'pointer' : 'not-allowed',
            boxShadow: selectedId ? `0 3px 12px ${RED}30` : 'none',
          }}
        >
          Assign Campaign
        </button>
      </div>
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

type Phase = 'select' | 'progress' | 'success';

interface Props {
  selectedIds: string[];
  selectedCodes: QRCodeRecord[];
  actor: string;
  onClose: () => void;
  onComplete: () => void;
}

export default function AssignCampaignModal({ selectedIds, selectedCodes, actor, onClose, onComplete }: Props) {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>('select');
  const [campaigns, setCampaigns] = useState<RewardCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);

  const startTimeRef = useRef<number>(Date.now());
  const firstDoneRef = useRef<number | null>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    fetchAllCampaigns().then(setCampaigns).catch(() => setCampaigns([])).finally(() => setLoadingCampaigns(false));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    if (done > 0 && firstDoneRef.current === null) firstDoneRef.current = Date.now();
  }, [done]);

  const etaSecs = (() => {
    if (done === 0 || done >= total || !firstDoneRef.current) return null;
    const elapsed = (Date.now() - firstDoneRef.current) / 1000;
    const rate = done / elapsed;
    if (rate <= 0) return null;
    return Math.ceil((total - done) / rate);
  })();

  const handleAssign = async () => {
    const campaign = campaigns.find(c => c.id === selectedId);
    if (!campaign) return;

    // Skip QR codes that already have this exact campaign assigned.
    const eligibleIds = selectedCodes.filter(qr => qr.campaignId !== campaign.id).map(qr => qr.id);
    if (eligibleIds.length === 0) {
      setDuplicateWarning('This campaign is already assigned to all selected QR codes.');
      return;
    }
    setDuplicateWarning(null);
    setError(null);

    setDone(0);
    setTotal(eligibleIds.length);
    startTimeRef.current = Date.now();
    firstDoneRef.current = null;
    setPhase('progress');

    try {
      const count = await bulkAssignCampaign(eligibleIds, campaign.id, campaign.name, actor, (d, t) => {
        setDone(d); setTotal(t);
      });
      await writeOpLog('campaign_assigned', 'mixed', count, actor, {
        qrIds: eligibleIds, campaignId: campaign.id, campaignName: campaign.name,
        reason: `${campaign.name} assigned to ${count} QR code${count === 1 ? '' : 's'}`,
      });
      setDone(count);
      setPhase('success');
      onComplete();
    } catch (e: any) {
      setPhase('select');
      setError(e?.message ?? 'Campaign assignment failed.');
    }
  };

  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const selectedCampaign = campaigns.find(c => c.id === selectedId);

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10,10,14,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      opacity: visible ? 1 : 0, transition: 'opacity 300ms ease', padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget && phase === 'select') onClose(); }}>
      <div style={{
        width: '100%', maxWidth: 460, background: '#FFFFFF', borderRadius: 24,
        boxShadow: '0 40px 100px rgba(0,0,0,0.35), 0 0 0 1px rgba(215,25,32,0.12)',
        padding: '28px 26px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center',
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(20px)',
        transition: 'transform 350ms cubic-bezier(0.34,1.56,0.64,1)',
        position: 'relative', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: phase === 'success' ? `linear-gradient(90deg, #22C55E, ${RED})` : `linear-gradient(90deg, ${RED}, #FF4D4D, ${RED})`,
          backgroundSize: '200% auto', animation: phase === 'progress' ? 'gradientSlide 1.8s linear infinite' : 'none',
        }} />

        {phase === 'select' && (
          <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
        )}

        {phase === 'select' && (
          <SelectView
            campaigns={campaigns}
            loadingCampaigns={loadingCampaigns}
            selectedId={selectedId}
            onSelect={id => { setSelectedId(id); setDuplicateWarning(null); }}
            count={selectedIds.length}
            duplicateWarning={duplicateWarning}
            error={error}
            onCancel={onClose}
            onAssign={handleAssign}
          />
        )}
        {phase === 'progress' && <LoadingView progress={progress} done={done} total={total} etaSecs={etaSecs} />}
        {phase === 'success' && (
          <SuccessView count={done} campaignName={selectedCampaign?.name ?? 'Campaign'} actor={actor} onClose={onClose} />
        )}
      </div>

      <style>{`
        @keyframes gradientSlide { to { background-position: 200% center; } }
        @keyframes glowPulse     { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:1; transform:scale(1.06); } }
        @keyframes shieldPop     { 0% { transform:scale(0) rotate(-20deg); opacity:0; } 100% { transform:scale(1) rotate(0deg); opacity:1; } }
      `}</style>
    </div>,
    document.body,
  );
}
