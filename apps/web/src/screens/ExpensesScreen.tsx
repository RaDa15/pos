import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { AppShell } from '../components/layout/AppShell.js';
import { Card, KpiCard } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from '@pos/shared';

interface ExpenseItem {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  businessDate: string;
  paymentMethod: ExpensePaymentMethod;
  description: string | null;
  createdBy: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
}

interface ExpensesResponse {
  data: ExpenseItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    totalAmount: number;
  };
}

const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string }> = {
  rent: { bg: '#e0e7ff', text: '#3730a3' },
  utilities: { bg: '#fef3c7', text: '#92400e' },
  salaries: { bg: '#dcfce7', text: '#166534' },
  supplies: { bg: '#f3e8ff', text: '#6b21a8' },
  maintenance: { bg: '#ffedd5', text: '#9a3412' },
  marketing: { bg: '#fce7f3', text: '#9d174d' },
  other: { bg: '#f1f5f9', text: '#475569' },
};

const PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  mobile_wallet: 'Mobile Wallet (mBoB/B-Ngul)',
  other: 'Other',
};

export const ExpensesScreen: React.FC = () => {
  const { permissions, employee } = useAuth();
  const canManage =
    permissions.includes('expenses.manage') ||
    employee?.role === 'admin' ||
    employee?.role === 'manager' ||
    employee?.role === 'accountant';

  // Filters
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStartStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [from, setFrom] = useState(monthStartStr);
  const [to, setTo] = useState(todayStr);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<ExpenseItem | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<ExpenseItem | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('supplies');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(todayStr);
  const [formMethod, setFormMethod] = useState<ExpensePaymentMethod>('cash');
  const [formDesc, setFormDesc] = useState('');

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (search.trim()) params.set('q', search.trim());
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await apiGet<ExpensesResponse>(`/expenses?${params.toString()}`);
      setExpenses(res.data);
      setTotalAmount(res.meta.totalAmount);
      setTotalCount(res.meta.total);
      setTotalPages(res.meta.pages);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load expenses';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [from, to, categoryFilter, search, page, limit]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const openCreateModal = () => {
    setFormName('');
    setFormCategory('supplies');
    setFormAmount('');
    setFormDate(todayStr);
    setFormMethod('cash');
    setFormDesc('');
    setFormError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (item: ExpenseItem) => {
    setEditExpense(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormAmount(String(item.amount));
    setFormDate(item.businessDate);
    setFormMethod(item.paymentMethod);
    setFormDesc(item.description || '');
    setFormError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(formAmount);
    if (!formName.trim()) {
      setFormError('Expense name is required.');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setFormError('Amount must be a positive number.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);
    try {
      await apiPost('/expenses', {
        name: formName.trim(),
        category: formCategory,
        amount: amt,
        businessDate: formDate,
        paymentMethod: formMethod,
        description: formDesc.trim() || null,
      });
      setIsCreateOpen(false);
      fetchExpenses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record expense.';
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editExpense) return;
    const amt = parseFloat(formAmount);
    if (!formName.trim()) {
      setFormError('Expense name is required.');
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setFormError('Amount must be a positive number.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);
    try {
      await apiPatch(`/expenses/${editExpense.id}`, {
        name: formName.trim(),
        category: formCategory,
        amount: amt,
        businessDate: formDate,
        paymentMethod: formMethod,
        description: formDesc.trim() || null,
      });
      setEditExpense(null);
      fetchExpenses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update expense.';
      setFormError(msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteExpense) return;
    setFormSubmitting(true);
    try {
      await apiDelete(`/expenses/${deleteExpense.id}`);
      setDeleteExpense(null);
      fetchExpenses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete expense.');
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Operating Expenses (SCR-20)"
      subtitle="Track business operating expenses (rent, utilities, salaries, supplies) for accurate profit analytics"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Top bar with KPI and Controls */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            alignItems: 'stretch',
          }}
        >
          <KpiCard
            label="Total Expenses for Selected Range"
            value={`Nu. ${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            tone="default"
            hint={`${totalCount} recorded expenses in period`}
          />

          <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>From Date</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>To Date</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '130px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>Category</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                  }}
                >
                  <option value="all">All Categories</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {canManage && (
                <div style={{ alignSelf: 'flex-end' }}>
                  <Button
                    variant="primary"
                    onClick={openCreateModal}
                    style={{
                      height: '37px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 600,
                    }}
                  >
                    <span>+</span> Record Expense
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Search bar & Refresh */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', width: '320px' }}>
            <input
              type="text"
              placeholder="Search expenses by name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                fontSize: '13.5px',
              }}
            />
          </div>
          <Button variant="outline" onClick={fetchExpenses} disabled={loading} style={{ fontSize: '13px' }}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </Button>
        </div>

        {/* Expenses Table Card */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {error && (
            <div style={{ padding: '16px', background: '#fee2e2', color: '#991b1b', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Expense Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Category</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Payment Method</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Amount (Nu.)</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Recorded By</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Notes</th>
                  {canManage && <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading && expenses.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                      Loading operating expenses...
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)' }}>
                      No expenses recorded for this period. Click "+ Record Expense" to add one.
                    </td>
                  </tr>
                ) : (
                  expenses.map((item) => {
                    const catStyle = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other;
                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {item.businessDate}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>
                          {item.name}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background: catStyle.bg,
                              color: catStyle.text,
                            }}
                          >
                            {item.category}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--ink)' }}>
                          {PAYMENT_METHOD_LABELS[item.paymentMethod] || item.paymentMethod}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                          Nu. {item.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                          {item.creatorName}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--muted)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.description || '—'}
                        </td>
                        {canManage && (
                          <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <Button
                                variant="outline"
                                onClick={() => openEditModal(item)}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                onClick={() => setDeleteExpense(item)}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                fontSize: '13px',
              }}
            >
              <span style={{ color: 'var(--muted)' }}>
                Page {page} of {totalPages} ({totalCount} total)
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Record Expense Modal */}
        {isCreateOpen && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '480px',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              }}
            >
              <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800 }}>
                Record Operating Expense
              </h2>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--muted)' }}>
                Enter the details of the business expense. This will be audit-logged and deducted from net profit.
              </p>

              {formError && (
                <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                    Expense Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. October Shop Rent, Electricity Bill, Wi-Fi"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                      Category *
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                    >
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                      Amount (Nu.) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                      Business Date
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                      Payment Method
                    </label>
                    <select
                      value={formMethod}
                      onChange={(e) => setFormMethod(e.target.value as ExpensePaymentMethod)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                    >
                      {EXPENSE_PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                    Notes / Reference (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Invoice #, cheque number, or payment details"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateOpen(false)}
                    disabled={formSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={formSubmitting}
                  >
                    {formSubmitting ? 'Saving...' : 'Save Expense'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Expense Modal */}
        {editExpense && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '480px',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              }}
            >
              <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800 }}>
                Edit Expense
              </h2>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--muted)' }}>
                Modifying this expense will generate an audit log entry showing the previous and new amounts.
              </p>

              {formError && (
                <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                  {formError}
                </div>
              )}

              <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                    Expense Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                      Category *
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                    >
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                      Amount (Nu.) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                      Business Date
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                      Payment Method
                    </label>
                    <select
                      value={formMethod}
                      onChange={(e) => setFormMethod(e.target.value as ExpensePaymentMethod)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px' }}
                    >
                      {EXPENSE_PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '4px' }}>
                    Notes / Reference (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13.5px', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditExpense(null)}
                    disabled={formSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={formSubmitting}
                  >
                    {formSubmitting ? 'Updating...' : 'Update Expense'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteExpense && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '420px',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              }}
            >
              <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#dc2626' }}>
                Confirm Deletion
              </h2>
              <p style={{ margin: '0 0 16px 0', fontSize: '13.5px', color: 'var(--ink)' }}>
                Are you sure you want to delete <strong>{deleteExpense.name}</strong> (Nu. {deleteExpense.amount.toFixed(2)})?
              </p>
              <p style={{ margin: '0 0 20px 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                This action is permanent and will be logged in the business audit trail.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button
                  variant="outline"
                  onClick={() => setDeleteExpense(null)}
                  disabled={formSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Deleting...' : 'Delete Expense'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};
