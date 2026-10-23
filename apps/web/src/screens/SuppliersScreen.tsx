import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client.js';
import { useToast } from '../components/ui/Toast.js';
import { Button } from '../components/ui/Button.js';
import { Card } from '../components/ui/Card.js';
import { Modal } from '../components/ui/Modal.js';
import { Input } from '../components/ui/Input.js';
import { Pill } from '../components/ui/Pill.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { useAuth } from '../context/AuthContext.js';
import { ROLE_PERMISSIONS, EmployeeRole } from '@pos/shared';

interface SupplierItem {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  openingPaid: number;
  openingOutstanding: number;
  paidTotal: number;
  outstandingTotal: number;
  active: boolean;
  createdAt: string;
}

export const SuppliersScreen: React.FC = () => {
  const { employee } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const role = (employee?.role as EmployeeRole) || 'cashier';
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  const canManage = rolePermissions.includes('suppliers.manage');

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [openingPaid, setOpeningPaid] = useState<number | ''>(0);
  const [openingOutstanding, setOpeningOutstanding] = useState<number | ''>(0);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState('');

  // 1. Fetch suppliers
  const { data: supplierResponse, isLoading } = useQuery<{
    data: SupplierItem[];
    summary: { totalPaid: number; totalOutstanding: number };
  }>({
    queryKey: ['suppliers-list', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      return apiClient.get(`/suppliers?${params.toString()}`);
    },
  });

  // 2. Mutation
  const supplierMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editingSupplier) {
        return apiClient.patch(`/suppliers/${editingSupplier.id}`, payload);
      }
      return apiClient.post('/suppliers', payload);
    },
    onSuccess: () => {
      toast(editingSupplier ? 'Supplier updated.' : 'Supplier saved.', 'success');
      queryClient.invalidateQueries({ queryKey: ['suppliers-list'] });
      setIsModalOpen(false);
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Operation failed');
    },
  });

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
    setOpeningPaid(0);
    setOpeningOutstanding(0);
    setIsActive(true);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (s: SupplierItem) => {
    setEditingSupplier(s);
    setName(s.name);
    setPhone(s.phone || '');
    setEmail(s.email || '');
    setAddress(s.address || '');
    setNotes(s.notes || '');
    setOpeningPaid(s.openingPaid);
    setOpeningOutstanding(s.openingOutstanding);
    setIsActive(s.active);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Supplier name is required.');
      return;
    }

    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      openingPaid: openingPaid !== '' ? Number(openingPaid) : 0,
      openingOutstanding: openingOutstanding !== '' ? Number(openingOutstanding) : 0,
      active: editingSupplier ? isActive : undefined,
    };

    supplierMutation.mutate(payload);
  };

  const suppliers = supplierResponse?.data ?? [];
  const summary = supplierResponse?.summary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--spacing-4)',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', margin: 0 }}>
            Suppliers & Vendors
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: 'var(--spacing-1) 0 0 0' }}>
            Manage supplier records, contact details, total purchases, and outstanding payable balances.
          </p>
        </div>

        {canManage && (
          <Button variant="primary" onClick={handleOpenCreate}>
            + Add Supplier
          </Button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--spacing-4)',
        }}
      >
        <Card
          style={{
            borderLeft: '4px solid var(--color-success)',
          }}
        >
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}>
            Total Paid to Suppliers
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--color-success)', marginTop: 'var(--spacing-1)' }}>
            Nu. {(summary?.totalPaid ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--spacing-1)' }}>
            Sum of opening paid balances + verified purchase payments
          </div>
        </Card>

        <Card
          style={{
            borderLeft: '4px solid var(--color-danger)',
          }}
        >
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}>
            Total Outstanding Payables
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--color-danger)', marginTop: 'var(--spacing-1)' }}>
            Nu. {(summary?.totalOutstanding ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--spacing-1)' }}>
            Unsettled balance owed across all active vendors
          </div>
        </Card>
      </div>

      {/* Filter & Table Card */}
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--spacing-4)',
          }}
        >
          <div style={{ width: '320px' }}>
            <Input
              placeholder="Search supplier, contact, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-8)', color: 'var(--color-text-muted)' }}>
            Loading suppliers...
          </div>
        ) : suppliers.length === 0 ? (
          <EmptyState
            message={search ? 'No suppliers match your search.' : 'No suppliers registered yet.'}
            description="Add suppliers to record purchases and track payable balances."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '13.5px',
              }}
            >
            <thead>
              <tr>
                <th>Supplier Name</th>
                <th>Contact Details</th>
                <th>Address</th>
                <th>Total Paid</th>
                <th>Outstanding</th>
                <th>Notes</th>
                {canManage && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    {!s.active && <Pill variant="neutral">Inactive</Pill>}
                  </td>
                  <td>
                    <div>{s.phone || '—'}</div>
                    {s.email && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {s.email}
                      </div>
                    )}
                  </td>
                  <td>{s.address || '—'}</td>
                  <td style={{ fontWeight: 500, color: 'var(--color-success)' }}>
                    Nu. {s.paidTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight: 'bold',
                        color: s.outstandingTotal > 0 ? 'var(--color-danger)' : 'inherit',
                      }}
                    >
                      Nu. {s.outstandingTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                    {s.notes || '—'}
                  </td>
                  {canManage && (
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="outline" onClick={() => handleOpenEdit(s)}>
                        Edit
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {/* Supplier Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          {formError && (
            <div
              style={{
                padding: 'var(--spacing-3)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-danger)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {formError}
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Supplier / Vendor Name *
            </label>
            <Input
              placeholder="e.g. Bhutan Food Distributors"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                Phone Number
              </label>
              <Input
                placeholder="e.g. +975 17112299"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                Email Address
              </label>
              <Input
                type="email"
                placeholder="e.g. sales@vendor.bt"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Address / Warehouse Location
            </label>
            <Input
              placeholder="e.g. Olakha Industrial Area, Thimphu"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                Opening Paid (Nu.)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openingPaid}
                onChange={(e) => setOpeningPaid(e.target.value ? Number(e.target.value) : 0)}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                Opening Outstanding (Nu.)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openingOutstanding}
                onChange={(e) => setOpeningOutstanding(e.target.value ? Number(e.target.value) : 0)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Notes & Delivery Schedule
            </label>
            <Input
              placeholder="e.g. Weekly deliveries every Tuesday morning"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {editingSupplier && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
              <input
                type="checkbox"
                id="supplier-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label htmlFor="supplier-active" style={{ fontWeight: 500 }}>
                Active supplier
              </label>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-2)' }}>
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={supplierMutation.isPending}>
              {supplierMutation.isPending ? 'Saving...' : 'Save Supplier'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
