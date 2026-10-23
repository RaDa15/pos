import React from 'react';

export type AlertBannerVariant = 'warning' | 'danger';

export interface AlertBannerProps {
  variant?: AlertBannerVariant;
  message: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  variant = 'warning',
  message,
  action,
  className = '',
}) => {
  const isWarning = variant === 'warning';

  return (
    <div
      role="alert"
      className={`alert-banner ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: 'var(--radius-sm)',
        borderWidth: '1px',
        borderStyle: 'solid',
        fontSize: '13.5px',
        lineHeight: 1.4,
        marginBottom: '16px',
        backgroundColor: isWarning ? 'var(--alert-bg)' : 'var(--red-tint)',
        borderColor: isWarning ? 'var(--alert-border)' : 'var(--red-border)',
        color: isWarning ? 'var(--alert-ink)' : 'var(--red)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span aria-hidden="true" style={{ fontWeight: 700, fontSize: '15px' }}>
          {isWarning ? '⚠' : '✕'}
        </span>
        <span>{message}</span>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'inherit',
            fontWeight: 700,
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: '13.5px',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
