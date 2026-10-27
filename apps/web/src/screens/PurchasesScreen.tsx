import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client.js';
import { useToast } from '../components/ui/Toast.js';
import { Button } from '../components/ui/Button.js';
import { Card, KpiCard } from '../components/ui/Card.js';
import { Modal } from '../components/ui/Modal.js';
import { Input } from '../components/ui/Input.js';
import { Pill } from '../components/ui/Pill.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { AppShell } from '../components/layout/AppShell.js';
import { useAuth } from '../context/AuthContext.js';
import { ROLE_PERMISSIONS, EmployeeRole } from '@pos/shared';

interface PurchaseItemSummary {
  id: string;
  productId: string;
  productName: string;
  barcode: string;
  unit: string;
  qty: number;
  unitCost: number;
  lineTotal: number;
  batchNo: string | null;
  expiryDate: string | null;
}

interface PurchaseItem {
  id: string;
  purchaseNo: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  total: number;
  amountPaid: number;
  outstanding: number;
  note: string | null;
  createdBy: string;
  itemsCount: number;
  items: PurchaseItemSummary[];
  createdAt: string;
}

interface PurchasesResponse {
  data: PurchaseItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalAmount: number;
    totalPaid: number;
    totalOutstanding: number;
  };
}

interface SupplierOption {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
}

interface ProductOption {
  id: string;
  name: string;
  barcode: string;
  unit: string;
  purchasePrice: number;
  stock: number;
  active: boolean;
}

interface NewLineItem {
  productId: string;
  qty: number;
  unitCost: number;
  batchNo: string;
  expiryDate: string;
}

