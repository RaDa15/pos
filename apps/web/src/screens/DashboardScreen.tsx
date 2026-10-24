import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiGet } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { AppShell } from '../components/layout/AppShell.js';
import { Card, KpiCard } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { Pill } from '../components/ui/Pill.js';
import { AlertBanner } from '../components/ui/AlertBanner.js';

interface DashboardResponseData {
  lens: 'full' | 'finance' | 'sales' | 'inventory' | 'floor';
  businessType?: 'grocery' | 'restaurant';
  businessDate: string;
  today?: {
    sales: number;
    orders: number;
    profit?: number;
    gst?: number;
    expenses?: number;
  };
  counts?: {
    products?: number;
    customers?: number;
    pendingOrders?: number;
    lowStock?: number;
    outOfStock?: number;
  };
  lowStockItems?: Array<{
    id: string;
    name: string;
    barcode: string;
    stock: number;
    minStock: number;
  }>;
  grocery?: {
    inventoryValue: number;
    fastMovingToday: number;
    recentPurchases: number;
  };
  restaurant?: {
    activeTables: number;
    pendingKitchen: number;
    dineIn: number;
    takeaway: number;
  };
  openKitchenTickets?: Array<{
    id: string;
    orderNo: string;
    orderType: string;
    tableNo: string | null;
    status: string;
    note: string | null;
    minutesAgo: number;
    itemCount: number;
    items: string[];
  }>;
  salesLast7Days?: Array<{
    date: string;
    sales: number;
    orders: number;
  }>;
  paymentMixToday?: Array<{
    method: string;
    amount: number;
    count: number;
  }>;
  topProducts?: Array<{
    name: string;
    qty: number;
    amount: number;
  }>;
  recentSales?: Array<{
    id: string;
    invoiceNo: string;
    total: number;
    paymentSummary: string;
    cashierName: string;
    completedAt: string;
  }>;
}

const LENS_EXPLANATIONS: Record<string, { title: string; desc: string }> = {
  sales: {
    title: 'Cashier Sales View',
    desc: 'You are viewing daily checkout metrics, pending tickets, and inventory warnings. Profit margins, tax returns, and operating expenses are restricted.',
  },
  finance: {
    title: 'Finance & Accounts View',
    desc: 'You are viewing revenue, estimated profits, DRC GST collections, operating expenses, and payment settlements. Physical inventory control actions are filtered.',
  },
  inventory: {
    title: 'Inventory & Stock View',
    desc: 'You are viewing warehouse levels, low stock warnings, out-of-stock items, and inventory valuations. Sales revenue and cashier records are restricted.',
  },
  floor: {
    title: 'Floor & Kitchen View',
    desc: 'You are viewing real-time dining tables, takeaway orders, and open kitchen queue tickets.',
  },
};

const PAYMENT_METHOD_NAMES: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  mobile_wallet: 'mBoB / B-Ngul',
  other: 'Other',
};

