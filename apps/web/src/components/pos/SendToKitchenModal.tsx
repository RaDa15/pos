import React, { useState } from 'react';
import { apiPost } from '../../api/client';
import { useCartStore } from '../../stores/cartStore';

interface SendToKitchenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderSent: (orderNo: string) => void;
}

export const SendToKitchenModal: React.FC<SendToKitchenModalProps> = ({
  isOpen,
  onClose,
  onOrderSent,
}) => {
  const lines = useCartStore((state) => state.lines);
  const currentOrderType = useCartStore((state) => state.orderType);
  const currentTableNo = useCartStore((state) => state.tableNo);
  const currentCustomer = useCartStore((state) => state.customer);
  const clearCart = useCartStore((state) => state.clearCart);

  const [orderType, setOrderType] = useState<string>(
    ['dine_in', 'takeaway', 'delivery', 'room_service', 'pre_booked'].includes(currentOrderType)
      ? currentOrderType
      : 'dine_in'
  );
  const [tableNo, setTableNo] = useState<string>(currentTableNo || '');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      setError('Cannot send an empty order to the kitchen.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiPost<{ data: { id: string; orderNo: string } }>('/api/v1/kitchen-orders', {
        orderType,
        tableNo: orderType === 'dine_in' ? tableNo.trim() || null : null,
        note: note.trim() || null,
        customerId: currentCustomer?.id || null,
        items: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
        })),
      });

      if (res && res.data) {
        clearCart();
        onOrderSent(res.data.orderNo);
        onClose();
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string; error?: { message?: string } };
      setError(errorObj.error?.message || errorObj.message || 'Failed to send order to kitchen');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-amber-50/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍳</span>
            <div>
              <h2 className="text-base font-bold text-gray-900">Send to Kitchen (KOT)</h2>
              <p className="text-xs text-gray-500">Order ticket will appear on the Kitchen Board</p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Order Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Order Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'dine_in', label: 'Dine-In', icon: '🍽️' },
                { id: 'takeaway', label: 'Takeaway', icon: '🥡' },
                { id: 'delivery', label: 'Delivery', icon: '🛵' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOrderType(t.id)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                    orderType === t.id
                      ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Table Number (If Dine-in) */}
          {orderType === 'dine_in' && (
            <div>
              <label htmlFor="kot-table-no" className="block text-xs font-semibold text-gray-700 mb-1">
                Table Number <span className="text-rose-500">*</span>
              </label>
              <input
                id="kot-table-no"
                type="text"
                required
                value={tableNo}
                onChange={(e) => setTableNo(e.target.value)}
                placeholder="e.g. 4 or T-12"
                className="w-full text-sm py-2 px-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          )}

          {/* Kitchen Note */}
          <div>
            <label htmlFor="kot-note" className="block text-xs font-semibold text-gray-700 mb-1">
              Kitchen Instructions / Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="kot-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Medium spice, no coriander, extra sauce"
              className="w-full text-xs py-2 px-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          {/* Items Summary Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-700">Ticket Items ({lines.length})</span>
              <span className="text-[11px] text-gray-500">
                Total Qty: {lines.reduce((sum, l) => sum + l.qty, 0)}
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 rounded-xl border border-gray-200 bg-gray-50/50 p-2 text-xs">
              {lines.map((item) => (
                <div key={item.productId} className="py-1.5 flex items-center justify-between text-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-700 w-6 text-right">{item.qty}×</span>
                    <span className="font-medium truncate max-w-[260px]">{item.name}</span>
                  </div>
                  <span className="text-gray-500 text-[11px]">Nu. {(item.unitPrice * item.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-gray-100 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || lines.length === 0}
              className="flex-[2] py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin text-sm">⌛</span>
                  <span>Sending to Kitchen...</span>
                </>
              ) : (
                <>
                  <span>🍳</span>
                  <span>Send to Kitchen ({lines.reduce((s, l) => s + l.qty, 0)} items)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
