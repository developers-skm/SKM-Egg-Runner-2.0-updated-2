import React, { useState, useCallback, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Search, Eye, Download, Printer, Copy, PauseCircle, PlayCircle,
  X, CheckCircle2, QrCode as QrCodeIcon, RefreshCw, ChevronLeft, ChevronRight,
  Filter, Archive, Trash2, FolderInput, Tag, Gift, Bookmark, BookmarkPlus, X as XIcon,
  Rows3, Rows2, Rows4, Columns3,
} from 'lucide-react';
import type { QRCodeRecord, SavedQRFilter } from '../../types/qr/qrManagementTypes';
import {
  fetchAllQRCodes, setQRActive, syncGameUrlFromFirestore,
  bulkSetActiveByIds, bulkDeleteByIds, bulkMoveToBatch, exportCSV, writeOpLog,
  getSavedFilters, saveFilter, deleteFilter,
} from '../../services/qr/qrManagementService';
import EmptyState from './shared/EmptyState';

const RED = '#D71920';

// ─── URL helper ───────────────────────────────────────────────────────────────

async function resolveQRUrl(qr: any): Promise<string> {
  if (qr.url) return qr.url as string;
  const base = await syncGameUrlFromFirestore();
  return `${base}/?qr=${qr.code}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusMeta(qr: QRCodeRecord) {
  if (!qr.active)                  return { label: 'Disabled',  bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' };
  if (qr.playCount >= qr.maxPlays) return { label: 'Exhausted', bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' };
  return                                  { label: 'Active',    bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' };
}

function typeMeta(type: string) {
  const l = type.toLowerCase();
  if (l === 'golden')    return { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' };
  if (l === 'developer') return { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
  if (l === 'campaign')  return { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' };
  return                        { bg: '#F3F4F6', color: '#374151', border: '#E5E7EB' };
}

function fmtDate(d?: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function generateQRDataUrl(qr: any): Promise<string> {
  const url = await resolveQRUrl(qr);
  return QRCode.toDataURL(url, {
    width: 300, margin: 2,
    color: { dark: '#1a0000', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  });
}

function downloadBlob(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[44, 70, 60, 80, 60, 50, 40, 40, 60].map((w, i) => (
        <td key={i} style={{ padding: '11px 12px' }}>
          <div style={{
            height: 12, borderRadius: 6, width: `${w}%`,
            background: 'linear-gradient(90deg,#F3F4F6 25%,#E9EAEC 50%,#F3F4F6 75%)',
            backgroundSize: '200% 100%',
            animation: 'skeletonSlide 1.4s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Summary stat bar ─────────────────────────────────────────────────────────

function SummaryBar({ codes }: { codes: QRCodeRecord[] }) {
  const total     = codes.length;
  const regular   = codes.filter(q => q.type.toLowerCase() === 'regular').length;
  const golden    = codes.filter(q => q.type.toLowerCase() === 'golden').length;
  const available = codes.filter(q => q.active && q.playCount < q.maxPlays).length;
  const used      = codes.filter(q => q.playCount > 0 && q.active && q.playCount < q.maxPlays).length;
  const exhausted = codes.filter(q => q.active && q.playCount >= q.maxPlays).length;
  const disabled  = codes.filter(q => !q.active).length;

  const items = [
    { label: 'Total',     value: total,     color: '#6366F1' },
    { label: 'Regular',   value: regular,   color: '#374151' },
    { label: 'Golden',    value: golden,    color: '#D97706' },
    { label: 'Available', value: available, color: '#16A34A' },
    { label: 'In Use',    value: used,      color: '#2563EB' },
    { label: 'Exhausted', value: exhausted, color: '#F97316' },
    { label: 'Disabled',  value: disabled,  color: '#DC2626' },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{
          flex: '1 1 80px', minWidth: 0,
          background: '#FFFFFF', border: '1px solid #E5E7EB',
          borderRadius: 10, padding: '9px 12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <p style={{ fontSize: 18, fontWeight: 900, color, margin: 0, lineHeight: 1 }}>{value}</p>
          <p style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', margin: '3px 0 0', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Icon button ──────────────────────────────────────────────────────────────

function IconBtn({ icon, tooltip, onClick, danger, success, disabled }: {
  icon: React.ReactNode; tooltip: string; onClick: () => void;
  danger?: boolean; success?: boolean; disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const color   = danger ? '#DC2626' : success ? '#16A34A' : '#6B7280';
  const hoverBg = danger ? '#FEF2F2' : success ? '#F0FDF4' : '#F3F4F6';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={onClick} disabled={disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={tooltip}
        style={{
          width: 30, height: 30, borderRadius: 7, border: 'none',
          background: hover ? hoverBg : 'transparent',
          color: disabled ? '#D1D5DB' : color,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 120ms', flexShrink: 0,
        }}
      >{icon}</button>
      {hover && !disabled && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: '#1A1A1A', color: '#fff', fontSize: 10, fontWeight: 600,
          padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 100,
        }}>{tooltip}</div>
      )}
    </div>
  );
}

// ─── QR Preview Modal ─────────────────────────────────────────────────────────

function QRPreviewModal({ qr, dataUrl, onClose, onToggle, toggling }: {
  qr: QRCodeRecord; dataUrl: string; onClose: () => void;
  onToggle: (code: string, active: boolean) => void; toggling: string | null;
}) {
  const [copied,   setCopied]   = useState(false);
  const [printing, setPrinting] = useState(false);
  const sm = statusMeta(qr);
  const tm = typeMeta(qr.type);

  const handleCopy     = () => { navigator.clipboard.writeText(qr.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  const handleDownload = () => downloadBlob(dataUrl, `${qr.code}.png`);
  const handlePrint    = () => {
    setPrinting(true);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${qr.code}</title>
      <style>@page{size:A5;margin:14mm}body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0}
      .card{border:1.5px solid #eee;border-radius:14px;padding:20px;text-align:center;max-width:240px}
      .code{font-size:14px;font-weight:900;font-family:monospace;color:#111;margin:10px 0 4px}
      .badge{font-size:9px;font-weight:800;text-transform:uppercase;padding:3px 10px;border-radius:20px;background:rgba(215,25,32,0.07);color:#D71920;display:inline-block}
      .meta{font-size:9px;color:#bbb;margin-top:6px}</style></head><body>
      <div class="card"><img src="${dataUrl}" width="200" height="200" style="display:block;margin:0 auto;border-radius:8px"/>
      <div class="code">${qr.code}</div><div class="badge">${qr.type}</div>
      <div class="meta">${fmtDate(qr.createdAt)}</div></div>
      <script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`;
    const win = window.open('', '_blank', 'width=400,height=500');
    if (win) { win.document.write(html); win.document.close(); }
    setTimeout(() => setPrinting(false), 1000);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#FFFFFF', borderRadius: 22, width: '100%', maxWidth: 680, boxShadow: '0 24px 60px rgba(0,0,0,0.2)', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: `${RED}10`, border: `1px solid ${RED}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RED }}>
              <QrCodeIcon size={15} strokeWidth={2} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>QR Preview</p>
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0, fontFamily: 'monospace' }}>{qr.code}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 320 }}>
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#FAFAFA' }}>
            <div style={{ border: '1.5px solid #E5E7EB', borderRadius: 16, padding: 14, background: '#FFFFFF', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
              <img src={dataUrl} alt={qr.code} style={{ width: 160, height: 160, display: 'block', borderRadius: 6 }} />
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '18px 20px', gap: 14, minWidth: 0 }}>
            <div style={{ background: '#F9FAFB', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', flex: 1 }}>
              {[
                { label: 'QR Code', value: qr.code,                                                     mono: true },
                { label: 'Type',    value: qr.type,                                                     badge: tm  },
                { label: 'Status',  value: sm.label,                                                    badge: sm  },
                { label: 'Batch',   value: qr.batch || '—',                                             mono: true },
                { label: 'Usage',   value: `${qr.playCount} / ${qr.maxPlays >= 999999 ? '∞' : qr.maxPlays} scans`  },
                { label: 'Created', value: fmtDate(qr.createdAt)                                                     },
                { label: 'Last Scan', value: fmtDate(qr.lastScannedAt)                                               },
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: i < arr.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, flexShrink: 0 }}>{row.label}</span>
                  {row.badge
                    ? <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, padding: '2px 8px', borderRadius: 20, background: row.badge.bg, color: row.badge.color, border: `1px solid ${row.badge.border}` }}>{row.value}</span>
                    : <span style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A', fontFamily: row.mono ? 'monospace' : undefined, textAlign: 'right', wordBreak: 'break-all' }}>{row.value}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button onClick={handleDownload} style={{ background: `linear-gradient(135deg,${RED},#B51218)`, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: `0 3px 12px ${RED}30` }}>
                <Download size={14} strokeWidth={2} /> Download PNG
              </button>
              <div style={{ display: 'flex', gap: 7 }}>
                <button onClick={handlePrint} disabled={printing} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Printer size={13} strokeWidth={2} /> {printing ? 'Printing…' : 'Print'}
                </button>
                <button onClick={handleCopy} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1px solid ${copied ? '#BBF7D0' : '#E5E7EB'}`, background: copied ? '#F0FDF4' : '#F9FAFB', color: copied ? '#16A34A' : '#374151', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 200ms' }}>
                  {copied ? <CheckCircle2 size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={2} />} {copied ? 'Copied!' : 'Copy ID'}
                </button>
              </div>
              <button onClick={() => { onToggle(qr.code, qr.active); onClose(); }} disabled={toggling === qr.code} style={{ padding: '9px 0', borderRadius: 10, border: `1px solid ${qr.active ? '#FECACA' : '#BBF7D0'}`, background: qr.active ? '#FEF2F2' : '#F0FDF4', color: qr.active ? '#DC2626' : '#16A34A', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                {qr.active ? <><PauseCircle size={13} strokeWidth={2} /> Disable QR</> : <><PlayCircle size={13} strokeWidth={2} /> Enable QR</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status / Type badges ─────────────────────────────────────────────────────

function StatusBadge({ qr }: { qr: QRCodeRecord }) {
  const m = statusMeta(qr);
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: m.bg, color: m.color, fontWeight: 700, border: `1px solid ${m.border}`, whiteSpace: 'nowrap' }}>{m.label}</span>;
}

function TypeBadge({ type }: { type: string }) {
  const m = typeMeta(type);
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: m.bg, color: m.color, fontWeight: 700, border: `1px solid ${m.border}`, whiteSpace: 'nowrap' }}>{type}</span>;
}

// ─── Floating Bulk Action Toolbar (§6) ───────────────────────────────────────
// Campaign/Reward "assignment" has no field to persist to (schema is frozen —
// no campaignId/rewardId on qrCodes docs). Those two actions only write a
// qrOperationLogs entry as a reference note for the admin to act on elsewhere.

interface BulkToolbarProps {
  count: number;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onPrint: () => void;
  onExport: () => void;
  onMoveBatch: () => void;
  onAssignCampaign: () => void;
  onAssignReward: () => void;
  onClear: () => void;
}

function BulkToolbarBtn({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 8,
        fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap',
        background: hover ? (danger ? '#FEF2F2' : 'rgba(255,255,255,0.12)') : 'transparent',
        color: danger ? '#FCA5A5' : '#fff',
      }}
    >{icon}{label}</button>
  );
}

function BulkToolbar({
  count, busy, onEnable, onDisable, onArchive, onDelete, onPrint, onExport,
  onMoveBatch, onAssignCampaign, onAssignReward, onClear,
}: BulkToolbarProps) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 30,
      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      background: '#1A1A1A', borderRadius: 12, padding: '8px 12px', marginBottom: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)', opacity: busy ? 0.6 : 1,
      pointerEvents: busy ? 'none' : 'auto',
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', padding: '0 8px 0 2px', whiteSpace: 'nowrap' }}>
        {count} selected
      </span>
      <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />
      <BulkToolbarBtn icon={<PlayCircle size={13} />}   label="Enable"   onClick={onEnable} />
      <BulkToolbarBtn icon={<PauseCircle size={13} />}  label="Disable"  onClick={onDisable} />
      <BulkToolbarBtn icon={<Archive size={13} />}      label="Archive"  onClick={onArchive} />
      <BulkToolbarBtn icon={<Printer size={13} />}      label="Print"    onClick={onPrint} />
      <BulkToolbarBtn icon={<Download size={13} />}     label="Export"   onClick={onExport} />
      <BulkToolbarBtn icon={<FolderInput size={13} />}  label="Move Batch" onClick={onMoveBatch} />
      <BulkToolbarBtn icon={<Tag size={13} />}          label="Assign Campaign" onClick={onAssignCampaign} />
      <BulkToolbarBtn icon={<Gift size={13} />}         label="Assign Reward"   onClick={onAssignReward} />
      <BulkToolbarBtn icon={<Trash2 size={13} />}       label="Delete"   onClick={onDelete} danger />
      <div style={{ marginLeft: 'auto' }}>
        <button onClick={onClear} style={{ width: 24, height: 24, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Destructive bulk confirm ────────────────────────────────────────────────

function BulkConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 12, color: '#6B7280', margin: '8px 0 18px' }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Input style ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 9, fontSize: 12,
  background: '#F9FAFB', border: '1.5px solid #E5E7EB',
  color: '#1A1A1A', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'system-ui,-apple-system,sans-serif', transition: 'border-color 150ms',
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

// ─── Density mode + column visibility (§15, localStorage-persisted) ─────────

type Density = 'compact' | 'comfortable' | 'spacious';
const DENSITY_KEY = 'qr_search_density';
const DENSITY_PADDING: Record<Density, string> = {
  compact:     '5px 12px',
  comfortable: '10px 12px',
  spacious:    '15px 12px',
};

const ALL_COLUMNS = ['Type', 'Status', 'Batch', 'Max', 'Used', 'Remaining', 'Created', 'Last Scan'] as const;
type ColumnName = typeof ALL_COLUMNS[number];
const COLUMNS_KEY = 'qr_search_visible_columns';

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { actor?: string; onNavigate?: (tab: string) => void; }

export default function QRSearch({ actor = 'Admin', onNavigate }: Props) {
  // Master list — loaded once from Firestore on mount
  const [allCodes,   setAllCodes]   = useState<QRCodeRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState<string | null>(null);

  // Filter state — applied client-side against allCodes
  const [searchText,  setSearchText]  = useState('');
  const [statusFilter,setStatusFilter]= useState<'' | 'active' | 'disabled' | 'exhausted'>('');
  const [typeFilter,  setTypeFilter]  = useState('');

  // Pagination
  const [pageSize,    setPageSize]    = useState(100);
  const [page,        setPage]        = useState(0);

  // Row actions
  const [toggling,    setToggling]    = useState<string | null>(null);
  const [preview,     setPreview]     = useState<{ qr: QRCodeRecord; dataUrl: string } | null>(null);
  const [loadingQr,   setLoadingQr]   = useState<string | null>(null);

  // Row selection (§6 bulk operations toolbar)
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [bulkBusy,   setBulkBusy]   = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Saved filters (§9) — localStorage-backed, no Firestore
  const [savedFilters, setSavedFilters] = useState<SavedQRFilter[]>(() => getSavedFilters());
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState('');

  // Density mode + column visibility (§15)
  const [density, setDensity] = useState<Density>(() => {
    try { return (localStorage.getItem(DENSITY_KEY) as Density) || 'comfortable'; } catch { return 'comfortable'; }
  });
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnName>>(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set(ALL_COLUMNS);
    } catch { return new Set(ALL_COLUMNS); }
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  useEffect(() => { try { localStorage.setItem(DENSITY_KEY, density); } catch { /* ignore */ } }, [density]);
  useEffect(() => { try { localStorage.setItem(COLUMNS_KEY, JSON.stringify([...visibleColumns])); } catch { /* ignore */ } }, [visibleColumns]);

  const toggleColumn = (col: ColumnName) => {
    setVisibleColumns(s => {
      const next = new Set(s);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  };
  const cellPad = DENSITY_PADDING[density];

  // ── Load all codes on mount ───────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const codes = await fetchAllQRCodes(); // already sorted createdAt desc
      setAllCodes(codes);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load QR codes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Client-side filtering (instant, no Firestore round-trip) ─────────────
  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return allCodes.filter(qr => {
      // Text search across code, batch, type
      if (q) {
        const hay = `${qr.code} ${qr.batch} ${qr.type} ${qr.prefix}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Status filter
      if (statusFilter) {
        if (statusFilter === 'active'    && !(qr.active && qr.playCount < qr.maxPlays))  return false;
        if (statusFilter === 'disabled'  && qr.active)                                   return false;
        if (statusFilter === 'exhausted' && !(qr.active && qr.playCount >= qr.maxPlays)) return false;
      }
      // Type filter
      if (typeFilter && qr.type.toLowerCase() !== typeFilter.toLowerCase()) return false;
      return true;
    });
  }, [allCodes, searchText, statusFilter, typeFilter]);

  // Reset to page 0 whenever filter changes
  useEffect(() => { setPage(0); }, [searchText, statusFilter, typeFilter, pageSize]);
  useEffect(() => { setSelected(new Set()); }, [searchText, statusFilter, typeFilter]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated   = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const hasFilters  = searchText !== '' || statusFilter !== '' || typeFilter !== '';

  const clearFilters = () => { setSearchText(''); setStatusFilter(''); setTypeFilter(''); };

  // ── Saved filters ─────────────────────────────────────────────────────────
  const handleApplyPreset = (preset: SavedQRFilter) => {
    setSearchText(preset.filters.qrId ?? '');
    setStatusFilter((preset.filters.status ?? '') as any);
    setTypeFilter(preset.filters.type ?? '');
  };
  const handleSaveCurrentFilter = () => {
    const name = saveNameInput.trim();
    if (!name) return;
    const updated = saveFilter(name, { qrId: searchText, batch: '', status: statusFilter, type: typeFilter as any });
    setSavedFilters(updated);
    setSaveNameInput('');
    setShowSaveInput(false);
  };
  const handleDeletePreset = (id: string) => setSavedFilters(deleteFilter(id));

  // ── Bulk selection ────────────────────────────────────────────────────────
  const toggleRow = (id: string) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllOnPage = () => {
    setSelected(s => {
      const next = new Set(s);
      const allSelected = paginated.every(qr => next.has(qr.id));
      paginated.forEach(qr => allSelected ? next.delete(qr.id) : next.add(qr.id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());
  const selectedCodes = useMemo(() => allCodes.filter(c => selected.has(c.id)), [allCodes, selected]);

  const runBulk = async (label: string, fn: () => Promise<number>) => {
    setBulkBusy(true);
    try {
      const n = await fn();
      await writeOpLog(label, 'mixed', n, actor, { qrIds: [...selected] });
      await loadAll();
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkEnable  = () => runBulk('enable',  () => bulkSetActiveByIds([...selected], true));
  const handleBulkDisable = () => runBulk('disable', () => bulkSetActiveByIds([...selected], false));
  const handleBulkArchive = () => runBulk('archive', () => bulkSetActiveByIds([...selected], false));
  const handleBulkDelete  = () => runBulk('delete',  () => bulkDeleteByIds([...selected]));
  const handleBulkExport  = () => {
    exportCSV(selectedCodes);
    writeOpLog('export', 'mixed', selectedCodes.length, actor, { qrIds: [...selected] }).catch(() => {});
  };
  const handleBulkPrint = () => {
    // Hands off to the Print Center tab, which already builds real print sheets — avoids duplicating that logic here.
    writeOpLog('print_requested', 'mixed', selectedCodes.length, actor, { qrIds: [...selected] }).catch(() => {});
    onNavigate?.('print');
  };
  // Campaign/Reward assignment: no field to persist to (schema frozen) — logged for reference only.
  const handleBulkAssignCampaign = () => {
    writeOpLog('campaign_assign_requested', 'mixed', selectedCodes.length, actor, {
      qrIds: [...selected], reason: 'Logged for reference — no campaign system integration yet',
    }).catch(() => {});
  };
  const handleBulkAssignReward = () => {
    writeOpLog('reward_assign_requested', 'mixed', selectedCodes.length, actor, {
      qrIds: [...selected], reason: 'Logged for reference — no reward system integration yet',
    }).catch(() => {});
  };
  const handleBulkMoveBatch = () => {
    const newBatch = window.prompt('Move selected QR codes to batch (name):');
    if (!newBatch) return;
    const newBatchId = `BATCH-${Date.now()}`;
    runBulk('batch_move', () => bulkMoveToBatch([...selected], newBatch.trim(), newBatchId));
  };

  // ── Row actions ───────────────────────────────────────────────────────────
  const handleToggle = async (code: string, currentActive: boolean) => {
    setToggling(code);
    try {
      await setQRActive(code, !currentActive);
      setAllCodes(r => r.map(q => q.code === code ? { ...q, active: !currentActive } : q));
    } finally { setToggling(null); }
  };

  const handleView = useCallback(async (qr: QRCodeRecord) => {
    setLoadingQr(qr.code);
    try { setPreview({ qr, dataUrl: await generateQRDataUrl(qr) }); }
    finally { setLoadingQr(null); }
  }, []);

  const handleDownloadDirect = useCallback(async (qr: QRCodeRecord) => {
    setLoadingQr(qr.code);
    try { downloadBlob(await generateQRDataUrl(qr), `${qr.code}.png`); }
    finally { setLoadingQr(null); }
  }, []);

  const spin = <span style={{ width: 13, height: 13, border: '2px solid #D1D5DB', borderTopColor: RED, borderRadius: '50%', animation: 'srchspin 0.7s linear infinite', display: 'inline-block' }} />;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>QR Search</h2>
          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0', fontWeight: 500 }}>
            {loading ? 'Loading QR codes…' : `${allCodes.length} QR codes · ${filtered.length} shown`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Density mode */}
          <div style={{ display: 'flex', border: '1px solid #E5E7EB', borderRadius: 9, overflow: 'hidden' }}>
            {([
              { key: 'compact' as Density,     icon: <Rows4 size={13} /> },
              { key: 'comfortable' as Density, icon: <Rows3 size={13} /> },
              { key: 'spacious' as Density,    icon: <Rows2 size={13} /> },
            ]).map(d => (
              <button key={d.key} onClick={() => setDensity(d.key)} title={d.key} style={{
                padding: '7px 9px', border: 'none', cursor: 'pointer',
                background: density === d.key ? RED : '#F9FAFB',
                color: density === d.key ? '#fff' : '#6B7280',
              }}>{d.icon}</button>
            ))}
          </div>

          {/* Column visibility */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColumnPicker(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#374151', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              <Columns3 size={13} /> Columns
            </button>
            {showColumnPicker && (
              <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 40, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 150 }}>
                {ALL_COLUMNS.map(col => (
                  <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 6px', fontSize: 11, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                    <input type="checkbox" checked={visibleColumns.has(col)} onChange={() => toggleColumn(col)} />
                    {col}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={loadAll}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#374151', fontSize: 11, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'srchspin 0.9s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Bulk operations toolbar — appears when rows are selected */}
      {selected.size > 0 && (
        <BulkToolbar
          count={selected.size}
          busy={bulkBusy}
          onEnable={handleBulkEnable}
          onDisable={handleBulkDisable}
          onArchive={handleBulkArchive}
          onDelete={() => setConfirmBulkDelete(true)}
          onPrint={handleBulkPrint}
          onExport={handleBulkExport}
          onMoveBatch={handleBulkMoveBatch}
          onAssignCampaign={handleBulkAssignCampaign}
          onAssignReward={handleBulkAssignReward}
          onClear={clearSelection}
        />
      )}

      {/* Summary bar — updates as filters change */}
      {!loading && !loadError && <SummaryBar codes={filtered} />}

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

        {/* ── Filter bar ── */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>

          {/* Text search */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
            <input
              style={{ ...inputStyle, paddingLeft: 32, paddingRight: searchText ? 32 : 12, width: '100%' }}
              placeholder="Search by QR ID, Batch, Type…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onFocus={e => (e.target.style.borderColor = RED)}
              onBlur={e  => (e.target.style.borderColor = '#E5E7EB')}
            />
            {searchText && (
              <button onClick={() => setSearchText('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Status filter */}
          <select
            style={{ ...inputStyle, cursor: 'pointer', flex: '0 0 auto', minWidth: 130 }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            onFocus={e => (e.target.style.borderColor = RED)}
            onBlur={e  => (e.target.style.borderColor = '#E5E7EB')}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="exhausted">Exhausted</option>
          </select>

          {/* Type filter */}
          <select
            style={{ ...inputStyle, cursor: 'pointer', flex: '0 0 auto', minWidth: 120 }}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            onFocus={e => (e.target.style.borderColor = RED)}
            onBlur={e  => (e.target.style.borderColor = '#E5E7EB')}
          >
            <option value="">All Types</option>
            <option value="Regular">Regular</option>
            <option value="Golden">Golden</option>
            <option value="Campaign">Campaign</option>
            <option value="Developer">Developer</option>
          </select>

          {/* Rows per page */}
          <select
            style={{ ...inputStyle, cursor: 'pointer', flex: '0 0 auto', minWidth: 100 }}
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            onFocus={e => (e.target.style.borderColor = RED)}
            onBlur={e  => (e.target.style.borderColor = '#E5E7EB')}
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} rows</option>)}
          </select>

          {/* Save current filter */}
          {hasFilters && !showSaveInput && (
            <button onClick={() => setShowSaveInput(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 13px', borderRadius: 9, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <BookmarkPlus size={12} /> Save Filter
            </button>
          )}

          {/* Clear filters */}
          {hasFilters && (
            <button onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 13px', borderRadius: 9, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Filter size={12} /> Clear
            </button>
          )}
        </div>

        {/* Save filter name input */}
        {showSaveInput && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              autoFocus
              style={{ ...inputStyle, flex: '0 1 220px' }}
              placeholder="Filter name (e.g. Unused QR)"
              value={saveNameInput}
              onChange={e => setSaveNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveCurrentFilter(); if (e.key === 'Escape') setShowSaveInput(false); }}
            />
            <button onClick={handleSaveCurrentFilter} style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: RED, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setShowSaveInput(false)} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        )}

        {/* Saved filter chips */}
        {savedFilters.length > 0 && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Bookmark size={12} color="#9CA3AF" />
            {savedFilters.map(preset => (
              <span key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 4px 4px 10px', borderRadius: 20, background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
                <button onClick={() => handleApplyPreset(preset)} style={{ border: 'none', background: 'none', fontSize: 10, fontWeight: 700, color: '#374151', cursor: 'pointer', padding: 0 }}>
                  {preset.name}
                </button>
                <button onClick={() => handleDeletePreset(preset.id)} style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <XIcon size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── Table ── */}
        {loadError ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <p style={{ color: '#DC2626', fontSize: 13, fontWeight: 600, margin: 0 }}>{loadError}</p>
            <button onClick={loadAll} style={{ marginTop: 12, padding: '8px 18px', borderRadius: 9, border: '1px solid #E5E7EB', background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 640, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 5 }}>
                  <th style={{ padding: '10px 12px', width: 32, background: '#F9FAFB', position: 'sticky', left: 0, zIndex: 6 }}>
                    <input
                      type="checkbox"
                      checked={paginated.length > 0 && paginated.every(qr => selected.has(qr.id))}
                      onChange={toggleAllOnPage}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 9, whiteSpace: 'nowrap' }}>QR Code ID</th>
                  {ALL_COLUMNS.filter(c => visibleColumns.has(c)).map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 9, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                  <th style={{ padding: '10px 12px', textAlign: 'left', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 9, whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.size + 3}>
                      <EmptyState
                        icon={<QrCodeIcon size={24} strokeWidth={1.6} />}
                        title={hasFilters ? 'No QR codes match your filters' : 'No QR codes found'}
                        message={hasFilters ? 'Try adjusting or clearing your filters.' : 'Generate QR codes to see them here.'}
                        actionLabel={hasFilters ? 'Clear filters' : undefined}
                        onAction={hasFilters ? clearFilters : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  paginated.map((qr, i) => {
                    const remaining = qr.maxPlays >= 999999 ? null : Math.max(0, qr.maxPlays - qr.playCount);
                    return (
                      <tr
                        key={qr.id}
                        style={{ borderBottom: i < paginated.length - 1 ? '1px solid #F9FAFB' : 'none', transition: 'background 100ms' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFA')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: cellPad }}>
                          <input
                            type="checkbox"
                            checked={selected.has(qr.id)}
                            onChange={() => toggleRow(qr.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>

                        {/* QR Code ID */}
                        <td style={{ padding: cellPad }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1A1A1A', fontSize: 11 }}>{qr.code}</span>
                        </td>

                        {visibleColumns.has('Type') && <td style={{ padding: cellPad }}><TypeBadge type={qr.type} /></td>}
                        {visibleColumns.has('Status') && <td style={{ padding: cellPad }}><StatusBadge qr={qr} /></td>}

                        {visibleColumns.has('Batch') && (
                          <td style={{ padding: cellPad, color: '#6B7280', fontSize: 11, whiteSpace: 'nowrap' }}>
                            {qr.batch || '—'}
                          </td>
                        )}

                        {visibleColumns.has('Max') && (
                          <td style={{ padding: cellPad, color: '#374151', fontWeight: 700, textAlign: 'center' }}>
                            {qr.maxPlays >= 999999 ? '∞' : qr.maxPlays}
                          </td>
                        )}

                        {visibleColumns.has('Used') && (
                          <td style={{ padding: cellPad, textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, color: qr.playCount > 0 ? RED : '#9CA3AF' }}>{qr.playCount}</span>
                          </td>
                        )}

                        {visibleColumns.has('Remaining') && (
                          <td style={{ padding: cellPad, textAlign: 'center' }}>
                            {remaining === null ? (
                              <span style={{ fontWeight: 700, color: '#16A34A' }}>∞</span>
                            ) : (
                              <span style={{ fontWeight: 700, color: remaining === 0 ? '#F97316' : '#16A34A' }}>{remaining}</span>
                            )}
                          </td>
                        )}

                        {visibleColumns.has('Created') && (
                          <td style={{ padding: cellPad, color: '#6B7280', whiteSpace: 'nowrap', fontSize: 11 }}>
                            {fmtDate(qr.createdAt)}
                          </td>
                        )}

                        {visibleColumns.has('Last Scan') && (
                          <td style={{ padding: cellPad, color: '#9CA3AF', whiteSpace: 'nowrap', fontSize: 11 }}>
                            {fmtDate(qr.lastScannedAt)}
                          </td>
                        )}

                        {/* Actions */}
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <IconBtn
                              icon={loadingQr === qr.code ? spin : <Eye size={14} strokeWidth={2} />}
                              tooltip="View QR"
                              onClick={() => handleView(qr)}
                              disabled={!!loadingQr}
                            />
                            <IconBtn
                              icon={<Download size={14} strokeWidth={2} />}
                              tooltip="Download PNG"
                              onClick={() => handleDownloadDirect(qr)}
                              disabled={!!loadingQr}
                            />
                            <IconBtn
                              icon={toggling === qr.code ? spin : qr.active ? <PauseCircle size={14} strokeWidth={2} /> : <PlayCircle size={14} strokeWidth={2} />}
                              tooltip={qr.active ? 'Disable QR' : 'Enable QR'}
                              onClick={() => handleToggle(qr.code, qr.active)}
                              danger={qr.active}
                              success={!qr.active}
                              disabled={toggling === qr.code}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && !loadError && filtered.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>
              {filtered.length === 0 ? 'No results' : `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}`}
              {hasFilters && allCodes.length !== filtered.length && ` (filtered from ${allCodes.length} total)`}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', cursor: page === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: page === 0 ? '#D1D5DB' : '#374151' }}
              >
                <ChevronLeft size={14} strokeWidth={2} />
              </button>

              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                // Show first, last, current ±1, and ellipsis
                let pg: number | null;
                if (totalPages <= 7) {
                  pg = i;
                } else if (i === 0) {
                  pg = 0;
                } else if (i === 6) {
                  pg = totalPages - 1;
                } else if (i === 1 && page > 3) {
                  pg = null; // left ellipsis
                } else if (i === 5 && page < totalPages - 4) {
                  pg = null; // right ellipsis
                } else {
                  const mid = Math.min(Math.max(page, 2), totalPages - 3);
                  pg = mid + (i - 3);
                  if (pg < 0 || pg >= totalPages) pg = null;
                }

                if (pg === null) {
                  return <span key={i} style={{ fontSize: 11, color: '#9CA3AF', padding: '0 4px' }}>…</span>;
                }
                return (
                  <button key={pg}
                    onClick={() => setPage(pg!)}
                    style={{
                      minWidth: 30, height: 30, borderRadius: 8, fontSize: 11, fontWeight: 700,
                      border: pg === page ? 'none' : '1px solid #E5E7EB',
                      background: pg === page ? RED : '#F9FAFB',
                      color: pg === page ? '#fff' : '#374151',
                      cursor: 'pointer', padding: '0 8px',
                      boxShadow: pg === page ? `0 2px 8px ${RED}30` : 'none',
                    }}
                  >{pg + 1}</button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: page >= totalPages - 1 ? '#D1D5DB' : '#374151' }}
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk delete confirm */}
      {confirmBulkDelete && (
        <BulkConfirmModal
          title={`Delete ${selected.size} QR code${selected.size === 1 ? '' : 's'}?`}
          message="This permanently removes the selected QR codes from Firestore. This cannot be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmBulkDelete(false)}
          onConfirm={() => { setConfirmBulkDelete(false); handleBulkDelete(); }}
        />
      )}

      {/* QR Preview Modal */}
      {preview && (
        <QRPreviewModal
          qr={preview.qr}
          dataUrl={preview.dataUrl}
          onClose={() => setPreview(null)}
          onToggle={handleToggle}
          toggling={toggling}
        />
      )}

      <style>{`
        @keyframes srchspin    { to { transform: rotate(360deg); } }
        @keyframes skeletonSlide { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </section>
  );
}
