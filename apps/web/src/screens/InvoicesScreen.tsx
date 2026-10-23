import React, { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { ReceiptModal, ReceiptSaleData } from '../components/pos/ReceiptModal.js';

interface InvoiceListItem {
  id: string;
  invoiceNo: string;
  completedAt: string;
  businessDate: string;
  cashier: { id: string; name: string };
  customer: { id: string; name: string; phone: string | null; type: string } | null;
  orderType: string;
  tableNo: string | null;
  status: 'completed' | 'voided';
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  taxAmount: number;
  charges: number;
  total: number;
  amountPaid: number;
  creditAmount: number;
  paymentSummary: string;
  itemCount: number;
  voided: {
    at: string;
    by: { id: string; name: string } | null;
    reason: string | null;
  } | null;
}

interface InvoicesResponse {
  data: InvoiceListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export const InvoicesScreen: React.FC = () => {
  const { employee, permissions, business } = useAuth();
  const canVoid =
    permissions.includes('sales.void') ||
    employee?.role === 'admin' ||
    employee?.role === 'manager';

  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'voided'>('all');

  // Default date range: last 30 days
  const defaultTo = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);

  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 25, pages: 1 });

  // Receipt Modal state
  const [selectedSale, setSelectedSale] = useState<ReceiptSaleData | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [openVoidOnReceipt, setOpenVoidOnReceipt] = useState(false);
  const [loadingSaleId, setLoadingSaleId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (fromDate) params.set('from', `${fromDate}T00:00:00.000Z`);
      if (toDate) params.set('to', `${toDate}T23:59:59.999Z`);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await apiGet<InvoicesResponse>(`/sales?${params.toString()}`);
      setInvoices(res.data);
      setMeta(res.meta);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load invoices';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, fromDate, toDate, page, limit]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleOpenReceipt = async (saleId: string, openVoid = false) => {
    setLoadingSaleId(saleId);
    try {
      const res = await apiGet<{ data: ReceiptSaleData }>(`/sales/${saleId}`);
      setSelectedSale(res.data);
      setOpenVoidOnReceipt(openVoid);
      setIsReceiptOpen(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to load receipt details');
    } finally {
      setLoadingSaleId(null);
    }
  };

  const handleVoidSuccess = (updatedSale: ReceiptSaleData) => {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === updatedSale.id
          ? {
              ...inv,
              status: 'voided',
              voided: updatedSale.voided,
            }
          : inv
      )
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Screen Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Invoices & Sales History</h1>
          <p className="text-sm text-gray-500 mt-1">
            Search, view, print 80mm receipts, and manage sales transactions (SCR-14).
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search box */}
          <div className="md:col-span-5 relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search invoice no. (e.g. INV-2026-00042) or customer name…"
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Date range From */}
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Date range To */}
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-2.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Quick reset */}
          <div className="md:col-span-1 flex items-center">
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setFromDate(defaultFrom);
                setToDate(defaultTo);
                setPage(1);
              }}
              title="Reset Filters"
              className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <span className="text-xs font-semibold text-gray-500 mr-1">Status:</span>
          {(['all', 'completed', 'voided'] as const).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition capitalize ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {st}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">
            Showing {invoices.length} of {meta.total} invoices
          </span>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 text-sm">Loading invoices…</div>
        ) : error ? (
          <div className="p-12 text-center text-red-600 text-sm">{error}</div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-3xl">🧾</div>
            <h3 className="font-semibold text-gray-800 text-sm">No invoices yet</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Completed and voided sales invoices matching your search and filter range will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Invoice No.</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4 text-center">Items</th>
                  <th className="py-3 px-4 text-right">Subtotal</th>
                  <th className="py-3 px-4 text-right">GST</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-gray-900">
                      {inv.invoiceNo}
                    </td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      <div>{new Date(inv.completedAt).toLocaleDateString()}</div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(inv.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-800 font-medium">
                      {inv.customer ? (
                        <div>
                          <span>{inv.customer.name}</span>
                          <span className="text-[10px] text-gray-400 ml-1">({inv.customer.type})</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Walk-in</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-gray-600">
                      {inv.itemCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-700">
                      Nu. {inv.subtotal.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-700">
                      Nu. {inv.taxAmount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                      Nu. {inv.total.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          inv.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                      <button
                        onClick={() => handleOpenReceipt(inv.id, false)}
                        disabled={loadingSaleId === inv.id}
                        className="px-2.5 py-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
                      >
                        {loadingSaleId === inv.id ? '…' : 'View'}
                      </button>

                      {canVoid && inv.status === 'completed' && (
                        <button
                          onClick={() => handleOpenReceipt(inv.id, true)}
                          disabled={loadingSaleId === inv.id}
                          className="px-2.5 py-1 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg transition"
                        >
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination bar */}
        {meta.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs">
            <span className="text-gray-500">
              Page {meta.page} of {meta.pages}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white border border-gray-300 rounded text-gray-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= meta.pages}
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                className="px-3 py-1 bg-white border border-gray-300 rounded text-gray-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Thermal & PDF Receipt Modal (SCR-09) */}
      {selectedSale && (
        <ReceiptModal
          sale={selectedSale}
          business={business || undefined}
          isOpen={isReceiptOpen}
          initialOpenVoidModal={openVoidOnReceipt}
          onClose={() => setIsReceiptOpen(false)}
          onVoidSuccess={handleVoidSuccess}
        />
      )}
    </div>
  );
};
