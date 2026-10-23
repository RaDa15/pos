import React from 'react';
import { PlatformLayout } from '../components/layout/PlatformLayout.js';
import { Card } from '../components/ui/Card.js';
import { EmptyState } from '../components/ui/EmptyState.js';

export const PlatformPaymentsScreen: React.FC = () => {
  return (
    <PlatformLayout title="Subscription Payment Verification Queue (SCR-27)">
      <Card>
        <EmptyState
          message="No pending bank transfer verification requests."
          description="Submitted journal numbers and screenshots for subscription renewals appear here for platform verification."
        />
      </Card>
    </PlatformLayout>
  );
};
