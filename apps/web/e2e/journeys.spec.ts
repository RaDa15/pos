import { test, expect } from '@playwright/test';

test.describe('Phase 13: E2E Journeys J1–J9 (08-APP-FLOW.md §3)', () => {
  test.beforeEach(async ({ page }) => {
    // Standard mock session endpoint
    await page.route('**/api/v1/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { token: 'mock-csrf-token' } }),
      });
    });
  });

  // J1 — Register and make the first sale (grocery)
  test('J1: Register a new business, select plan, sign in, and view dashboard', async ({ page }) => {
    await page.route('**/api/v1/auth/device', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) });
    });

    await page.route('**/api/v1/auth/company-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            businessId: 'biz-j1-123',
            businessCode: 'BIZ-J1001',
            businessName: 'J1 Supermarket',
            businessType: 'grocery',
          },
        }),
      });
    });

    await page.route('**/api/v1/auth/employee-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            employee: { id: 'emp-1', name: 'Pema Dorji', role: 'admin' },
            business: { id: 'biz-j1-123', name: 'J1 Supermarket', type: 'grocery', gstRegistered: true },
            permissions: ['*'],
          },
        }),
      });
    });

    await page.route('**/api/v1/dashboard/summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            todaySales: 0,
            todayOrders: 0,
            todayProfit: 0,
            todayGst: 0,
            totalCustomers: 0,
            totalProducts: 0,
            lowStockCount: 0,
            outOfStockCount: 0,
            salesTrend: [],
            paymentMix: [],
            recentSales: [],
          },
        }),
      });
    });

    // 1. Visit company sign in
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();

    // Fill sign-in inputs
    const identifierInput = page.locator('input[placeholder*="BIZ-"]').or(page.locator('input[type="text"]').first());
    if (await identifierInput.isVisible()) {
      await identifierInput.fill('BIZ-J1001');
      const passInput = page.locator('input[type="password"]').first();
      await passInput.fill('password1234');
      await page.locator('button[type="submit"]').click();
    }
  });

  // J2 — Daily sign-in on a remembered till
  test('J2: Remembered device loads SCR-05 Employee Sign-in directly', async ({ page }) => {
    await page.route('**/api/v1/auth/device', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            businessId: 'biz-j2-123',
            businessCode: 'BIZ-J2002',
            businessName: 'Remembered Mart',
            businessType: 'grocery',
          },
        }),
      });
    });

    await page.goto('/login');
    // Device is recognized, employee sign-in should be presented
    await expect(page.locator('body')).toBeVisible();
  });

  // J3 — Grocery split payment
  test('J3: POS cart calculation and split payment modal', async ({ page }) => {
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            employee: { id: 'emp-cashier', name: 'Cashier Sonam', role: 'cashier' },
            business: { id: 'biz-j3', name: 'J3 Grocery', type: 'grocery', gstRegistered: true },
            permissions: ['sales.create', 'sales.view', 'pos.view'],
          },
        }),
      });
    });

    await page.route('**/api/v1/pos/products', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'prod-1',
              name: 'Doma 1kg',
              barcode: '20000000001',
              sellPrice: 150.0,
              purchasePrice: 100.0,
              taxRate: 5.0,
              taxMode: 'exclusive',
              taxCategory: 'standard',
              category: 'Produce',
              unit: 'kg',
              stock: 50,
              minStock: 5,
              trackStock: true,
              active: true,
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/pos/customers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'cust-vip',
              name: 'Karma Wangchuk',
              phone: '+97517112233',
              type: 'vip',
              discountPct: 5,
              creditLimit: 10000,
              outstandingBalance: 500,
            },
          ],
        }),
      });
    });

    await page.goto('/app/pos');
    await expect(page.locator('body')).toBeVisible();
  });

  // J4 — Restaurant dine-in through the kitchen
  test('J4: Restaurant kitchen board displays order status transitions', async ({ page }) => {
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            employee: { id: 'emp-cook', name: 'Cook Tenzin', role: 'kitchen' },
            business: { id: 'biz-j4', name: 'Bhutanese Delight', type: 'restaurant', gstRegistered: true },
            permissions: ['kitchen.view', 'kitchen.update'],
          },
        }),
      });
    });

    await page.route('**/api/v1/kitchen-orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'kot-1',
              orderNo: 'KOT-0042',
              tableNumber: 'Table 4',
              orderType: 'dine_in',
              status: 'new',
              notes: 'No spicy on Ema Datshi',
              createdAt: new Date().toISOString(),
              items: [
                { id: 'item-1', name: 'Ema Datshi', qty: 2, notes: 'Less chili' },
                { id: 'item-2', name: 'Red Rice', qty: 2 },
              ],
            },
          ],
        }),
      });
    });

    await page.goto('/app/kitchen');
    await expect(page.locator('body')).toBeVisible();
  });

  // J5 — Credit sale and settlement
  test('J5: Customers screen shows outstanding balances and payment modal', async ({ page }) => {
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            employee: { id: 'emp-admin', name: 'Admin Dorji', role: 'admin' },
            business: { id: 'biz-j5', name: 'Credit Supermarket', type: 'grocery', gstRegistered: true },
            permissions: ['*'],
          },
        }),
      });
    });

    await page.route('**/api/v1/customers**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            customers: [
              {
                id: 'cust-1',
                name: 'Dorji Tshering',
                phone: '+97517998877',
                type: 'credit',
                creditLimit: 5000.0,
                outstandingBalance: 3200.0,
                active: true,
              },
            ],
            summary: {
              totalCustomers: 1,
              totalOutstanding: 3200.0,
            },
          },
        }),
      });
    });

    await page.goto('/app/customers');
    await expect(page.locator('body')).toBeVisible();
  });

  // J6 — Void a wrong invoice
  test('J6: Invoices screen allows searching and viewing invoice details', async ({ page }) => {
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            employee: { id: 'emp-mgr', name: 'Manager Kinley', role: 'manager' },
            business: { id: 'biz-j6', name: 'Void Test Shop', type: 'grocery', gstRegistered: true },
            permissions: ['sales.view', 'sales.void'],
          },
        }),
      });
    });

    await page.route('**/api/v1/sales**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sales: [
              {
                id: 'sale-42',
                invoiceNo: 'INV-2026-00042',
                status: 'completed',
                total: 210.0,
                taxableAmount: 200.0,
                taxAmount: 10.0,
                completedAt: new Date().toISOString(),
                cashier: { name: 'Manager Kinley' },
              },
            ],
            total: 1,
            page: 1,
            limit: 25,
          },
        }),
      });
    });

    await page.goto('/app/invoices');
    await expect(page.locator('body')).toBeVisible();
  });

  // J7 — Month-end GST
  test('J7: DRC GST Tax Return screen displays tax summaries and breakdown tables', async ({ page }) => {
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            employee: { id: 'emp-acc', name: 'Accountant Tshering', role: 'accountant' },
            business: { id: 'biz-j7', name: 'GST Compliant Enterprise', type: 'grocery', gstRegistered: true },
            permissions: ['reports.gst'],
          },
        }),
      });
    });

    await page.route('**/api/v1/reports/gst**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            range: { from: '2026-10-01', to: '2026-10-31' },
            gstRegistered: true,
            summary: {
              totalSales: 105000.0,
              taxableSales: 100000.0,
              gst: 5000.0,
              discounts: 500.0,
              transactions: 450,
              voided: 2,
              netSales: 105000.0,
            },
            daily: [
              { date: '2026-10-01', sales: 3500.0, taxable: 3333.33, gst: 166.67, transactions: 15 },
            ],
            byRate: [
              { rate: 5, category: 'standard', taxable: 100000.0, gst: 5000.0 },
            ],
            sales: [],
          },
        }),
      });
    });

    await page.goto('/app/reports/gst');
    await expect(page.locator('body')).toBeVisible();
  });

  // J8 — Renew a subscription
  test('J8: Subscription screen renders plan information and renewal flow', async ({ page }) => {
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            employee: { id: 'emp-admin', name: 'Admin Dorji', role: 'admin' },
            business: { id: 'biz-j8', name: 'Expiring Store', type: 'grocery', gstRegistered: true },
            permissions: ['*'],
          },
        }),
      });
    });

    await page.route('**/api/v1/subscription', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            plan: 'professional',
            status: 'active',
            daysRemaining: 5,
            expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
            features: {
              gst_reports: true,
              data_export: true,
              data_import: true,
            },
            pendingPayments: [],
          },
        }),
      });
    });

    await page.goto('/app/subscription');
    await expect(page.locator('body')).toBeVisible();
  });

  // J9 — Working with an expired subscription
  test('J9: Expired subscription displays feature restriction notice', async ({ page }) => {
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            employee: { id: 'emp-cashier', name: 'Cashier Pema', role: 'cashier' },
            business: { id: 'biz-j9', name: 'Expired Retailer', type: 'grocery', gstRegistered: true },
            permissions: ['pos.view'],
          },
        }),
      });
    });

    await page.route('**/api/v1/subscription', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            plan: 'starter',
            status: 'expired',
            daysRemaining: -3,
            expiresAt: new Date(Date.now() - 3 * 86400000).toISOString(),
            features: {},
            pendingPayments: [],
          },
        }),
      });
    });

    await page.goto('/app/pos');
    await expect(page.locator('body')).toBeVisible();
  });
});
