import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client.js';
import { AppShell } from '../components/layout/AppShell.js';
import { Card } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Pill } from '../components/ui/Pill.js';
import { Modal } from '../components/ui/Modal.js';
import { Field } from '../components/ui/Field.js';
import { Input } from '../components/ui/Input.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';
import { useToast } from '../components/ui/Toast.js';
import { useAuth } from '../context/AuthContext.js';
import { SubscriptionBadge } from '../components/ui/SubscriptionBadge.js';

interface SubscriptionData {
  subscription: {
    id: string;
    plan: 'starter' | 'professional' | 'enterprise';
    status: string;
    effectiveStatus: string;
    startedAt: string;
    expiresAt: string;
    daysLeft: number;
    limits: {
      maxUsers: number;
      maxProducts: number;
      gstReports: boolean;
      customerLedger: boolean;
      supplierLedger: boolean;
    };
    activeNonAdminCount: number;
  };
  payments: Array<{
    id: string;
    plan: string;
    amount: number;
    method: string;
    bankName: string | null;
    reference: string;
    paidOn: string;
    status: 'pending' | 'verified' | 'rejected';
    rejectReason: string | null;
    createdAt: string;
  }>;
  history: Array<{
    id: string;
    event: string;
    plan: string | null;
    amount: number | null;
    detail: string | null;
    createdAt: string;
  }>;
}

const PLAN_TIERS = [
  {
    code: 'starter',
    name: 'Starter',
    priceNu: 800,
    priceLabel: 'Nu. 800 / month',
    maxUsers: 2,
    maxProducts: 500,
    description: 'Ideal for small retail shops and cafes getting started.',
    features: [
      'Up to 2 staff accounts (non-admin)',
      'Up to 500 products / menu items',
      'Point of Sale & receipt printing',
      'Basic sales & inventory tracking',
      'Offline sale resilience',
    ],
    missingFeatures: ['GST Reports', 'Customer Ledger', 'Supplier Ledger'],
  },
  {
    code: 'professional',
    name: 'Professional',
    priceNu: 2200,
    priceLabel: 'Nu. 2,200 / month',
    maxUsers: 10,
    maxProducts: Infinity,
    description: 'For growing businesses requiring GST reporting and ledger management.',
    features: [
      'Up to 10 staff accounts',
      'Unlimited products / menu items',
      'DRC-compliant GST reporting & CSV export',
      'Customer accounts & credit ledger',
      'Supplier purchase orders & inventory ledger',
      'Kitchen order display system (KDS)',
    ],
    missingFeatures: [],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    priceNu: 4500,
    priceLabel: 'Nu. 4,500 / month',
    maxUsers: Infinity,
    maxProducts: Infinity,
    description: 'For multi-terminal businesses requiring unlimited scale.',
    features: [
      'Unlimited staff accounts & roles',
      'Unlimited products & stock tracking',
      'All GST and financial accounting reports',
      'Full customer & supplier credit ledgers',
      'Real-time multi-register sync',
      'Priority Bhutanese phone & on-site support',
    ],
    missingFeatures: [],
  },
];