export const DashboardScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { employee, business, permissions } = useAuth();

  const [data, setData] = useState<DashboardResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchDashboard = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await apiGet<{ data: DashboardResponseData }>('/api/v1/dashboard');
      setData(res.data);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard(false);

    // 60-second background polling
    const interval = setInterval(() => {
      fetchDashboard(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const activeLens = data?.lens || 'full';
  const isRestaurant = (data?.businessType ?? business?.type) === 'restaurant';

  const formatNu = (amount: number | undefined) => {
    if (amount === undefined || isNaN(amount)) return 'Nu. 0.00';
    return `Nu. ${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <AppShell
      title={t('nav.dashboard', 'Dashboard')}
      subtitle={
        data?.businessDate
          ? `Business Date: ${data.businessDate} • Thimphu Time (UTC+6)`
          : 'Business Overview'
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Header Action Row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDashboard(true)}
              disabled={refreshing || loading}
            >
              {refreshing ? 'Refreshing...' : '↻ Refresh'}
            </Button>
            {permissions.includes('sales.create') && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/app/pos')}
              >
                + New Sale
              </Button>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <AlertBanner
            variant="danger"
            message={`Dashboard Error: ${error}`}
            action={{ label: 'Retry', onClick: () => fetchDashboard(false) }}
          />
        )}

        {/* Role Lens Explanation Banner (AC-15, AC-16) */}
        {activeLens !== 'full' && LENS_EXPLANATIONS[activeLens] && (
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--teal-wash)',
              border: '1px solid var(--teal-tint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px' }}>👁</span>
              <div>
                <strong style={{ fontSize: '13.5px', color: 'var(--teal-dark)' }}>
                  {LENS_EXPLANATIONS[activeLens].title}
                </strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--ink)' }}>
                  {LENS_EXPLANATIONS[activeLens].desc}
                </p>
              </div>
            </div>
            <Pill variant="neutral">{employee?.role?.toUpperCase()}</Pill>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
            Loading dashboard data...
          </div>
        )}

        {data && (
          <>
            {/* Primary KPI Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '16px',
              }}
            >
              {data.today && (
                <>
                  <KpiCard
                    label="Today's Sales"
                    value={formatNu(data.today.sales)}
                    tone="good"
                    hint={`${data.today.orders} completed sale${data.today.orders === 1 ? '' : 's'}`}
                  />
                  <KpiCard
                    label="Orders Completed"
                    value={String(data.today.orders)}
                    tone="default"
                    hint="Today's settled invoices"
                  />
                  {data.today.profit !== undefined && (
                    <KpiCard
                      label="Estimated Profit"
                      value={formatNu(data.today.profit)}
                      tone={data.today.profit >= 0 ? 'good' : 'warn'}
                      hint="Revenue - COGS - Expenses (BR-32)"
                    />
                  )}
                  {data.today.gst !== undefined && (
                    <KpiCard
                      label="GST Collected"
                      value={formatNu(data.today.gst)}
                      tone="default"
                      hint="DRC 5% Standard Rate"
                    />
                  )}
                  {data.today.expenses !== undefined && (
                    <KpiCard
                      label="Today's Expenses"
                      value={formatNu(data.today.expenses)}
                      tone="warn"
                      hint="Store operating expenses"
                    />
                  )}
                </>
              )}

              {/* Restaurant floor KPI cards */}
              {isRestaurant && data.restaurant && (
                <>
                  <KpiCard
                    label="Active Tables"
                    value={String(data.restaurant.activeTables)}
                    tone="good"
                    hint={`${data.restaurant.dineIn} Dine-In / ${data.restaurant.takeaway} Takeaway`}
                  />
                  <KpiCard
                    label="Kitchen Queue"
                    value={String(data.restaurant.pendingKitchen)}
                    tone={data.restaurant.pendingKitchen > 0 ? 'warn' : 'default'}
                    hint="Orders in preparation"
                  />
                </>
              )}

              {/* Inventory count KPIs */}
              {data.counts && (
                <>
                  {data.counts.lowStock !== undefined && (
                    <KpiCard
                      label="Low Stock Alerts"
                      value={String(data.counts.lowStock)}
                      tone={data.counts.lowStock > 0 ? 'warn' : 'default'}
                      hint={`${data.counts.outOfStock ?? 0} out of stock`}
                    />
                  )}
                  {data.counts.products !== undefined && (
                    <KpiCard
                      label="Total Products"
                      value={String(data.counts.products)}
                      tone="default"
                      hint="Active items in catalogue"
                    />
                  )}
                </>
              )}

              {/* Grocery snapshot KPI */}
              {!isRestaurant && data.grocery && (
                <KpiCard
                  label="Inventory Valuation"
                  value={formatNu(data.grocery.inventoryValue)}
                  tone="good"
                  hint="Tracked stock at purchase cost"
                />
              )}
            </div>

            {/* Quick Actions Bar */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                padding: '12px 16px',
                backgroundColor: 'var(--panel)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)', marginRight: '6px' }}>
                Quick Links:
              </span>
              {permissions.includes('sales.create') && (
                <Button size="sm" variant="outline" onClick={() => navigate('/app/pos')}>
                  POS Register
                </Button>
              )}
              {isRestaurant && permissions.includes('kitchen.view') && (
                <Button size="sm" variant="outline" onClick={() => navigate('/app/kitchen')}>
                  Kitchen Board
                </Button>
              )}
              {permissions.includes('inventory.view') && (
                <Button size="sm" variant="outline" onClick={() => navigate('/app/inventory')}>
                  Stock Inventory
                </Button>
              )}
              {permissions.includes('expenses.view') && (
                <Button size="sm" variant="outline" onClick={() => navigate('/app/expenses')}>
                  Operating Expenses
                </Button>
              )}
              {permissions.includes('reports.gst') && (
                <Button size="sm" variant="outline" onClick={() => navigate('/app/reports/gst')}>
                  GST Return (SCR-16)
                </Button>
              )}
              {permissions.includes('reports.sales') && (
                <Button size="sm" variant="outline" onClick={() => navigate('/app/reports/sales')}>
                  Sales & Profit (SCR-17)
                </Button>
              )}
            </div>

            {/* Charts Section: 7-Day Trend & Payment Mix */}
            {data.salesLast7Days && data.salesLast7Days.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                  gap: '16px',
                }}
              >
                {/* 7-Day Trend SVG Chart */}
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
                      7-Day Sales Trend
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Daily Gross Sales</span>
                  </div>

                  {(() => {
                    const points = data.salesLast7Days;
                    const maxSale = Math.max(...points.map((p) => p.sales), 100);
                    const chartH = 140;
                    const chartW = 340;
                    const barW = Math.max(18, Math.floor(chartW / (points.length * 2)));

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <svg
                          viewBox={`0 0 ${chartW} ${chartH + 30}`}
                          style={{ width: '100%', height: '170px', overflow: 'visible' }}
                        >
                          <line x1="0" y1={chartH * 0.25} x2={chartW} y2={chartH * 0.25} stroke="var(--line)" strokeDasharray="3 3" />
                          <line x1="0" y1={chartH * 0.5} x2={chartW} y2={chartH * 0.5} stroke="var(--line)" strokeDasharray="3 3" />
                          <line x1="0" y1={chartH * 0.75} x2={chartW} y2={chartH * 0.75} stroke="var(--line)" strokeDasharray="3 3" />
                          <line x1="0" y1={chartH} x2={chartW} y2={chartH} stroke="var(--line)" />

                          {points.map((p, idx) => {
                            const x = (idx + 0.5) * (chartW / points.length);
                            const h = Math.max(4, (p.sales / maxSale) * (chartH - 20));
                            const y = chartH - h;
                            const shortDate = p.date.slice(5);

                            return (
                              <g key={p.date} style={{ cursor: 'pointer' }}>
                                <rect
                                  x={x - barW / 2}
                                  y={y}
                                  width={barW}
                                  height={h}
                                  rx="4"
                                  fill="var(--teal)"
                                  opacity="0.88"
                                >
                                  <title>{`${p.date}: Nu. ${p.sales.toFixed(2)} (${p.orders} orders)`}</title>
                                </rect>
                                <text
                                  x={x}
                                  y={y - 5}
                                  fontSize="9.5"
                                  textAnchor="middle"
                                  fill="var(--ink)"
                                  fontWeight="600"
                                >
                                  {p.sales > 0 ? (p.sales >= 1000 ? `${(p.sales / 1000).toFixed(1)}k` : p.sales.toFixed(0)) : ''}
                                </text>
                                <text
                                  x={x}
                                  y={chartH + 16}
                                  fontSize="10"
                                  textAnchor="middle"
                                  fill="var(--muted)"
                                >
                                  {shortDate}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    );
                  })()}
                </Card>

                {/* Payment Mix Today */}
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
                      Today's Payment Mix
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Completed Tenders</span>
                  </div>

                  {(!data.paymentMixToday || data.paymentMixToday.length === 0) ? (
                    <div style={{ padding: '36px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                      No payments collected yet today.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(() => {
                        const totalPaid = data.paymentMixToday.reduce((s, p) => s + p.amount, 0);

                        return data.paymentMixToday.map((item) => {
                          const pct = totalPaid > 0 ? (item.amount / totalPaid) * 100 : 0;
                          return (
                            <div key={item.method} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                }}
                              >
                                <span>
                                  {PAYMENT_METHOD_NAMES[item.method] || item.method}
                                  <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: '6px' }}>
                                    ({item.count} txn{item.count === 1 ? '' : 's'})
                                  </span>
                                </span>
                                <span>
                                  {formatNu(item.amount)}{' '}
                                  <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>
                                    ({pct.toFixed(0)}%)
                                  </span>
                                </span>
                              </div>
                              <div
                                style={{
                                  height: '8px',
                                  width: '100%',
                                  backgroundColor: 'var(--line-soft)',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${pct}%`,
                                    backgroundColor:
                                      item.method === 'cash'
                                        ? 'var(--teal)'
                                        : item.method === 'mobile_wallet'
                                        ? 'var(--amber)'
                                        : 'var(--navy)',
                                    borderRadius: '4px',
                                  }}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* Restaurant Open Kitchen Tickets (AC-16) */}
            {isRestaurant && data.openKitchenTickets && data.openKitchenTickets.length > 0 && (
              <Card>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>
                      Active Kitchen Orders ({data.openKitchenTickets.length})
                    </h3>
                    <Pill variant="warning">Live Queue</Pill>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/app/kitchen')}
                  >
                    Open Kitchen Board →
                  </Button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '12px',
                  }}
                >
                  {data.openKitchenTickets.slice(0, 6).map((ticket) => (
                    <div
                      key={ticket.id}
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--line)',
                        backgroundColor: 'var(--paper)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--ink)' }}>
                          #{ticket.orderNo} {ticket.tableNo ? `(Table ${ticket.tableNo})` : '(Takeaway)'}
                        </span>
                        <Pill
                          variant={
                            ticket.status === 'ready'
                              ? 'success'
                              : ticket.status === 'preparing'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {ticket.status.toUpperCase()}
                        </Pill>
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        Ordered {ticket.minutesAgo} min ago • {ticket.itemCount} items
                      </div>

                      <div style={{ fontSize: '12.5px', marginTop: '4px', lineHeight: 1.35 }}>
                        {ticket.items.slice(0, 3).join(', ')}
                        {ticket.items.length > 3 && ` +${ticket.items.length - 3} more`}
                      </div>

                      {ticket.note && (
                        <div
                          style={{
                            fontSize: '11.5px',
                            color: 'var(--amber-ink)',
                            backgroundColor: 'var(--amber-tint)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            marginTop: '2px',
                          }}
                        >
                          Note: {ticket.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Two-Column Grid: Left (Top Products) & Right (Low Stock / Recent Sales) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '16px',
              }}
            >
              {/* Column 1: Top Products */}
              {data.topProducts && (
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
                      Top Products Today
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>By Units Sold</span>
                  </div>

                  {data.topProducts.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                      No product sales recorded yet today.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                          <th style={{ padding: '6px 8px' }}>Product</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Qty</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topProducts.map((p, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid var(--line-soft)',
                            }}
                          >
                            <td style={{ padding: '8px', fontWeight: 600 }}>{p.name}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {p.qty}
                            </td>
                            <td
                              style={{
                                padding: '8px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 600,
                              }}
                            >
                              {formatNu(p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              )}

              {/* Column 2: Low Stock Warnings */}
              {data.lowStockItems && (
                <Card>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>
                        Low Stock Warnings
                      </h3>
                      {data.lowStockItems.length > 0 && (
                        <Pill variant="danger">{data.lowStockItems.length} items</Pill>
                      )}
                    </div>
                    {permissions.includes('inventory.view') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/app/inventory')}
                      >
                        Inventory →
                      </Button>
                    )}
                  </div>

                  {data.lowStockItems.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--teal-dark)', fontSize: '13px' }}>
                      ✓ All inventory levels are above minimum threshold.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                          <th style={{ padding: '6px 8px' }}>Item</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>In Stock</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Min Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.lowStockItems.map((item) => (
                          <tr
                            key={item.id}
                            style={{
                              borderBottom: '1px solid var(--line-soft)',
                              backgroundColor: item.stock <= 0 ? 'var(--red-tint)' : undefined,
                            }}
                          >
                            <td style={{ padding: '8px' }}>
                              <div style={{ fontWeight: 600 }}>{item.name}</div>
                              {item.barcode && (
                                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{item.barcode}</div>
                              )}
                            </td>
                            <td
                              style={{
                                padding: '8px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                                color: item.stock <= 0 ? 'var(--red)' : 'var(--amber-text)',
                                fontWeight: 700,
                              }}
                            >
                              {item.stock}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {item.minStock}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              )}

              {/* Column 3: Recent Invoices */}
              {data.recentSales && (
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
                      Recent Invoices
                    </h3>
                    {permissions.includes('sales.view') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/app/sales')}
                      >
                        All Sales →
                      </Button>
                    )}
                  </div>

                  {data.recentSales.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                      No invoices settled today.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'var(--muted)' }}>
                          <th style={{ padding: '6px 8px' }}>Invoice</th>
                          <th style={{ padding: '6px 8px' }}>Payment</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentSales.map((s) => (
                          <tr key={s.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                            <td style={{ padding: '8px' }}>
                              <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                                {s.invoiceNo}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {s.cashierName} • {new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td style={{ padding: '8px', fontSize: '12px' }}>
                              <Pill variant="neutral">{s.paymentSummary}</Pill>
                            </td>
                            <td
                              style={{
                                padding: '8px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                              }}
                            >
                              {formatNu(s.total)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/app/sales/${s.id}`)}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
};
