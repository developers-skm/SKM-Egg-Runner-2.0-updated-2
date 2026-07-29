import React, { useState, useMemo, useEffect } from 'react';
import { FileBarChart2, Download, Calendar } from 'lucide-react';
import { fetchAllQRCodes, writeOpLog } from '../../services/qr/qrManagementService';
import type { QRCodeRecord } from '../../types/qr/qrManagementTypes';

const RED = '#D71920';

type RangeKey = 'daily' | 'weekly' | 'monthly' | 'custom';

function dateKey(d: Date) { return d.toISOString().slice(0, 10); }

function rangeStart(range: RangeKey, customFrom: string): Date {
  const d = new Date();
  if (range === 'daily')   d.setDate(d.getDate() - 1);
  if (range === 'weekly')  d.setDate(d.getDate() - 7);
  if (range === 'monthly') d.setDate(d.getDate() - 30);
  if (range === 'custom')  return customFrom ? new Date(customFrom) : d;
  return d;
}

interface Props { actor: string; }

export default function QRReportCenter({ actor }: Props) {
  const [codes, setCodes]     = useState<QRCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange]     = useState<RangeKey>('daily');
  const [customFrom, setCustomFrom] = useState(dateKey(new Date(Date.now() - 7 * 86400000)));
  const [customTo, setCustomTo]     = useState(dateKey(new Date()));

  useEffect(() => {
    fetchAllQRCodes().then(setCodes).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const from = rangeStart(range, customFrom);
    const to = range === 'custom' && customTo ? new Date(customTo + 'T23:59:59') : new Date();
    return codes.filter(c => c.createdAt >= from && c.createdAt <= to);
  }, [codes, range, customFrom, customTo]);

  const summary = useMemo(() => {
    const totalScans = filtered.reduce((s, c) => s + c.playCount, 0);
    const active = filtered.filter(c => c.active && c.playCount < c.maxPlays).length;
    const disabled = filtered.filter(c => !c.active).length;
    return { count: filtered.length, totalScans, active, disabled };
  }, [filtered]);

  const handleDownload = () => {
    const header = 'Code,Type,Batch,MaxPlays,PlayCount,Active,CreatedAt\n';
    const rows = filtered.map(q =>
      `${q.code},${q.type},${q.batch},${q.maxPlays},${q.playCount},${q.active},${q.createdAt.toISOString()}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `qr-report-${range}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    writeOpLog('report_generated', range, filtered.length, actor, { reason: `${range} report, ${filtered.length} records` }).catch(() => {});
  };

  const rangeLabels: { key: RangeKey; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <section>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', margin: 0 }}>Report Center</h2>
        <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0', fontWeight: 500 }}>
          Generate scoped reports with a preview before download
        </p>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 18, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {rangeLabels.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} style={{
              padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              border: range === r.key ? 'none' : '1px solid #E5E7EB',
              cursor: 'pointer',
              background: range === r.key ? RED : '#F9FAFB',
              color: range === r.key ? '#fff' : '#6B7280',
              boxShadow: range === r.key ? `0 2px 8px ${RED}30` : 'none',
            }}>{r.label}</button>
          ))}
        </div>

        {range === 'custom' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <Calendar size={13} color="#9CA3AF" />
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }} />
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }} />
          </div>
        )}

        {loading ? (
          <div style={{ height: 100, background: '#F3F4F6', borderRadius: 10 }} />
        ) : (
          <>
            {/* Preview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'QR Codes', value: summary.count, color: '#6366F1' },
                { label: 'Total Scans', value: summary.totalScans, color: RED },
                { label: 'Active', value: summary.active, color: '#16A34A' },
                { label: 'Disabled', value: summary.disabled, color: '#DC2626' },
              ].map(s => (
                <div key={s.label} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 12px' }}>
                  <p style={{ fontSize: 20, fontWeight: 900, color: s.color, margin: 0 }}>{s.value.toLocaleString()}</p>
                  <p style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', margin: '3px 0 0', textTransform: 'uppercase' }}>{s.label}</p>
                </div>
              ))}
            </div>

            <button onClick={handleDownload} disabled={filtered.length === 0} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 10,
              border: 'none', background: filtered.length ? `linear-gradient(135deg,${RED},#B51218)` : '#E5E7EB',
              color: '#fff', fontSize: 12, fontWeight: 800, cursor: filtered.length ? 'pointer' : 'not-allowed',
              boxShadow: filtered.length ? `0 3px 12px ${RED}30` : 'none',
            }}>
              <Download size={14} /> Download CSV ({filtered.length} records)
            </button>
          </>
        )}
      </div>
    </section>
  );
}
