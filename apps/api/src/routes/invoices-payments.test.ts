import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';
import { OrderType, PaymentStatus, MovementType, CustomerType } from '@prisma/client';

describe('Phase 8: Invoices, Void & Payments Integration Tests (AC-41, AC-42, AC-46)', () => {
  const app = createApp();

  beforeEach(() => {
    resetRateLimits();
  });

  async function loginAsEmployee(
    agent: ReturnType<typeof request.agent>,
    csrfToken: string,
    companyName: string,
    username: string
  ) {
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: companyName, password: 'demo_password_1234' });

    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username, password: 'demo_password_1234' });
  }

  it('GET /api/v1/sales: returns paginated sales list with filters and waiter scoping', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const res = await agent.get('/api/v1/sales?page=1&limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.total).toBeGreaterThan(0);

    // Search by invoiceNo
    const firstInvoice = res.body.data[0];
    const searchRes = await agent.get(`/api/v1/sales?q=${firstInvoice.invoiceNo}`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.some((s: { invoiceNo: string }) => s.invoiceNo === firstInvoice.invoiceNo)).toBe(true);

    // Filter by status completed
    const completedRes = await agent.get('/api/v1/sales?status=completed');
    expect(completedRes.status).toBe(200);
    expect(completedRes.body.data.every((s: { status: string }) => s.status === 'completed')).toBe(true);
  });

  it('AC-42: Cashier and Accountant signed in attempting POST /sales/:id/void return 403 FORBIDDEN', async () => {
    // 1. First get an existing completed sale
    const adminAgent = request.agent(app);
    const adminCsrf = await adminAgent.get('/api/v1/auth/csrf');
    await loginAsEmployee(adminAgent, adminCsrf.body.data.token, 'Pema Store', 'admin');
    const salesRes = await adminAgent.get('/api/v1/sales?status=completed');
    const saleId = salesRes.body.data[0].id;

    // 2. Try as Cashier
    const cashierAgent = request.agent(app);
    const cashierCsrf = await cashierAgent.get('/api/v1/auth/csrf');
    await loginAsEmployee(cashierAgent, cashierCsrf.body.data.token, 'Pema Store', 'cashier1');

    const cashierVoidRes = await cashierAgent
      .post(`/api/v1/sales/${saleId}/void`)
      .set('X-CSRF-Token', cashierCsrf.body.data.token)
      .send({ reason: 'Cashier trying to void' });

    expect(cashierVoidRes.status).toBe(403);
    expect(cashierVoidRes.body.error.code).toBe('FORBIDDEN');

    // 3. Try as Accountant
    const accountantAgent = request.agent(app);
    const accountantCsrf = await accountantAgent.get('/api/v1/auth/csrf');
    await loginAsEmployee(accountantAgent, accountantCsrf.body.data.token, 'Pema Store', 'accountant1');

    const accountantVoidRes = await accountantAgent
      .post(`/api/v1/sales/${saleId}/void`)
      .set('X-CSRF-Token', accountantCsrf.body.data.token)
      .send({ reason: 'Accountant trying to void' });

    expect(accountantVoidRes.status).toBe(403);
    expect(accountantVoidRes.body.error.code).toBe('FORBIDDEN');
  });

  it('AC-41: Completed sale with 2 tracked items, 1 untracked dish, partial credit 500.00 voided by Manager', async () => {
    const business = await prisma.business.findFirst({
      where: { name: 'Test Restaurant' },
    });
    expect(business).toBeDefined();

    const zeroTax = await prisma.taxRate.findFirst({
      where: { businessId: business!.id, rate: 0 },
    });
    expect(zeroTax).toBeDefined();

    const randSuffix = Math.floor(10000000 + Math.random() * 90000000).toString();

    // Create 2 tracked products and 1 untracked product
    const tracked1 = await prisma.product.create({
      data: {
        business: { connect: { id: business!.id } },
        name: 'Tracked Soft Drink',
        barcode: `201${randSuffix}`,
        category: 'Beverage',
        purchasePrice: 30,
        sellPrice: 50,
        taxRate: { connect: { id: zeroTax!.id } },
        stock: 50,
        trackStock: true,
      },
    });

    const tracked2 = await prisma.product.create({
      data: {
        business: { connect: { id: business!.id } },
        name: 'Tracked Dessert',
        barcode: `202${randSuffix}`,
        category: 'Dessert',
        purchasePrice: 40,
        sellPrice: 80,
        taxRate: { connect: { id: zeroTax!.id } },
        stock: 30,
        trackStock: true,
      },
    });

    const untrackedDish = await prisma.product.create({
      data: {
        business: { connect: { id: business!.id } },
        name: 'Untracked Momos Special',
        barcode: `203${randSuffix}`,
        category: 'Mains',
        purchasePrice: 60,
        sellPrice: 150,
        taxRate: { connect: { id: zeroTax!.id } },
        stock: 0,
        trackStock: false,
      },
    });

    // Create a customer with outstanding balance
    const customer = await prisma.customer.create({
      data: {
        business: { connect: { id: business!.id } },
        name: 'Tashi Dorji',
        type: CustomerType.credit,
        creditLimit: 5000,
        outstandingBalance: 200,
        totalSpent: 1000,
      },
    });

    const manager = await prisma.employee.findFirst({
      where: { businessId: business!.id, role: 'manager' },
    });
    expect(manager).toBeDefined();

    // Create a linked kitchen order
    const kot = await prisma.kitchenOrder.create({
      data: {
        business: { connect: { id: business!.id } },
        creator: { connect: { id: manager!.id } },
        orderNo: `KOT-${Math.floor(1000 + Math.random() * 9000)}`,
        orderType: OrderType.dine_in,
        status: 'served',
        billed: false,
      },
    });

    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    // Login as Manager (has sales.void)
    await loginAsEmployee(agent, csrfToken, 'Test Restaurant', 'manager1');

    // Complete sale: 2 of tracked1 (100) + 2 of tracked2 (160) + 2 of untracked (300) = 560.
    // Total = 560.00. Paid: cash 60.00, credit 500.00.
    const saleRes = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'dine_in',
        customerId: customer.id,
        kitchenOrderId: kot.id,
        lines: [
          { productId: tracked1.id, qty: 2, unitPrice: 50 },
          { productId: tracked2.id, qty: 2, unitPrice: 80 },
          { productId: untrackedDish.id, qty: 2, unitPrice: 150 },
        ],
        payments: [
          { method: 'cash', amount: 60, cashReceived: 100 },
          { method: 'credit', amount: 500 },
        ],
      });

    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.data.id;
    const invoiceNo = saleRes.body.data.invoiceNo;

    // Check stocks after sale: tracked1 was 50 -> 48, tracked2 was 30 -> 28
    const tracked1AfterSale = await prisma.product.findUnique({ where: { id: tracked1.id } });
    const tracked2AfterSale = await prisma.product.findUnique({ where: { id: tracked2.id } });
    expect(tracked1AfterSale!.stock).toBe(48);
    expect(tracked2AfterSale!.stock).toBe(28);

    // Customer balance increased by credit 500
    const customerAfterSale = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(Number(customerAfterSale!.outstandingBalance)).toBe(700); // 200 + 500

    // KOT was marked billed
    const kotAfterSale = await prisma.kitchenOrder.findUnique({ where: { id: kot.id } });
    expect(kotAfterSale!.billed).toBe(true);

    // MANAGER VOIDS WITH REASON "Wrong table" (AC-41)
    const voidRes = await agent
      .post(`/api/v1/sales/${saleId}/void`)
      .set('X-CSRF-Token', csrfToken)
      .send({ reason: 'Wrong table' });

    expect(voidRes.status).toBe(200);
    const voidedSale = voidRes.body.data;

    // 1. Status voided with time, Manager and reason
    expect(voidedSale.status).toBe('voided');
    expect(voidedSale.voided).toBeDefined();
    expect(voidedSale.voided.reason).toBe('Wrong table');
    expect(voidedSale.voided.by.name).toBe('Sample Manager');
    expect(voidedSale.invoiceNo).toBe(invoiceNo); // invoice number unchanged

    // 2. Tracked items restocked with void_restock movements; untracked not
    const tracked1AfterVoid = await prisma.product.findUnique({ where: { id: tracked1.id } });
    const tracked2AfterVoid = await prisma.product.findUnique({ where: { id: tracked2.id } });
    expect(tracked1AfterVoid!.stock).toBe(50);
    expect(tracked2AfterVoid!.stock).toBe(30);

    const voidRestockMovements = await prisma.stockMovement.findMany({
      where: { saleId, type: MovementType.void_restock },
    });
    expect(voidRestockMovements.length).toBe(2);
    expect(voidRestockMovements.some((m) => m.productId === tracked1.id && m.qty === 2)).toBe(true);
    expect(voidRestockMovements.some((m) => m.productId === tracked2.id && m.qty === 2)).toBe(true);
    expect(voidRestockMovements.some((m) => m.productId === untrackedDish.id)).toBe(false);

    // 3. Sale's payments marked voided
    const payments = await prisma.payment.findMany({ where: { saleId } });
    expect(payments.every((p) => p.status === PaymentStatus.voided)).toBe(true);

    // 4. Customer total spent and outstanding reduced (outstanding reduced by 500.00, not below 0)
    const customerAfterVoid = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(Number(customerAfterVoid!.outstandingBalance)).toBe(200); // 700 - 500

    // 5. Linked KOT billed = false, status stays served
    const kotAfterVoid = await prisma.kitchenOrder.findUnique({ where: { id: kot.id } });
    expect(kotAfterVoid!.billed).toBe(false);
    expect(kotAfterVoid!.status).toBe('served');
  });

  it('AC-46: Payments report for today (cash, voided mbob, credit, and settlement)', async () => {
    const business = await prisma.business.findFirst({
      where: { name: 'Norbu General Store' },
    });
    expect(business).toBeDefined();

    const zeroTax = await prisma.taxRate.findFirst({
      where: { businessId: business!.id, rate: 0 },
    });
    expect(zeroTax).toBeDefined();

    const randBar = `209${Math.floor(10000000 + Math.random() * 90000000)}`;

    // Create a product for Norbu General Store
    const item = await prisma.product.create({
      data: {
        business: { connect: { id: business!.id } },
        name: 'Report Test Snack',
        barcode: randBar,
        category: 'Snacks',
        purchasePrice: 50,
        sellPrice: 100,
        taxRate: { connect: { id: zeroTax!.id } },
        stock: 100,
        trackStock: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        business: { connect: { id: business!.id } },
        name: 'Rinchen Dorji',
        type: CustomerType.credit,
        creditLimit: 2000,
        outstandingBalance: 500,
        totalSpent: 500,
      },
    });

    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Norbu General Store', 'admin');

    // Query initial baseline payments report
    const todayStr = new Date().toISOString().slice(0, 10);
    const initialRes = await agent.get(
      `/api/v1/payments?from=${todayStr}T00:00:00.000Z&to=${todayStr}T23:59:59.999Z`
    );
    expect(initialRes.status).toBe(200);
    const initReport = initialRes.body.data;
    const initialCash = initReport.totalsByMethod.find((m: { method: string }) => m.method === 'cash')?.amount || 0;
    const initialMbob = initReport.totalsByMethod.find((m: { method: string }) => m.method === 'mbob')?.amount || 0;
    const initialCredit = initReport.onCredit?.amount || 0;
    const initialMpay = initReport.totalsByMethod.find((m: { method: string }) => m.method === 'mpay')?.amount || 0;
    const initialSettlements = initReport.settlementsTotal?.amount || 0;

    // 1. Cash sale 100.00
    const sale1Res = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: item.id, qty: 1, unitPrice: 100 }],
        payments: [{ method: 'cash', amount: 100, cashReceived: 100 }],
      });
    expect(sale1Res.status).toBe(201);

    // 2. mBoB sale 200.00 later voided
    const sale2Res = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: item.id, qty: 2, unitPrice: 100 }],
        payments: [{ method: 'mbob', amount: 200, journalNo: 'MB998811' }],
      });
    expect(sale2Res.status).toBe(201);
    const sale2Id = sale2Res.body.data.id;

    // Void the mBoB sale
    const voidSale2 = await agent
      .post(`/api/v1/sales/${sale2Id}/void`)
      .set('X-CSRF-Token', csrfToken)
      .send({ reason: 'Void test mBoB' });
    expect(voidSale2.status).toBe(200);

    // 3. Credit sale 300.00
    const sale3Res = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        customerId: customer.id,
        lines: [{ productId: item.id, qty: 3, unitPrice: 100 }],
        payments: [{ method: 'credit', amount: 300 }],
      });
    expect(sale3Res.status).toBe(201);

    // 4. Credit Settlement 150.00 by mPay (mpay)
    const settleRes = await agent
      .post(`/api/v1/customers/${customer.id}/settlements`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', `c0ffee${Math.floor(10000000 + Math.random() * 90000000)}`)
      .send({
        amount: 150,
        method: 'mpay',
        journalNo: 'BNB123456',
      });
    expect(settleRes.status).toBe(201);

    // Query payments report for today
    const paymentsRes = await agent.get(
      `/api/v1/payments?from=${todayStr}T00:00:00.000Z&to=${todayStr}T23:59:59.999Z`
    );

    expect(paymentsRes.status).toBe(200);
    const report = paymentsRes.body.data;

    // Verify AC-46 assertions:
    // Cash: increased by 100.00
    const cashEntry = report.totalsByMethod.find((m: { method: string }) => m.method === 'cash');
    expect(cashEntry.amount).toBe(Math.round((initialCash + 100) * 100) / 100);

    // mBoB: remains at initial (the 200.00 sale was voided, and voided payments aren't counted in any card)
    const mbobEntry = report.totalsByMethod.find((m: { method: string }) => m.method === 'mbob');
    expect(mbobEntry.amount).toBe(initialMbob);

    // On credit: increased by 300.00
    expect(report.onCredit.amount).toBe(Math.round((initialCredit + 300) * 100) / 100);

    // mPay (settlements): increased by 150.00
    const mpayEntry = report.totalsByMethod.find((m: { method: string }) => m.method === 'mpay');
    expect(mpayEntry.amount).toBe(Math.round((initialMpay + 150) * 100) / 100);
    expect(report.settlementsTotal.amount).toBe(Math.round((initialSettlements + 150) * 100) / 100);

    // Verify CSV export
    const csvRes = await agent.get(
      `/api/v1/payments/export.csv?from=${todayStr}T00:00:00.000Z&to=${todayStr}T23:59:59.999Z`
    );
    expect(csvRes.status).toBe(200);
    expect(csvRes.header['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('Date,Time,Invoice/Receipt,Method,Amount,Fee,Bank,JournalNo,Remarks,CreatedBy,Status');
    expect(csvRes.text).toContain('CASH');
    expect(csvRes.text).toContain('MPAY');
  });
});
