import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../api/client';
import { useCartStore, type CartProduct } from '../stores/cartStore';

export type KitchenStatus = 'new' | 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled';

interface KitchenOrderItem {
  id: string;
  productId: string;
  name: string;
  qty: number;
  unit: string;
  category: string;
  sellPrice: number;
}

interface KitchenOrder {
  id: string;
  orderNo: string;
  orderType: string;
  tableNo: string | null;
  note: string | null;
  status: KitchenStatus;
  billed: boolean;
  saleId: string | null;
  customerId: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  createdBy: string;
  creator: { id: string; name: string; role: string } | null;
  statusChangedAt: string;
  createdAt: string;
  items: KitchenOrderItem[];
}

const COLUMNS: Array<{
  id: KitchenStatus;
  title: string;
  nextStatus?: KitchenStatus;
  nextLabel?: string;
  badgeBg: string;
  badgeText: string;
  borderHeader: string;
}> = [
  {
    id: 'new',
    title: 'New',
    nextStatus: 'accepted',
    nextLabel: 'Accept ➔',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    borderHeader: 'border-blue-400',
  },
  {
    id: 'accepted',
    title: 'Accepted',
    nextStatus: 'preparing',
    nextLabel: 'Start Prep ➔',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-800',
    borderHeader: 'border-indigo-400',
  },
  {
    id: 'preparing',
    title: 'Preparing',
    nextStatus: 'ready',
    nextLabel: 'Mark Ready ➔',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    borderHeader: 'border-amber-400',
  },
  {
    id: 'ready',
    title: 'Ready',
    nextStatus: 'served',
    nextLabel: 'Serve ➔',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    borderHeader: 'border-emerald-400',
  },
  {
    id: 'served',
    title: 'Served',
    badgeBg: 'bg-gray-100',
    badgeText: 'text-gray-800',
    borderHeader: 'border-gray-400',
  },
  {
    id: 'cancelled',
    title: 'Cancelled',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    borderHeader: 'border-rose-400',
  },
];

