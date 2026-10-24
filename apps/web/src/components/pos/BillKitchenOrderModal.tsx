import React, { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useCartStore, type CartProduct } from '../../stores/cartStore';

interface BillableKitchenOrderItem {
  id: string;
  productId: string;
  name: string;
  qty: number;
  product: CartProduct | null;
}

interface BillableKitchenOrder {
  id: string;
  orderNo: string;
  orderType: string;
  tableNo: string | null;
  note: string | null;
  status: 'ready' | 'served';
  billed: boolean;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    type: string;
    creditLimit: number | null;
    outstandingBalance: number;
  } | null;
  creator: { id: string; name: string } | null;
  items: BillableKitchenOrderItem[];
}

interface BillKitchenOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderSelected: (orderNo: string) => void;
}

function timeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  return `${diffHours}h ${diffMins % 60}m ago`;
}

export const BillKitchenOrderModal: React.FC<BillKitchenOrderModalProps> = ({
  isOpen,
  onClose,
  onOrderSelected,
}) => {
  const [orders, setOrders] = useState<BillableKitchenOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKitchenOrder = useCartStore((state) => state.loadKitchenOrder);

  const fetchBillable = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ data: BillableKitchenOrder[] }>('/api/v1/kitchen-orders/billable');
      if (res && res.data) {
        setOrders(res.data);
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string; error?: { message?: string } };
      setError(errorObj.error?.message || errorObj.message || 'Failed to fetch billable kitchen orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBillable();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectOrder = (order: BillableKitchenOrder) => {
    // Check if items have valid product details
    const validItems: Array<{ product: CartProduct; qty: number }> = [];
    for (const item of order.items) {
      if (item.product) {
        validItems.push({
          product: item.product,
          qty: item.qty,
        });
      }
    }

    if (validItems.length === 0) {
      setError(`Cannot bill ${order.orderNo}: items no longer exist in catalog.`);
      return;
    }

    loadKitchenOrder({
      id: order.id,
      orderType: order.orderType,
      tableNo: order.tableNo,
      customer: order.customer
        ? {
            id: order.customer.id,
            name: order.customer.name,
            phone: order.customer.phone,
            type: order.customer.type,
            creditLimit: order.customer.creditLimit,
            outstandingBalance: order.customer.outstandingBalance,
            discountPct: 0,
            gstId: null,
          }
        : null,
      items: validItems,
    });

    onOrderSelected(order.orderNo);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-emerald-50/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📋</span>
            <div>
              <h2 className="text-base font-bold text-gray-900">Bill a Kitchen Order</h2>
              <p className="text-xs text-gray-500">Select a Ready or Served order to load into POS cart</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 text-xs">
              <span className="animate-spin text-2xl mb-2">⌛</span>
              <span>Loading billable kitchen orders...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 text-xs">
              <span className="text-3xl mb-2">🍽️</span>
              <p className="font-semibold text-gray-600">No billable kitchen orders</p>
              <p className="text-gray-400 text-[11px] mt-1">
                Only Ready and Served unbilled orders will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const totalItemsCount = order.items.reduce((s, i) => s + i.qty, 0);
                const isReady = order.status === 'ready';

                return (
                  <div
                    key={order.id}
                    className="p-4 rounded-xl border border-gray-200 hover:border-emerald-300 hover:shadow-md transition bg-white flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">
                          {order.orderNo}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isReady ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {order.status}
                        </span>
                        {order.tableNo && (
                          <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
                            Table {order.tableNo}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400">• {timeAgo(order.createdAt)}</span>
                      </div>

                      {order.note && (
                        <div className="text-[11px] text-amber-800 bg-amber-50/80 px-2 py-1 rounded-md border border-amber-200 inline-block font-medium">
                          Note: {order.note}
                        </div>
                      )}

                      <div className="text-xs text-gray-600 font-medium">
                        {order.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                      </div>

                      <div className="text-[11px] text-gray-400 flex items-center gap-2">
                        <span>Items: {totalItemsCount}</span>
                        {order.customer && <span>• Customer: {order.customer.name}</span>}
                        {order.creator && <span>• Taken by: {order.creator.name}</span>}
                      </div>
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => handleSelectOrder(order)}
                        className="w-full md:w-auto py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition flex items-center justify-center gap-1.5"
                      >
                        <span>💳</span>
                        <span>Bill This Order</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-between items-center text-xs text-gray-500">
          <span>{orders.length} order(s) awaiting billing</span>
          <button
            type="button"
            onClick={fetchBillable}
            className="text-emerald-700 hover:underline font-medium"
          >
            ↻ Refresh
          </button>
        </div>
      </div>
    </div>
  );
};
