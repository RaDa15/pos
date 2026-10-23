import React from 'react';
import { Button } from './Button.js';

export interface EmptyStateProps {
  message: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`empty-state ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '36px 16px',
        color: 'var(--muted)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--muted)',
        }}
      >
        {message}
      </p>
      {description && (
        <p
          style={{
            margin: '6px 0 0 0',
            fontSize: '12.5px',
            color: 'var(--placeholder)',
            maxWidth: '360px',
          }}
        >
          {description}
        </p>
      )}
      {action && (
        <div style={{ marginTop: '16px' }}>
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
};
