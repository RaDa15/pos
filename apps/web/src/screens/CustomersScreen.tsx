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

interface CustomerItem {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstId: string | null;
  creditLimit: number | null;
  totalSpent: number;
  outstandingBalance: number;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

interface CustomerHistory {
  customer: {
    id: string;
    name: string;
    type: string;
    phone: string | null;
    creditLimit: number | null;
    totalSpent: number;
    outstandingBalance: number;
  };
  sales: Array<{
    id: string;
    invoiceNo: string;
    status: string;
    total: number;
    paid: number;
    credit: number;
    completedAt: string;
  }>;
  settlements: Array<{
    id: string;
    receiptNo: string;
    method: string;
    amount: number;
    bankName: string | null;
    journalNo: string | null;
    remarks: string | null;
    status: string;
    createdAt: string;
    receivedBy: string;
  }>;
}

export const CustomersScreen: React.FC = () => {
  const { employee } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const role = (employee?.role as EmployeeRole) || 'cashier';
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  const canManage = rolePermissions.includes('customers.manage');
  const canSettle = rolePermissions.includes('customers.settle');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modal states
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstId, setGstId] = useState('');
  const [customerType, setCustomerType] = useState('regular');
  const [creditLimit, setCreditLimit] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [customerFormError, setCustomerFormError] = useState('');

  // Settlement modal state
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [settleCustomer, setSettleCustomer] = useState<CustomerItem | null>(null);
  const [settleAmount, setSettleAmount] = useState<number | ''>('');
  const [settleMethod, setSettleMethod] = useState('cash');
  const [settleBankName, setSettleBankName] = useState('');
  const [settleJournalNo, setSettleJournalNo] = useState('');
  const [settleRemarks, setSettleRemarks] = useState('');
  const [settleError, setSettleError] = useState('');

  // History drawer state
  const [historyCustomerId, setHistoryCustomerId] = useState<string | null>(null);

  // 1. Fetch customers
  const { data: customerResponse, isLoading } = useQuery<{
    data: CustomerItem[];
    headerTotals: { outstandingTotal: number; customersWithBalance: number };
    meta: { page: number; limit: number; total: number };
  }>({
    queryKey: ['customers-list', search, typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      params.set('page', page.toString());
      params.set('limit', '50');

      return apiClient.get(`/customers?${params.toString()}`);
    },
  });

  // 2. Fetch history if opened
  const { data: historyData, isLoading: isHistoryLoading } = useQuery<{
    data: CustomerHistory;
  }>({
    queryKey: ['customer-history', historyCustomerId],
    queryFn: async () => {
      return apiClient.get(`/customers/${historyCustomerId}/history`);
    },
    enabled: Boolean(historyCustomerId),
  });

