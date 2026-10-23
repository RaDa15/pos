import React from 'react';

export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'expired'
  | 'suspended'
  | 'cancelled';

export interface SubscriptionBadgeProps {
  status: SubscriptionStatus | string;
  className?: string;
}

export const SubscriptionBadge: React.FC<SubscriptionBadgeProps> = ({
  status,
  className = '',
}) => {
  const normStatus = (status || '').toLowerCase() as SubscriptionStatus;

  const styleMap: Record<
    SubscriptionStatus,
    { bg: string; color: string; label: string }
  > = {
    active: {
      bg: 'var(--teal-tint)',
      color: 'var(--teal-dark)',
      label: 'ACTIVE',
    },
    trial: {
      bg: 'var(--amber-tint)',
      color: 'var(--amber-ink)',
      label: 'TRIAL',
    },
    expired: {
      bg: 'var(--red-tint)',
      color: 'var(--red)',
      label: 'EXPIRED',
    },
    suspended: {
      bg: '#EEEEEE',
      color: '#555555',
      label: 'SUSPENDED',
    },
    cancelled: {
      bg: '#EEEEEE',
      color: '#555555',
      label: 'CANCELLED',
    },
  };

  const current = styleMap[normStatus] || {
    bg: '#EEEEEE',
    color: '#555555',
    label: (status || 'UNKNOWN').toUpperCase(),
  };

  return (
    <span
      className={`sub-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        borderRadius: 'var(--radius-pill)',
        backgroundColor: current.bg,
        color: current.color,
        lineHeight: 1.4,
      }}
    >
      {current.label}
    </span>
  );
};
