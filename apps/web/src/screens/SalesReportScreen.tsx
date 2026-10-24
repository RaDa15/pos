import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { AppShell } from '../components/layout/AppShell.js';
import { Card, KpiCard } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';

interface SalesReportData {
  grossSales: number;
  count: number;
  averageSale: number;
  estimatedProfit: number;
  revenueByDay: Array<{
    date: string;
    revenue: number;
  }>;
  profitByDay: Array<{
    date: string;
    profit: number;
    revenue: number;
    cogs: number;
    expenses: number;
  }>;
  byCategory: Array<{
    category: string;
    qty: number;
    sales: number;
  }>;
  byCashier: Array<{
    cashierName: string;
    orders: number;
    sales: number;
  }>;
}

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

export const SalesReportScreen: React.FC = () => {
  const navigate = useNavigate();
  const { permissions } = useAuth();

  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [data, setData] = useState<SalesReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchSalesReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (from) queryParams.set('from', from);
      if (to) queryParams.set('to', to);

      const res = await apiGet<{ data: SalesReportData }>(`/api/v1/reports/sales?${queryParams.toString()}`);
      setData(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate sales report';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (from && to) {
      fetchSalesReport();
    }
  }, [fetchSalesReport, from, to]);

  const formatNu = (amount: number | undefined) => {
    if (amount === undefined || isNaN(amount)) return 'Nu. 0.00';
    return `Nu. ${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <AppShell
      title="Sales & Profit Analytics"
      subtitle="Financial performance, historical product costs, and operating margins (BR-32, AC-47)"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Top Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
          {permissions.includes('expenses.view') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/app/expenses')}
            >
              Operating Expenses →
            </Button>
          )}
          {permissions.includes('reports.gst') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/app/reports/gst')}
            >
              GST Returns →
            </Button>
          )}
        </div>

        {/* Error message */}
        {error && (
          <AlertBanner
            variant="danger"
            message={`Error loading sales analytics: ${error}`}
            action={{ label: 'Retry', onClick: fetchSalesReport }}
          />
        )}

        {/* Filters Card */}
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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

              <Button size="sm" variant="outline" onClick={fetchSalesReport} disabled={loading}>
                {loading ? 'Analyzing...' : 'Update Analytics'}
              </Button>
            </div>
          </div>
        </Card>

        {/* BR-32 Profit Formula Explainer Callout */}
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--teal-wash)',
            border: '1px solid var(--teal-tint)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px' }}>ℹ</span>
            <strong style={{ fontSize: '13.5px', color: 'var(--teal-dark)' }}>
              Bhutan Accounting Rule BR-32: Estimated Profit Formula
            </strong>
          </div>
          <p style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.5, color: 'var(--ink)' }}>
            <strong>Estimated Profit = (Taxable Sales + Service Charges) - COGS - Operating Expenses</strong>
            <br />
            • <em>Revenue</em> excludes GST collected, as GST is held in trust for the Department of Revenue & Customs (DRC).
            <br />
            • <em>Cost of Goods Sold (COGS)</em> is calculated from the historical purchase cost snapshot captured when items were invoiced.
            <br />
            • <em>Operating Expenses</em> deduct all recorded store overheads (rent, salaries, utilities) for the matching business dates.
          </p>
        </div>

        {/* KPI Cards */}
        {data && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '16px',
            }}
          >
            <KpiCard
              label="Gross Sales"
              value={formatNu(data.grossSales)}
              tone="good"
              hint={`${data.count} completed orders`}
            />
            <KpiCard
              label="Completed Orders"
              value={String(data.count)}
              tone="default"
              hint="Paid customer transactions"
            />
            <KpiCard
              label="Average Order Value"
              value={formatNu(data.averageSale)}
              tone="default"
              hint="Gross sales ÷ completed orders"
            />
            <KpiCard
              label="Estimated Operating Profit"
              value={formatNu(data.estimatedProfit)}
              tone={data.estimatedProfit >= 0 ? 'good' : 'warn'}
              hint="Net after COGS & Expenses (BR-32)"
            />
          </div>
        )}

        {/* Profit and Revenue Daily Trend Chart */}
        {data && data.profitByDay && data.profitByDay.length > 0 && (
          <Card>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>
                  Daily Revenue vs. Estimated Profit
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Blue = Pre-tax Revenue • Teal = Estimated Operating Profit
                </span>
              </div>
            </div>

            {(() => {
              const days = data.profitByDay;
              const maxVal = Math.max(
                ...days.map((d) => Math.max(d.revenue, Math.abs(d.profit))),
                100
              );
              const chartH = 160;
              const chartW = 600;
              const colW = Math.max(16, Math.floor(chartW / (days.length * 2.5)));

              return (
                <div style={{ overflowX: 'auto' }}>
                  <svg
                    viewBox={`0 0 ${chartW} ${chartH + 36}`}
                    style={{ minWidth: '480px', width: '100%', height: '200px', overflow: 'visible' }}
                  >
                    <line x1="0" y1={chartH * 0.25} x2={chartW} y2={chartH * 0.25} stroke="var(--line)" strokeDasharray="3 3" />
                    <line x1="0" y1={chartH * 0.5} x2={chartW} y2={chartH * 0.5} stroke="var(--line)" strokeDasharray="3 3" />
                    <line x1="0" y1={chartH * 0.75} x2={chartW} y2={chartH * 0.75} stroke="var(--line)" strokeDasharray="3 3" />
                    <line x1="0" y1={chartH} x2={chartW} y2={chartH} stroke="var(--line)" />

                    {days.map((d, idx) => {
                      const xGroup = (idx + 0.5) * (chartW / days.length);

                      const revH = Math.max(2, (d.revenue / maxVal) * (chartH - 24));
                      const revY = chartH - revH;

                      const profitH = Math.max(2, (Math.max(0, d.profit) / maxVal) * (chartH - 24));
                      const profitY = chartH - profitH;

                      return (
                        <g key={d.date} style={{ cursor: 'pointer' }}>
                          <rect
                            x={xGroup - colW - 2}
                            y={revY}
                            width={colW}
                            height={revH}
                            rx="3"
                            fill="var(--navy)"
                            opacity="0.8"
                          >
                            <title>{`${d.date} Revenue: Nu. ${d.revenue.toFixed(2)}`}</title>
                          </rect>

                          <rect
                            x={xGroup + 2}
                            y={profitY}
                            width={colW}
                            height={profitH}
                            rx="3"
                            fill={d.profit >= 0 ? 'var(--teal)' : 'var(--red)'}
                            opacity="0.9"
                          >
                            <title>{`${d.date} Profit: Nu. ${d.profit.toFixed(2)} (COGS: ${d.cogs.toFixed(2)}, Exp: ${d.expenses.toFixed(2)})`}</title>
                          </rect>

                          <text
                            x={xGroup}
                            y={chartH + 18}
                            fontSize="10"
                            textAnchor="middle"
                            fill="var(--muted)"
                          >
                            {d.date.slice(5)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })()}
          </Card>
        )}

        {/* Tables Grid: Category Breakdown & Cashier Performance */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Category Breakdown Table */}
          {data && (
            <Card>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>
                  Sales by Product Category
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {data.byCategory.length} Categories
                </span>
              </div>

              {data.byCategory.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  No item sales in selected period.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                      <th style={{ padding: '8px' }}>Category</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Units Sold</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Total Sales</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totalCatSales = data.byCategory.reduce((s, c) => s + c.sales, 0);

                      return data.byCategory.map((cat, idx) => {
                        const share = totalCatSales > 0 ? (cat.sales / totalCatSales) * 100 : 0;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                            <td style={{ padding: '8px', fontWeight: 600 }}>{cat.category}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {cat.qty}
                            </td>
                            <td
                              style={{
                                padding: '8px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 600,
                              }}
                            >
                              {formatNu(cat.sales)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', color: 'var(--muted)', fontSize: '12px' }}>
                              {share.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              )}
            </Card>
          )}

          {/* Cashier Performance Table */}
          {data && (
            <Card>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>
                  Cashier Sales Performance
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {data.byCashier.length} Cashiers
                </span>
              </div>

              {data.byCashier.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  No cashier transaction data available.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                      <th style={{ padding: '8px' }}>Staff Name</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Orders Settled</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Gross Sales</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Avg / Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCashier.map((c, idx) => {
                      const avg = c.orders > 0 ? c.sales / c.orders : 0;
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: '8px', fontWeight: 600 }}>{c.cashierName}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {c.orders}
                          </td>
                          <td
                            style={{
                              padding: '8px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              color: 'var(--teal-dark)',
                            }}
                          >
                            {formatNu(c.sales)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {formatNu(avg)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
};
