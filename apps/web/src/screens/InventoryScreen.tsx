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

interface StockItem {
  id: string;
  name: string;
  category: string;
  barcode: string;
  unit: string;
  trackStock: boolean;
  stock: number;
  minStock: number;
  purchasePrice: number;
  sellPrice: number;
  batchNo: string | null;
  expiryDate: string | null;
  active: boolean;
  stockStatus: 'untracked' | 'out' | 'low' | 'ok';
}

interface AlertCounts {
  lowStock: number;
  outOfStock: number;
  badgeCount: number;
  expiringSoon: number;
  expired: number;
}

interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  productBarcode: string;
  type: string;
  qty: number;
  stockAfter: number;
  reason: string | null;
  createdAt: string;
  createdBy: string;
}

export const InventoryScreen: React.FC = () => {
  const { employee } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const role = (employee?.role as EmployeeRole) || 'cashier';
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  const canAdjust = rolePermissions.includes('inventory.adjust');

  const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'out' | 'ok'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [movementType, setMovementType] = useState<'stock_in' | 'stock_out' | 'adjustment'>('stock_in');
  const [quantity, setQuantity] = useState(1);
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [reason, setReason] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [formError, setFormError] = useState('');

  // 1. Fetch alerts
  const { data: alertsData } = useQuery<{
    counts: AlertCounts;
    lowStockItems: StockItem[];
    outOfStockItems: StockItem[];
    expiringSoonItems: Array<StockItem & { daysLeft: number; isExpired: boolean }>;
  }>({
    queryKey: ['inventory-alerts'],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: {
          counts: AlertCounts;
          lowStockItems: StockItem[];
          outOfStockItems: StockItem[];
          expiringSoonItems: Array<StockItem & { daysLeft: number; isExpired: boolean }>;
        };
      }>('/inventory/alerts');
      return res.data;
    },
  });

  // 2. Fetch stock list
  const { data: stockResponse, isLoading: isStockLoading } = useQuery<{
    data: StockItem[];
    meta: { page: number; limit: number; total: number };
  }>({
    queryKey: ['inventory-stock', statusFilter, search, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      params.set('page', page.toString());
      params.set('limit', '50');

      return apiClient.get(`/inventory/stock?${params.toString()}`);
    },
    enabled: activeTab === 'stock',
  });

  // 3. Fetch movements list
  const { data: movementsResponse, isLoading: isMovementsLoading } = useQuery<{
    data: StockMovement[];
    meta: { page: number; limit: number; total: number };
  }>({
    queryKey: ['inventory-movements', page],
    queryFn: async () => {
      return apiClient.get(`/stock-movements?page=${page}&limit=50`);
    },
    enabled: activeTab === 'movements',
  });

  // 4. Create movement mutation
  const adjustMutation = useMutation({
    mutationFn: async (payload: {
      productId: string;
      type: string;
      qty: number;
      direction?: string;
      reason?: string;
      batchNo?: string | null;
      expiryDate?: string | null;
    }) => {
      return apiClient.post('/stock-movements', payload);
    },
    onSuccess: () => {
      toast('Inventory updated successfully.', 'success');
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      setIsAdjustModalOpen(false);
      resetModal();
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to update stock');
    },
  });

  const resetModal = () => {
    setSelectedProductId('');
    setMovementType('stock_in');
    setQuantity(1);
    setDirection('increase');
    setReason('');
    setBatchNo('');
    setExpiryDate('');
    setFormError('');
  };

  const handleOpenAdjust = (prodId?: string) => {
    resetModal();
    if (prodId) {
      setSelectedProductId(prodId);
    }
    setIsAdjustModalOpen(true);
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!selectedProductId) {
      setFormError('Please select a product.');
      return;
    }

    if (quantity <= 0) {
      setFormError('Quantity must be greater than 0.');
      return;
    }

    if (movementType === 'adjustment' && !reason.trim()) {
      setFormError('Reason is required for stock adjustments (BR-25).');
      return;
    }

    adjustMutation.mutate({
      productId: selectedProductId,
      type: movementType,
      qty: quantity,
      direction: movementType === 'adjustment' ? direction : undefined,
      reason: reason.trim() || undefined,
      batchNo: batchNo.trim() || null,
      expiryDate: expiryDate || null,
    });
  };

  const counts = alertsData?.counts;
  const stockItems = stockResponse?.data ?? [];
  const movements = movementsResponse?.data ?? [];

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
            Inventory & Stock Control
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: 'var(--spacing-1) 0 0 0' }}>
            Monitor real-time inventory levels, stock warnings, expiration alerts, and audit trails.
          </p>
        </div>

        {canAdjust && (
          <Button variant="primary" onClick={() => handleOpenAdjust()}>
            + Stock In / Out / Adjustment
          </Button>
        )}
      </div>

      {/* Alert KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--spacing-4)',
        }}
      >
        <Card
          style={{
            borderLeft: '4px solid var(--color-danger)',
            cursor: 'pointer',
          }}
          onClick={() => {
            setActiveTab('stock');
            setStatusFilter('out');
          }}
        >
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Out of Stock
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: 'bold',
              color: counts?.outOfStock ? 'var(--color-danger)' : 'inherit',
              marginTop: 'var(--spacing-1)',
            }}
          >
            {counts?.outOfStock ?? 0}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--spacing-1)' }}>
            Products with 0 or negative stock
          </div>
        </Card>

        <Card
          style={{
            borderLeft: '4px solid var(--color-warning)',
            cursor: 'pointer',
          }}
          onClick={() => {
            setActiveTab('stock');
            setStatusFilter('low');
          }}
        >
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Low Stock Warnings
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: 'bold',
              color: counts?.lowStock ? 'var(--color-warning)' : 'inherit',
              marginTop: 'var(--spacing-1)',
            }}
          >
            {counts?.lowStock ?? 0}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--spacing-1)' }}>
            Tracked products at or below minimum stock
          </div>
        </Card>

        <Card
          style={{
            borderLeft: '4px solid var(--color-accent)',
          }}
        >
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Expiring Soon (30d)
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: 'bold',
              color: 'var(--color-accent)',
              marginTop: 'var(--spacing-1)',
            }}
          >
            {counts?.expiringSoon ?? 0}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--spacing-1)' }}>
            Items expiring within the next 30 days
          </div>
        </Card>

        <Card
          style={{
            borderLeft: '4px solid var(--color-danger)',
          }}
        >
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Expired Batches
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: 'bold',
              color: counts?.expired ? 'var(--color-danger)' : 'inherit',
              marginTop: 'var(--spacing-1)',
            }}
          >
            {counts?.expired ?? 0}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--spacing-1)' }}>
            Past expiration date (dispose/adjust out)
          </div>
        </Card>
      </div>

      {/* Main Navigation Tabs */}
      <div style={{ display: 'flex', gap: 'var(--spacing-2)', borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={() => setActiveTab('stock')}
          style={{
            padding: 'var(--spacing-3) var(--spacing-4)',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'stock' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'stock' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: activeTab === 'stock' ? 600 : 500,
            cursor: 'pointer',
          }}
        >
          Current Stock Levels
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          style={{
            padding: 'var(--spacing-3) var(--spacing-4)',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'movements' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'movements' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: activeTab === 'movements' ? 600 : 500,
            cursor: 'pointer',
          }}
        >
          Stock Movement Log
        </button>
      </div>

      {/* TAB 1: Current Stock */}
      {activeTab === 'stock' && (
        <Card>
          {/* Filter Bar */}
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
              <Button
                variant={statusFilter === 'all' ? 'primary' : 'outline'}
                onClick={() => {
                  setStatusFilter('all');
                  setPage(1);
                }}
              >
                All
              </Button>
              <Button
                variant={statusFilter === 'low' ? 'primary' : 'outline'}
                onClick={() => {
                  setStatusFilter('low');
                  setPage(1);
                }}
              >
                Low Stock ({counts?.lowStock ?? 0})
              </Button>
              <Button
                variant={statusFilter === 'out' ? 'primary' : 'outline'}
                onClick={() => {
                  setStatusFilter('out');
                  setPage(1);
                }}
              >
                Out of Stock ({counts?.outOfStock ?? 0})
              </Button>
              <Button
                variant={statusFilter === 'ok' ? 'primary' : 'outline'}
                onClick={() => {
                  setStatusFilter('ok');
                  setPage(1);
                }}
              >
                OK
              </Button>
            </div>

            <div style={{ width: '280px' }}>
              <Input
                placeholder="Search product, barcode..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {/* Stock Table */}
          {isStockLoading ? (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-8)', color: 'var(--color-text-muted)' }}>
              Loading inventory levels...
            </div>
          ) : stockItems.length === 0 ? (
            <EmptyState
              message={search ? 'No products match your search.' : 'No products found in this filter.'}
              description="Adjust your search filters or record opening stock."
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
                  <th>Product</th>
                  <th>Barcode</th>
                  <th>Category</th>
                  <th>Stock Level</th>
                  <th>Min Stock</th>
                  <th>Batch / Expiry</th>
                  <th>Status</th>
                  {canAdjust && <th style={{ textAlign: 'right' }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {stockItems.map((p) => {
                  let pillVariant: 'danger' | 'warning' | 'success' | 'neutral' = 'success';
                  let pillLabel = 'In Stock';

                  if (!p.trackStock) {
                    pillVariant = 'neutral';
                    pillLabel = 'Not tracked';
                  } else if (p.stockStatus === 'out') {
                    pillVariant = 'danger';
                    pillLabel = 'Out of Stock';
                  } else if (p.stockStatus === 'low') {
                    pillVariant = 'warning';
                    pillLabel = 'Low Stock';
                  }

                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>
                        {p.barcode}
                      </td>
                      <td>{p.category}</td>
                      <td>
                        {!p.trackStock ? (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        ) : (
                          <span
                            style={{
                              fontWeight: 'bold',
                              color:
                                p.stock <= 0
                                  ? 'var(--color-danger)'
                                  : p.minStock > 0 && p.stock <= p.minStock
                                  ? 'var(--color-warning)'
                                  : 'inherit',
                            }}
                          >
                            {p.stock} {p.unit}
                          </span>
                        )}
                      </td>
                      <td>{p.trackStock ? `${p.minStock} ${p.unit}` : '—'}</td>
                      <td>
                        {p.expiryDate ? (
                          <span
                            style={{
                              color: new Date(p.expiryDate) < new Date() ? 'var(--color-danger)' : 'inherit',
                              fontWeight: new Date(p.expiryDate) < new Date() ? 'bold' : 'normal',
                            }}
                          >
                            {p.expiryDate}{' '}
                            {new Date(p.expiryDate) < new Date() ? '(expired)' : ''}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                        {p.batchNo && (
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                            Batch: {p.batchNo}
                          </div>
                        )}
                      </td>
                      <td>
                        <Pill variant={pillVariant}>{pillLabel}</Pill>
                      </td>
                      {canAdjust && (
                        <td style={{ textAlign: 'right' }}>
                          {p.trackStock && (
                            <Button
                              variant="outline"
                              onClick={() => handleOpenAdjust(p.id)}
                            >
                              Adjust
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 2: Movements Log */}
      {activeTab === 'movements' && (
        <Card>
          {isMovementsLoading ? (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-8)', color: 'var(--color-text-muted)' }}>
              Loading stock movements...
            </div>
          ) : movements.length === 0 ? (
            <EmptyState
              message="No stock movements recorded yet."
              description="Stock in, stock out, sales, and manual adjustments will appear here."
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
                  <th>Timestamp</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Change</th>
                  <th>Stock After</th>
                  <th>Reason</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  let badgeVariant: 'success' | 'danger' | 'neutral' = 'neutral';
                  if (m.qty > 0) badgeVariant = 'success';
                  if (m.qty < 0) badgeVariant = 'danger';

                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {new Date(m.createdAt).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 600 }}>{m.productName}</td>
                      <td>
                        <Pill variant="neutral">{m.type.replace('_', ' ').toUpperCase()}</Pill>
                      </td>
                      <td>
                        <Pill variant={badgeVariant}>
                          {m.qty > 0 ? `+${m.qty}` : m.qty} {m.productUnit}
                        </Pill>
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        {m.stockAfter} {m.productUnit}
                      </td>
                      <td style={{ color: m.reason ? 'inherit' : 'var(--color-text-muted)' }}>
                        {m.reason || '—'}
                      </td>
                      <td>{m.createdBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      )}

      {/* Stock Adjustment Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Record Stock Movement"
      >
        <form onSubmit={handleAdjustSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
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
              Product *
            </label>
            <select
              className="input"
              value={selectedProductId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedProductId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                backgroundColor: 'var(--panel)',
                color: 'var(--ink)',
              }}
            >
              <option value="">Select a tracked product...</option>
              {stockItems
                .filter((p) => p.trackStock)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Current Stock: {p.stock} {p.unit})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Movement Type *
            </label>
            <select
              className="input"
              value={movementType}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setMovementType(e.target.value as 'stock_in' | 'stock_out' | 'adjustment')
              }
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                backgroundColor: 'var(--panel)',
                color: 'var(--ink)',
              }}
            >
              <option value="stock_in">Stock In (Increase +)</option>
              <option value="stock_out">Stock Out (Decrease −)</option>
              <option value="adjustment">Manual Adjustment</option>
            </select>
          </div>

          {movementType === 'adjustment' && (
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                Adjustment Direction *
              </label>
              <select
                className="input"
                value={direction}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setDirection(e.target.value as 'increase' | 'decrease')
                }
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  backgroundColor: 'var(--panel)',
                  color: 'var(--ink)',
                }}
              >
                <option value="increase">Increase Stock (+)</option>
                <option value="decrease">Decrease Stock (−)</option>
              </select>
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Quantity *
            </label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
              Reason {movementType === 'adjustment' ? '*' : '(optional)'}
            </label>
            <Input
              placeholder={movementType === 'adjustment' ? 'e.g., Audit discrepancy, damaged' : 'Optional note'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={movementType === 'adjustment'}
            />
          </div>

          {movementType === 'stock_in' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                  Batch Number
                </label>
                <Input
                  placeholder="e.g. BATCH-2026-01"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 'var(--spacing-1)', fontWeight: 500 }}>
                  Expiry Date
                </label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-2)' }}>
            <Button variant="outline" type="button" onClick={() => setIsAdjustModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? 'Updating...' : 'Save Movement'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
