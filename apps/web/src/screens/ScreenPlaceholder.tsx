import React from 'react';
import { AppShell } from '../components/layout/AppShell.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';

export interface ScreenPlaceholderProps {
  screenId: string;
  title: string;
  subtitle?: string;
  description: string;
  phaseNumber: number;
}

export const ScreenPlaceholder: React.FC<ScreenPlaceholderProps> = ({
  screenId,
  title,
  subtitle,
  description,
  phaseNumber,
}) => {
  return (
    <AppShell title={title} subtitle={subtitle || screenId}>
      <Card style={{ padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--teal-dark)',
                backgroundColor: 'var(--teal-tint)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                textTransform: 'uppercase',
              }}
            >
              {screenId}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '8px' }}>
              Planned for Phase {phaseNumber}
            </span>
          </div>
        </div>

        <EmptyState
          message={`${title} workspace is ready for development.`}
          description={description}
        />
      </Card>
    </AppShell>
  );
};
