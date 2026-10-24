import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client.js';
import { PlatformLayout } from '../components/layout/PlatformLayout.js';
import { Card } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Pill, type PillVariant } from '../components/ui/Pill.js';
import { Modal } from '../components/ui/Modal.js';
import { Field } from '../components/ui/Field.js';
import { Input } from '../components/ui/Input.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { useToast } from '../components/ui/Toast.js';

interface BusinessListItem {
  id: string;
  businessCode: string;
  name: string;
  type: 'grocery' | 'restaurant';
  ownerName: string;
  phone: string | null;
  email: string | null;
  plan: string;
  status: string;
  effectiveStatus: string;
  expiresAt: string;
  daysLeft: number;
  activeEmployeeCount: number;
  createdAt: string;
}

interface BusinessDetail {
  id: string;
  businessCode: string;
  name: string;
  type: 'grocery' | 'restaurant';
  ownerName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tpn: string | null;
  gstRegistered: boolean;
  gstNo: string | null;
  activeEmployeeCount: number;
  createdAt: string;
  subscription: {
    id: string;
    plan: string;
    status: string;
    effectiveStatus: string;
    startedAt: string;
    expiresAt: string;
    daysLeft: number;
  } | null;
  subscriptionEvents: Array<{
    id: string;
    eventType: string;
    fromPlan: string | null;
    toPlan: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  subscriptionPayments: Array<{
    id: string;
    plan: string;
    amount: number;
    method: string;
    bankName: string | null;
    reference: string;
    paidOn: string;
    status: string;
    createdAt: string;
  }>;
}

export function PlatformBusinessesScreen() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBizId, setSelectedBizId] = useState<string | null>(null);

  // Password reset modal state
  const [isResetPwdModalOpen, setIsResetPwdModalOpen] = useState(false);
  const [resetPwdBiz, setResetPwdBiz] = useState<BusinessListItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetPwdSuccess, setResetPwdSuccess] = useState<string | null>(null);

  // Suspend modal state
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  // Fetch businesses list
  const queryParams = new URLSearchParams();
  if (search.trim()) queryParams.set('search', search.trim());
  if (statusFilter && statusFilter !== 'all') queryParams.set('status', statusFilter);

  const { data: listData, isLoading } = useQuery<{ data: BusinessListItem[] }>({
    queryKey: ['platform-businesses', search, statusFilter],
    queryFn: async () => api.get<{ data: BusinessListItem[] }>(`/api/v1/platform/businesses?${queryParams.toString()}`),
  });

  // Fetch selected business details
  const { data: detailData, isLoading: detailLoading } = useQuery<{ data: BusinessDetail }>({
    queryKey: ['platform-business-detail', selectedBizId],
    queryFn: async () => api.get<{ data: BusinessDetail }>(`/api/v1/platform/businesses/${selectedBizId}`),
    enabled: Boolean(selectedBizId),
  });

  const businesses = listData?.data || [];
  const selectedBiz = detailData?.data;

  // Extend 14 days mutation
  const extendMutation = useMutation({
    mutationFn: async (bizId: string) => {
      return api.post(`/api/v1/platform/businesses/${bizId}/extend`, { days: 14 });
    },
    onSuccess: async () => {
      toast('Subscription extended by 14 days', 'success');
      await queryClient.invalidateQueries({ queryKey: ['platform-businesses'] });
      await queryClient.invalidateQueries({ queryKey: ['platform-business-detail', selectedBizId] });
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'Failed to extend subscription', 'error');
    },
  });

  // Suspend mutation
  const suspendMutation = useMutation({
    mutationFn: async ({ bizId, reason }: { bizId: string; reason?: string }) => {
      return api.post(`/api/v1/platform/businesses/${bizId}/suspend`, { reason });
    },
    onSuccess: async () => {
      toast('Business suspended successfully', 'info');
      setIsSuspendModalOpen(false);
      setSuspendReason('');
      await queryClient.invalidateQueries({ queryKey: ['platform-businesses'] });
      await queryClient.invalidateQueries({ queryKey: ['platform-business-detail', selectedBizId] });
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'Failed to suspend business', 'error');
    },
  });

  // Reactivate mutation
  const reactivateMutation = useMutation({
    mutationFn: async (bizId: string) => {
      return api.post(`/api/v1/platform/businesses/${bizId}/reactivate`);
    },
    onSuccess: async () => {
      toast('Business reactivated successfully', 'success');
      await queryClient.invalidateQueries({ queryKey: ['platform-businesses'] });
      await queryClient.invalidateQueries({ queryKey: ['platform-business-detail', selectedBizId] });
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'Failed to reactivate business', 'error');
    },
  });

  // Reset password mutation
  const resetPwdMutation = useMutation({
    mutationFn: async ({ bizId, pwd }: { bizId: string; pwd?: string }) => {
      return api.post<{ message: string; newPassword?: string }>(
        `/api/v1/platform/businesses/${bizId}/reset-password`,
        pwd ? { newPassword: pwd } : {}
      );
    },
    onSuccess: (res) => {
      setResetPwdSuccess(res.newPassword || newPassword || 'Password reset successful');
      toast('Company password reset successfully', 'success');
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'Failed to reset password', 'error');
    },
  });

  const getStatusBadgeVariant = (st: string): PillVariant => {
    switch (st.toLowerCase()) {
      case 'active':
        return 'success';
      case 'trial':
        return 'warning';
      case 'suspended':
        return 'danger';
      case 'expired':
        return 'danger';
      case 'cancelled':
      default:
        return 'neutral';
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  return (
    <PlatformLayout title="Businesses Directory (SCR-26)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Filters and Search Card */}
        <Card>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
              alignItems: 'flex-end',
            }}
          >
            <Field label="Search Businesses">
              <Input
                placeholder="Search by name, code, phone, email, owner..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>

            <Field label="Status Filter">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  fontSize: '13px',
                  width: '100%',
                  backgroundColor: 'var(--panel)',
                  color: 'var(--ink)',
                }}
              >
                <option value="all">All Statuses</option>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="outline"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
              >
                Reset Search
              </Button>
            </div>
          </div>
        </Card>

        {/* Directory Table */}
        <Card>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13.5px', color: 'var(--muted)' }}>
              Total registered businesses: <strong>{businesses.length}</strong>
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
              Loading businesses...
            </div>
          ) : businesses.length === 0 ? (
            <EmptyState
              message="No businesses registered yet."
              description="Registered grocery shops and restaurants will appear here for operational management."
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: '12px' }}>
                    <th style={{ padding: '10px 12px' }}>Business</th>
                    <th style={{ padding: '10px 12px' }}>Type</th>
                    <th style={{ padding: '10px 12px' }}>Owner</th>
                    <th style={{ padding: '10px 12px' }}>Plan</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px' }}>Expires</th>
                    <th style={{ padding: '10px 12px' }}>Staff</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((b) => (
                    <tr
                      key={b.id}
                      style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                      onClick={() => setSelectedBizId(b.id)}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{b.name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--muted)', fontFamily: 'monospace' }}>
                          {b.businessCode}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>{b.type}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div>{b.ownerName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{b.phone || b.email || '—'}</div>
                      </td>
                      <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>
                        <span style={{ fontWeight: 600 }}>{b.plan}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Pill variant={getStatusBadgeVariant(b.effectiveStatus)}>
                          {b.effectiveStatus}
                        </Pill>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div>{formatDate(b.expiresAt)}</div>
                        <div style={{ fontSize: '11px', color: b.daysLeft <= 7 ? 'var(--amber)' : 'var(--muted)' }}>
                          {b.effectiveStatus === 'expired' ? 'Expired' : `${b.daysLeft}d left`}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        {b.activeEmployeeCount}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setSelectedBizId(b.id);
                          }}
                        >
                          Manage →
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Business Details Modal (SCR-26) */}
      {selectedBizId && (
        <Modal
          title={selectedBiz ? `${selectedBiz.name} (${selectedBiz.businessCode})` : 'Loading Business Details...'}
          isOpen={Boolean(selectedBizId)}
          onClose={() => setSelectedBizId(null)}
        >
          {detailLoading || !selectedBiz ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
              Loading business profile...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Top Quick Actions Bar */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  backgroundColor: 'var(--paper)',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                }}
              >
                <Button
                  variant="primary"
                  size="sm"
                  loading={extendMutation.isPending}
                  onClick={() => extendMutation.mutate(selectedBiz.id)}
                >
                  + Extend 14 Days
                </Button>

                {selectedBiz.subscription?.status === 'suspended' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={reactivateMutation.isPending}
                    onClick={() => reactivateMutation.mutate(selectedBiz.id)}
                  >
                    Reactivate Account
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ color: 'var(--red)' }}
                    onClick={() => setIsSuspendModalOpen(true)}
                  >
                    Suspend Account
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const found = businesses.find((b) => b.id === selectedBiz.id) || null;
                    setResetPwdBiz(found);
                    setNewPassword('');
                    setResetPwdSuccess(null);
                    setIsResetPwdModalOpen(true);
                  }}
                >
                  🔑 Reset Company Password
                </Button>
              </div>

              {/* Business Overview */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  fontSize: '13px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                    Owner
                  </span>
                  <strong>{selectedBiz.ownerName}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                    Type
                  </span>
                  <span style={{ textTransform: 'capitalize' }}>{selectedBiz.type}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                    Phone / Email
                  </span>
                  <span>{selectedBiz.phone || '—'} / {selectedBiz.email || '—'}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                    GST Registered
                  </span>
                  <span>{selectedBiz.gstRegistered ? `Yes (${selectedBiz.gstNo || 'No TPN'})` : 'No'}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                    Current Plan
                  </span>
                  <strong style={{ textTransform: 'capitalize' }}>{selectedBiz.subscription?.plan || 'Starter'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                    Status
                  </span>
                  <Pill variant={getStatusBadgeVariant(selectedBiz.subscription?.effectiveStatus || 'trial')}>
                    {selectedBiz.subscription?.effectiveStatus || 'trial'}
                  </Pill>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                    Expiry Date
                  </span>
                  <span>{formatDate(selectedBiz.subscription?.expiresAt)} ({selectedBiz.subscription?.daysLeft ?? 0}d left)</span>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>
                    Active Non-Admin Staff
                  </span>
                  <strong>{selectedBiz.activeEmployeeCount}</strong>
                </div>
              </div>

              {/* Payments History */}
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink)' }}>
                  Subscription Payments
                </h4>
                {selectedBiz.subscriptionPayments && selectedBiz.subscriptionPayments.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                        <th style={{ padding: '6px' }}>Ref #</th>
                        <th style={{ padding: '6px' }}>Plan</th>
                        <th style={{ padding: '6px' }}>Amount</th>
                        <th style={{ padding: '6px' }}>Method</th>
                        <th style={{ padding: '6px' }}>Paid Date</th>
                        <th style={{ padding: '6px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBiz.subscriptionPayments.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '6px', fontWeight: 600 }}>{p.reference}</td>
                          <td style={{ padding: '6px', textTransform: 'capitalize' }}>{p.plan}</td>
                          <td style={{ padding: '6px' }}>Nu. {p.amount}</td>
                          <td style={{ padding: '6px', textTransform: 'uppercase' }}>{p.method}</td>
                          <td style={{ padding: '6px' }}>{formatDate(p.paidOn)}</td>
                          <td style={{ padding: '6px' }}>
                            <Pill variant={getStatusBadgeVariant(p.status)}>{p.status}</Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>No payment records found.</div>
                )}
              </div>

              {/* Subscription Events History */}
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink)' }}>
                  Subscription History Log
                </h4>
                {selectedBiz.subscriptionEvents && selectedBiz.subscriptionEvents.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                        <th style={{ padding: '6px' }}>Date</th>
                        <th style={{ padding: '6px' }}>Event</th>
                        <th style={{ padding: '6px' }}>Plan</th>
                        <th style={{ padding: '6px' }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBiz.subscriptionEvents.map((ev) => (
                        <tr key={ev.id} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td style={{ padding: '6px', color: 'var(--muted)' }}>{formatDate(ev.createdAt)}</td>
                          <td style={{ padding: '6px', fontWeight: 600, textTransform: 'capitalize' }}>
                            {ev.eventType.replace(/_/g, ' ')}
                          </td>
                          <td style={{ padding: '6px', textTransform: 'capitalize' }}>
                            {ev.fromPlan && ev.toPlan ? `${ev.fromPlan} → ${ev.toPlan}` : ev.toPlan || ev.fromPlan || '—'}
                          </td>
                          <td style={{ padding: '6px' }}>{ev.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>No subscription events recorded.</div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <Button variant="outline" onClick={() => setSelectedBizId(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Suspend Confirmation Modal */}
      {isSuspendModalOpen && selectedBiz && (
        <Modal
          title={`Suspend Business: ${selectedBiz.name}`}
          isOpen={isSuspendModalOpen}
          onClose={() => setIsSuspendModalOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
              Suspending this business will immediately block all terminal logins and POS operations. You can reactivate the account later.
            </p>

            <Field label="Suspension Reason (optional)">
              <Input
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g. Non-payment, regulatory request, fraudulent activity..."
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="outline" onClick={() => setIsSuspendModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ backgroundColor: 'var(--red)', borderColor: 'var(--red)' }}
                loading={suspendMutation.isPending}
                onClick={() => suspendMutation.mutate({ bizId: selectedBiz.id, reason: suspendReason.trim() || undefined })}
              >
                Confirm Suspend
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reset Password Modal */}
      {isResetPwdModalOpen && resetPwdBiz && (
        <Modal
          title={`Reset Company Password: ${resetPwdBiz.name}`}
          isOpen={isResetPwdModalOpen}
          onClose={() => setIsResetPwdModalOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {resetPwdSuccess ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: '32px', color: 'var(--teal)', marginBottom: '8px' }}>✓</div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>
                  Password Reset Successfully!
                </div>
                <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '8px' }}>
                  Please share the new company credentials securely with the owner:
                </div>
                <div
                  style={{
                    backgroundColor: 'var(--paper)',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '16px',
                    marginTop: '8px',
                    color: 'var(--ink)',
                    userSelect: 'all',
                  }}
                >
                  {resetPwdSuccess}
                </div>
                <Button
                  variant="primary"
                  style={{ marginTop: '16px', width: '100%', justifyContent: 'center' }}
                  onClick={() => setIsResetPwdModalOpen(false)}
                >
                  Done
                </Button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
                  Enter a new company master password (min 8 characters), or leave blank to automatically generate a secure temporary password.
                </p>

                <Field label="New Master Password (optional)">
                  <Input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave blank to auto-generate"
                  />
                </Field>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                  <Button variant="outline" onClick={() => setIsResetPwdModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    loading={resetPwdMutation.isPending}
                    onClick={() => resetPwdMutation.mutate({ bizId: resetPwdBiz.id, pwd: newPassword.trim() || undefined })}
                  >
                    Reset Password
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </PlatformLayout>
  );
}
