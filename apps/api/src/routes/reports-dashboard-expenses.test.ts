import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { Prisma } from '@prisma/client';

const app = createApp();

type BusinessWithEmployees = Prisma.BusinessGetPayload<{ include: { employees: true } }>;

describe('Phase 10 — Dashboard, Reports & Expenses (AC-15, AC-16, AC-43, AC-44, AC-45, AC-47, AC-51)', () => {
  let groceryBiz: BusinessWithEmployees;
  let restaurantBiz: BusinessWithEmployees;
  let adminAgent: ReturnType<typeof request.agent>;
  let cashierAgent: ReturnType<typeof request.agent>;
  let accountantAgent: ReturnType<typeof request.agent>;
  let kitchenAgent: ReturnType<typeof request.agent>;
  let accountantCsrf: string;

  async function createAuthenticatedAgent(companyName: string, username: string) {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    const companyRes = await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: companyName, password: 'demo_password_1234' });
    expect(companyRes.status).toBe(200);

    const empRes = await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username, password: 'demo_password_1234' });
    expect(empRes.status).toBe(200);

    return { agent, csrfToken };
  }

  beforeAll(async () => {
    // 1. Fetch Demo Businesses
    groceryBiz = (await prisma.business.findFirst({
      where: { businessCode: 'BIZ-PEMA1' },
      include: { employees: true },
    }))!;
    restaurantBiz = (await prisma.business.findFirst({
      where: { businessCode: 'BIZ-TEST1' },
      include: { employees: true },
    }))!;

    // 2. Sign in Grocery Admin
    const adminSession = await createAuthenticatedAgent('Pema Store', 'admin');
    adminAgent = adminSession.agent;

    // 3. Sign in Grocery Cashier
    const cashierSession = await createAuthenticatedAgent('Pema Store', 'cashier1');
    cashierAgent = cashierSession.agent;

    // 4. Sign in Grocery Accountant
    const acctSession = await createAuthenticatedAgent('Pema Store', 'accountant1');
    accountantAgent = acctSession.agent;
    accountantCsrf = acctSession.csrfToken;

    // 5. Sign in Restaurant Kitchen Staff
    const kitchenSession = await createAuthenticatedAgent('Test Restaurant', 'kitchenstaff1');
    kitchenAgent = kitchenSession.agent;
  });

  describe('AC-15: Role-based Dashboard (Admin vs Cashier lenses)', () => {
    it('Admin sees sales, orders, profit, gst and expenses; Cashier gets NO profit, gst, or expenses', async () => {
      // 1. Clean existing today sales in Grocery A for deterministic testing
      const now = new Date();
      const bttDate = new Date(now.getTime() + 6 * 3600 * 1000);
      const todayStr = bttDate.toISOString().slice(0, 10);
      const businessDate = new Date(`${todayStr}T00:00:00.000Z`);

      const cashier = groceryBiz.employees.find((e) => e.username === 'cashier1')!;

      // Sever mutual FKs before deleting sales
      await prisma.sale.updateMany({
        where: { businessId: groceryBiz.id, businessDate },
        data: { kitchenOrderId: null },
      });
      await prisma.saleItem.deleteMany({
        where: { sale: { businessId: groceryBiz.id, businessDate } },
      });
      await prisma.payment.deleteMany({
        where: { sale: { businessId: groceryBiz.id, businessDate } },
      });
      await prisma.sale.deleteMany({
        where: { businessId: groceryBiz.id, businessDate },
      });

      // 2. Create 5 completed sales and 1 voided sale today
      const testProduct = await prisma.product.findFirst({
        where: { businessId: groceryBiz.id, active: true },
      });
      expect(testProduct).toBeDefined();

      let sum5CompletedTotals = 0;
      for (let i = 1; i <= 5; i++) {
        const total = 100 + i * 10;
        sum5CompletedTotals += total;

        await prisma.sale.create({
          data: {
            businessId: groceryBiz.id,
            invoiceNo: `INV-TEST-AC15-${i}`,
            invoiceYear: 2026,
            invoiceSeq: 9100 + i,
            cashierId: cashier.id,
            orderType: 'walk_in',
            subtotal: new Prisma.Decimal(total),
            discountTotal: new Prisma.Decimal(0),
            taxableAmount: new Prisma.Decimal(total),
            taxAmount: new Prisma.Decimal(0),
            charges: new Prisma.Decimal(0),
            total: new Prisma.Decimal(total),
            amountPaid: new Prisma.Decimal(total),
            creditAmount: new Prisma.Decimal(0),
            paymentSummary: 'cash',
            gstRegistered: true,
            status: 'completed',
            businessDate,
            completedAt: now,
            items: {
              create: {
                businessId: groceryBiz.id,
                lineNo: 1,
                productId: testProduct!.id,
                name: testProduct!.name,
                barcode: testProduct!.barcode,
                category: testProduct!.category,
                qty: 1,
                unitPrice: new Prisma.Decimal(total),
                lineDiscount: new Prisma.Decimal(0),
                allocatedDiscount: new Prisma.Decimal(0),
                taxable: new Prisma.Decimal(total),
                tax: new Prisma.Decimal(0),
                taxRate: new Prisma.Decimal(0),
                taxMode: 'exclusive',
                taxCategory: 'exempt',
                total: new Prisma.Decimal(total),
                unitCost: new Prisma.Decimal(50),
                trackStock: false,
              },
            },
          },
        });
      }

      // Create 1 voided sale today
      await prisma.sale.create({
        data: {
          businessId: groceryBiz.id,
          invoiceNo: 'INV-TEST-AC15-VOIDED',
          invoiceYear: 2026,
          invoiceSeq: 9199,
          cashierId: cashier.id,
          orderType: 'walk_in',
          subtotal: new Prisma.Decimal(500),
          discountTotal: new Prisma.Decimal(0),
          taxableAmount: new Prisma.Decimal(500),
          taxAmount: new Prisma.Decimal(0),
          charges: new Prisma.Decimal(0),
          total: new Prisma.Decimal(500),
          amountPaid: new Prisma.Decimal(500),
          creditAmount: new Prisma.Decimal(0),
          paymentSummary: 'cash',
          gstRegistered: true,
          status: 'voided',
          businessDate,
          completedAt: now,
        },
      });

      // 3. Admin calls GET /dashboard
      const adminDash = await adminAgent.get('/api/v1/dashboard');
      expect(adminDash.status).toBe(200);
      const adminData = adminDash.body.data;
      expect(adminData.lens).toBe('full');
      expect(adminData.today.sales).toBe(sum5CompletedTotals);
      expect(adminData.today.orders).toBe(5);
      expect(adminData.today).toHaveProperty('profit');
      expect(adminData.today).toHaveProperty('gst');
      expect(adminData.today).toHaveProperty('expenses');

      // 4. Cashier calls GET /dashboard (AC-15: Cashier's response has no profit, gst, or expenses)
      const cashierDash = await cashierAgent.get('/api/v1/dashboard');
      expect(cashierDash.status).toBe(200);
      const cashierData = cashierDash.body.data;
      expect(cashierData.lens).toBe('sales');
      expect(cashierData.today.sales).toBe(sum5CompletedTotals);
      expect(cashierData.today.orders).toBe(5);
      expect(cashierData.today).not.toHaveProperty('profit');
      expect(cashierData.today).not.toHaveProperty('gst');
      expect(cashierData.today).not.toHaveProperty('expenses');

      // Cleanup test sales so they don't leak into subsequent suites
      await prisma.saleItem.deleteMany({
        where: { sale: { invoiceNo: { startsWith: 'INV-TEST-AC15' } } },
      });
      await prisma.payment.deleteMany({
        where: { sale: { invoiceNo: { startsWith: 'INV-TEST-AC15' } } },
      });
      await prisma.sale.deleteMany({
        where: { invoiceNo: { startsWith: 'INV-TEST-AC15' } },
      });
    });
  });

  describe('AC-16: Kitchen Staff Floor Lens', () => {
    it('Kitchen staff dashboard shows floor lens with open tickets', async () => {
      // 1. Clean open KOTs in restaurant for test (sever mutual FK first)
      await prisma.sale.updateMany({
        where: { businessId: restaurantBiz.id },
        data: { kitchenOrderId: null },
      });
      await prisma.kitchenOrder.updateMany({
        where: { businessId: restaurantBiz.id },
        data: { saleId: null },
      });
      await prisma.kitchenOrderItem.deleteMany({
        where: { kitchenOrder: { businessId: restaurantBiz.id } },
      });
      await prisma.kitchenOrder.deleteMany({
        where: { businessId: restaurantBiz.id },
      });

      const dish = await prisma.product.findFirst({
        where: { businessId: restaurantBiz.id, active: true },
      });
      expect(dish).toBeDefined();

      const waiter = await prisma.employee.findFirst({
        where: { businessId: restaurantBiz.id, role: 'waiter' },
      });
      expect(waiter).toBeDefined();

      // Create 3 open kitchen orders
      for (let i = 1; i <= 3; i++) {
        await prisma.kitchenOrder.create({
          data: {
            businessId: restaurantBiz.id,
            createdBy: waiter!.id,
            orderNo: `KOT-AC16-${i}`,
            orderType: 'dine_in',
            tableNo: `T${i}`,
            status: i === 1 ? 'new' : i === 2 ? 'accepted' : 'preparing',
            items: {
              create: {
                businessId: restaurantBiz.id,
                productId: dish!.id,
                name: dish!.name,
                qty: 2,
              },
            },
          },
        });
      }

      // Kitchen staff fetches dashboard
      const res = await kitchenAgent.get('/api/v1/dashboard');
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.lens).toBe('floor');
      expect(data.openKitchenTickets).toBeDefined();
      expect(data.openKitchenTickets.length).toBe(3);
      expect(data.restaurant.pendingKitchen).toBe(3);
    });
  });

  describe('AC-43 & AC-44 & AC-45: GST Reports & Exports', () => {
    it('AC-44: Asia/Thimphu 23:30 cutoff is included on 3 Nov, not on 4 Nov', async () => {
      const cashier = groceryBiz.employees.find((e) => e.username === 'cashier1')!;
      const testProduct = await prisma.product.findFirst({
        where: { businessId: groceryBiz.id, active: true },
      });

      // 23:30 BTT on 2026-11-03 corresponds to 17:30 UTC on 2026-11-03
      const saleUtc = new Date('2026-11-03T17:30:00.000Z');
      const bttBusinessDate = new Date('2026-11-03T00:00:00.000Z');

      const testSale = await prisma.sale.create({
        data: {
          businessId: groceryBiz.id,
          invoiceNo: 'INV-AC44-CUTOFF',
          invoiceYear: 2026,
          invoiceSeq: 100,
          cashierId: cashier.id,
          orderType: 'walk_in',
          subtotal: new Prisma.Decimal(200),
          discountTotal: new Prisma.Decimal(0),
          taxableAmount: new Prisma.Decimal(190.48),
          taxAmount: new Prisma.Decimal(9.52),
          charges: new Prisma.Decimal(0),
          total: new Prisma.Decimal(200),
          amountPaid: new Prisma.Decimal(200),
          creditAmount: new Prisma.Decimal(0),
          paymentSummary: 'cash',
          gstRegistered: true,
          status: 'completed',
          businessDate: bttBusinessDate,
          completedAt: saleUtc,
          items: {
            create: {
              businessId: groceryBiz.id,
              lineNo: 1,
              productId: testProduct!.id,
              name: testProduct!.name,
              barcode: testProduct!.barcode,
              category: testProduct!.category,
              qty: 1,
              unitPrice: new Prisma.Decimal(200),
              lineDiscount: new Prisma.Decimal(0),
              allocatedDiscount: new Prisma.Decimal(0),
              taxable: new Prisma.Decimal(190.48),
              tax: new Prisma.Decimal(9.52),
              taxRate: new Prisma.Decimal(5),
              taxMode: 'exclusive',
              taxCategory: 'standard',
              total: new Prisma.Decimal(200),
              unitCost: new Prisma.Decimal(100),
              trackStock: false,
            },
          },
        },
      });

      // Query for 3 Nov: from 2026-11-03 to 2026-11-03
      const res3Nov = await adminAgent.get('/api/v1/reports/gst?from=2026-11-03T00:00&to=2026-11-03T23:59');
      expect(res3Nov.status).toBe(200);
      const invoices3Nov = (res3Nov.body.data.sales as Array<{ invoiceNo: string }>).map((s) => s.invoiceNo);
      expect(invoices3Nov).toContain('INV-AC44-CUTOFF');

      // Query for 4 Nov: should NOT include the 3 Nov 23:30 sale
      const res4Nov = await adminAgent.get('/api/v1/reports/gst?from=2026-11-04T00:00&to=2026-11-04T23:59');
      expect(res4Nov.status).toBe(200);
      const invoices4Nov = (res4Nov.body.data.sales as Array<{ invoiceNo: string }>).map((s) => s.invoiceNo);
      expect(invoices4Nov).not.toContain('INV-AC44-CUTOFF');

      // Cleanup test sale
      await prisma.saleItem.deleteMany({ where: { saleId: testSale.id } });
      await prisma.sale.delete({ where: { id: testSale.id } });
    });

    it('AC-43: Summary GST equals sum of by-rate GST and sum of daily GST to the chhertum', async () => {
      const res = await adminAgent.get('/api/v1/reports/gst');
      expect(res.status).toBe(200);
      const { summary, daily, byRate } = res.body.data;

      // Σ byRate gst
      const sumByRateGstChhertum = (byRate as Array<{ gst: number }>).reduce(
        (sum: number, r) => sum + Math.round(r.gst * 100),
        0
      );

      // Σ daily gst
      const sumDailyGstChhertum = (daily as Array<{ gst: number }>).reduce(
        (sum: number, d) => sum + Math.round(d.gst * 100),
        0
      );

      const summaryGstChhertum = Math.round(summary.gst * 100);

      expect(summaryGstChhertum).toBe(sumByRateGstChhertum);
      expect(summaryGstChhertum).toBe(sumDailyGstChhertum);
    });

    it('AC-45: Exports CSVs for daily, rate, and sales tables', async () => {
      // Daily CSV
      const dailyCsv = await adminAgent.get('/api/v1/reports/gst/export.csv?kind=daily');
      expect(dailyCsv.status).toBe(200);
      expect(dailyCsv.headers['content-type']).toContain('text/csv');
      expect(dailyCsv.text).toContain('Date,Transactions,Taxable Sales (Nu.),GST Collected (Nu.),Total Sales (Nu.)');

      // Rate CSV
      const rateCsv = await adminAgent.get('/api/v1/reports/gst/export.csv?kind=rate');
      expect(rateCsv.status).toBe(200);
      expect(rateCsv.text).toContain('GST Rate (%),Tax Category,Taxable Amount (Nu.),GST Amount (Nu.)');

      // Sales CSV
      const salesCsv = await adminAgent.get('/api/v1/reports/gst/export.csv?kind=sales');
      expect(salesCsv.status).toBe(200);
      expect(salesCsv.text).toContain('Invoice No,Date & Time (UTC),Status,Taxable Amount (Nu.),GST Amount (Nu.),Total (Nu.)');
    });
  });

  describe('AC-47: Sales & Estimated Profit Report', () => {
    it('Estimated profit = taxable 358.50 + charges 20.00 - unit cost 250.00 - expense 50.00 = 78.50', async () => {
      const cashier = groceryBiz.employees.find((e) => e.username === 'cashier1')!;
      const testProduct = await prisma.product.findFirst({
        where: { businessId: groceryBiz.id, active: true },
      });

      const dayStr = '2026-10-15';
      const bttDate = new Date(`${dayStr}T00:00:00.000Z`);
      const completedAt = new Date(`${dayStr}T10:00:00.000Z`);

      // Clean existing sales & expenses on that test date
      await prisma.saleItem.deleteMany({
        where: { sale: { businessId: groceryBiz.id, businessDate: bttDate } },
      });
      await prisma.payment.deleteMany({
        where: { sale: { businessId: groceryBiz.id, businessDate: bttDate } },
      });
      await prisma.sale.deleteMany({
        where: { businessId: groceryBiz.id, businessDate: bttDate },
      });
      await prisma.expense.deleteMany({
        where: { businessId: groceryBiz.id, businessDate: bttDate },
      });

      // 1. Create Sale per AC-47:
      // Taxable: 358.50, GST: 17.93, charges: 20.00 -> total: 396.43
      // lines' unit cost * qty = 250.00
      await prisma.sale.create({
        data: {
          businessId: groceryBiz.id,
          invoiceNo: 'INV-AC47-PROFIT',
          invoiceYear: 2026,
          invoiceSeq: 9501,
          cashierId: cashier.id,
          orderType: 'walk_in',
          subtotal: new Prisma.Decimal(358.5),
          discountTotal: new Prisma.Decimal(0),
          taxableAmount: new Prisma.Decimal(358.5),
          taxAmount: new Prisma.Decimal(17.93),
          charges: new Prisma.Decimal(20.0),
          total: new Prisma.Decimal(396.43),
          amountPaid: new Prisma.Decimal(396.43),
          creditAmount: new Prisma.Decimal(0),
          paymentSummary: 'cash',
          gstRegistered: true,
          status: 'completed',
          businessDate: bttDate,
          completedAt,
          items: {
            create: {
              businessId: groceryBiz.id,
              lineNo: 1,
              productId: testProduct!.id,
              name: testProduct!.name,
              barcode: testProduct!.barcode,
              category: testProduct!.category,
              qty: 1,
              unitPrice: new Prisma.Decimal(358.5),
              lineDiscount: new Prisma.Decimal(0),
              allocatedDiscount: new Prisma.Decimal(0),
              taxable: new Prisma.Decimal(358.5),
              tax: new Prisma.Decimal(17.93),
              taxRate: new Prisma.Decimal(5),
              taxMode: 'exclusive',
              taxCategory: 'standard',
              total: new Prisma.Decimal(376.43),
              unitCost: new Prisma.Decimal(250.0), // Historical unit cost
              trackStock: false,
            },
          },
        },
      });

      // 2. Create one expense of 50.00 the same day
      await prisma.expense.create({
        data: {
          businessId: groceryBiz.id,
          name: 'Cleaning Supplies',
          category: 'supplies',
          amount: new Prisma.Decimal(50.0),
          businessDate: bttDate,
          paymentMethod: 'cash',
          createdBy: cashier.id,
        },
      });

      // 3. Later change product's purchase price to 300.00 (should NOT affect historical profit)
      await prisma.product.update({
        where: { id: testProduct!.id },
        data: { purchasePrice: new Prisma.Decimal(300.0) },
      });

      // 4. Query sales report for that day
      const res = await adminAgent.get(`/api/v1/reports/sales?from=${dayStr}&to=${dayStr}`);
      if (res.status !== 200) {
        console.error('AC-47 error response:', res.status, res.body);
      }
      expect(res.status).toBe(200);
      const data = res.body.data;

      // Estimated profit = 358.50 + 20.00 - 250.00 - 50.00 = 78.50
      expect(data.estimatedProfit).toBe(78.5);

      // Cleanup test sale and expense
      await prisma.saleItem.deleteMany({ where: { sale: { invoiceNo: 'INV-AC47-PROFIT' } } });
      await prisma.payment.deleteMany({ where: { sale: { invoiceNo: 'INV-AC47-PROFIT' } } });
      await prisma.sale.deleteMany({ where: { invoiceNo: 'INV-AC47-PROFIT' } });
      await prisma.expense.deleteMany({ where: { businessId: groceryBiz.id, businessDate: bttDate } });
    });
  });

  describe('AC-51: Expenses CRUD & Audit Logging', () => {
    it('Records rent 18,000.00, edits to 18,500.00, deletes another expense, creating 3 audit rows', async () => {
      // Pre-create an expense to delete
      const toDelete = await prisma.expense.create({
        data: {
          businessId: groceryBiz.id,
          name: 'Old Printer Repair',
          category: 'maintenance',
          amount: new Prisma.Decimal(1200.0),
          businessDate: new Date('2026-10-20T00:00:00.000Z'),
          createdBy: groceryBiz.employees[0]!.id,
        },
      });

      // Count initial audit rows
      const initialAuditCount = await prisma.auditLog.count({
        where: { businessId: groceryBiz.id, entityType: 'expense' },
      });

      // 1. Accountant records rent 18,000.00 for today
      const createRes = await accountantAgent
        .post('/api/v1/expenses')
        .set('X-CSRF-Token', accountantCsrf)
        .send({
          name: 'Store Rent',
          category: 'rent',
          amount: 18000,
          paymentMethod: 'bank_transfer',
          description: 'October month rent',
        });
      expect(createRes.status).toBe(201);
      const createdExpense = createRes.body.data.expense;
      expect(createdExpense.amount).toBe(18000);

      // 2. Edit rent to 18,500.00
      const editRes = await accountantAgent
        .patch(`/api/v1/expenses/${createdExpense.id}`)
        .set('X-CSRF-Token', accountantCsrf)
        .send({
          amount: 18500,
        });
      expect(editRes.status).toBe(200);
      expect(editRes.body.data.expense.amount).toBe(18500);

      // 3. Delete the other expense
      const delRes = await accountantAgent
        .delete(`/api/v1/expenses/${toDelete.id}`)
        .set('X-CSRF-Token', accountantCsrf);
      expect(delRes.status).toBe(200);

      // Check 3 audit rows were created
      const finalAuditCount = await prisma.auditLog.count({
        where: { businessId: groceryBiz.id, entityType: 'expense' },
      });
      expect(finalAuditCount - initialAuditCount).toBe(3);

      // Verify today's dashboard reflects 18,500.00 in expenses
      const dashRes = await accountantAgent.get('/api/v1/dashboard');
      expect(dashRes.status).toBe(200);
      expect(dashRes.body.data.today.expenses).toBeGreaterThanOrEqual(18500);
    });
  });
});
