import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import { useCartStore } from '../../stores/cartStore';

interface HeldOrderRecord {
  id: string;
  label: string;
  createdAt: string;
  creator: { id: string; name: string };
  payload: Record<string, unknown>;
}

interface HeldOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderResumed: () => void;
}

export const HeldOrdersModal: React.FC<HeldOrdersModalProps> = ({
  isOpen,
  onClose,
  onOrderResumed,
}) => {
  const [orders, setOrders] = useState<HeldOrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const restoreFromHeldOrder = useCartStore((state) => state.restoreFromHeldOrder);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ data: HeldOrderRecord[] }>('/api/v1/held-orders');
      if (res && res.data) {
        setOrders(res.data);
      }
    } catch (err) {
      console.error('Failed to load held orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOrders();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleResume = async (order: HeldOrderRecord) => {
    setResumingId(order.id);
    try {
      const res = await apiPost<{ data: { payload: unknown } }>(
        `/api/v1/held-orders/${order.id}/resume`,
        {}
      );
      if (res && res.data) {
        restoreFromHeldOrder(res.data.payload as Parameters<typeof restoreFromHeldOrder>[0], order.id);
        onOrderResumed();
        onClose();
      }
    } catch (err) {
      console.error('Failed to resume held order:', err);
      alert('Could not resume held order');
    } finally {
      setResumingId(null);
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!confirm('Are you sure you want to discard this held order?')) return;
    try {
      await apiDelete(`/api/v1/held-orders/${orderId}`);
      setOrders(orders.filter((o) => o.id !== orderId));
    } catch (err) {
      console.error('Failed to delete held order:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white text-gray-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Held Orders ({orders.length})</h3>
            <p className="text-xs text-gray-500">Resume or discard previously held carts</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 transition"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Loading held orders...</div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              <span className="text-3xl block mb-2">📥</span>
              No held orders currently in queue.
            </div>
          ) : (
            orders.map((o) => {
              const lines = Array.isArray((o.payload as { lines?: unknown[] })?.lines)
                ? (o.payload as { lines: unknown[] }).lines
                : [];
              const orderType = (o.payload as { orderType?: string })?.orderType || 'walk_in';
              const tableNo = (o.payload as { tableNo?: string })?.tableNo;

              return (
                <div
                  key={o.id}
                  className="p-4 bg-gray-50 hover:bg-gray-100/80 border border-gray-200 rounded-xl flex items-center justify-between gap-4 transition"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-900 text-sm">{o.label}</div>
                    <div className="text-xs text-gray-500 flex flex-wrap items-center gap-2">
                      <span>{lines.length} items</span>
                      <span>•</span>
                      <span className="capitalize">{orderType.replace('_', ' ')}</span>
                      {tableNo && <span>• Table {tableNo}</span>}
                      <span>•</span>
                      <span>By {o.creator.name}</span>
                    </div>
                    <div className="text-[10px] text-gray-400">
                      Held at: {new Date(o.createdAt).toLocaleTimeString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleResume(o)}
                      disabled={resumingId === o.id}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                    >
                      {resumingId === o.id ? 'Resuming...' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(o.id)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 transition text-sm rounded-lg hover:bg-rose-50"
                      title="Discard order"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
