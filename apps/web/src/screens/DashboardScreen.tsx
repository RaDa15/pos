import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.js';
import { AppShell } from '../components/layout/AppShell.js';
import { KpiCard, Card } from '../components/ui/Card.js';

export const DashboardScreen: React.FC = () => {
  const { t } = useTranslation();
  const { employee, business, dashboardLens } = useAuth();

  return (
    <AppShell
      title={t('nav.dashboard', 'Dashboard')}
      subtitle={
        dashboardLens
          ? `Lens: ${dashboardLens.replace('_', ' ').toUpperCase()}`
          : 'Business Overview'
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* KPI Grid */}
        <div
          className="grid cols-4"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
          }}
        >
          <KpiCard
            label="Today's Sales"
            value="Nu. 0.00"
            tone="default"
            hint="0 completed sales"
          />
          <KpiCard
            label="Active Orders"
            value="0"
            tone="default"
            hint="Kitchen / pending"
          />
          <KpiCard
            label="Low Stock Alerts"
            value="0"
            tone="default"
            hint="Tracked products"
          />
          <KpiCard
            label="Cash in Register"
            value="Nu. 0.00"
            tone="default"
            hint="Daily cash drawer"
          />
        </div>

        {/* Business and Employee Lens Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          <Card>
            <h2 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--ink)' }}>
              Business Profile
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px' }}>
              <div><strong>Name:</strong> {business?.name}</div>
              <div><strong>Business Code:</strong> {business?.businessCode}</div>
              <div><strong>Type:</strong> {business?.type === 'restaurant' ? 'Restaurant & Bar' : 'Grocery & Retail'}</div>
              <div><strong>GST Status:</strong> {business?.gstRegistered ? `Registered (${business.gstNo || 'No TPN'})` : 'Non-GST'}</div>
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--ink)' }}>
              Session Lens
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px' }}>
              <div><strong>Employee:</strong> {employee?.name}</div>
              <div><strong>Role:</strong> {employee?.role}</div>
              <div><strong>Active Lens:</strong> {dashboardLens || employee?.role}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                Screens and controls are filtered automatically by your role permissions and plan limits.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
};