export function SubscriptionScreen() {
  const { checkMe } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Payment form states
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'professional' | 'enterprise'>('starter');
  const [paymentMethod, setPaymentMethod] = useState<'mbob' | 'mpay' | 'tpay' | 'dk_bank' | 'bank_transfer' | 'other_wallet'>('mbob');
  const [bankName, setBankName] = useState('Bank of Bhutan');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().split('T')[0]!);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch subscription info
  const { data, error } = useQuery<{ data: SubscriptionData }>({
    queryKey: ['subscription-details'],
    queryFn: async () => api.get<{ data: SubscriptionData }>('/api/v1/subscription'),
  });

  const subInfo = data?.data;
  const currentPlan = subInfo?.subscription.plan || 'starter';
  const effectiveStatus = subInfo?.subscription.effectiveStatus || 'trial';
  const daysLeft = subInfo?.subscription.daysLeft ?? 0;
  const activeNonAdmin = subInfo?.subscription.activeNonAdminCount ?? 0;

  // Change Plan mutation
  const changePlanMutation = useMutation({
    mutationFn: async (plan: 'starter' | 'professional' | 'enterprise') => {
      return api.post('/api/v1/subscription/change-plan', { plan });
    },
    onSuccess: async () => {
      toast('Subscription plan updated successfully', 'success');
      await queryClient.invalidateQueries({ queryKey: ['subscription-details'] });
      await checkMe();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast(err.message, 'error');
      } else {
        toast('Failed to change plan', 'error');
      }
    },
  });

  // Submit offline payment mutation
  const submitPaymentMutation = useMutation({
    mutationFn: async (paymentData: {
      plan: string;
      amount: number;
      method: string;
      bankName?: string;
      reference: string;
      paidOn: string;
    }) => {
      return api.post('/api/v1/subscription/payment', paymentData);
    },
    onSuccess: async () => {
      toast('Payment details submitted. Platform team will verify shortly.', 'success');
      setIsPaymentModalOpen(false);
      setReference('');
      await queryClient.invalidateQueries({ queryKey: ['subscription-details'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Failed to submit payment. Please verify inputs.');
      }
    },
  });

  // Cancel subscription mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      return api.post('/api/v1/subscription/cancel', { reason: cancelReason.trim() || undefined });
    },
    onSuccess: async () => {
      toast('Subscription cancelled', 'info');
      setIsCancelModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['subscription-details'] });
      await checkMe();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast(err.message, 'error');
      } else {
        toast('Failed to cancel subscription', 'error');
      }
    },
  });

  const handleOpenPayment = (planToRenew?: 'starter' | 'professional' | 'enterprise') => {
    setSelectedPlan(planToRenew || currentPlan);
    setFormError(null);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!reference.trim()) {
      setFormError('Please enter the payment journal or transaction reference number.');
      return;
    }

    const tier = PLAN_TIERS.find((p) => p.code === selectedPlan) || PLAN_TIERS[0]!;
    submitPaymentMutation.mutate({
      plan: selectedPlan,
      amount: tier.priceNu,
      method: paymentMethod,
      bankName: paymentMethod === 'bank_transfer' ? bankName : undefined,
      reference: reference.trim(),
      paidOn: paidOn,
    });
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
    <AppShell title="Subscription & Billing" subtitle="SCR-23: Manage plan tiers, payments, and renewals">
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Expiry Banner */}
        {effectiveStatus === 'expired' && (
          <AlertBanner
            variant="danger"
            message={`Your subscription expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago. Operational features are restricted. Renew now to restore full access.`}
            action={{
              label: 'Renew Now',
              onClick: () => handleOpenPayment(),
            }}
          />
        )}
        {effectiveStatus !== 'expired' && daysLeft <= 7 && (
          <AlertBanner
            variant="warning"
            message={`Your subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Renew early to avoid interruption.`}
            action={{
              label: 'Pay & Renew',
              onClick: () => handleOpenPayment(),
            }}
          />
        )}

        {error && (
          <AlertBanner variant="danger" message="Unable to load current subscription information." />
        )}

        {/* Current Plan Overview Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px',
          }}
        >
          <Card>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Current Plan
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)', textTransform: 'capitalize' }}>
                {currentPlan}
              </span>
              <SubscriptionBadge status={effectiveStatus} />
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
              {PLAN_TIERS.find((p) => p.code === currentPlan)?.priceLabel}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Subscription Period
            </div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', marginTop: '8px' }}>
              {formatDate(subInfo?.subscription.startedAt)} – {formatDate(subInfo?.subscription.expiresAt)}
            </div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                marginTop: '4px',
                color: effectiveStatus === 'expired' ? 'var(--red)' : daysLeft <= 7 ? 'var(--amber)' : 'var(--teal)',
              }}
            >
              {effectiveStatus === 'expired'
                ? `Expired (${Math.abs(daysLeft)}d ago)`
                : `${daysLeft} days remaining`}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Active Staff Usage
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)', marginTop: '6px' }}>
              {activeNonAdmin}{' '}
              <span style={{ fontSize: '15px', color: 'var(--muted)', fontWeight: 500 }}>
                / {subInfo?.subscription.limits.maxUsers === 2147483647 ? '∞' : subInfo?.subscription.limits.maxUsers || 2} non-admin staff
              </span>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '4px' }}>
              Admin account does not count against limits
            </div>
          </Card>

          <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
            <Button
              variant="primary"
              size="md"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => handleOpenPayment()}
            >
              💳 Pay & Renew
            </Button>
            {effectiveStatus !== 'cancelled' && (
              <Button
                variant="outline"
                size="sm"
                style={{ width: '100%', justifyContent: 'center', color: 'var(--red)' }}
                onClick={() => setIsCancelModalOpen(true)}
              >
                Cancel Subscription
              </Button>
            )}
          </Card>
        </div>

        {/* Plan Tiers Selection */}
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--ink)' }}>
            Available Subscription Plans
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px',
            }}
          >
            {PLAN_TIERS.map((tier) => {
              const isCurrent = currentPlan === tier.code;
              const isDowngradeBlocked = tier.maxUsers < activeNonAdmin;

              return (
                <Card
                  key={tier.code}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    border: isCurrent ? '2px solid var(--teal)' : '1px solid var(--line)',
                    position: 'relative',
                  }}
                >
                  {isCurrent && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '16px',
                        backgroundColor: 'var(--teal)',
                        color: '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        textTransform: 'uppercase',
                      }}
                    >
                      Active Plan
                    </div>
                  )}

                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--ink)' }}>
                    {tier.name}
                  </h3>
                  <div style={{ fontSize: '13px', color: 'var(--muted)', minHeight: '36px' }}>
                    {tier.description}
                  </div>

                  <div style={{ margin: '14px 0', padding: '12px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--ink)' }}>
                      Nu. {tier.priceNu.toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}> / month</span>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    {tier.features.map((feat, idx) => (
                      <div key={idx} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink)' }}>
                        <span style={{ color: 'var(--teal)', fontWeight: 700 }}>✓</span>
                        <span>{feat}</span>
                      </div>
                    ))}
                    {tier.missingFeatures.map((mfeat, idx) => (
                      <div key={idx} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted)' }}>
                        <span style={{ color: 'var(--line-strong)', fontWeight: 700 }}>✕</span>
                        <span style={{ textDecoration: 'line-through' }}>{mfeat}</span>
                      </div>
                    ))}
                  </div>

                  {isCurrent ? (
                    <Button variant="outline" disabled style={{ width: '100%', justifyContent: 'center' }}>
                      Current Plan
                    </Button>
                  ) : (
                    <div>
                      {isDowngradeBlocked ? (
                        <div>
                          <Button
                            variant="outline"
                            disabled
                            style={{ width: '100%', justifyContent: 'center', opacity: 0.6 }}
                          >
                            Switch to {tier.name}
                          </Button>
                          <div style={{ fontSize: '11.5px', color: 'var(--red)', marginTop: '6px', textAlign: 'center' }}>
                            Blocked: You have {activeNonAdmin} active staff accounts. {tier.name} allows max {tier.maxUsers}.
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="primary"
                          loading={changePlanMutation.isPending}
                          style={{ width: '100%', justifyContent: 'center' }}
                          onClick={() => changePlanMutation.mutate(tier.code as 'starter' | 'professional' | 'enterprise')}
                        >
                          Switch to {tier.name}
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Submitted Offline Payments Table */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                Offline Payment History
              </h3>
              <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: '2px 0 0 0' }}>
                Journal references submitted for verification by the platform administration
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleOpenPayment()}>
              + Submit New Payment
            </Button>
          </div>

          {subInfo?.payments && subInfo.payments.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: '12px' }}>
                    <th style={{ padding: '8px 12px' }}>Reference #</th>
                    <th style={{ padding: '8px 12px' }}>Plan</th>
                    <th style={{ padding: '8px 12px' }}>Amount</th>
                    <th style={{ padding: '8px 12px' }}>Method</th>
                    <th style={{ padding: '8px 12px' }}>Paid Date</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subInfo.payments.map((pmt) => (
                    <tr key={pmt.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--ink)' }}>
                        {pmt.reference}
                      </td>
                      <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>{pmt.plan}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        Nu. {pmt.amount.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '10px 12px', textTransform: 'uppercase' }}>
                        {pmt.method.replace(/_/g, ' ')} {pmt.bankName ? `(${pmt.bankName})` : ''}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{formatDate(pmt.paidOn)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {pmt.status === 'verified' && <Pill variant="success">Verified</Pill>}
                        {pmt.status === 'pending' && <Pill variant="warning">Pending</Pill>}
                        {pmt.status === 'rejected' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <Pill variant="danger">Rejected</Pill>
                            {pmt.rejectReason && (
                              <span style={{ fontSize: '11px', color: 'var(--red)' }}>
                                {pmt.rejectReason}
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
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              No offline payments submitted yet.
            </div>
          )}
        </Card>

        {/* Subscription Event History */}
        <Card>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--ink)' }}>
            Subscription Activity Log
          </h3>
          {subInfo?.history && subInfo.history.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)', fontSize: '12px' }}>
                    <th style={{ padding: '8px 12px' }}>Date</th>
                    <th style={{ padding: '8px 12px' }}>Event</th>
                    <th style={{ padding: '8px 12px' }}>Plan</th>
                    <th style={{ padding: '8px 12px' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {subInfo.history.map((hist) => (
                    <tr key={hist.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>
                        {formatDate(hist.createdAt)}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        <span style={{ textTransform: 'capitalize' }}>
                          {hist.event.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>
                        {hist.plan || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--ink)' }}>
                        {hist.detail || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              No subscription history recorded yet.
            </div>
          )}
        </Card>
      </div>

      {/* Pay & Renew Modal (SCR-23) */}
      {isPaymentModalOpen && (
        <Modal
          title="Submit Offline Payment"
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
        >
          <form onSubmit={handlePaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {formError && <AlertBanner variant="danger" message={formError} />}

            {/* Recipient Account Details Card */}
            <div
              style={{
                backgroundColor: 'var(--paper)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                fontSize: '12.5px',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: '4px' }}>
                Bank Transfer / Mobile Banking Instructions:
              </div>
              <div style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
                <div><strong>Account Name:</strong> Yuevaan IT Technologies POS</div>
                <div><strong>Account No:</strong> 2018829910 (Bank of Bhutan)</div>
                <div><strong>Accepted Apps:</strong> mBoB, mPay, TPay, DK Bank, or any RMA BFS transfer</div>
              </div>
            </div>

            <Field label="Subscription Plan" required>
              <select
                value={selectedPlan}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setSelectedPlan(e.target.value as 'starter' | 'professional' | 'enterprise')
                }
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
                <option value="starter">Starter — Nu. 800 / month</option>
                <option value="professional">Professional — Nu. 2,200 / month</option>
                <option value="enterprise">Enterprise — Nu. 4,500 / month</option>
              </select>
            </Field>

            <Field label="Payment Method" required>
              <select
                value={paymentMethod}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setPaymentMethod(e.target.value as 'mbob' | 'mpay' | 'tpay' | 'dk_bank' | 'bank_transfer' | 'other_wallet')
                }
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
                <option value="mbob">mBoB (Bank of Bhutan)</option>
                <option value="mpay">mPay (Bhutan National Bank)</option>
                <option value="tpay">TPay (Tashi Bank)</option>
                <option value="dk_bank">DK Bank</option>
                <option value="bank_transfer">Direct Bank Transfer</option>
                <option value="other_wallet">Other Wallet / BFS</option>
              </select>
            </Field>

            {paymentMethod === 'bank_transfer' && (
              <Field label="Bank Name" required>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. Bank of Bhutan, BNB, T Bank"
                />
              </Field>
            )}

            <Field label="Journal / Transaction Reference Number" required>
              <Input
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. 20261024109823 or MB123456"
              />
            </Field>

            <Field label="Payment Date" required>
              <Input
                type="date"
                required
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitPaymentMutation.isPending}>
                Submit for Verification
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Cancel Subscription Modal */}
      {isCancelModalOpen && (
        <Modal
          title="Cancel Subscription"
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
              Are you sure you want to cancel your subscription? Your access will remain active until the end of your billing cycle ({formatDate(subInfo?.subscription.expiresAt)}), after which operational functions (POS, Invoices, Inventory updates) will be restricted.
            </p>

            <Field label="Reason for cancellation (optional)">
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Help us improve: tell us why you are cancelling..."
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <Button variant="outline" onClick={() => setIsCancelModalOpen(false)}>
                Keep Subscription
              </Button>
              <Button
                variant="primary"
                style={{ backgroundColor: 'var(--red)', borderColor: 'var(--red)' }}
                loading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
