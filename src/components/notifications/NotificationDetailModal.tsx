/**
 * NotificationDetailModal — fallback shown when a tapped notification has
 * no resolvable navigation target (resolveNavTarget returned null). Never
 * crashes; just shows the notification's own content full-screen.
 */

import React from 'react';
import { X } from 'lucide-react';
import type { AppNotification } from '../../types/notifications';

function fullDate(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function NotificationDetailModal({ notification, onClose }: {
  notification: AppNotification;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1400,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, background: '#fff', borderRadius: 20,
          padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          animation: 'skmNotifDetailIn 220ms cubic-bezier(0.34,1.3,0.64,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', margin: 0, lineHeight: 1.3, paddingRight: 12 }}>
            {notification.title}
          </p>
          <button onClick={onClose} style={{
            flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: 'none',
            background: '#F5F5F5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} color="#888" />
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 14px', lineHeight: 1.6 }}>
          {notification.message}
        </p>
        <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>{fullDate(notification.createdAt)}</p>

        <button onClick={onClose} style={{
          marginTop: 18, width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
          background: 'linear-gradient(135deg,#D71920,#B31217)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
        }}>
          Done
        </button>
      </div>
      <style>{`@keyframes skmNotifDetailIn { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
}
