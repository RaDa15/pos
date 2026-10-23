import React, { useState } from 'react';
import { Button } from '../components/ui/Button.js';
import { Input, Select, Textarea } from '../components/ui/Input.js';
import { Field } from '../components/ui/Field.js';
import { Card, KpiCard } from '../components/ui/Card.js';
import { Pill } from '../components/ui/Pill.js';
import { SubscriptionBadge } from '../components/ui/SubscriptionBadge.js';
import { Modal } from '../components/ui/Modal.js';
import { useToast } from '../components/ui/Toast.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';
import { DataTable, Column } from '../components/ui/DataTable.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { LanguageToggle } from '../components/ui/LanguageToggle.js';

interface SampleRow {
  id: string;
  item: string;
  category: string;
  price: string;
  status: string;
  [key: string]: unknown;
}

export const DevComponentsPage: React.FC = () => {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [wideModalOpen, setWideModalOpen] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [pwdVal, setPwdVal] = useState('secret1234');

  const sampleCols: Column<SampleRow>[] = [
    { key: 'item', header: 'Item Name' },
    { key: 'category', header: 'Category' },
    { key: 'price', header: 'Price', align: 'right' },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <Pill
          variant={
            row.status === 'In Stock'
              ? 'success'
              : row.status === 'Low Stock'
              ? 'warning'
              : 'danger'
          }
        >
          {row.status}
        </Pill>
      ),
    },
  ];

  const sampleData: SampleRow[] = [
    { id: '1', item: 'Doma & Pan', category: 'Grocery', price: 'Nu. 50.00', status: 'In Stock' },
    { id: '2', item: 'Red Rice 25kg', category: 'Grains', price: 'Nu. 1,650.00', status: 'Low Stock' },
    { id: '3', item: 'Suja Tea', category: 'Beverage', price: 'Nu. 45.00', status: 'Out of Stock' },
  ];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 6px 0' }}>Design System Components</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          Interactive catalog of all POS SYSTEM UI components per <code>09-DESIGN.md</code> §3.
        </p>
      </div>

      {/* Buttons */}
      <Card>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Buttons</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <Button variant="default">Default Navy</Button>
          <Button variant="primary">Primary Teal</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="link">Link Style</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="default" size="sm">Small (sm)</Button>
          <Button variant="primary" size="lg">Large POS (lg)</Button>
        </div>
      </Card>

      {/* Forms & Inputs */}
      <Card>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Form Controls & Inputs</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <Field label="Text Input" hint="Helpful hint text below">
            <Input
              type="text"
              placeholder="e.g. Doma / Rice"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
            />
          </Field>

          <Field label="Password with Show/Hide toggle" required>
            <Input
              type="password"
              value={pwdVal}
              onChange={(e) => setPwdVal(e.target.value)}
            />
          </Field>

          <Field label="Input with Error" error="This field is required.">
            <Input type="text" hasError value="" readOnly placeholder="Invalid entry" />
          </Field>

          <Field label="Select Dropdown">
            <Select defaultValue="grocery">
              <option value="grocery">Grocery Store</option>
              <option value="restaurant">Restaurant</option>
            </Select>
          </Field>

          <Field label="Textarea" hint="Max 250 characters">
            <Textarea rows={3} placeholder="Enter kitchen notes or item details..." />
          </Field>
        </div>
      </Card>

      {/* Pills & Badges */}
      <Card>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Pills & Subscription Badges</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Pills:</span>
            <Pill variant="success">Completed</Pill>
            <Pill variant="warning">Low stock</Pill>
            <Pill variant="danger">Cancelled</Pill>
            <Pill variant="neutral">Draft</Pill>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Subscriptions:</span>
            <SubscriptionBadge status="active" />
            <SubscriptionBadge status="trial" />
            <SubscriptionBadge status="expired" />
            <SubscriptionBadge status="suspended" />
            <SubscriptionBadge status="cancelled" />
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>KPI Cards</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <KpiCard label="Today's Sales" value="Nu. 24,580.00" tone="good" hint="18 orders" />
          <KpiCard label="Low Stock Items" value="7" tone="warn" hint="Needs reordering" />
          <KpiCard label="Cash Collected" value="Nu. 18,200.00" tone="default" hint="Drawer balance" />
          <KpiCard label="Active Orders" value="3" tone="default" hint="In kitchen" />
        </div>
      </div>

      {/* Alert Banners */}
      <Card>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Alert Banners</h2>
        <AlertBanner
          variant="warning"
          message="Your subscription will expire in 3 days. Please submit a payment reference to avoid service interruption."
          action={{ label: 'Renew Now', onClick: () => toast('Navigating to renew...') }}
        />
        <AlertBanner
          variant="danger"
          message="Subscription Expired: Only read-only records and settings are accessible."
          action={{ label: 'Reactivate', onClick: () => toast('Opening payment options...') }}
        />
      </Card>

      {/* Toasts & Modals */}
      <Card>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Toasts & Modals</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <Button variant="default" onClick={() => toast('Sale completed successfully. Receipt #INV-001.', 'success')}>
            Show Success Toast
          </Button>
          <Button variant="outline" onClick={() => toast('Low stock warning for 2 products.', 'info')}>
            Show Info Toast
          </Button>
          <Button variant="danger" onClick={() => toast('Failed to complete sale: connection lost.', 'error')}>
            Show Error Toast
          </Button>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Open Normal Modal
          </Button>
          <Button variant="outline" onClick={() => setWideModalOpen(true)}>
            Open Wide Modal
          </Button>
        </div>
      </Card>

      {/* Normal Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Confirm Stock Adjustment"
        onSubmit={() => {
          toast('Stock adjusted successfully', 'success');
          setModalOpen(false);
        }}
      >
        <p style={{ margin: '0 0 14px 0', color: 'var(--muted)' }}>
          Are you sure you want to write off 2 damaged units of <strong>Red Rice 25kg</strong>?
        </p>
        <Field label="Reason">
          <Input type="text" placeholder="e.g. Water damage during transport" defaultValue="Damaged packaging" />
        </Field>
      </Modal>

      {/* Wide Modal */}
      <Modal
        isOpen={wideModalOpen}
        onClose={() => setWideModalOpen(false)}
        title="Add New Catalogue Product"
        size="wide"
        submitLabel="Save Product"
        onSubmit={() => {
          toast('Product created', 'success');
          setWideModalOpen(false);
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Field label="Product Name" required>
            <Input type="text" placeholder="e.g. Bhutanese Honey 500g" />
          </Field>
          <Field label="Barcode">
            <Input type="text" placeholder="Leave blank to auto-generate" />
          </Field>
          <Field label="Selling Price (Nu.)" required>
            <Input type="number" placeholder="450.00" />
          </Field>
          <Field label="Cost Price (Nu.)">
            <Input type="number" placeholder="380.00" />
          </Field>
        </div>
      </Modal>

      {/* Data Table */}
      <Card>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Data Table</h2>
        <DataTable columns={sampleCols} data={sampleData} />

        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '24px 0 12px 0' }}>Loading State</h3>
        <DataTable columns={sampleCols} data={[]} loading />

        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '24px 0 12px 0' }}>Empty State</h3>
        <DataTable columns={sampleCols} data={[]} emptyMessage="No products match the filter criteria." />
      </Card>

      {/* Standalone Empty State */}
      <Card>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Standalone Empty State</h2>
        <EmptyState
          message="No active kitchen orders"
          description="Orders sent from POS will appear here for preparation."
          action={{ label: 'Go to POS Billing', onClick: () => toast('Navigating to POS...') }}
        />
      </Card>

      {/* Skeletons & Language Toggle */}
      <Card>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>Skeletons & Language Toggles</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
          <Skeleton variant="line" width="60%" />
          <Skeleton variant="line" width="90%" />
          <Skeleton variant="block" height={50} />
        </div>

        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px' }}>Light Toggle:</div>
            <LanguageToggle variant="light" />
          </div>
          <div style={{ backgroundColor: 'var(--navy)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--nav-sub)', marginBottom: '6px' }}>Sidebar Toggle:</div>
            <LanguageToggle variant="sidebar" />
          </div>
        </div>
      </Card>
    </div>
  );
};
