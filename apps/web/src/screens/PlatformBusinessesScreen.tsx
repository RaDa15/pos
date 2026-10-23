import React from 'react';
import { PlatformLayout } from '../components/layout/PlatformLayout.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';

export const PlatformBusinessesScreen: React.FC = () => {
  return (
    <PlatformLayout title="Businesses Directory (SCR-26)">
      <Card>
        <EmptyState
          message="Platform business directory ready."
          description="View and manage all registered Bhutanese businesses, subscription statuses, and employee counts."
        />
      </Card>
    </PlatformLayout>
  );
};
