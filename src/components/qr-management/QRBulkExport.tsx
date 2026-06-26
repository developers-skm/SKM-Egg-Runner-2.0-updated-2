import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import QRCode from 'qrcode';
import {
  Archive, FileText, Table2, FileSpreadsheet, HardDrive,
  Download, X, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import type { QRCodeRecord } from '../../types/qr/qrManagementTypes';
import { exportCSV, exportExcel, exportBackupJSON, writeOpLog } from '../../services/qr/qrManagementService';

const RED    = '#D71920';
const SAFE   = '#16A34A';
const DANGER = '#DC2626';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }

function inferBatchName(codes: QRCodeRecord[]): string {
  if (!codes.length) return 'Batch';
  const b = codes[0].batch ?? '';
  // Readable batch names like "Batch 12" come through directly;
  // raw BATCH-timestamp IDs get prettified
  if (/^Batch\s+\d+$/i.test(b)) return b;
  if (b.startsWith('BATCH-')) return `Batch ${b.replace('BATCH-', '')}`;
  return b || 'Batch';
}

function safeFilename(name: string) { return name.replace(/[^a-zA-Z0-9_-]/g, '_'); }

/** Render a QR code to a canvas data-URL at the given pixel size. */
async function renderQR(url: string, size: number, type: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: size, margin: 1, errorCorrectionLevel: 'H',
    color: { dark: type === 'Golden' ? '#92400E' : '#0A0000', light: '#FFFFFF' },
  });
}

/** Yield to the event loop so the browser stays responsive between heavy operations. */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

// ─── Progress Modal ───────────────────────────────────────────────────────────

type ExportPhase = 'idle' | 'working' | 'done' | 'error';

interface ProgressState {
  phase:    ExportPhase;
  step:     string;
  pct:      number;
  error:    string;
  blobUrl:  string;
  filename: string;
}

