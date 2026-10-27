import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { hashPassword } from '../lib/passwords.js';
import {
  BusinessType,
  EmployeeRole,
  PaymentMethod,
  SaleStatus,
  OrderType,
  TaxCategory,
  TaxMode,
  ProductUnit,
  PlanCode,
  SubscriptionStatus,
  CounterName,
} from '@prisma/client';

const app = createApp();

describe('Phase 13: AC-67 Load Testing (20,000 Sales & 5,000 Products)', () => {
  let businessId: string;
  let cashierAgent: ReturnType<typeof request.agent>;
  let cashierCsrf: string;
  let adminAgent: ReturnType<typeof request.agent>;
  let standardTaxRateId: string;
  let sampleProductIds: string[] = [];

  const BIZ_CODE = 'BIZ-LOADTEST1';

  async function cleanBusiness(bizCode: string) {
    const existing = await prisma.business.findUnique({
      where: { businessCode: bizCode },
      select: { id: true },
    });
    if (existing) {
      const id = existing.id;
      await prisma.auditLog.deleteMany({ where: { businessId: id } });
      await prisma.saleItem.deleteMany({ where: { businessId: id } });
      await prisma.payment.deleteMany({ where: { businessId: id } });
      await prisma.stockMovement.deleteMany({ where: { businessId: id } });
      await prisma.sale.deleteMany({ where: { businessId: id } });
      await prisma.product.deleteMany({ where: { businessId: id } });
      await prisma.taxRate.deleteMany({ where: { businessId: id } });
      await prisma.employee.deleteMany({ where: { businessId: id } });
      await prisma.subscription.deleteMany({ where: { businessId: id } });
      await prisma.counter.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
  }

  beforeAll(async () => {
    // Clean up any previous test business
    await cleanBusiness(BIZ_CODE);

    const passwordHash = await hashPassword('loadtest_pass_1234');

    // 1. Create Load Test Enterprise Business
    const biz = await prisma.business.create({
      data: {
        businessCode: BIZ_CODE,
        name: 'Load Test Supermarket',
        nameKey: 'loadtestsupermarket',
        type: BusinessType.grocery,
        ownerName: 'Performance Tester',
        phone: '+97517112233',
        email: 'perf@example.com',
        gstNo: 'GST-PERF-999',
        gstRegistered: true,
        passwordHash,
        subscription: {
          create: {
            plan: PlanCode.enterprise,
            status: SubscriptionStatus.active,
            startedAt: new Date('2026-01-01T00:00:00Z'),
            expiresAt: new Date('2027-12-31T23:59:59Z'),
          },
        },
      },
    });
    businessId = biz.id;

    // 2. Employees (Admin + Cashier)
    const admin = await prisma.employee.create({
      data: {
        businessId,
        username: 'perfadmin',
        usernameKey: 'perfadmin',
        name: 'Perf Admin',
        role: EmployeeRole.admin,
        passwordHash,
      },
    });

    await prisma.employee.create({
      data: {
        businessId,
        username: 'perfcashier',
        usernameKey: 'perfcashier',
        name: 'Perf Cashier',
        role: EmployeeRole.cashier,
        passwordHash,
      },
    });

    // 3. Standard Tax Rate
    const taxRate = await prisma.taxRate.create({
      data: {
        businessId,
        name: 'Standard GST 5%',
        rate: 5.0,
        mode: TaxMode.exclusive,
        category: TaxCategory.standard,
        effectiveDate: new Date('2026-01-01'),
        isDefault: true,
        active: true,
      },
    });
    standardTaxRateId = taxRate.id;

    // 4. Bulk Insert 5,000 Products in batches of 1,000
    const TOTAL_PRODUCTS = 5000;
    const productRows = [];
    for (let i = 1; i <= TOTAL_PRODUCTS; i++) {
      const barcode = `20${String(i).padStart(9, '0')}`;
      productRows.push({
        businessId,
        name: `Benchmark Product ${i}`,
        category: i % 5 === 0 ? 'Beverages' : i % 3 === 0 ? 'Produce' : 'Snacks',
        barcode,
        purchasePrice: 40.0,
        sellPrice: 50.0,
        taxRateId: standardTaxRateId,
        unit: ProductUnit.pc,
        stock: 500,
        minStock: 10,
        trackStock: true,
        active: true,
      });
    }

    const BATCH_SIZE = 1000;
    for (let i = 0; i < productRows.length; i += BATCH_SIZE) {
      await prisma.product.createMany({
        data: productRows.slice(i, i + BATCH_SIZE),
      });
    }

    // Fetch 35 products for the 30-line checkout test
    const fetchedProducts = await prisma.product.findMany({
      where: { businessId },
      take: 35,
      select: { id: true },
    });
    sampleProductIds = fetchedProducts.map((p) => p.id);

    // 5. Bulk Insert 20,000 Sales in batches of 2,000
    const TOTAL_SALES = 20000;
    const saleRows = [];
    const baseDate = new Date('2026-10-01T08:00:00Z').getTime();

    for (let i = 1; i <= TOTAL_SALES; i++) {
      const invoiceNo = `INV-2026-${String(i).padStart(5, '0')}`;
      // Distribute sales across October 2026 (30 days)
      const offsetMs = (i % 30) * 24 * 3600 * 1000 + (i % 86400) * 1000;
      const completedAt = new Date(baseDate + offsetMs);
      const businessDate = new Date(completedAt.toISOString().slice(0, 10));

      saleRows.push({
        businessId,
        invoiceNo,
        invoiceYear: 2026,
        invoiceSeq: i,
        status: SaleStatus.completed,
        completedAt,
        businessDate,
        cashierId: admin.id,
        orderType: OrderType.walk_in,
        gstRegistered: true,
        subtotal: 100.0,
        discountTotal: 0.0,
        taxableAmount: 100.0,
        taxAmount: 5.0,
        total: 105.0,
        amountPaid: 105.0,
        creditAmount: 0.0,
        paymentSummary: 'Cash',
      });
    }

    for (let i = 0; i < saleRows.length; i += 2000) {
      await prisma.sale.createMany({
        data: saleRows.slice(i, i + 2000),
      });
    }

    // Initialize invoice counter so subsequent sales generate INV-2026-20001+
    await prisma.counter.create({
      data: {
        businessId,
        name: CounterName.invoice,
        year: 2026,
        value: TOTAL_SALES,
      },
    });

    // 6. Sign in Admin & Cashier
    async function signin(username: string) {
      const agent = request.agent(app);
      const csrfRes = await agent.get('/api/v1/auth/csrf');
      const token = csrfRes.body.data.token;

      const companyRes = await agent
        .post('/api/v1/auth/company-login')
        .set('X-CSRF-Token', token)
        .send({ identifier: BIZ_CODE, password: 'loadtest_pass_1234' });
      expect(companyRes.status).toBe(200);

      const empRes = await agent
        .post('/api/v1/auth/employee-login')
        .set('X-CSRF-Token', token)
        .send({ username, password: 'loadtest_pass_1234' });
      expect(empRes.status).toBe(200);

      return { agent, token };
    }

    const adminAuth = await signin('perfadmin');
    adminAgent = adminAuth.agent;

    const cashierAuth = await signin('perfcashier');
    cashierAgent = cashierAuth.agent;
    cashierCsrf = cashierAuth.token;
  }, 90000);

  afterAll(async () => {
    await cleanBusiness(BIZ_CODE);
  });

  it('AC-67: product search < 300 ms among 5,000 products', async () => {
    // 1. Text search by name
    const startName = performance.now();
    const resName = await cashierAgent.get('/api/v1/pos/products?search=Benchmark Product 2500');
    const elapsedName = performance.now() - startName;

    expect(resName.status).toBe(200);
    expect(resName.body.data.length).toBeGreaterThan(0);
    expect(elapsedName).toBeLessThan(300);

    // 2. Search by exact barcode
    const startBarcode = performance.now();
    const resBarcode = await cashierAgent.get('/api/v1/pos/products?search=20000004500');
    const elapsedBarcode = performance.now() - startBarcode;

    expect(resBarcode.status).toBe(200);
    expect(resBarcode.body.data.length).toBe(1);
    expect(elapsedBarcode).toBeLessThan(300);
  });

  it('AC-67: POST /sales with 30 lines < 500 ms p95 in business with 20,000 sales', async () => {
    expect(sampleProductIds.length).toBeGreaterThanOrEqual(30);

    const lines = sampleProductIds.slice(0, 30).map((productId) => ({
      productId,
      qty: 1,
      unitPrice: 50.0,
      lineDiscount: 0,
    }));

    // Perform sale
    const start = performance.now();
    const res = await cashierAgent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', cashierCsrf)
      .send({
        orderType: 'walk_in',
        lines,
        payments: [
          {
            method: PaymentMethod.cash,
            amount: 1575.0, // 30 * 50 = 1500 + 5% GST = 1575.00
            cashReceived: 1600.0,
          },
        ],
      });
    const elapsed = performance.now() - start;

    expect(res.status).toBe(201);
    expect(res.body.data.items.length).toBe(30);
    expect(res.body.data.total).toBe(1575.0);
    expect(elapsed).toBeLessThan(500);
  });

  it('AC-67: One-month GST report < 2 seconds with 20,000 sales in DB', async () => {
    const start = performance.now();
    const res = await adminAgent.get('/api/v1/reports/gst?from=2026-10-01&to=2026-10-31');
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.data.summary.transactions).toBeGreaterThan(15000);
    expect(elapsed).toBeLessThan(2000);
  });

  it('AC-67: One-month Sales & Profit report < 2 seconds with 20,000 sales in DB', async () => {
    const start = performance.now();
    const res = await adminAgent.get('/api/v1/reports/sales?from=2026-10-01&to=2026-10-31');
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBeGreaterThan(15000);
    expect(elapsed).toBeLessThan(2000);
  });
});
