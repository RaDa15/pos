import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, style, className = '', ...props }: CardProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 18px',
        ...style,
      }}
      className={`card ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface KpiCardProps {
  label: string;
  value: string | number;
  tone?: 'default' | 'good' | 'warn';
  hint?: string;
  style?: React.CSSProperties;
}

export function KpiCard({ label, value, tone = 'default', hint, style }: KpiCardProps) {
  const getToneColor = () => {
    switch (tone) {
      case 'good':
        return 'var(--teal-dark)';
      case 'warn':
        return 'var(--red)';
      default:
        return 'var(--ink)';
    }
  };

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', ...style }}>
      <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: '24px',
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color: getToneColor(),
          marginTop: '4px',
        }}
      >
        {value}
      </span>
      {hint && (
        <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {hint}
        </span>
      )}
    </Card>
  );
}
