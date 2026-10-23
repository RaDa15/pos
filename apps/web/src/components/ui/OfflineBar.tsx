import React from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus.js';

export const OfflineBar: React.FC = () => {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      style={{
        backgroundColor: 'var(--amber-tint)',
        borderBottom: '1px solid var(--alert-border)',
        color: 'var(--amber-ink)',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: '12.5px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        zIndex: 9998,
      }}
    >
      <span aria-hidden="true">⚠</span>
      <span>You are currently offline. Changes will not be saved until your connection is restored.</span>
    </div>
  );
};
