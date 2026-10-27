import React, { useState, useEffect } from 'react';
import { CustomerOption, PaymentLineState } from '../../stores/cartStore';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  customer: CustomerOption | null;
  onCompleteSale: (payments: PaymentLineState[]) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
}

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'mbob', label: 'mBoB', icon: '📱' },
  { id: 'mpay', label: 'mPay', icon: '📱' },
  { id: 'dk_bank', label: 'DK Bank', icon: '🏦' },
  { id: 'tpay', label: 'TPay', icon: '📱' },
  { id: 'other_wallet', label: 'Other Wallet', icon: '👛' },
  { id: 'card', label: 'Card', icon: '💳' },
  { id: 'bank', label: 'Bank Transfer', icon: '🏛️' },
  { id: 'credit', label: 'Credit', icon: '📋' },
];

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  total,
  customer,
  onCompleteSale,
  isSubmitting,
  error,
}) => {
  const [payments, setPayments] = useState<PaymentLineState[]>([]);

  useEffect(() => {
    if (isOpen) {
      // Default: single cash line equal to grand total
      setPayments([
        {
          method: 'cash',
          amount: total,
          cashReceived: total,
          journalNo: '',
          bankName: '',
        },
      ]);
    }
  }, [isOpen, total]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remainingDue = Math.round((total - totalPaid) * 100) / 100;
  const isExactMatch = Math.abs(remainingDue) < 0.005;

  const handleAddPaymentLine = () => {
    const unallocated = Math.max(0, remainingDue);
    setPayments([
      ...payments,
      {
        method: 'cash',
        amount: unallocated > 0 ? unallocated : 0,
        cashReceived: unallocated > 0 ? unallocated : null,
        journalNo: '',
        bankName: '',
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (payments.length <= 1) return;
    setPayments(payments.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, updates: Partial<PaymentLineState>) => {
    setPayments(
      payments.map((p, i) => {
        if (i !== index) return p;
        const next = { ...p, ...updates };

        // Auto cash received when editing amount on cash
        if (next.method === 'cash' && updates.amount !== undefined && (next.cashReceived === null || next.cashReceived === undefined || next.cashReceived < next.amount)) {
          next.cashReceived = next.amount;
        }

        return next;
      })
    );
  };

  const handleQuickCash = (received: number) => {
    if (payments.length === 1 && payments[0]!.method === 'cash') {
      updateLine(0, { cashReceived: received });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isExactMatch || isSubmitting) return;

    // Check wallet Txn ID requirement (BR-17)
    for (const p of payments) {
      if (['mbob', 'mpay', 'dk_bank', 'tpay', 'other_wallet'].includes(p.method)) {
        if (!p.journalNo?.trim()) {
          alert(`Transaction ID is required for ${p.method.toUpperCase()}`);
          return;
        }
      } else if (p.method === 'bank') {
        if (!p.bankName?.trim() || !p.journalNo?.trim()) {
          alert('Bank name and journal number are required for Bank Transfer');
          return;
        }
      } else if (p.method === 'cash') {
        if (p.cashReceived !== null && p.cashReceived !== undefined && p.cashReceived < p.amount) {
          alert('Cash received cannot be less than the cash line amount');
          return;
        }
      } else if (p.method === 'credit') {
        if (!customer) {
          alert('Select a customer before adding a credit payment');
          return;
        }
      }
    }

    await onCompleteSale(payments);
  };

  // Check if credit exceeds limit
  const totalCredit = payments
    .filter((p) => p.method === 'credit')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const isCreditLimitExceeded =
    customer &&
    customer.creditLimit !== null &&
    customer.creditLimit > 0 &&
    customer.outstandingBalance + totalCredit > customer.creditLimit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white text-gray-900 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Checkout & Payments</h3>
            <p className="text-xs text-gray-500">Select payment methods and record transaction details</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 transition"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Total Banner */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-xl p-5 text-white flex items-center justify-between shadow-md">
            <div>
              <span className="text-xs uppercase tracking-wider text-emerald-100 font-medium">Grand Total Due</span>
              <div className="text-3xl font-extrabold tracking-tight mt-0.5">Nu. {total.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wider text-emerald-100 font-medium">Remaining</span>
              <div className={`text-xl font-bold mt-0.5 ${remainingDue === 0 ? 'text-emerald-200' : 'text-amber-200'}`}>
                {remainingDue === 0 ? '✓ Balanced' : `Nu. ${remainingDue.toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Credit Limit Exceeded Warning Banner */}
          {isCreditLimitExceeded && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
              <span className="text-base mt-0.5">⚠️</span>
              <div>
                <p className="font-semibold">Credit Limit Warning (BR-19)</p>
                <p>
                  Customer {customer.name} owes Nu. {customer.outstandingBalance.toFixed(2)}. Adding Nu.{' '}
                  {totalCredit.toFixed(2)} credit will exceed their limit of Nu. {customer.creditLimit?.toFixed(2)}.
                  Sale is still permitted.
                </p>
              </div>
            </div>
          )}

          {/* Quick Cash Buttons for Cash Payments */}
          {payments.length === 1 && payments[0]?.method === 'cash' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Quick Cash Shortcuts</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickCash(total)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-800 transition"
                >
                  Exact (Nu. {total.toFixed(2)})
                </button>
                {[
                  Math.ceil(total / 50) * 50,
                  Math.ceil(total / 100) * 100,
                  Math.ceil(total / 500) * 500,
                  Math.ceil(total / 1000) * 1000,
                ]
                  .filter((v, idx, arr) => v > total && arr.indexOf(v) === idx)
                  .slice(0, 4)
                  .map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickCash(val)}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 transition"
                    >
                      Nu. {val}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Payment Lines */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Lines</label>
              <button
                type="button"
                onClick={handleAddPaymentLine}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                + Add Method (Split)
              </button>
            </div>

            {payments.map((line, idx) => (
              <div key={idx} className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 relative">
                {payments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(idx)}
                    className="absolute top-3 right-3 text-gray-400 hover:text-rose-600 transition text-sm"
                    title="Remove payment line"
                  >
                    ✕
                  </button>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Method Select */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">Method</label>
                    <select
                      value={line.method}
                      onChange={(e) => updateLine(idx, { method: e.target.value })}
                      className="w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 py-2 px-2.5 bg-white"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option
                          key={m.id}
                          value={m.id}
                          disabled={m.id === 'credit' && !customer}
                        >
                          {m.icon} {m.label} {m.id === 'credit' && !customer ? '(Customer required)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Line Amount */}
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">Amount (Nu.)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={line.amount || ''}
                      onChange={(e) => updateLine(idx, { amount: parseFloat(e.target.value) || 0 })}
                      className="w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 py-2 px-2.5 font-semibold"
                      required
                    />
                  </div>
                </div>

                {/* Cash Details */}
                {line.method === 'cash' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-gray-200/60">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Cash Received (Nu.)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={line.amount}
                        value={line.cashReceived ?? ''}
                        onChange={(e) =>
                          updateLine(idx, {
                            cashReceived: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        className="w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 py-1.5 px-2.5"
                        placeholder={line.amount.toFixed(2)}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Change to Return</label>
                      <div className="text-xs font-bold text-emerald-700 py-2 px-2.5 bg-emerald-50/70 border border-emerald-200/50 rounded-lg">
                        Nu.{' '}
                        {line.cashReceived !== null && line.cashReceived !== undefined
                          ? Math.max(0, line.cashReceived - line.amount).toFixed(2)
                          : '0.00'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Digital Wallet Txn ID */}
                {['mbob', 'mpay', 'dk_bank', 'tpay', 'other_wallet'].includes(line.method) && (
                  <div className="pt-1 border-t border-gray-200/60">
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      Journal No / Txn ID <span className="text-rose-500">*</span> (BR-17)
                    </label>
                    <input
                      type="text"
                      value={line.journalNo || ''}
                      onChange={(e) => updateLine(idx, { journalNo: e.target.value })}
                      placeholder="e.g. 48211904 or MB12345678"
                      className="w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 py-1.5 px-2.5"
                      required
                    />
                  </div>
                )}

                {/* Bank Transfer Details */}
                {line.method === 'bank' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-gray-200/60">
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">
                        Bank Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={line.bankName || ''}
                        onChange={(e) => updateLine(idx, { bankName: e.target.value })}
                        placeholder="e.g. Bank of Bhutan"
                        className="w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 py-1.5 px-2.5"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">
                        Journal Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={line.journalNo || ''}
                        onChange={(e) => updateLine(idx, { journalNo: e.target.value })}
                        placeholder="e.g. JRN-2026-99"
                        className="w-full text-xs rounded-lg border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 py-1.5 px-2.5"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Credit info */}
                {line.method === 'credit' && customer && (
                  <div className="pt-1 border-t border-gray-200/60 text-[11px] text-gray-600 flex justify-between">
                    <span>
                      Customer: <strong>{customer.name}</strong>
                    </span>
                    <span>
                      Balance: Nu. {customer.outstandingBalance.toFixed(2)} | Limit: Nu.{' '}
                      {customer.creditLimit ? customer.creditLimit.toFixed(2) : 'None'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs">
              {!isExactMatch && (
                <span className="text-amber-600 font-medium">
                  {remainingDue > 0
                    ? `Nu. ${remainingDue.toFixed(2)} remaining to allocate`
                    : `Nu. ${Math.abs(remainingDue).toFixed(2)} over allocated`}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isExactMatch || isSubmitting}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition flex items-center gap-2 ${
                  isExactMatch && !isSubmitting
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-gray-300 cursor-not-allowed text-gray-500'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Processing Sale...
                  </>
                ) : (
                  <>
                    <span>✓</span> Complete Sale (Nu. {total.toFixed(2)})
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
