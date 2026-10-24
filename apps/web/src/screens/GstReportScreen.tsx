import React, { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { AppShell } from '../components/layout/AppShell.js';
import { Card, KpiCard } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Pill } from '../components/ui/Pill.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';

interface GstReportData {
  range: {
    from: string | null;
    to: string | null;
  };
  gstRegistered: boolean;
  summary: {
    totalSales: number;
    taxableSales: number;
    gst: number;
    discounts: number;
    transactions: number;
    voided: number;
    netSales: number;
  };
  daily: Array<{
    date: string;
    sales: number;
    taxable: number;
    gst: number;
    transactions: number;
  }>;
  byRate: Array<{
    rate: number;
    category: string;
    taxable: number;
    gst: number;
  }>;
  sales: Array<{
    id: string;
    invoiceNo: string;
    completedAt: string;
    taxable: number;
    gst: number;
    total: number;
    status: string;
  }>;
}

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

export const GstReportScreen: React.FC = () => {
  const { business } = useAuth();

  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activeTab, setActiveTab] = useState<'daily' | 'rate' | 'transactions'>('daily');

  const [data, setData] = useState<GstReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to compute date range strings (YYYY-MM-DD)
  const computePresetRange = (p: DatePreset): { fromStr: string; toStr: string } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const format = (d: Date) => d.toISOString().slice(0, 10);

    switch (p) {
      case 'today':
        return { fromStr: format(today), toStr: format(today) };
      case 'yesterday': {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        return { fromStr: format(y), toStr: format(y) };
      }
      case 'this_week': {
        const start = new Date(today);
        const day = start.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        start.setDate(start.getDate() + diff);
        return { fromStr: format(start), toStr: format(today) };
      }
      case 'last_week': {
        const start = new Date(today);
        const day = start.getDay();
        const diff = (day === 0 ? -6 : 1) - day - 7;
        start.setDate(start.getDate() + diff);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return { fromStr: format(start), toStr: format(end) };
      }
      case 'this_month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { fromStr: format(start), toStr: format(today) };
      }
      case 'last_month': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { fromStr: format(start), toStr: format(end) };
      }
      case 'this_year': {
        const start = new Date(today.getFullYear(), 0, 1);
        return { fromStr: format(start), toStr: format(today) };
      }
      case 'custom':
      default:
        return { fromStr: from, toStr: to };
    }
  };

  const handlePresetChange = (newPreset: DatePreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const { fromStr, toStr } = computePresetRange(newPreset);
      setFrom(fromStr);
      setTo(toStr);
    }
  };

  useEffect(() => {
    const { fromStr, toStr } = computePresetRange('this_month');
    setFrom(fromStr);
    setTo(toStr);
  }, []);

  const fetchGstReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (from) queryParams.set('from', from);
      if (to) queryParams.set('to', to);

      const res = await apiGet<{ data: GstReportData }>(`/api/v1/reports/gst?${queryParams.toString()}`);
      setData(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate GST report';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (from && to) {
      fetchGstReport();
    }
  }, [fetchGstReport, from, to]);

  const formatNu = (amount: number | undefined) => {
    if (amount === undefined || isNaN(amount)) return 'Nu. 0.00';
    return `Nu. ${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const getCsvExportUrl = (kind: 'daily' | 'rate' | 'sales') => {
    const params = new URLSearchParams();
    params.set('kind', kind);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `/api/v1/reports/gst/export.csv?${params.toString()}`;
  };

  return (
    <AppShell
      title="DRC GST Tax Return"
      subtitle="Department of Revenue & Customs • GST Act of Bhutan 2020 (BR-30, AC-43)"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Top Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            🖨 Print / PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              window.open(getCsvExportUrl(activeTab === 'transactions' ? 'sales' : activeTab), '_blank')
            }
          >
            📥 Export CSV ({activeTab.toUpperCase()})
          </Button>
        </div>

        {/* Non-GST Registered Business Warning (BR-30) */}
        {data && !data.gstRegistered && (
          <AlertBanner
            variant="warning"
            message={
              <span>
                <strong>Non-GST Registered Entity:</strong> Your business is configured as non-GST registered. Per DRC rules, all sales are recorded at 0% GST and tax invoices are not issued.
              </span>
            }
          />
        )}

        {/* Error message */}
        {error && (
          <AlertBanner
            variant="danger"
            message={`Error loading GST return: ${error}`}
            action={{ label: 'Retry', onClick: fetchGstReport }}
          />
        )}

        {/* Filters Card */}
        <Card>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)', marginRight: '4px' }}>
                Period:
              </span>
              {(
                [
                  ['today', 'Today'],
                  ['yesterday', 'Yesterday'],
                  ['this_week', 'This Week'],
                  ['last_week', 'Last Week'],
                  ['this_month', 'This Month'],
                  ['last_month', 'Last Month'],
                  ['this_year', 'This Year'],
                  ['custom', 'Custom'],
                ] as const
              ).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetChange(p)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: '12.5px',
                    fontWeight: preset === p ? 700 : 500,
                    backgroundColor: preset === p ? 'var(--navy)' : 'var(--panel)',
                    color: preset === p ? '#ffffff' : 'var(--ink)',
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '12px',
                paddingTop: '6px',
                borderTop: '1px solid var(--line-soft)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--muted)' }}>From:</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPreset('custom');
                    setFrom(e.target.value);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--line)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--muted)' }}>To:</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPreset('custom');
                    setTo(e.target.value);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--line)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <Button size="sm" variant="outline" onClick={fetchGstReport} disabled={loading}>
                {loading ? 'Calculating...' : 'Apply Filter'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Summary KPI Grid */}
        {data && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
            }}
          >
            <KpiCard
              label="Total Gross Sales"
              value={formatNu(data.summary.totalSales)}
              tone="good"
              hint="All settled customer invoices"
            />
            <KpiCard
              label="Taxable Sales"
              value={formatNu(data.summary.taxableSales)}
              tone="default"
              hint="Pre-tax taxable value"
            />
            <KpiCard
              label="GST Collected (5%)"
              value={formatNu(data.summary.gst)}
              tone="good"
              hint="Payable to DRC Thimphu"
            />
            <KpiCard
              label="Discounts Given"
              value={formatNu(data.summary.discounts)}
              tone="default"
              hint="Total promotions / markdowns"
            />
            <KpiCard
              label="Completed Sales"
              value={String(data.summary.transactions)}
              tone="default"
              hint="Invoices issued"
            />
            <KpiCard
              label="Voided Invoices"
              value={String(data.summary.voided)}
              tone={data.summary.voided > 0 ? 'warn' : 'default'}
              hint="Excluded from tax totals (BR-30)"
            />
          </div>
        )}

        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'daily' ? '3px solid var(--teal)' : '3px solid transparent',
              fontWeight: activeTab === 'daily' ? 700 : 500,
              color: activeTab === 'daily' ? 'var(--teal-dark)' : 'var(--muted)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Daily Breakdown (AC-44)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rate')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'rate' ? '3px solid var(--teal)' : '3px solid transparent',
              fontWeight: activeTab === 'rate' ? 700 : 500,
              color: activeTab === 'rate' ? 'var(--teal-dark)' : 'var(--muted)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            By Tax Rate Breakdown (AC-43)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transactions')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'transactions' ? '3px solid var(--teal)' : '3px solid transparent',
              fontWeight: activeTab === 'transactions' ? 700 : 500,
              color: activeTab === 'transactions' ? 'var(--teal-dark)' : 'var(--muted)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Transactions List ({data?.sales.length ?? 0})
          </button>
        </div>

        {/* Table Content */}
        {loading && !data && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
            Generating DRC tax calculations...
          </div>
        )}

        {data && (
          <Card>
            {/* Daily Breakdown Table */}
            {activeTab === 'daily' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                    Daily GST Summary (Asia/Thimphu 23:30 Cutoff)
                  </h3>
                  <a
                    href={getCsvExportUrl('daily')}
                    download
                    style={{ fontSize: '12.5px', color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    📥 Download Daily CSV
                  </a>
                </div>

                {data.daily.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>
                    No sales recorded in selected date range.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                        <th style={{ padding: '10px 8px' }}>Date (BTT)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center' }}>Transactions</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Taxable Sales (Nu.)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>GST Collected (Nu.)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Total Sales (Nu.)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.daily.map((d) => (
                        <tr key={d.date} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: '10px 8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            {d.date}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>{d.transactions}</td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {formatNu(d.taxable)}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--teal-dark)',
                              fontWeight: 700,
                            }}
                          >
                            {formatNu(d.gst)}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                            }}
                          >
                            {formatNu(d.sales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--line)', fontWeight: 800 }}>
                        <td style={{ padding: '10px 8px' }}>Total</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>{data.summary.transactions}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {formatNu(data.summary.taxableSales)}
                        </td>
                        <td
                          style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--teal-dark)',
                          }}
                        >
                          {formatNu(data.summary.gst)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {formatNu(data.summary.totalSales)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* By-Rate Breakdown Table */}
            {activeTab === 'rate' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                    Tax Schedule Breakdown by Rate (BR-30, AC-43)
                  </h3>
                  <a
                    href={getCsvExportUrl('rate')}
                    download
                    style={{ fontSize: '12.5px', color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    📥 Download Rate CSV
                  </a>
                </div>

                {data.byRate.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>
                    No line-item tax details found for this period.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                        <th style={{ padding: '10px 8px' }}>Rate %</th>
                        <th style={{ padding: '10px 8px' }}>Tax Category</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Taxable Amount (Nu.)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>GST Collected (Nu.)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Effective Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byRate.map((r, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: '10px 8px' }}>
                            <Pill variant={r.rate === 5 ? 'success' : 'neutral'}>{r.rate}%</Pill>
                          </td>
                          <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                            {r.category === 'standard'
                              ? 'Standard Rated (5%)'
                              : r.category === 'zero'
                              ? 'Zero-Rated (0%)'
                              : r.category === 'exempt'
                              ? 'Exempt Goods (0%)'
                              : r.category}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {formatNu(r.taxable)}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--teal-dark)',
                              fontWeight: 700,
                            }}
                          >
                            {formatNu(r.gst)}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--muted)' }}>
                            {r.taxable > 0 ? `${((r.gst / r.taxable) * 100).toFixed(1)}%` : '0%'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Transactions List */}
            {activeTab === 'transactions' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>
                    Tax Invoices in Period ({data.sales.length})
                  </h3>
                  <a
                    href={getCsvExportUrl('sales')}
                    download
                    style={{ fontSize: '12.5px', color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    📥 Download Invoices CSV
                  </a>
                </div>

                {data.sales.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>
                    No completed invoices in selected period.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                        <th style={{ padding: '10px 8px' }}>Invoice No</th>
                        <th style={{ padding: '10px 8px' }}>Date / Time (BTT)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Taxable Sales</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>GST (5%)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>Invoice Total</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sales.map((s) => (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: '10px 8px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {s.invoiceNo}
                          </td>
                          <td style={{ padding: '10px 8px', color: 'var(--muted)', fontSize: '12px' }}>
                            {new Date(s.completedAt).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {formatNu(s.taxable)}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--teal-dark)',
                              fontWeight: 600,
                            }}
                          >
                            {formatNu(s.gst)}
                          </td>
                          <td
                            style={{
                              padding: '10px 8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                            }}
                          >
                            {formatNu(s.total)}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <Pill variant="success">{s.status.toUpperCase()}</Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Hidden Printable Statement (#print-area) */}
        {data && (
          <div id="print-area" className="report-print" style={{ display: 'none' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '18px' }}>{business?.name || 'POS System'}</h2>
              <div style={{ fontSize: '13px' }}>
                {business?.address && <span>{business.address} • </span>}
                <span>TPN / GST No: {business?.gstNo || 'Not Registered'}</span>
              </div>
              <h3 style={{ margin: '14px 0 4px 0', fontSize: '16px' }}>OFFICIAL DRC GST RETURN REPORT</h3>
              <div style={{ fontSize: '12px', color: '#555' }}>
                Period: {data.range.from || 'Start'} to {data.range.to || 'Present'} (Asia/Thimphu Time)
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px', fontSize: '12px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '6px', fontWeight: 600 }}>Total Gross Sales:</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{formatNu(data.summary.totalSales)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '6px', fontWeight: 600 }}>Taxable Sales (Pre-Tax):</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{formatNu(data.summary.taxableSales)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '6px', fontWeight: 600 }}>GST Collected (5% Standard):</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>{formatNu(data.summary.gst)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '6px', fontWeight: 600 }}>Discounts Awarded:</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{formatNu(data.summary.discounts)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '6px', fontWeight: 600 }}>Total Completed Transactions:</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{data.summary.transactions}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '6px', fontWeight: 600 }}>Voided Invoices (Excluded from tax):</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{data.summary.voided}</td>
                </tr>
              </tbody>
            </table>

            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px' }}>Tax Schedule Summary</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '11px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Rate</th>
                  <th style={{ textAlign: 'left', padding: '4px' }}>Category</th>
                  <th style={{ textAlign: 'right', padding: '4px' }}>Taxable Amount</th>
                  <th style={{ textAlign: 'right', padding: '4px' }}>GST Collected</th>
                </tr>
              </thead>
              <tbody>
                {data.byRate.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '4px' }}>{r.rate}%</td>
                    <td style={{ padding: '4px' }}>{r.category}</td>
                    <td style={{ padding: '4px', textAlign: 'right' }}>{formatNu(r.taxable)}</td>
                    <td style={{ padding: '4px', textAlign: 'right' }}>{formatNu(r.gst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: '30px', fontSize: '11px', color: '#666', textAlign: 'center' }}>
              Generated electronically via Bhutan POS • Department of Revenue & Customs Compliant (BR-30)
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};
