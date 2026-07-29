import React, { useRef, useState } from 'react';
import { Plus, Printer, Download, Upload, Layers3, FileBarChart2, BarChart3 } from 'lucide-react';

const RED = '#D71920';

interface QuickAction {
  label: string;
  icon:  React.ReactNode;
  tab?:  string;
  onClick?: () => void;
  primary?: boolean;
}

interface Props {
  onNavigate: (tab: string) => void;
  onImportCSV?: (file: File) => void;
}

// Persistent action bar — always visible above the tab content. "Import" is
// scoped to CSV re-upload for record-keeping only (no bulk-create-from-CSV);
// it logs the import via QROperationLogs rather than writing new QR docs.
export default function QRQuickActionBar({ onNavigate, onImportCSV }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const actions: QuickAction[] = [
    { label: 'Generate QR',  icon: <Plus size={13} />,             tab: 'generator', primary: true },
    { label: 'Print',        icon: <Printer size={13} />,          tab: 'print' },
    { label: 'Export',       icon: <Download size={13} />,         tab: 'bulk' },
    { label: 'Import',       icon: <Upload size={13} />,           onClick: () => fileInputRef.current?.click() },
    { label: 'Create Batch', icon: <Layers3 size={13} />,          tab: 'generator' },
    { label: 'Report',       icon: <FileBarChart2 size={13} />,    tab: 'report' },
    { label: 'Analytics',    icon: <BarChart3 size={13} />,        tab: 'analytics' },
  ];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12,
      padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {actions.map(a => {
        const id = a.label;
        const hover = hoverId === id;
        return (
          <button
            key={id}
            onClick={() => (a.onClick ? a.onClick() : a.tab && onNavigate(a.tab))}
            onMouseEnter={() => setHoverId(id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9,
              fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: a.primary ? 'none' : `1px solid ${hover ? RED + '30' : '#E5E7EB'}`,
              background: a.primary ? `linear-gradient(135deg,${RED},#B51218)` : (hover ? '#FAFAFA' : '#FFFFFF'),
              color: a.primary ? '#fff' : '#374151',
              boxShadow: a.primary ? `0 3px 10px ${RED}30` : 'none',
              transition: 'background 150ms, border-color 150ms',
            }}
          >
            {a.icon}{a.label}
          </button>
        );
      })}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && onImportCSV) onImportCSV(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