  // 3. Customer mutation
  const customerMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editingCustomer) {
        return apiClient.patch(`/customers/${editingCustomer.id}`, payload);
      }
      return apiClient.post('/customers', payload);
    },
    onSuccess: () => {
      toast(editingCustomer ? 'Customer updated.' : 'Customer added.', 'success');
      queryClient.invalidateQueries({ queryKey: ['customers-list'] });
      setIsCustomerModalOpen(false);
    },
    onError: (err: Error) => {
      setCustomerFormError(err.message || 'Operation failed');
    },
  });

  // 4. Settle mutation
  const settleMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      return apiClient.post<{ data: { payment: { receiptNo: string }; customer: { outstandingBalance: number } } }>(
        `/customers/${settleCustomer?.id}/settlements`,
        payload,
        {
          'Idempotency-Key': crypto.randomUUID(),
        }
      );
    },
    onSuccess: (res) => {
      const receiptNo = res.data?.payment?.receiptNo;
      const newBal = res.data?.customer?.outstandingBalance ?? 0;
      toast(`Nu. ${settleAmount} received from ${settleCustomer?.name} (${receiptNo}). Balance: Nu. ${newBal.toFixed(2)}.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['customers-list'] });
      queryClient.invalidateQueries({ queryKey: ['customer-history'] });
      setIsSettleModalOpen(false);
    },
    onError: (err: Error) => {
      setSettleError(err.message || 'Settlement failed');
    },
  });

  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setGstId('');
    setCustomerType('regular');
    setCreditLimit('');
    setNotes('');
    setIsActive(true);
    setCustomerFormError('');
    setIsCustomerModalOpen(true);
  };

  const handleOpenEdit = (c: CustomerItem) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone || '');
    setEmail(c.email || '');
    setAddress(c.address || '');
    setGstId(c.gstId || '');
    setCustomerType(c.type);
    setCreditLimit(c.creditLimit !== null ? c.creditLimit : '');
    setNotes(c.notes || '');
    setIsActive(c.active);
    setCustomerFormError('');
    setIsCustomerModalOpen(true);
  };

  const handleOpenSettle = (c: CustomerItem) => {
    setSettleCustomer(c);
    setSettleAmount(c.outstandingBalance);
    setSettleMethod('cash');
    setSettleBankName('');
    setSettleJournalNo('');
    setSettleRemarks('');
    setSettleError('');
    setIsSettleModalOpen(true);
  };

  const handleCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomerFormError('');

    if (!name.trim()) {
      setCustomerFormError('Customer name is required.');
      return;
    }

    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      gstId: gstId.trim() || null,
      type: customerType,
      creditLimit: creditLimit !== '' ? Number(creditLimit) : null,
      notes: notes.trim() || null,
      active: editingCustomer ? isActive : undefined,
    };

    customerMutation.mutate(payload);
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSettleError('');

    const amt = Number(settleAmount);
    if (!amt || amt <= 0) {
      setSettleError('Amount must be greater than 0.');
      return;
    }

    if (settleCustomer && amt > settleCustomer.outstandingBalance) {
      setSettleError(`Settlement amount cannot exceed balance of Nu. ${settleCustomer.outstandingBalance.toFixed(2)}.`);
      return;
    }

    if (settleMethod === 'bank' && (!settleBankName.trim() || !settleJournalNo.trim())) {
      setSettleError('Bank name and journal/reference number are required for bank settlements.');
      return;
    }

    const walletMethods = ['mbob', 'mpay', 'dk_bank', 'tpay', 'other_wallet'];
    if (walletMethods.includes(settleMethod) && !settleJournalNo.trim()) {
      setSettleError('Transaction ID is required for mobile wallet settlements.');
      return;
    }

    settleMutation.mutate({
      amount: amt,
      method: settleMethod,
      bankName: settleBankName.trim() || null,
      journalNo: settleJournalNo.trim() || null,
      remarks: settleRemarks.trim() || null,
    });
  };

  const customers = customerResponse?.data ?? [];
  const headerTotals = customerResponse?.headerTotals;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
      {/* Header */}
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
            Customers & Credit Accounts
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: 'var(--spacing-1) 0 0 0' }}>
            Manage customer directory, customer-type pricing, credit limits, and balance settlements.
          </p>
        </div>

        {canManage && (
          <Button variant="primary" onClick={handleOpenCreate}>
            + Add Customer
          </Button>
        )}
      </div>

      {/* Credit Summary Card */}
      <Card
        style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(37, 99, 235, 0.1) 100%)',
          borderLeft: '4px solid var(--color-primary)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-4)' }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}>
              Total Credit Outstanding
            </div>
            <div style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 'bold', color: 'var(--color-primary)', marginTop: 'var(--spacing-1)' }}>
              Nu. {(headerTotals?.outstandingTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Across <strong style={{ color: 'var(--color-text)' }}>{headerTotals?.customersWithBalance ?? 0}</strong> customer(s) with an active balance
          </div>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--spacing-3)',
            marginBottom: 'var(--spacing-4)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
            <select
              className="input"
              value={typeFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              style={{
                minWidth: '180px',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                backgroundColor: 'var(--panel)',
                color: 'var(--ink)',
              }}
            >
              <option value="">All Customer Types</option>
              <option value="regular">Regular</option>
              <option value="vip">VIP</option>
              <option value="corporate">Corporate</option>
              <option value="wholesale">Wholesale</option>
              <option value="retail">Retail</option>
              <option value="credit">Credit</option>
              <option value="government_institutional">Government / Institutional</option>
              <option value="online">Online</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>

          <div style={{ width: '280px' }}>
            <Input
              placeholder="Search by name, phone, TPN..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {/* Customers Table */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-8)', color: 'var(--color-text-muted)' }}>
            Loading customers...
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            message={search ? 'No customers match your search.' : 'No customers recorded yet.'}
            description="Add regular, VIP, wholesale, or corporate customers to track credit and discounts."
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
                <th>Customer Name</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Total Spent</th>
                <th>Credit Limit</th>
                <th>Outstanding Balance</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    {!c.active && <Pill variant="neutral">Inactive</Pill>}
                    {c.gstId && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        TPN: {c.gstId}
                      </div>
                    )}
                  </td>
                  <td>
                    <Pill variant="neutral">{c.type.replace('_', ' ').toUpperCase()}</Pill>
                  </td>
                  <td>
                    <div>{c.phone || '—'}</div>
                    {c.email && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {c.email}
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 500 }}>
                    Nu. {c.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    {c.creditLimit !== null ? (
                      `Nu. ${c.creditLimit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>No limit</span>
                    )}
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight: 'bold',
                        color: c.outstandingBalance > 0 ? 'var(--color-danger)' : 'inherit',
                      }}
                    >
                      Nu. {c.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 'var(--spacing-2)' }}>
                      <Button
                        variant="outline"
                        onClick={() => setHistoryCustomerId(c.id)}
                      >
                        History
                      </Button>

                      {canSettle && c.outstandingBalance > 0 && (
                        <Button
                          variant="primary"
                          onClick={() => handleOpenSettle(c)}
                        >
                          Receive Payment
                        </Button>
                      )}

                      {canManage && (
                        <Button
                          variant="outline"
                          onClick={() => handleOpenEdit(c)}
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {/* Customer Create / Edit Modal */}
      <Modal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add New Customer'}
      >
        <form onSubmit={handleCustomerSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          {customerFormError && (
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
              {customerFormError}
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Customer Name *
            </label>
            <Input
              placeholder="e.g. Dorji Wangchuk"
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
                placeholder="e.g. 17123456"
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
                placeholder="e.g. dorji@example.bt"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                Customer Type *
              </label>
              <select
                className="input"
                value={customerType}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCustomerType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  backgroundColor: 'var(--panel)',
                  color: 'var(--ink)',
                }}
              >
                <option value="regular">Regular</option>
                <option value="vip">VIP</option>
                <option value="corporate">Corporate</option>
                <option value="wholesale">Wholesale</option>
                <option value="retail">Retail</option>
                <option value="credit">Credit</option>
                <option value="government_institutional">Government / Institutional</option>
                <option value="online">Online</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                Credit Limit (Nu.)
              </label>
              <Input
                type="number"
                min="0"
                placeholder="Leave blank for no limit"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value ? Number(e.target.value) : '')}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Taxpayer Number (TPN / GST ID)
            </label>
            <Input
              placeholder="e.g. GST-100223344"
              value={gstId}
              onChange={(e) => setGstId(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Address
            </label>
            <Input
              placeholder="e.g. Changzamtok, Thimphu"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Notes
            </label>
            <Input
              placeholder="Optional notes or instructions"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {editingCustomer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
              <input
                type="checkbox"
                id="customer-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label htmlFor="customer-active" style={{ fontWeight: 500 }}>
                Active customer
              </label>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-2)' }}>
            <Button variant="outline" type="button" onClick={() => setIsCustomerModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={customerMutation.isPending}>
              {customerMutation.isPending ? 'Saving...' : 'Save Customer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Receive Credit Payment Modal */}
      <Modal
        isOpen={isSettleModalOpen}
        onClose={() => setIsSettleModalOpen(false)}
        title={`Receive Payment: ${settleCustomer?.name}`}
      >
        <form onSubmit={handleSettleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          {settleError && (
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
              {settleError}
            </div>
          )}

          <div
            style={{
              padding: 'var(--spacing-3)',
              background: 'var(--color-bg-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              Current Outstanding Balance
            </div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', color: 'var(--color-danger)' }}>
              Nu. {(settleCustomer?.outstandingBalance ?? 0).toFixed(2)}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Settlement Amount (Nu.) *
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={settleCustomer?.outstandingBalance}
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value ? Number(e.target.value) : '')}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Payment Method *
            </label>
            <select
              className="input"
              value={settleMethod}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSettleMethod(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                backgroundColor: 'var(--panel)',
                color: 'var(--ink)',
              }}
            >
              <option value="cash">Cash</option>
              <option value="mbob">mBoB (Bank of Bhutan)</option>
              <option value="mpay">mPay (Bhutan National Bank)</option>
              <option value="tpay">TPay (T Bank)</option>
              <option value="dk_bank">DK Bank</option>
              <option value="other_wallet">Other Mobile Wallet</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>

          {settleMethod === 'bank' && (
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                Bank Name *
              </label>
              <Input
                placeholder="e.g. Bank of Bhutan"
                value={settleBankName}
                onChange={(e) => setSettleBankName(e.target.value)}
                required
              />
            </div>
          )}

          {settleMethod !== 'cash' && (
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                {settleMethod === 'bank' ? 'Journal / Ref Number *' : 'Transaction ID *'}
              </label>
              <Input
                placeholder="e.g. MP77812345 or BOB998877"
                value={settleJournalNo}
                onChange={(e) => setSettleJournalNo(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Remarks
            </label>
            <Input
              placeholder="e.g. Partial settlement for invoice INV-2026-00010"
              value={settleRemarks}
              onChange={(e) => setSettleRemarks(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-2)' }}>
            <Button variant="outline" type="button" onClick={() => setIsSettleModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={settleMutation.isPending}>
              {settleMutation.isPending ? 'Processing...' : 'Confirm Receipt'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Customer History Modal / Drawer */}
      <Modal
        isOpen={Boolean(historyCustomerId)}
        onClose={() => setHistoryCustomerId(null)}
        title={`Customer Account Ledger: ${historyData?.data?.customer?.name || ''}`}
      >
        {isHistoryLoading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-6)' }}>Loading customer ledger...</div>
        ) : historyData?.data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
            {/* Quick KPI stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-3)' }}>
              <div style={{ padding: 'var(--spacing-3)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Total Spent</div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold' }}>
                  Nu. {historyData.data.customer.totalSpent.toFixed(2)}
                </div>
              </div>
              <div style={{ padding: 'var(--spacing-3)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Outstanding Credit</div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold', color: 'var(--color-danger)' }}>
                  Nu. {historyData.data.customer.outstandingBalance.toFixed(2)}
                </div>
              </div>
              <div style={{ padding: 'var(--spacing-3)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Credit Limit</div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold' }}>
                  {historyData.data.customer.creditLimit ? `Nu. ${historyData.data.customer.creditLimit.toFixed(2)}` : 'None'}
                </div>
              </div>
            </div>

            {/* Invoices table */}
            <div>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'bold', marginBottom: 'var(--spacing-2)' }}>
                Past Sales / Invoices
              </h3>
              {historyData.data.sales.length === 0 ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                  No sales recorded for this customer yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th>Invoice No</th>
                        <th>Date</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Credit</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.data.sales.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.invoiceNo}</td>
                          <td style={{ fontSize: 'var(--font-size-xs)' }}>
                            {new Date(s.completedAt).toLocaleDateString()}
                          </td>
                          <td>Nu. {s.total.toFixed(2)}</td>
                          <td>Nu. {s.paid.toFixed(2)}</td>
                          <td style={{ color: s.credit > 0 ? 'var(--color-danger)' : 'inherit', fontWeight: s.credit > 0 ? 600 : 400 }}>
                            Nu. {s.credit.toFixed(2)}
                          </td>
                          <td>
                            <Pill variant={s.status === 'completed' ? 'success' : 'danger'}>
                              {s.status.toUpperCase()}
                            </Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Settlements table */}
            <div>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'bold', marginBottom: 'var(--spacing-2)' }}>
                Payments Received Against Credit (CR-NNNN)
              </h3>
              {historyData.data.settlements.length === 0 ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                  No balance payments recorded yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th>Receipt No</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Reference / Txn</th>
                        <th>Received By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.data.settlements.map((set) => (
                        <tr key={set.id}>
                          <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{set.receiptNo}</td>
                          <td style={{ fontSize: 'var(--font-size-xs)' }}>
                            {new Date(set.createdAt).toLocaleDateString()}
                          </td>
                          <td>
                            <Pill variant="neutral">{set.method.toUpperCase()}</Pill>
                          </td>
                          <td style={{ fontWeight: 'bold', color: 'var(--color-success)' }}>
                            Nu. {set.amount.toFixed(2)}
                          </td>
                          <td style={{ fontSize: 'var(--font-size-xs)' }}>
                            {set.journalNo || set.bankName || '—'}
                          </td>
                          <td>{set.receivedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setHistoryCustomerId(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
