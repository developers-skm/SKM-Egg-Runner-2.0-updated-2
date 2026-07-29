import React, { useEffect, useState, useMemo } from 'react';
import {
  Layers3, AlertTriangle, Package, Printer, Download, Archive, PlayCircle,
  ExternalLink, Grid3x3, List,
} from 'lucide-react';
import {
  fetchBatchSummaries, fetchAllQRCodes, bulkSetActiveByBatchId,
  exportCSV, writeOpLog, computeSmartWarnings,
} from '../../services/qr/qrManagementService';
import type { QRBatchSummary, QRCodeRecord } from '../../types/qr/qrManagementTypes';
import QRHeatMap from './shared/QRHeatMap';
import QRSmartWarnings from './QRSmartWarnings';
import EmptyState from './shared/EmptyState';

const RED   = '#D71920';
const SAFE  = '#16A34A';
const WARN  = '#F97316';
const DANGER = '#DC2626';

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusStyle(status: QRBatchSummary['status']): React.CSSProperties {
  if (status === 'active')   return { background: '#F0FDF4', color: SAFE,   border: '1px solid #BBF7D0' };
  if (status === 'disabled') return { background: '#FEF2F2', color: DANGER, border: '1px solid #FECACA' };
  return                            { background: '#FFFBEB', color: WARN,   border: '1px solid #FDE68A' };
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, borderRadius: 4, background: '#F3F4F6', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 4, transition: 'width 500ms ease-out' }} />
    </div>
  );
}

interface CardProps {
  batch: QRBatchSummary;
  onOpen: () => void;
  onArchiveToggle: () => void;
  onExport: () => void;
  onPrint: () => void;
  busy: boolean;
}

function BatchCard({ batch: b, onOpen, onArchiveToggle, onExport, onPrint, busy }: CardProps) {
  const status = statusStyle(b.status);
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 14,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {b.batchName}
          </p>
          <p style={{ fontSize: 10, color: '#9CA3AF', margin: '2px 0 0' }}>{fmtDate(b.createdAt)} · {b.prefix}</p>
        </div>
        <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', ...status }}>
          {b.status}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A' }}>{b.qrCount}</div>
          <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase' }}>QR Count</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A' }}>{b.activeCount}</div>
          <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase' }}>Active</div>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' }}>Completion</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#374151' }}>{b.completionPct}%</span>
        </div>
        <ProgressBar pct={b.completionPct} color={RED} />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' }}>Usage</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#374151' }}>{b.usagePct}%</span>
        </div>
        <ProgressBar pct={b.usagePct} color="#0891B2" />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        <button onClick={onOpen} style={btnStyle('#F3F4F6', '#374151')}><ExternalLink size={12} /> Open</button>
        <button onClick={onPrint} style={btnStyle('#F3F4F6', '#374151')}><Printer size={12} /> Print</button>
        <button onClick={onExport} style={btnStyle('#F3F4F6', '#374151')}><Download size={12} /> Export</button>
        <button onClick={onArchiveToggle} disabled={busy} style={btnStyle(b.status === 'disabled' ? '#F0FDF4' : '#FEF2F2', b.status === 'disabled' ? SAFE : DANGER)}>
          {b.status === 'disabled' ? <PlayCircle size={12} /> : <Archive size={12} />}
          {b.status === 'disabled' ? 'Unarchive' : 'Archive'}
        </button>
      </div>
    </div>
  );
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8,
    fontSize: 10, fontWeight: 700, border: 'none', background: bg, color, cursor: 'pointer',
  };
}

interface Props {
  actor: string;
  onNavigate?: (tab: string) => void;
  onOpenBatch?: (batchId: string) => void;
}

export default function QRBatchCards({ actor, onNavigate, onOpenBatch }: Props) {
  const [batches, setBatches] = useState<QRBatchSummary[]>([]);
  const warnings = useMemo(() => computeSmartWarnings(batches), [batches]);
  const [allCodes, setAllCodes] = useState<QRCodeRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null);
  const [view, setView] = useState<'cards' | 'heatmap'>('cards');

  const load = () => {
    setLoading(true); setError(null);
    Promise.all([fetchBatchSummaries(), fetchAllQRCodes()])
      .then(([b, codes]) => { setBatches(b); setAllCodes(codes); })
      .catch(err => setError(err?.message ?? 'Failed to load batches'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleArchiveToggle = async (b: QRBatchSummary) => {
    setBusyBatchId(b.batchId);
    try {
      const nextActive = b.status === 'disabled';
      const count = await bulkSetActiveByBatchId(b.batchId, nextActive);
      await writeOpLog(nextActive ? 'unarchive' : 'archive', b.type, count, actor, { batchName: b.batchName });
      load();
    } catch (err: any) {
      setError(err?.message ?? 'Archive action failed');
    } finally {
      setBusyBatchId(null);
    }
  };

  const handleExport = (b: QRBatchSummary) => {
    const codes = allCodes.filter(c => (c as any).batchId === b.batchId || c.batch === b.batchName);
    exportCSV(codes);
    writeOpLog('export', b.type, codes.length, actor, { batchName: b.batchName }).catch(() => {});
  };

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>Batch Management</h2>
          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0', fontWeight: 500 }}>
            {batches.length} batch{batches.length === 1 ? '' : 'es'} · aggregated live from QR records
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setView('cards')} style={{ ...btnStyle(view === 'cards' ? RED : '#F3F4F6', view === 'cards' ? '#fff' : '#374151'), padding: '7px 12px' }}>
            <Grid3x3 size={12} /> Cards
          </button>
          <button onClick={() => setView('heatmap')} style={{ ...btnStyle(view === 'heatmap' ? RED : '#F3F4F6', view === 'heatmap' ? '#fff' : '#374151'), padding: '7px 12px' }}>
            <List size={12} /> Heat Map
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={15} color={DANGER} />
          <p style={{ color: DANGER, fontSize: 12, fontWeight: 700, margin: 0 }}>{error}</p>
        </div>
      )}

      {!loading && <QRSmartWarnings warnings={warnings} onSelectBatch={onOpenBatch} />}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 200, borderRadius: 14, background: 'linear-gradient(90deg,#F3F4F6 25%,#E9EAEC 50%,#F3F4F6 75%)', backgroundSize: '200% 100%', animation: 'batchSlide 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon={<Package size={24} strokeWidth={1.6} />}
          title="No batches yet"
          message="Generate QR codes to see batch cards here."
          actionLabel="Generate QR Codes"
          onAction={() => onNavigate?.('generator')}
        />
      ) : view === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
          {batches.map(b => (
            <BatchCard
              key={b.batchId}
              batch={b}
              busy={busyBatchId === b.batchId}
              onOpen={() => onOpenBatch?.(b.batchId)}
              onPrint={() => onNavigate?.('print')}
              onExport={() => handleExport(b)}
              onArchiveToggle={() => handleArchiveToggle(b)}
            />
          ))}
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 14, padding: 16 }}>
          <QRHeatMap batches={batches} onSelect={onOpenBatch} />
        </div>
      )}

      <style>{`@keyframes batchSlide { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }`}</style>
    </section>
  );
}
