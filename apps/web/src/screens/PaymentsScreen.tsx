import React, { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api/client.js';

interface MethodTotal {
  method: string;
  amount: number;
  count: number;
}

interface PaymentRecord {
  id: string;
  kind: 'sale' | 'credit_settlement';
  referenceNo: string;
  saleId: string | null;
  customerId: string | null;
  customerName: string | null;
  method: string;
  amount: number;
  fee: number;
  bankName: string | null;
  journalNo: string | null;
  remarks: string | null;
  status: string;
  businessDate: string;
  createdAt: string;
  voidedAt: string | null;
  createdBy: { id: string; name: string };
}

interface PaymentsReportResponse {
  totalsByMethod: MethodTotal[];
  totalReceived: number;
  onCredit: { amount: number; count: number };
  settlementsTotal: { amount: number; count: number };
  records: PaymentRecord[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

export const PaymentsScreen: React.FC = () => {
  const [preset, setPreset] = useState<DatePreset>('today');
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaymentsReportResponse | null>(null);

  // Set dates based on preset
  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    setPage(1);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (p === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (p === 'yesterday') {
      const yest = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setFromDate(yest);
      setToDate(yest);
    } else if (p === 'week') {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d.setDate(diff)).toISOString().slice(0, 10);
      setFromDate(monday);
      setToDate(todayStr);
    } else if (p === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      setFromDate(firstDay);
      setToDate(todayStr);
    } else if (p === 'year') {
      const firstDayOfYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
      setFromDate(firstDayOfYear);
      setToDate(todayStr);
    }
  };

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', `${fromDate}T00:00:00.000Z`);
      if (toDate) params.set('to', `${toDate}T23:59:59.999Z`);
      if (methodFilter !== 'all') params.set('method', methodFilter);
      if (kindFilter !== 'all') params.set('kind', kindFilter);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await apiGet<PaymentsReportResponse>(`/payments?${params.toString()}`);
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load payments report';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, methodFilter, kindFilter, page, limit]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', `${fromDate}T00:00:00.000Z`);
    if (toDate) params.set('to', `${toDate}T23:59:59.999Z`);
    if (methodFilter !== 'all') params.set('method', methodFilter);
    if (kindFilter !== 'all') params.set('kind', kindFilter);

    window.open(`/api/v1/payments/export.csv?${params.toString()}`, '_blank');
  };

  const cashTotal = data?.totalsByMethod.find((m) => m.method === 'cash');
  const mbobTotal = data?.totalsByMethod.find((m) => m.method === 'mbob');
  const mpayTotal = data?.totalsByMethod.find((m) => m.method === 'bnb_mPay');
  const tpayTotal = data?.totalsByMethod.find((m) => m.method === 'tPay');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Title & Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Payments & Daily Register</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cash register reconciliation, digital wallet transactions, and credit settlements (SCR-15).
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
        >
          <span>📊</span> Export CSV
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
        {/* Preset Date Range Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Period:</span>
          {(['today', 'yesterday', 'week', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition capitalize ${
                preset === p
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p === 'week' ? 'This week' : p === 'month' ? 'This month' : p === 'year' ? 'This year' : p}
            </button>
          ))}
        </div>

        {/* Date Inputs & Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPreset('custom');
                setPage(1);
              }}
              className="w-full py-1.5 px-3 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPreset('custom');
                setPage(1);
              }}
              className="w-full py-1.5 px-3 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Method</label>
            <select
              value={methodFilter}
              onChange={(e) => {
                setMethodFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-3 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="all">All Methods</option>
              <option value="cash">Cash</option>
              <option value="mbob">mBoB (Bank of Bhutan)</option>
              <option value="bnb_mPay">B-Ngultrum / mPay (BNBL)</option>
              <option value="tPay">T-Pay (Tashi Bank)</option>
              <option value="credit">On Credit</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase mb-1">Type</label>
            <select
              value={kindFilter}
              onChange={(e) => {
                setKindFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-1.5 px-3 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
            >
              <option value="all">All Transactions</option>
              <option value="sale">Sales Only</option>
              <option value="credit_settlement">Credit Settlements Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards (BR-31: completed only, credit separate, settlements counted) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Money Received */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm col-span-2 sm:col-span-1 lg:col-span-2 bg-gradient-to-br from-indigo-50/50 to-white">
          <div className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">
            Total Money Received
          </div>
          <div className="text-2xl font-extrabold text-indigo-900 mt-1 font-mono">
            Nu. {(data?.totalReceived || 0).toFixed(2)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Excludes credit sales (BR-31)</p>
        </div>

        {/* Cash */}
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>Cash</span>
            <span>💵</span>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1 font-mono">
            Nu. {(cashTotal?.amount || 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{cashTotal?.count || 0} txns</div>
        </div>

        {/* mBoB */}
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>mBoB</span>
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1 font-mono">
            Nu. {(mbobTotal?.amount || 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{mbobTotal?.count || 0} txns</div>
        </div>

        {/* mPay / B-Ngultrum */}
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>mPay</span>
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1 font-mono">
            Nu. {(mpayTotal?.amount || 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{mpayTotal?.count || 0} txns</div>
        </div>

        {/* T-Pay */}
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>T-Pay</span>
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
          </div>
          <div className="text-lg font-bold text-gray-900 mt-1 font-mono">
            Nu. {(tpayTotal?.amount || 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{tpayTotal?.count || 0} txns</div>
        </div>
      </div>

      {/* Credit & Settlements Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* On Credit */}
        <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">
              On Credit (Sales)
            </div>
            <div className="text-xl font-extrabold text-amber-900 mt-1 font-mono">
              Nu. {(data?.onCredit?.amount || 0).toFixed(2)}
            </div>
            <p className="text-[11px] text-amber-700/80 mt-0.5">
              {data?.onCredit?.count || 0} credit sale(s) billed to customer accounts
            </p>
          </div>
          <div className="text-2xl">📝</div>
        </div>

        {/* Credit Settlements */}
        <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              Credit Settlements Received
            </div>
            <div className="text-xl font-extrabold text-emerald-900 mt-1 font-mono">
              Nu. {(data?.settlementsTotal?.amount || 0).toFixed(2)}
            </div>
            <p className="text-[11px] text-emerald-700/80 mt-0.5">
              {data?.settlementsTotal?.count || 0} customer balance repayment(s)
            </p>
          </div>
          <div className="text-2xl">💳</div>
        </div>
      </div>

      {/* Payment Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 text-sm">Loading payments…</div>
        ) : error ? (
          <div className="p-12 text-center text-red-600 text-sm">{error}</div>
        ) : !data || data.records.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-3xl">💳</div>
            <h3 className="font-semibold text-gray-800 text-sm">No payments in this range</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Payments from completed POS sales and customer credit settlements will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Invoice / Receipt</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Bank / Journal No.</th>
                  <th className="py-3 px-4">Recorded By</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/70 transition">
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">
                      <div>{new Date(r.createdAt).toLocaleDateString()}</div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-gray-900">
                      {r.referenceNo}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          r.kind === 'sale'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {r.kind === 'sale' ? 'Sale Payment' : 'Settlement'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-800">
                      {r.customerName || <span className="text-gray-400 italic">Walk-in</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wider text-gray-700">
                        {r.method}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">
                      Nu. {r.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-[11px]">
                      {r.journalNo ? (
                        <div>
                          <span className="font-semibold text-gray-800">{r.journalNo}</span>
                          {r.bankName && <span className="text-gray-400 ml-1">({r.bankName})</span>}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-700">
                      {r.createdBy?.name || 'Staff'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          r.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination bar */}
        {data && data.meta.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs">
            <span className="text-gray-500">
              Page {data.meta.page} of {data.meta.pages}
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
                disabled={page >= data.meta.pages}
                onClick={() => setPage((p) => Math.min(data.meta.pages, p + 1))}
                className="px-3 py-1 bg-white border border-gray-300 rounded text-gray-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
