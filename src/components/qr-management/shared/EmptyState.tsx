import React from 'react';
import { Inbox } from 'lucide-react';

const RED = '#D71920';

interface Props {
  icon?:        React.ReactNode;
  title:        string;
  message?:     string;
  actionLabel?: string;
  onAction?:    () => void;
}

export default function EmptyState({ icon, title, message, actionLabel, onAction }: Props) {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
        background: '#F9FAFB', border: '1px solid #E5E7EB',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4C9D4',
      }}>
        {icon ?? <Inbox size={24} strokeWidth={1.6} />}
      </div>
      <p style={{ fontSize: 13, fontWeight: 800, color: '#374151', margin: 0 }}>{title}</p>
      {message && <p style={{ fontSize: 11, color: '#9CA3AF', margin: '4px 0 0', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>{message}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction} style={{
          marginTop: 14, padding: '8px 18px', borderRadius: 9, border: 'none',
          background: `linear-gradient(135deg,${RED},#B51218)`, color: '#fff',
          fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: `0 3px 10px ${RED}30`,
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