export const PurchasesScreen: React.FC = () => {
  const { employee, business } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const role = (employee?.role as EmployeeRole) || 'cashier';
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  const canManage = rolePermissions.includes('purchases.manage');
  const isGrocery = business?.type === 'grocery';

  // Filters
  const [supplierFilter, setSupplierFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  // Modals state
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseItem | null>(null);

  // Form state
  const todayStr = new Date().toISOString().slice(0, 10);
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formPurchaseDate, setFormPurchaseDate] = useState(todayStr);
  const [formItems, setFormItems] = useState<NewLineItem[]>([
    { productId: '', qty: 1, unitCost: 0, batchNo: '', expiryDate: '' },
  ]);
  const [formAmountPaid, setFormAmountPaid] = useState<number | ''>(0);
  const [formNote, setFormNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch purchases query
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (supplierFilter) params.set('supplierId', supplierFilter);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('page', String(page));
    params.set('limit', '25');
    return params.toString();
  }, [supplierFilter, from, to, page]);

  const { data: purchasesData, isLoading } = useQuery<PurchasesResponse>({
    queryKey: ['purchases', queryParams],
    queryFn: () => apiClient.get<PurchasesResponse>(`/api/v1/purchases?${queryParams}`),
    enabled: isGrocery,
  });

  // Fetch active suppliers for dropdown
  const { data: suppliersData } = useQuery<{ data: SupplierOption[] }>({
    queryKey: ['suppliers-list'],
    queryFn: () => apiClient.get<{ data: SupplierOption[] }>('/api/v1/suppliers?limit=100'),
    enabled: isGrocery,
  });
  const suppliers = suppliersData?.data || [];

  // Fetch products for purchase items line dropdown
  const { data: productsData } = useQuery<{ data: ProductOption[] }>({
    queryKey: ['products-list'],
    queryFn: () => apiClient.get<{ data: ProductOption[] }>('/api/v1/products?limit=200'),
    enabled: isGrocery,
  });
  const products = productsData?.data || [];

  // Calculate form totals
  const formComputedTotal = useMemo(() => {
    return formItems.reduce((acc, item) => {
      const line = Math.round(Number(item.qty || 0) * Number(item.unitCost || 0) * 100) / 100;
      return acc + line;
    }, 0);
  }, [formItems]);

  const formComputedOutstanding = useMemo(() => {
    const paid = Number(formAmountPaid || 0);
    return Math.max(0, Math.round((formComputedTotal - paid) * 100) / 100);
  }, [formComputedTotal, formAmountPaid]);

  // Record purchase mutation
  const recordPurchaseMutation = useMutation({
    mutationFn: (payload: {
      supplierId: string;
      purchaseDate: string;
      items: Array<{
        productId: string;
        qty: number;
        unitCost: number;
        batchNo?: string;
        expiryDate?: string;
      }>;
      amountPaid: number;
      note?: string;
    }) => apiClient.post('/api/v1/purchases', payload),
    onSuccess: () => {
      toast('Purchase record created and product stock updated.', 'success');
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setIsRecordModalOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to record purchase.');
    },
  });

  const resetForm = () => {
    setFormSupplierId('');
    setFormPurchaseDate(todayStr);
    setFormItems([{ productId: '', qty: 1, unitCost: 0, batchNo: '', expiryDate: '' }]);
    setFormAmountPaid(0);
    setFormNote('');
    setFormError(null);
  };

  const handleOpenRecordModal = () => {
    resetForm();
    setIsRecordModalOpen(true);
  };

  const handleAddItemLine = () => {
    setFormItems((prev) => [
      ...prev,
      { productId: '', qty: 1, unitCost: 0, batchNo: '', expiryDate: '' },
    ]);
  };

  const handleRemoveItemLine = (index: number) => {
    if (formItems.length === 1) {
      toast('Purchase must contain at least one line item.', 'error');
      return;
    }
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemProductChange = (index: number, productId: string) => {
    const selectedProd = products.find((p) => p.id === productId);
    setFormItems((prev) => {
      const current = prev[index];
      if (!current) return prev;
      const updated = [...prev];
      updated[index] = {
        ...current,
        productId,
        unitCost: selectedProd ? selectedProd.purchasePrice : current.unitCost,
      };
      return updated;
    });
  };

  const handleItemFieldChange = (
    index: number,
    field: keyof NewLineItem,
    value: string | number
  ) => {
    setFormItems((prev) => {
      const current = prev[index];
      if (!current) return prev;
      const updated = [...prev];
      updated[index] = {
        productId: field === 'productId' ? (value as string) : current.productId,
        qty: field === 'qty' ? (value as number) : current.qty,
        unitCost: field === 'unitCost' ? (value as number) : current.unitCost,
        batchNo: field === 'batchNo' ? (value as string) : current.batchNo,
        expiryDate: field === 'expiryDate' ? (value as string) : current.expiryDate,
      };
      return updated;
    });
  };

  const handleSubmitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formSupplierId) {
      setFormError('Please select a supplier.');
      return;
    }

    if (!formPurchaseDate) {
      setFormError('Please select a valid purchase date.');
      return;
    }

    for (let i = 0; i < formItems.length; i++) {
      const item = formItems[i];
      if (!item) continue;
      if (!item.productId) {
        setFormError(`Item #${i + 1} is missing a selected product.`);
        return;
      }
      if (item.qty <= 0) {
        setFormError(`Item #${i + 1} must have a quantity of 1 or more.`);
        return;
      }
      if (item.unitCost < 0) {
        setFormError(`Item #${i + 1} unit cost cannot be negative.`);
        return;
      }
    }

    const paid = Number(formAmountPaid || 0);
    if (paid < 0) {
      setFormError('Amount paid cannot be negative.');
      return;
    }

    if (paid > formComputedTotal) {
      setFormError(
        `Amount paid (Nu. ${paid.toFixed(2)}) cannot exceed total purchase amount (Nu. ${formComputedTotal.toFixed(2)}).`
      );
      return;
    }

    const itemsPayload = formItems.map((item) => ({
      productId: item.productId,
      qty: Number(item.qty),
      unitCost: Number(item.unitCost),
      ...(item.batchNo.trim() ? { batchNo: item.batchNo.trim() } : {}),
      ...(item.expiryDate ? { expiryDate: item.expiryDate } : {}),
    }));

    recordPurchaseMutation.mutate({
      supplierId: formSupplierId,
      purchaseDate: formPurchaseDate,
      items: itemsPayload,
      amountPaid: paid,
      note: formNote.trim() || undefined,
    });
  };

  // If Restaurant, show notification per BR-38
  if (!isGrocery) {
    return (
      <AppShell
        title="Supplier Purchases (SCR-13)"
        subtitle="Manage supplier purchases, cost price updates, and stock receipts"
      >
        <Card style={{ padding: '32px', textAlign: 'center', maxWidth: '600px', margin: '40px auto' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>
            Grocery Feature Only
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.6 }}>
            Per business rule <strong>BR-38</strong>, the Supplier Purchases and Cost Price Tracking module
            is designated specifically for Grocery retail stores. Restaurant businesses record incoming
            ingredients and supplies via <strong>Operating Expenses</strong> (SCR-20).
          </p>
        </Card>
      </AppShell>
    );
  }

  const purchases = purchasesData?.data || [];
  const summary = purchasesData?.summary || { totalAmount: 0, totalPaid: 0, totalOutstanding: 0 };
  const pagination = purchasesData?.pagination;

  return (
    <AppShell
      title="Supplier Purchases (SCR-13)"
      subtitle="Record incoming goods from suppliers, track cost prices, and manage accounts payable (BR-38)"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* KPI Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          <KpiCard
            label="Total Purchases"
            value={`Nu. ${summary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            hint={`${pagination?.total || 0} purchase orders recorded`}
            tone="default"
          />
          <KpiCard
            label="Total Amount Paid"
            value={`Nu. ${summary.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            hint="Settled to suppliers"
            tone="default"
          />
          <KpiCard
            label="Total Outstanding Payable"
            value={`Nu. ${summary.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            hint="Pending supplier credit"
            tone={summary.totalOutstanding > 0 ? 'warn' : 'default'}
          />
        </div>

        {/* Filter and Action Bar */}
        <Card style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>
                Supplier
              </label>
              <select
                value={supplierFilter}
                onChange={(e) => {
                  setSupplierFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  padding: '0 10px',
                  background: 'var(--panel)',
                  color: 'var(--ink)',
                  fontSize: '13px',
                }}
              >
                <option value="">All Suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>
                From Date
              </label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                style={{ height: '36px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>
                To Date
              </label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                style={{ height: '36px' }}
              />
            </div>

            {(supplierFilter || from || to) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSupplierFilter('');
                  setFrom('');
                  setTo('');
                  setPage(1);
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>

          {canManage && (
            <Button variant="primary" onClick={handleOpenRecordModal}>
              + Record Purchase
            </Button>
          )}
        </Card>

        {/* Purchases Table */}
        <Card style={{ padding: '0', overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
              Loading purchase records…
            </div>
          ) : purchases.length === 0 ? (
            <EmptyState
              message="No Purchases Recorded"
              description="Record goods incoming from suppliers to update inventory stock and unit purchase costs."
              action={
                canManage
                  ? {
                      label: '+ Record First Purchase',
                      onClick: handleOpenRecordModal,
                    }
                  : undefined
              }
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
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-sunken)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Purchase No.</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Supplier</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>Items</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Total (Nu.)</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Paid (Nu.)</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Outstanding</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Recorded By</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr
                      key={p.id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'monospace' }}>
                        {p.purchaseNo}
                      </td>
                      <td style={{ padding: '12px 16px' }}>{p.purchaseDate}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.supplierName}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '12px', background: 'var(--surface-sunken)', padding: '2px 8px', borderRadius: '12px' }}>
                          {p.itemsCount}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                        {p.total.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--green)' }}>
                        {p.amountPaid.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {p.outstanding === 0 ? (
                          <Pill variant="success">Paid</Pill>
                        ) : (
                          <Pill variant="danger">{`Nu. ${p.outstanding.toFixed(2)}`}</Pill>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '13px' }}>
                        {p.createdBy}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedPurchase(p)}
                        >
                          View Detail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination controls */}
          {pagination && pagination.totalPages > 1 && (
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
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* View Detail Modal */}
      {selectedPurchase && (
        <Modal
          isOpen={!!selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
          title={`Purchase Details · ${selectedPurchase.purchaseNo}`}
          size="wide"
          hideFooter
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                padding: '12px',
                background: 'var(--surface-sunken)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            >
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Supplier</span>
                <span style={{ fontWeight: 600 }}>{selectedPurchase.supplierName}</span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Purchase Date</span>
                <span style={{ fontWeight: 600 }}>{selectedPurchase.purchaseDate}</span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Recorded By</span>
                <span style={{ fontWeight: 600 }}>{selectedPurchase.createdBy}</span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Recorded At</span>
                <span style={{ fontWeight: 600 }}>
                  {new Date(selectedPurchase.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {selectedPurchase.note && (
              <div style={{ fontSize: '13px', padding: '10px', background: 'var(--panel)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Note: </span>
                {selectedPurchase.note}
              </div>
            )}

            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '8px 0 0 0' }}>Line Items</h3>
            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Product</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Barcode</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Unit Cost (Nu.)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Line Total (Nu.)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Batch / Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPurchase.items.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.productName}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--muted)' }}>
                        {item.barcode}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {item.qty} {item.unit}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {item.unitCost.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                        {item.lineTotal.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '12px' }}>
                        {item.batchNo ? `Batch: ${item.batchNo}` : '—'}
                        {item.expiryDate ? ` (Exp: ${item.expiryDate})` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '24px',
                padding: '12px 16px',
                background: 'var(--surface-sunken)',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            >
              <div>
                <span style={{ color: 'var(--muted)' }}>Total: </span>
                <strong style={{ fontSize: '16px' }}>Nu. {selectedPurchase.total.toFixed(2)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Amount Paid: </span>
                <strong style={{ color: 'var(--green)' }}>Nu. {selectedPurchase.amountPaid.toFixed(2)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Outstanding: </span>
                <strong style={{ color: selectedPurchase.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>
                  Nu. {selectedPurchase.outstanding.toFixed(2)}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <Button variant="outline" onClick={() => setSelectedPurchase(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Record Purchase Modal (Wide) */}
      {isRecordModalOpen && (
        <Modal
          isOpen={isRecordModalOpen}
          onClose={() => setIsRecordModalOpen(false)}
          title="Record Supplier Purchase (BR-38)"
          size="wide"
          hideFooter
        >
          <form onSubmit={handleSubmitPurchase} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--red-tint)',
                  color: 'var(--red)',
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Supplier *
                </label>
                <select
                  required
                  value={formSupplierId}
                  onChange={(e) => setFormSupplierId(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    padding: '0 10px',
                    background: 'var(--panel)',
                    color: 'var(--ink)',
                  }}
                >
                  <option value="">Select a Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Purchase Date *
                </label>
                <Input
                  required
                  type="date"
                  value={formPurchaseDate}
                  onChange={(e) => setFormPurchaseDate(e.target.value)}
                />
              </div>
            </div>

            {/* Line Items Editor */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700 }}>Line Items</span>
                <Button type="button" size="sm" variant="outline" onClick={handleAddItemLine}>
                  + Add Item
                </Button>
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', width: '30%' }}>Product *</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '12%' }}>Qty *</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '15%' }}>Unit Cost (Nu.) *</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '15%' }}>Line Total</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', width: '15%' }}>Batch No</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', width: '13%' }}>Expiry Date</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', width: '5%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formItems.map((item, index) => {
                      const lineTotal = Math.round(Number(item.qty || 0) * Number(item.unitCost || 0) * 100) / 100;
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px' }}>
                            <select
                              required
                              value={item.productId}
                              onChange={(e) => handleItemProductChange(index, e.target.value)}
                              style={{
                                width: '100%',
                                height: '34px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                padding: '0 8px',
                                fontSize: '12.5px',
                                background: 'var(--panel)',
                                color: 'var(--ink)',
                              }}
                            >
                              <option value="">Select product</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.barcode})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <Input
                              type="number"
                              min={1}
                              required
                              value={item.qty}
                              onChange={(e) => handleItemFieldChange(index, 'qty', parseInt(e.target.value, 10) || 1)}
                              style={{ textAlign: 'right', height: '34px', fontSize: '12.5px' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              required
                              value={item.unitCost}
                              onChange={(e) => handleItemFieldChange(index, 'unitCost', parseFloat(e.target.value) || 0)}
                              style={{ textAlign: 'right', height: '34px', fontSize: '12.5px' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                            Nu. {lineTotal.toFixed(2)}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <Input
                              placeholder="Batch"
                              value={item.batchNo}
                              onChange={(e) => handleItemFieldChange(index, 'batchNo', e.target.value)}
                              style={{ height: '34px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <Input
                              type="date"
                              value={item.expiryDate}
                              onChange={(e) => handleItemFieldChange(index, 'expiryDate', e.target.value)}
                              style={{ height: '34px', fontSize: '12px' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              style={{ color: 'var(--red)', padding: '2px 6px' }}
                              onClick={() => handleRemoveItemLine(index)}
                            >
                              ✕
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Totals and Amount Paid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px',
                padding: '14px',
                background: 'var(--surface-sunken)',
                borderRadius: '8px',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>Total Purchase Cost</span>
                <span style={{ fontSize: '18px', fontWeight: 700 }}>
                  Nu. {formComputedTotal.toFixed(2)}
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>
                  Amount Paid Now (Nu.) *
                </label>
                <Input
                  type="number"
                  min={0}
                  max={formComputedTotal}
                  step="0.01"
                  required
                  value={formAmountPaid}
                  onChange={(e) => setFormAmountPaid(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  style={{ height: '36px', fontWeight: 600 }}
                />
              </div>

              <div>
                <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block' }}>Outstanding Balance</span>
                <span
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: formComputedOutstanding > 0 ? 'var(--red)' : 'var(--green)',
                  }}
                >
                  Nu. {formComputedOutstanding.toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Note / Memo
              </label>
              <textarea
                rows={2}
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Optional supplier invoice reference or purchase memo"
                style={{
                  width: '100%',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  padding: '8px 10px',
                  background: 'var(--panel)',
                  color: 'var(--ink)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <Button type="button" variant="outline" onClick={() => setIsRecordModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={recordPurchaseMutation.isPending}>
                {recordPurchaseMutation.isPending ? 'Recording Purchase…' : 'Save & Record Purchase'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
};