function getElapsedTime(createdAt: string): { label: string; urgency: 'normal' | 'warn' | 'urgent' } {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  let label = `${diffMins}m ago`;
  if (diffMins < 1) label = 'Just now';
  else if (diffMins >= 60) label = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m ago`;

  let urgency: 'normal' | 'warn' | 'urgent' = 'normal';
  if (diffMins >= 25) urgency = 'urgent';
  else if (diffMins >= 12) urgency = 'warn';

  return { label, urgency };
}

export const KitchenBoardScreen: React.FC = () => {
  const { business, permissions } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadKitchenOrder = useCartStore((state) => state.loadKitchenOrder);

  const [activeFilter, setActiveFilter] = useState<'active' | 'all' | 'ready_billable' | 'closed'>('active');
  const [cancelModalOrder, setCancelModalOrder] = useState<KitchenOrder | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Poll kitchen orders every 5 seconds (AC-37, SCR-10)
  const { data: orders = [], isLoading, error: queryError } = useQuery<KitchenOrder[]>({
    queryKey: ['kitchen-orders'],
    queryFn: async () => {
      const res = await apiGet<{ data: KitchenOrder[] }>('/api/v1/kitchen-orders');
      return res.data || [];
    },
    enabled: business?.type === 'restaurant',
    refetchInterval: 5000,
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: KitchenStatus }) => {
      const res = await apiPost<{ data: KitchenOrder }>(`/api/v1/kitchen-orders/${id}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      setActionError(null);
      setCancelModalOrder(null);
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    },
    onError: (err: unknown) => {
      const errorObj = err as { message?: string; error?: { message?: string } };
      setActionError(errorObj.error?.message || errorObj.message || 'Status transition failed');
    },
  });

  if (business?.type !== 'restaurant') {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center py-20">
        <span className="text-5xl mb-4 block">🍳</span>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Kitchen Orders Board</h1>
        <p className="text-gray-500 text-sm mb-6">
          The Kitchen Display System (KOT) is designed specifically for restaurants and cafes.
          Your business is currently registered as a{' '}
          <span className="font-semibold text-gray-800">{business?.type || 'non-restaurant'}</span>.
        </p>
        <button
          type="button"
          onClick={() => navigate('/app/pos')}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition"
        >
          Go to Point of Sale
        </button>
      </div>
    );
  }

  // Filter columns to display based on active tab
  const visibleColumns = COLUMNS.filter((col) => {
    if (activeFilter === 'active') {
      return ['new', 'accepted', 'preparing', 'ready'].includes(col.id);
    }
    if (activeFilter === 'ready_billable') {
      return ['ready', 'served'].includes(col.id);
    }
    if (activeFilter === 'closed') {
      return ['served', 'cancelled'].includes(col.id);
    }
    return true; // 'all'
  });

  const canSell = permissions.includes('pos.sell');

  // Handle billing an order directly from kitchen board
  const handleBillOrder = (order: KitchenOrder) => {
    // Map items to CartProduct shape for loading into POS cart
    const validItems: Array<{ product: CartProduct; qty: number }> = order.items.map((i) => ({
      product: {
        id: i.productId,
        name: i.name,
        barcode: '',
        category: i.category || 'Kitchen',
        unit: i.unit || 'plate',
        sellPrice: i.sellPrice,
        stock: 999,
        trackStock: false,
        minStock: 0,
        taxRate: {
          id: 'standard',
          rate: 0,
          mode: 'exclusive',
          category: 'exempt',
        },
      },
      qty: i.qty,
    }));

    loadKitchenOrder({
      id: order.id,
      orderType: order.orderType,
      tableNo: order.tableNo,
      customer: order.customer
        ? {
            id: order.customer.id,
            name: order.customer.name,
            phone: order.customer.phone,
            type: 'regular',
            creditLimit: null,
            outstandingBalance: 0,
            discountPct: 0,
            gstId: null,
          }
        : null,
      items: validItems,
    });

    navigate('/app/pos');
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-100 overflow-hidden">
      {/* Top Bar / Toolbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍳</span>
            <h1 className="text-base font-bold text-gray-900">Kitchen Display Board</h1>
          </div>
          <span className="text-xs text-gray-400 hidden sm:inline">•</span>
          <span className="text-xs text-gray-500 hidden sm:inline">
            Auto-refreshes every 5s
          </span>
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeFilter === 'active'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Active ({orders.filter((o) => ['new', 'accepted', 'preparing', 'ready'].includes(o.status)).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeFilter === 'all'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Columns
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('ready_billable')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeFilter === 'ready_billable'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Ready to Bill ({orders.filter((o) => ['ready', 'served'].includes(o.status) && !o.billed).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('closed')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeFilter === 'closed'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Closed
            </button>
          </div>

          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] })}
            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition text-xs font-semibold"
            title="Refresh now"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {actionError && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-2 text-rose-800 text-xs font-medium flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-600 font-bold hover:text-rose-900 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Board Kanban Layout with Horizontal Scroll on Tablet/Desktop */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
            <span className="animate-spin text-3xl mb-2">⌛</span>
            <span>Loading kitchen tickets...</span>
          </div>
        ) : queryError ? (
          <div className="h-full flex flex-col items-center justify-center text-rose-600 text-sm">
            <span className="text-3xl mb-2">⚠️</span>
            <span>Failed to load kitchen tickets</span>
          </div>
        ) : (
          <div className="flex gap-4 h-full min-w-max pb-2">
            {visibleColumns.map((col) => {
              const columnOrders = orders.filter((o) => o.status === col.id);

              return (
                <div
                  key={col.id}
                  className="w-80 flex flex-col bg-gray-50/80 rounded-2xl border border-gray-200 overflow-hidden shadow-sm shrink-0"
                >
                  {/* Column Header */}
                  <div
                    className={`px-4 py-3 bg-white border-b-2 ${col.borderHeader} flex items-center justify-between shrink-0`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900">{col.title}</span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.badgeBg} ${col.badgeText}`}
                      >
                        {columnOrders.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards Scroll Area */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {columnOrders.length === 0 ? (
                      <div className="h-32 flex flex-col items-center justify-center text-gray-300 text-xs border-2 border-dashed border-gray-200 rounded-xl">
                        <span>No tickets in {col.title}</span>
                      </div>
                    ) : (
                      columnOrders.map((order) => {
                        const { label: elapsed, urgency } = getElapsedTime(order.createdAt);
                        const canCancel = ['new', 'accepted', 'preparing', 'ready'].includes(order.status) && !order.billed;
                        const canBill = ['ready', 'served'].includes(order.status) && !order.billed && canSell;

                        return (
                          <div
                            key={order.id}
                            className={`p-3.5 bg-white rounded-xl border shadow-sm transition hover:shadow-md ${
                              urgency === 'urgent'
                                ? 'border-rose-300 ring-1 ring-rose-300'
                                : urgency === 'warn'
                                  ? 'border-amber-300'
                                  : 'border-gray-200'
                            }`}
                          >
                            {/* Card Top: Order No, Table, Urgency */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <span className="font-mono font-bold text-sm text-gray-900">
                                  {order.orderNo}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {order.tableNo ? (
                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                                      Table {order.tableNo}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-semibold text-gray-600 capitalize">
                                      {order.orderType.replace('_', ' ')}
                                    </span>
                                  )}
                                  {order.billed && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                      ✓ Billed
                                    </span>
                                  )}
                                </div>
                              </div>

                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                  urgency === 'urgent'
                                    ? 'bg-rose-100 text-rose-800 animate-pulse'
                                    : urgency === 'warn'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {elapsed}
                              </span>
                            </div>

                            {/* Kitchen Note Callout */}
                            {order.note && (
                              <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-medium leading-relaxed">
                                <span className="font-bold">Note:</span> {order.note}
                              </div>
                            )}

                            {/* Items List */}
                            <div className="divide-y divide-gray-100 border-t border-b border-gray-100 py-1.5 my-2 text-xs">
                              {order.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="py-1 flex items-baseline justify-between gap-2"
                                >
                                  <div className="flex items-baseline gap-2">
                                    <span className="font-bold text-gray-900 text-sm w-5 text-right">
                                      {item.qty}×
                                    </span>
                                    <span className="font-medium text-gray-800">{item.name}</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Footer Details: Server / Creator */}
                            <div className="flex items-center justify-between text-[11px] text-gray-400 mb-3">
                              <span>Taken by: {order.creator?.name || 'Staff'}</span>
                              {order.customer && <span>{order.customer.name}</span>}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1.5 pt-1">
                              {/* Step Forward Action */}
                              {col.nextStatus && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    statusMutation.mutate({
                                      id: order.id,
                                      status: col.nextStatus!,
                                    })
                                  }
                                  disabled={statusMutation.isPending}
                                  className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center justify-center gap-1 disabled:opacity-50"
                                >
                                  <span>{col.nextLabel}</span>
                                </button>
                              )}

                              {/* Bill Order Button */}
                              {canBill && (
                                <button
                                  type="button"
                                  onClick={() => handleBillOrder(order)}
                                  className="py-1.5 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1"
                                  title="Bill this order in POS"
                                >
                                  <span>💳</span> Bill
                                </button>
                              )}

                              {/* Cancel Button */}
                              {canCancel && (
                                <button
                                  type="button"
                                  onClick={() => setCancelModalOrder(order)}
                                  disabled={statusMutation.isPending}
                                  className="py-1.5 px-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium transition"
                                  title="Cancel ticket"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel Order Confirm Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="text-2xl">⚠️</span>
              <h3 className="font-bold text-base text-gray-900">Cancel Kitchen Order?</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to cancel ticket{' '}
              <span className="font-mono font-bold text-gray-900">{cancelModalOrder.orderNo}</span>?
              {cancelModalOrder.tableNo && ` (Table ${cancelModalOrder.tableNo})`}
              <br />
              This will mark the ticket as cancelled and cannot be undone.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                className="flex-1 py-2 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                No, Keep Ticket
              </button>
              <button
                type="button"
                onClick={() =>
                  statusMutation.mutate({
                    id: cancelModalOrder.id,
                    status: 'cancelled',
                  })
                }
                disabled={statusMutation.isPending}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
              >
                Yes, Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
