import React from 'react';

export type PillVariant = 'success' | 'danger' | 'warning' | 'neutral';

export interface PillProps {
  children: React.ReactNode;
  variant?: PillVariant;
  style?: React.CSSProperties;
}

export function Pill({ children, variant = 'neutral', style }: PillProps) {
  const getStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'success':
        return {
          backgroundColor: 'var(--teal-tint)',
          color: 'var(--teal-dark)',
        };
      case 'danger':
        return {
          backgroundColor: 'var(--red-tint)',
          color: 'var(--red)',
        };
      case 'warning':
        return {
          backgroundColor: 'var(--amber-tint)',
          color: 'var(--amber-ink)',
        };
      case 'neutral':
      default:
        return {
          backgroundColor: 'var(--neutral-pill)',
          color: 'var(--neutral-pill-text)',
        };
    }
  };

  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '11px',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        whiteSpace: 'nowrap',
        ...getStyles(),
        ...style,
      }}
    >
      {children}
    </span>
  );
}