function ProgressModal({
  state, onClose,
}: { state: ProgressState; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  React.useEffect(() => { const t = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(t); }, []);

  const close = () => { setVisible(false); setTimeout(onClose, 250); };

  const isWorking = state.phase === 'working';
  const isDone    = state.phase === 'done';
  const isError   = state.phase === 'error';

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
      padding: 20,
      opacity: visible ? 1 : 0, transition: 'opacity 250ms ease',
    }}>
      <div style={{
        width: '100%', maxWidth: 400, background: '#FFFFFF',
        borderRadius: 22, overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.28), 0 0 0 1px rgba(215,25,32,0.1)',
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(12px)',
        transition: 'transform 300ms cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* Top accent */}
        <div style={{
          height: 3, background: isDone ? `linear-gradient(90deg,${SAFE},#22C55E)` : isError ? `linear-gradient(90deg,${DANGER},#EF4444)` : `linear-gradient(90deg,${RED},#FF4D4D,${RED})`,
          backgroundSize: '200% auto',
          animation: isWorking ? 'expGrad 1.5s linear infinite' : 'none',
        }} />

        <div style={{ padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

          {/* Icon */}
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: isDone ? '#F0FDF4' : isError ? '#FEF2F2' : `${RED}0D`,
            border: `1px solid ${isDone ? '#BBF7D0' : isError ? '#FECACA' : `${RED}25`}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: isWorking ? 'none' : isDone ? 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
          }}>
            {isWorking && <Loader2 size={26} color={RED} style={{ animation: 'expSpin 0.9s linear infinite' }} />}
            {isDone    && <CheckCircle2 size={26} color={SAFE} strokeWidth={2.5} />}
            {isError   && <AlertCircle  size={26} color={DANGER} strokeWidth={2.5} />}
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', margin: '0 0 4px' }}>
              {isWorking ? 'Preparing Export…' : isDone ? 'Export Complete' : 'Export Failed'}
            </h3>
            <p style={{ fontSize: 12, color: isError ? DANGER : '#6B7280', margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
              {isError ? state.error : isWorking ? state.step : 'Your file is ready for download.'}
            </p>
          </div>

          {/* Progress bar */}
          {isWorking && (
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{state.step}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: RED }}>{state.pct}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 6, background: '#F3F4F6', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 6,
                  background: `linear-gradient(90deg,${RED},#FF4D4D)`,
                  width: `${state.pct}%`, transition: 'width 350ms ease',
                  backgroundSize: '200% auto', animation: 'expGrad 1.5s linear infinite',
                }} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            {isDone && state.blobUrl && (
              <a
                href={state.blobUrl}
                download={state.filename}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12,
                  background: `linear-gradient(135deg,${RED},#B51218)`, color: '#fff',
                  fontWeight: 800, fontSize: 13, textDecoration: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  boxShadow: `0 4px 14px ${RED}30`,
                }}
              >
                <Download size={14} strokeWidth={2.5} /> Download
              </a>
            )}
            {(isDone || isError) && (
              <button
                onClick={close}
                style={{
                  flex: isDone && state.blobUrl ? '0 0 auto' : 1,
                  padding: '12px 20px', borderRadius: 12,
                  background: '#F3F4F6', border: '1px solid #E5E7EB',
                  color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}
              >
                <X size={14} /> Close
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes expGrad { to { background-position: 200% center; } }
        @keyframes expSpin { to { transform: rotate(360deg); } }
        @keyframes popIn   { 0% { transform: scale(0.7); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>,
    document.body,
  );
}

// ─── Pure-JS ZIP builder ──────────────────────────────────────────────────────
// Implements the ZIP local file + central directory format from spec.
// No external library — runs in the browser using Uint8Array.

class ZipBuilder {
  private files: Array<{ name: string; data: Uint8Array; crc: number; date: number }> = [];

  private crc32(buf: Uint8Array): number {
    const table = ZipBuilder.crcTable();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    return (~crc) >>> 0;
  }

  private static _table: number[] | null = null;
  private static crcTable(): number[] {
    if (ZipBuilder._table) return ZipBuilder._table;
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return ZipBuilder._table = t;
  }

  private dosDate(): number {
    const d = new Date();
    return ((d.getFullYear() - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) |
           (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  }

  private u32(n: number): number[] { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }
  private u16(n: number): number[] { return [n & 0xFF, (n >> 8) & 0xFF]; }

  addFile(name: string, data: Uint8Array) {
    this.files.push({ name, data, crc: this.crc32(data), date: this.dosDate() });
  }

  addText(name: string, text: string) {
    this.addFile(name, new TextEncoder().encode(text));
  }

  build(): Uint8Array {
    const enc = new TextEncoder();
    const parts: Uint8Array[] = [];
    const offsets: number[] = [];
    let offset = 0;

    // Local file entries
    for (const f of this.files) {
      offsets.push(offset);
      const nameBytes = enc.encode(f.name);
      const header = [
        0x50, 0x4B, 0x03, 0x04,      // signature
        0x14, 0x00,                   // version needed
        0x00, 0x00,                   // flags
        0x00, 0x00,                   // compression (stored)
        ...this.u32(f.date),          // mod date+time (4 bytes)
        ...this.u32(f.crc),
        ...this.u32(f.data.length),   // compressed
        ...this.u32(f.data.length),   // uncompressed
        ...this.u16(nameBytes.length),
        0x00, 0x00,                   // extra field length
      ];
      const localEntry = new Uint8Array(header.length + nameBytes.length + f.data.length);
      localEntry.set(header, 0);
      localEntry.set(nameBytes, header.length);
      localEntry.set(f.data, header.length + nameBytes.length);
      parts.push(localEntry);
      offset += localEntry.length;
    }

    // Central directory
    const cdParts: Uint8Array[] = [];
    let cdSize = 0;
    for (let i = 0; i < this.files.length; i++) {
      const f = this.files[i];
      const nameBytes = enc.encode(f.name);
      const cd = [
        0x50, 0x4B, 0x01, 0x02,     // signature
        0x14, 0x00,                  // version made by
        0x14, 0x00,                  // version needed
        0x00, 0x00,                  // flags
        0x00, 0x00,                  // compression
        ...this.u32(f.date),
        ...this.u32(f.crc),
        ...this.u32(f.data.length),
        ...this.u32(f.data.length),
        ...this.u16(nameBytes.length),
        0x00, 0x00,                  // extra
        0x00, 0x00,                  // comment
        0x00, 0x00,                  // disk start
        0x00, 0x00,                  // int attribs
        0x00, 0x00, 0x00, 0x00,     // ext attribs
        ...this.u32(offsets[i]),
      ];
      const entry = new Uint8Array(cd.length + nameBytes.length);
      entry.set(cd, 0); entry.set(nameBytes, cd.length);
      cdParts.push(entry);
      cdSize += entry.length;
    }

    // End of central directory
    const eocd = [
      0x50, 0x4B, 0x05, 0x06,
      0x00, 0x00, 0x00, 0x00,
      ...this.u16(this.files.length),
      ...this.u16(this.files.length),
      ...this.u32(cdSize),
      ...this.u32(offset),
      0x00, 0x00,
    ];

    const total = parts.reduce((s, p) => s + p.length, 0) +
                  cdParts.reduce((s, p) => s + p.length, 0) + eocd.length;
    const out = new Uint8Array(total);
    let pos = 0;
    [...parts, ...cdParts].forEach(p => { out.set(p, pos); pos += p.length; });
    out.set(eocd, pos);
    return out;
  }
}

// ─── PDF builder (uses hidden iframe + CSS print) ─────────────────────────────
// Generates a proper A4 print-ready HTML page, injects it into a hidden iframe,
// and triggers window.print() from within that frame.
// QR images are embedded as base64 data-URLs so no network requests are needed.

async function buildPDFHtml(
  codes: QRCodeRecord[],
  batchName: string,
  actor: string,
  onProgress: (pct: number, step: string) => void,
): Promise<string> {
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalPages = Math.ceil(codes.length / 20); // 4×5 = 20 per page

  onProgress(5, 'Rendering QR images…');

  // Render all QR images
  const dataUrls: string[] = [];
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    const url = (c as any).url ?? `https://skm-egg-runner.vercel.app/?qr=${c.code}`;
    try { dataUrls.push(await renderQR(url, 200, c.type)); }
    catch { dataUrls.push(''); }
    if (i % 10 === 9) {
      onProgress(5 + Math.round((i / codes.length) * 70), 'Rendering QR images…');
      await tick();
    }
  }

  onProgress(80, 'Composing PDF layout…');
  await tick();

  const gridCols = 4;

  // Build QR grid rows — each set of 20 becomes one page
  const pageBlocks: string[] = [];
  for (let p = 0; p < totalPages; p++) {
    const slice = codes.slice(p * 20, (p + 1) * 20);
    const cells = slice.map((c, i) => {
      const idx = p * 20 + i;
      const img = dataUrls[idx] ? `<img src="${dataUrls[idx]}" />` : '<div class="no-qr">—</div>';
      return `
        <div class="qr-cell">
          ${img}
          <div class="qr-code">${c.code}</div>
          <div class="qr-meta">${c.batch || batchName} · ${c.type} · ${c.maxPlays === 999999 ? '∞' : c.maxPlays} plays</div>
        </div>`;
    }).join('');
    pageBlocks.push(`
      <div class="page${p > 0 ? ' page-break' : ''}">
        <div class="page-header">
          <div class="header-left">
            <span class="brand">SKM QR Management</span>
            <span class="batch-pill">${batchName}</span>
          </div>
          <div class="header-right">
            Page ${p + 1} / ${totalPages}
          </div>
        </div>
        <div class="qr-grid">${cells}</div>
        <div class="page-footer">
          Generated ${date} · By ${actor} · ${codes.length} QR Codes · Confidential
        </div>
      </div>`);
  }

  onProgress(95, 'Finalising…');
  await tick();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>SKM QR Batch — ${batchName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#1A1A1A;}
  @page{size:A4 portrait;margin:14mm 12mm 14mm;}
  .page{min-height:267mm;display:flex;flex-direction:column;}
  .page-break{page-break-before:always;}
  .page-header{
    display:flex;align-items:center;justify-content:space-between;
    padding-bottom:8px;border-bottom:2px solid #D71920;margin-bottom:14px;
    font-size:11px;font-weight:700;color:#6B7280;
  }
  .header-left{display:flex;align-items:center;gap:10px;}
  .brand{font-size:13px;font-weight:900;color:#1A1A1A;letter-spacing:-0.3px;}
  .batch-pill{
    font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;
    padding:3px 10px;border-radius:20px;background:#D7192010;
    border:1px solid #D7192030;color:#D71920;
  }
  .qr-grid{
    display:grid;grid-template-columns:repeat(${gridCols},1fr);
    gap:10px;flex:1;align-content:start;
  }
  .qr-cell{
    border:1px solid #E5E7EB;border-radius:10px;padding:10px 8px;
    display:flex;flex-direction:column;align-items:center;gap:5px;
    background:#FAFAFA;
  }
  .qr-cell img{width:100%;max-width:130px;height:auto;border-radius:6px;display:block;}
  .no-qr{width:100%;height:90px;display:flex;align-items:center;justify-content:center;color:#9CA3AF;}
  .qr-code{font-family:monospace;font-size:9px;font-weight:700;color:#1A1A1A;word-break:break-all;text-align:center;}
  .qr-meta{font-size:8px;color:#9CA3AF;font-weight:500;text-align:center;line-height:1.4;}
  .page-footer{
    margin-top:12px;padding-top:7px;border-top:1px solid #E5E7EB;
    font-size:8px;color:#9CA3AF;text-align:center;font-weight:500;
  }
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .page-break{page-break-before:always;}
  }
</style>
</head>
<body>
${pageBlocks.join('\n')}
</body>
</html>`;
}

// ─── Export functions ─────────────────────────────────────────────────────────

async function exportAsPDF(
  codes: QRCodeRecord[],
  batchName: string,
  actor: string,
  onProgress: (pct: number, step: string) => void,
  onDone: (blobUrl: string, filename: string) => void,
  onError: (msg: string) => void,
) {
  try {
    const html = await buildPDFHtml(codes, batchName, actor, onProgress);
    onProgress(98, 'Opening print dialog…');
    await tick();

    // Create a hidden iframe and print from within it
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;border:none;';
    document.body.appendChild(iframe);

    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => {
        try {
          const iDoc = iframe.contentDocument!;
          iDoc.open(); iDoc.write(html); iDoc.close();
          // Give images time to decode
          setTimeout(() => {
            try {
              iframe.contentWindow!.focus();
              iframe.contentWindow!.print();
              resolve();
            } catch (e) { reject(e); }
          }, 600);
        } catch (e) { reject(e); }
      };
      iframe.src = 'about:blank';
    });

    // Also offer an HTML download as a fallback (opens in browser and can be printed/saved as PDF)
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const date = todayStr();
    const filename = `SKM_${safeFilename(batchName)}_${codes.length}QR_${date}.html`;

    document.body.removeChild(iframe);
    onProgress(100, 'Done');
    onDone(url, filename);
  } catch (e: any) {
    onError(e?.message ?? 'PDF generation failed. Please try again.');
  }
}

async function exportAsZIP(
  codes: QRCodeRecord[],
  batchName: string,
  actor: string,
  onProgress: (pct: number, step: string) => void,
  onDone: (blobUrl: string, filename: string) => void,
  onError: (msg: string) => void,
) {
  try {
    const zip = new ZipBuilder();
    const folderName = safeFilename(batchName);
    const total = codes.length;

    onProgress(5, 'Rendering QR images…');

    // Render QR PNGs in batches of 10 to keep browser responsive
    for (let i = 0; i < total; i++) {
      const c = codes[i];
      const url = (c as any).url ?? `https://skm-egg-runner.vercel.app/?qr=${c.code}`;
      const dataUrl = await renderQR(url, 300, c.type);

      // Convert data-URL to Uint8Array
      const base64 = dataUrl.split(',')[1];
      const binary  = atob(base64);
      const bytes   = new Uint8Array(binary.length);
      for (let b = 0; b < binary.length; b++) bytes[b] = binary.charCodeAt(b);
      zip.addFile(`${folderName}/${c.code}.png`, bytes);

      if (i % 10 === 9 || i === total - 1) {
        onProgress(5 + Math.round(((i + 1) / total) * 75), `Rendering QR images… (${i + 1}/${total})`);
        await tick();
      }
    }

    onProgress(82, 'Building manifest CSV…');
    await tick();

    // Manifest CSV
    const csvHeader = 'QR ID,Batch,QR Type,Max Plays,Status,Used Plays,Remaining,Game URL';
    const csvRows = codes.map(c => {
      const status  = !c.active ? 'Disabled' : c.playCount >= c.maxPlays ? 'Exhausted' : c.playCount > 0 ? 'In Use' : 'Available';
      const maxStr  = c.maxPlays === 999999 ? 'Unlimited' : String(c.maxPlays);
      const remStr  = c.maxPlays === 999999 ? 'Unlimited' : String(Math.max(0, c.maxPlays - c.playCount));
      const url     = (c as any).url ?? `https://skm-egg-runner.vercel.app/?qr=${c.code}`;
      return [c.code, c.batch, c.type, maxStr, status, c.playCount, remStr, url]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
    });
    zip.addText(`${folderName}/manifest.csv`, [csvHeader, ...csvRows].join('\n'));

    onProgress(90, 'Building manifest JSON…');
    await tick();

    // Manifest JSON
    const manifest = {
      batchName,
      exportedAt:  new Date().toISOString(),
      exportedBy:  actor,
      totalCodes:  total,
      codes: codes.map(c => ({
        id:        c.id,
        code:      c.code,
        batch:     c.batch,
        type:      c.type,
        maxPlays:  c.maxPlays,
        playCount: c.playCount,
        active:    c.active,
        createdAt: c.createdAt?.toISOString?.() ?? '',
        url:       (c as any).url ?? '',
      })),
    };
    zip.addText(`${folderName}/manifest.json`, JSON.stringify(manifest, null, 2));

    onProgress(96, 'Compressing…');
    await tick();

    const bytes  = zip.build();
    const blob   = new Blob([bytes], { type: 'application/zip' });
    const url    = URL.createObjectURL(blob);
    const date   = todayStr();
    const filename = `SKM_${safeFilename(batchName)}_QR_PNG_${date}.zip`;

    onProgress(100, 'Done');
    onDone(url, filename);
  } catch (e: any) {
    onError(e?.message ?? 'ZIP generation failed. Please try again.');
  }
}

// ─── Export button ────────────────────────────────────────────────────────────

function ExportBtn({ label, icon, onClick, disabled, accent = '#F3F4F6', textColor = '#374151' }: {
  label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; accent?: string; textColor?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background:   disabled ? '#F9FAFB' : accent,
      border:       `1px solid ${disabled ? '#E5E7EB' : '#E5E7EB'}`,
      color:        disabled ? '#D1D5DB' : textColor,
      borderRadius: 10, padding: '10px 16px', fontSize: 12, fontWeight: 700,
      cursor:       disabled ? 'not-allowed' : 'pointer',
      display:      'flex', alignItems: 'center', gap: 7,
      transition:   'all 150ms', whiteSpace: 'nowrap',
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = RED; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; }}
    >
      {icon}{label}
    </button>
  );
}

// ─── Main Export Center component ─────────────────────────────────────────────

interface Props { codes: QRCodeRecord[]; actor?: string; }

export default function QRBulkExport({ codes, actor = 'Admin' }: Props) {
  const [csvMsg, setCsvMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [modalState, setModalState] = useState<ProgressState>({ phase: 'idle', step: '', pct: 0, error: '', blobUrl: '', filename: '' });
  const blobRef = useRef<string>('');

  const flash = (text: string, ok = true) => { setCsvMsg({ text, ok }); setTimeout(() => setCsvMsg(null), 4000); };

  const updateModal = (patch: Partial<ProgressState>) =>
    setModalState(prev => ({ ...prev, ...patch }));

  const startExport = (phase: ExportPhase = 'working') => {
    // Revoke any previous blob URL to free memory
    if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = ''; }
    setModalState({ phase, step: 'Initialising…', pct: 0, error: '', blobUrl: '', filename: '' });
  };

  const onDone = (blobUrl: string, filename: string) => {
    blobRef.current = blobUrl;
    updateModal({ phase: 'done', blobUrl, filename, pct: 100, step: 'Complete' });
  };

  const onError = (error: string) => updateModal({ phase: 'error', error });

  const progress = (pct: number, step: string) => updateModal({ pct: Math.round(pct), step });

  const batchName = inferBatchName(codes);

  const handlePDF = () => {
    if (!codes.length) return;
    startExport('working');
    exportAsPDF(codes, batchName, actor, progress, onDone, onError);
  };

  const handleZIP = () => {
    if (!codes.length) return;
    startExport('working');
    exportAsZIP(codes, batchName, actor, progress, onDone, onError);
  };

  const handleCSV = () => {
    exportCSV(codes);
    writeOpLog('export', 'CSV', codes.length, actor).catch(() => {});
    flash(`CSV exported — ${codes.length} codes.`);
  };

  const handleExcel = () => {
    exportExcel(codes);
    writeOpLog('export', 'Excel', codes.length, actor).catch(() => {});
    flash(`Excel exported — ${codes.length} codes.`);
  };

  const handleBackup = async () => {
    try {
      const d = await exportBackupJSON();
      writeOpLog('backup', 'JSON', codes.length, actor).catch(() => {});
      flash(`Backup saved: backup-${d}.json`);
    } catch (e: any) { flash(e?.message ?? 'Backup failed.', false); }
  };

  return (
    <section>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>Export Center</h2>
        <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0', fontWeight: 500 }}>
          Download QR data in multiple formats · {codes.length} code{codes.length !== 1 ? 's' : ''} loaded
        </p>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 18, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Format groups */}
        <div>
          <p style={{ fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 8px' }}>Visual Export</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <ExportBtn
              label="Export PDF"
              icon={<FileText size={14} strokeWidth={2} />}
              onClick={handlePDF}
              disabled={!codes.length}
              accent={`${RED}0D`}
              textColor={RED}
            />
            <ExportBtn
              label="Export ZIP (PNG)"
              icon={<Archive size={14} strokeWidth={2} />}
              onClick={handleZIP}
              disabled={!codes.length}
              accent="#F5F3FF"
              textColor="#6D28D9"
            />
          </div>
          {codes.length > 0 && (
            <p style={{ fontSize: 10, color: '#9CA3AF', margin: '6px 0 0' }}>
              PDF: A4 print-ready · 4×5 grid · {Math.ceil(codes.length / 20)} page{Math.ceil(codes.length / 20) !== 1 ? 's' : ''} &nbsp;|&nbsp;
              ZIP: individual PNGs + manifest.csv + manifest.json
            </p>
          )}
        </div>

        <div style={{ height: 1, background: '#F3F4F6' }} />

        <div>
          <p style={{ fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 8px' }}>Data Export</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <ExportBtn label="Export CSV"   icon={<Table2          size={14} strokeWidth={2} />} onClick={handleCSV}    disabled={!codes.length} accent="#EFF6FF" textColor="#1D4ED8" />
            <ExportBtn label="Export Excel" icon={<FileSpreadsheet size={14} strokeWidth={2} />} onClick={handleExcel}  disabled={!codes.length} accent="#F0FDF4" textColor="#15803D" />
            <ExportBtn label="Backup JSON"  icon={<HardDrive       size={14} strokeWidth={2} />} onClick={handleBackup} disabled={!codes.length} accent="#FAF5FF" textColor="#6D28D9" />
          </div>
        </div>

        {csvMsg && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: csvMsg.ok ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${csvMsg.ok ? '#BBF7D0' : '#FECACA'}` }}>
            <p style={{ color: csvMsg.ok ? SAFE : DANGER, fontSize: 12, fontWeight: 600, margin: 0 }}>{csvMsg.text}</p>
          </div>
        )}
      </div>

      {modalState.phase !== 'idle' && (
        <ProgressModal
          state={modalState}
          onClose={() => setModalState(prev => ({ ...prev, phase: 'idle' }))}
        />
      )}
    </section>
  );
}
