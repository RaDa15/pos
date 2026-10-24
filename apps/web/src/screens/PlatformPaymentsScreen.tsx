import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client.js';
import { PlatformLayout } from '../components/layout/PlatformLayout.js';
import { Card } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Pill } from '../components/ui/Pill.js';
import { Modal } from '../components/ui/Modal.js';
import { Field } from '../components/ui/Field.js';
import { Input } from '../components/ui/Input.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { useToast } from '../components/ui/Toast.js';

interface PlatformPaymentItem {
  id: string;
  businessId: string;
  plan: string;
  amount: number;
  method: string;
  bankName: string | null;
  reference: string;
  paidOn: string;
  status: 'pending' | 'verified' | 'rejected';
  rejectReason: string | null;
  createdAt: string;
  business: {
    id: string;
    name: string;
    businessCode: string;
    type: string;
    ownerName: string;
    phone: string | null;
  };
  submitter: {
    id: string;
    name: string;
    username: string;
  } | null;
}

export function PlatformPaymentsScreen() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'pending' | 'verified' | 'rejected'>('pending');

  // Verify modal state
  const [verifyTarget, setVerifyTarget] = useState<PlatformPaymentItem | null>(null);

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState<PlatformPaymentItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Fetch payments list
  const { data, isLoading } = useQuery<{ data: PlatformPaymentItem[] }>({
    queryKey: ['platform-payments', statusFilter],
    queryFn: async () => api.get<{ data: PlatformPaymentItem[] }>(`/api/v1/platform/payments?status=${statusFilter}`),
  });

  const payments = data?.data || [];

  // Verify payment mutation
  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/api/v1/platform/payments/${id}/verify`);
    },
    onSuccess: async () => {
      toast('Payment verified and business subscription extended by 30 days', 'success');
      setVerifyTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['platform-payments'] });
      await queryClient.invalidateQueries({ queryKey: ['platform-businesses'] });
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'Failed to verify payment', 'error');
    },
  });

  // Reject payment mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return api.post(`/api/v1/platform/payments/${id}/reject`, { reason });
    },
    onSuccess: async () => {
      toast('Payment rejected', 'info');
      setRejectTarget(null);
      setRejectReason('');
      setRejectError(null);
      await queryClient.invalidateQueries({ queryKey: ['platform-payments'] });
      await queryClient.invalidateQueries({ queryKey: ['platform-businesses'] });
    },
    onError: (err) => {
      setRejectError(err instanceof ApiError ? err.message : 'Failed to reject payment');
    },
  });

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setRejectError('Please enter a rejection reason.');
      return;
    }
    if (rejectTarget) {
      rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() });
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
    <PlatformLayout title="Subscription Payment Verification Queue (SCR-27)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Filter Card */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant={statusFilter === 'pending' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('pending')}
              >
                Pending Verification
              </Button>
              <Button
                variant={statusFilter === 'verified' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('verified')}
              >
                Verified
              </Button>
              <Button
                variant={statusFilter === 'rejected' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('rejected')}
              >
                Rejected
              </Button>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Showing {payments.length} {statusFilter} payment{payments.length === 1 ? '' : 's'}
            </div>
          </div>
        </Card>

        {/* Payments Table */}
        <Card>
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
              Loading payment queue...
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              message={
                statusFilter === 'pending'
                  ? 'No payments waiting for verification.'
                  : `No ${statusFilter} payments found.`
              }
              description={
                statusFilter === 'pending'
                  ? 'Offline bank transfer references and mobile banking journals submitted by businesses will appear here.'
                  : undefined
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: '12px' }}>
                    <th style={{ padding: '10px 12px' }}>Business</th>
                    <th style={{ padding: '10px 12px' }}>Plan</th>
                    <th style={{ padding: '10px 12px' }}>Amount</th>
                    <th style={{ padding: '10px 12px' }}>Method</th>
                    <th style={{ padding: '10px 12px' }}>Reference #</th>
                    <th style={{ padding: '10px 12px' }}>Paid Date</th>
                    <th style={{ padding: '10px 12px' }}>Submitted</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{p.business?.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {p.business?.businessCode} · {p.business?.ownerName}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textTransform: 'capitalize', fontWeight: 600 }}>
                        {p.plan}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--ink)' }}>
                        Nu. {Number(p.amount).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '10px 12px', textTransform: 'uppercase' }}>
                        <div>{p.method.replace(/_/g, ' ')}</div>
                        {p.bankName && (
                          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'none' }}>
                            {p.bankName}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--ink)' }}>
                        <code
                          style={{
                            backgroundColor: 'var(--paper)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '12.5px',
                          }}
                        >
                          {p.reference}
                        </code>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{formatDate(p.paidOn)}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--muted)', fontSize: '12px' }}>
                        <div>{formatDate(p.createdAt)}</div>
                        {p.submitter && (
                          <div style={{ fontSize: '11px' }}>by {p.submitter.name}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {p.status === 'pending' ? (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setVerifyTarget(p)}
                            >
                              Verify
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              style={{ color: 'var(--red)' }}
                              onClick={() => {
                                setRejectTarget(p);
                                setRejectReason('');
                                setRejectError(null);
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : p.status === 'verified' ? (
                          <Pill variant="success">Verified</Pill>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <Pill variant="danger">Rejected</Pill>
                            {p.rejectReason && (
                              <span style={{ fontSize: '11px', color: 'var(--red)', maxWidth: '160px', textAlign: 'right' }}>
                                {p.rejectReason}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Verify Payment Modal */}
      {verifyTarget && (
        <Modal
          title={`Verify Subscription Payment: ${verifyTarget.reference}`}
          isOpen={Boolean(verifyTarget)}
          onClose={() => setVerifyTarget(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
              Confirm payment verification for <strong>{verifyTarget.business?.name}</strong>?
            </p>

            <div
              style={{
                backgroundColor: 'var(--paper)',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                fontSize: '13px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              <div><strong>Plan:</strong> <span style={{ textTransform: 'capitalize' }}>{verifyTarget.plan}</span></div>
              <div><strong>Amount:</strong> Nu. {Number(verifyTarget.amount).toLocaleString('en-IN')}</div>
              <div><strong>Method:</strong> {verifyTarget.method.replace(/_/g, ' ').toUpperCase()}</div>
              <div><strong>Paid Date:</strong> {formatDate(verifyTarget.paidOn)}</div>
              <div><strong>Reference #:</strong> {verifyTarget.reference}</div>
            </div>

            <div
              style={{
                backgroundColor: '#ECFDF5',
                color: '#065F46',
                border: '1px solid #A7F3D0',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12.5px',
              }}
            >
              ✓ This will mark the payment as <strong>verified</strong>, activate the business subscription, and extend expiration by <strong>30 days</strong>.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <Button variant="outline" onClick={() => setVerifyTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate(verifyTarget.id)}
              >
                Confirm Verification
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Payment Modal */}
      {rejectTarget && (
        <Modal
          title={`Reject Payment: ${rejectTarget.reference}`}
          isOpen={Boolean(rejectTarget)}
          onClose={() => setRejectTarget(null)}
        >
          <form onSubmit={handleRejectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
              Rejecting will notify <strong>{rejectTarget.business?.name}</strong>. A reason is required so the tenant can correct their payment or reference details.
            </p>

            {rejectError && <div style={{ color: 'var(--red)', fontSize: '12.5px' }}>{rejectError}</div>}

            <Field label="Rejection Reason" required>
              <Input
                autoFocus
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Journal number not found in bank statement, incorrect amount..."
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                style={{ backgroundColor: 'var(--red)', borderColor: 'var(--red)' }}
                loading={rejectMutation.isPending}
              >
                Confirm Rejection
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </PlatformLayout>
  );
}
