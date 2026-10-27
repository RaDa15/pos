import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';
import { verifyPassword } from '../lib/passwords.js';

describe('Phase 12: Purchases & Data Import/Export (AC-25, AC-54, AC-55, BR-38)', () => {
  const app = createApp();

  beforeEach(() => {
    resetRateLimits();
  });

  async function loginAsAdmin(
    agent: ReturnType<typeof request.agent>,
    csrfToken: string,
    companyName = 'Pema Store'
  ) {
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: companyName, password: 'demo_password_1234' });

    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'admin', password: 'demo_password_1234' });
  }

  async function loginAsCashier(
    agent: ReturnType<typeof request.agent>,
    csrfToken: string,
    companyName = 'Pema Store'
  ) {
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: companyName, password: 'demo_password_1234' });

    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'cashier1', password: 'demo_password_1234' });
  }

  async function loginAsRestaurantAdmin(
    agent: ReturnType<typeof request.agent>,
    csrfToken: string
  ) {
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: 'Test Restaurant', password: 'demo_password_1234' });

    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'admin', password: 'demo_password_1234' });
  }

  it('AC-25: Supplier "Druk Wholesale Supply" with no purchases, product stock 10 -> Purchase 20 units at 400.00, amount paid 5,000.00 (BR-38)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken, 'Pema Store');

    const business = await prisma.business.findFirstOrThrow({ where: { name: 'Pema Store' } });
    const taxRate = await prisma.taxRate.findFirstOrThrow({ where: { businessId: business.id } });

    // Given: Supplier "Druk Wholesale Supply" with no purchases
    const supplier = await prisma.supplier.create({
      data: {
        businessId: business.id,
        name: 'Druk Wholesale Supply',
        phone: '17112233',
        email: 'drukwholesale@supplier.bt',
        openingPaid: 0,
        openingOutstanding: 0,
      },
    });

    // Given: Product with stock 10
    const product = await prisma.product.create({
      data: {
        businessId: business.id,
        name: 'Test Basmati Rice 5kg',
        barcode: `2099${Math.floor(1000000 + Math.random() * 9000000)}`,
        category: 'Grains',
        purchasePrice: 350.0,
        sellPrice: 480.0,
        stock: 10,
        minStock: 5,
        trackStock: true,
        taxRateId: taxRate.id,
      },
    });

    // When: Record a purchase of 20 units at 400.00, amount paid 5,000.00
    const purchaseRes = await agent
      .post('/api/v1/purchases')
      .set('X-CSRF-Token', csrfToken)
      .send({
        supplierId: supplier.id,
        purchaseDate: '2026-11-03',
        amountPaid: 5000.0,
        note: 'Seasonal restocking',
        items: [
          {
            productId: product.id,
            qty: 20,
            unitCost: 400.0,
            batchNo: 'BATCH-2026-X',
            expiryDate: '2027-11-01',
          },
        ],
      });

    expect(purchaseRes.status).toBe(201);
    const pData = purchaseRes.body.data;

    // Then: Purchase number PUR-YYYY-NNNNN
    expect(pData.purchaseNo).toMatch(/^PUR-\d{4}-\d{5}$/);
    expect(pData.total).toBe(8000); // 20 * 400.00
    expect(pData.amountPaid).toBe(5000);
    expect(pData.outstanding).toBe(3000);

    // Then: Product stock becomes 30 (10 + 20)
    const updatedProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(updatedProduct.stock).toBe(30);

    // Then: Product purchase price becomes 400.00
    expect(Number(updatedProduct.purchasePrice)).toBe(400.0);
    expect(updatedProduct.batchNo).toBe('BATCH-2026-X');

    // Then: A 'purchase' movement +20 with stockAfter 30
    const movement = await prisma.stockMovement.findFirst({
      where: {
        businessId: business.id,
        productId: product.id,
        type: 'purchase',
      },
    });
    expect(movement).toBeDefined();
    expect(movement!.qty).toBe(20);
    expect(movement!.stockAfter).toBe(30);

    // Then: Supplier outstanding = 3,000.00
    const supListRes = await agent.get(`/api/v1/suppliers?search=${encodeURIComponent('Druk Wholesale Supply')}`);
    expect(supListRes.status).toBe(200);
    const supMatch = supListRes.body.data.find((s: { id: string }) => s.id === supplier.id);
    expect(supMatch).toBeDefined();
    expect(supMatch.paidTotal).toBe(5000.0);
    expect(supMatch.outstandingTotal).toBe(3000.0);

    // Test GET /purchases list and detail
    const listRes = await agent.get(`/api/v1/purchases?supplierId=${supplier.id}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listRes.body.data[0].purchaseNo).toBe(pData.purchaseNo);

    const detailRes = await agent.get(`/api/v1/purchases/${pData.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.items.length).toBe(1);
    expect(detailRes.body.data.items[0].productName).toBe('Test Basmati Rice 5kg');

    // Clean up
    await prisma.stockMovement.deleteMany({ where: { purchaseId: pData.id } });
    await prisma.purchaseItem.deleteMany({ where: { purchaseId: pData.id } });
    await prisma.purchase.delete({ where: { id: pData.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  it('Purchases: rejects Cashier (403), rejects Restaurant (403), and validates amountPaid <= total', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    // 1. Cashier attempts purchase -> 403 FORBIDDEN (requires purchases.manage)
    await loginAsCashier(agent, csrfToken, 'Pema Store');
    const cashierRes = await agent.get('/api/v1/purchases');
    expect(cashierRes.status).toBe(403);

    // 2. Restaurant Admin attempts purchase -> 403 FORBIDDEN (grocery only)
    const restAgent = request.agent(app);
    const restCsrfRes = await restAgent.get('/api/v1/auth/csrf');
    const restCsrfToken = restCsrfRes.body.data.token;
    await loginAsRestaurantAdmin(restAgent, restCsrfToken);

    const restRes = await restAgent.get('/api/v1/purchases');
    expect(restRes.status).toBe(403);
    expect(restRes.body.error.message).toContain('grocery');

    // 3. Amount paid > total is rejected with 400
    const adminAgent = request.agent(app);
    const adminCsrfRes = await adminAgent.get('/api/v1/auth/csrf');
    const adminCsrfToken = adminCsrfRes.body.data.token;
    await loginAsAdmin(adminAgent, adminCsrfToken, 'Pema Store');

    const business = await prisma.business.findFirstOrThrow({ where: { name: 'Pema Store' } });
    const supplier = await prisma.supplier.findFirstOrThrow({ where: { businessId: business.id } });
    const product = await prisma.product.findFirstOrThrow({ where: { businessId: business.id } });

    const excessivePayRes = await adminAgent
      .post('/api/v1/purchases')
      .set('X-CSRF-Token', adminCsrfToken)
      .send({
        supplierId: supplier.id,
        purchaseDate: '2026-11-03',
        amountPaid: 50000.0, // Exceeds 10 * 100 = 1000
        items: [
          {
            productId: product.id,
            qty: 10,
            unitCost: 100.0,
          },
        ],
      });
    expect(excessivePayRes.status).toBe(400);
  });

  it('AC-55: Any business -> Admin downloads JSON export containing all collections with no passwordHash, session, or TOTP secrets', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken, 'Pema Store');

    const exportRes = await agent.get('/api/v1/data/export');
    expect(exportRes.status).toBe(200);
    expect(exportRes.header['content-type']).toContain('application/json');
    expect(exportRes.header['content-disposition']).toContain('attachment');

    const payload = exportRes.body;
    expect(payload.app).toBe('POS SYSTEM');
    expect(payload.version).toBe(1);
    expect(payload.business).toBeDefined();
    expect(payload.collections).toBeDefined();

    // Verify all primary collections present
    expect(Array.isArray(payload.collections.employees)).toBe(true);
    expect(Array.isArray(payload.collections.products)).toBe(true);
    expect(Array.isArray(payload.collections.customers)).toBe(true);
    expect(Array.isArray(payload.collections.suppliers)).toBe(true);
    expect(Array.isArray(payload.collections.sales)).toBe(true);
    expect(Array.isArray(payload.collections.payments)).toBe(true);
    expect(Array.isArray(payload.collections.expenses)).toBe(true);

    // CRITICAL SECURITY CHECK: Verify NO passwordHash, sessions, or TOTP secrets exist
    const rawJson = JSON.stringify(payload);
    expect(rawJson).not.toContain('passwordHash');
    expect(rawJson).not.toContain('password_hash');
    expect(rawJson).not.toContain('totpSecret');
    expect(rawJson).not.toContain('totp_secret');
    expect(rawJson).not.toContain('sessionId');

    for (const emp of payload.collections.employees) {
      expect(emp.passwordHash).toBeUndefined();
      expect(emp.username).toBeDefined();
    }
  });

  it('AC-54: Prototype backup JSON imported into fresh business; second import returns 409 IMPORT_NOT_ALLOWED', async () => {
    // 1. Create a fresh clean business via registration
    const freshAgent = request.agent(app);
    const csrfRes = await freshAgent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    const uniqueBizName = `Fresh Store ${Date.now()}`;
    const regRes = await freshAgent
      .post('/api/v1/register')
      .set('X-CSRF-Token', csrfToken)
      .send({
        business: {
          name: uniqueBizName,
          type: 'grocery',
          ownerName: 'Fresh Owner',
          phone: '+975 17998877',
          email: `fresh${Date.now()}@test.bt`,
        },
        password: 'Password123!',
        plan: 'professional',
      });
    expect(regRes.status).toBe(201);

    // Sign in to fresh business
    await freshAgent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: uniqueBizName, password: 'Password123!' });

    await freshAgent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'admin', password: 'Password123!' });

    // 2. Prepare sample prototype backup JSON
    const prototypeBackup = {
      app: 'POS SYSTEM',
      version: 1,
      business: {
        name: uniqueBizName,
        type: 'grocery',
        ownerName: 'Fresh Owner',
        phone: '17998877',
        email: `fresh${Date.now()}@test.bt`,
        address: 'Clock Tower Square, Thimphu',
        gstNo: 'TPN-12345678',
      },
      collections: {
        taxrates: [
          { id: 'tr_1', name: 'GST Standard 5%', rate: 5, mode: 'exclusive', active: true, isDefault: true },
          { id: 'tr_2', name: 'GST Exempt 0%', rate: 0, mode: 'exclusive', active: true, isDefault: false },
        ],
        users: [
          {
            id: 'u_1',
            username: 'cashier_old',
            fullName: 'Old Cashier Dorji',
            role: 'Cashier',
            phone: '17554433',
            password: 'plaintext_password_from_prototype_123', // Must NEVER be imported as password!
          },
        ],
        suppliers: [
          {
            id: 'sup_1',
            name: 'Phuntsholing Wholesale Depot',
            phone: '17334455',
            email: 'depot@supplier.bt',
            address: 'Phuntsholing Industrial Area',
            amountPaid: 12000,
            amountOutstanding: 4500,
          },
        ],
        products: [
          {
            id: 'prod_1',
            name: 'Sunflower Oil 1L',
            barcode: '20112233445',
            category: 'Cooking Oils',
            sellPrice: 160,
            purchasePrice: 130,
            stock: 45,
            minStock: 10,
            unit: 'pc',
            taxId: 'tr_1',
            trackStock: true,
          },
        ],
        customers: [
          {
            id: 'cust_walkin',
            name: 'Walk-in Customer', // Must be SKIPPED per 06 §8
            type: 'Regular',
          },
          {
            id: 'cust_1',
            name: 'Ugyen Wangchuk',
            type: 'VIP Customer',
            phone: '17667788',
            creditLimit: 5000,
            openingBalance: 1200,
          },
        ],
        expenses: [
          {
            id: 'exp_1',
            name: 'Store Rent October',
            category: 'rent',
            amount: 15000,
            date: '2026-10-01',
            paymentMethod: 'bank_transfer',
          },
        ],
        transactions: [
          {
            id: 'tx_1',
            invoiceNo: 'INV-2026-00001',
            date: '2026-10-15T10:30:00Z',
            cashierId: 'u_1',
            customerId: 'cust_1',
            subtotal: 320,
            discount: 0,
            gst: 16,
            total: 336,
            status: 'completed',
            amountPaid: 336,
            lines: [
              {
                productId: 'prod_1',
                name: 'Sunflower Oil 1L',
                qty: 2,
                price: 160,
                discount: 0,
                taxRate: 5,
                taxAmount: 16,
                total: 336,
              },
            ],
          },
        ],
        payments: [
          {
            id: 'pay_1',
            transactionId: 'tx_1',
            method: 'mBoB',
            amount: 336,
            date: '2026-10-15T10:30:00Z',
            kind: 'sale',
          },
        ],
        orders: [],
        auditLogs: [
          {
            id: 'log_1',
            by: 'Old Cashier Dorji',
            action: 'store_opened',
            details: 'Opened store morning shift',
            date: '2026-10-15T08:00:00Z',
          },
        ],
      },
    };

    // 3. Admin imports prototype backup
    const importRes = await freshAgent
      .post('/api/v1/data/import-prototype')
      .set('X-CSRF-Token', csrfToken)
      .send(prototypeBackup);

    expect(importRes.status).toBe(200);
    const resData = importRes.body.data;
    expect(resData.counts).toBeDefined();
    expect(resData.counts.products).toBe(1);
    expect(resData.counts.customers).toBe(1); // Walk-in skipped
    expect(resData.counts.suppliers).toBe(1);
    expect(resData.counts.expenses).toBe(1);
    expect(resData.counts.sales).toBe(1);
    expect(resData.counts.payments).toBe(1);
    expect(resData.counts.auditLogs).toBe(1);

    // Verify imported users
    expect(resData.importedUsers.length).toBe(1);
    expect(resData.importedUsers[0].username).toBe('cashier_old');

    // Verify employee was created with mustChangePassword = true and prototype plaintext password NOT used
    const freshBiz = await prisma.business.findFirstOrThrow({ where: { name: uniqueBizName } });
    const importedEmp = await prisma.employee.findFirstOrThrow({
      where: { businessId: freshBiz.id, usernameKey: 'cashier_old' },
    });
    expect(importedEmp.mustChangePassword).toBe(true);

    const isOldPlaintextValid = await verifyPassword(
      'plaintext_password_from_prototype_123',
      importedEmp.passwordHash
    );
    expect(isOldPlaintextValid).toBe(false); // Prototype password discarded!

    // Verify Walk-in customer was skipped
    const walkinCust = await prisma.customer.findFirst({
      where: { businessId: freshBiz.id, name: 'Walk-in Customer' },
    });
    expect(walkinCust).toBeNull();

    // 4. Second import attempt -> 409 IMPORT_NOT_ALLOWED (AC-54)
    const secondImportRes = await freshAgent
      .post('/api/v1/data/import-prototype')
      .set('X-CSRF-Token', csrfToken)
      .send(prototypeBackup);

    expect(secondImportRes.status).toBe(409);
    expect(secondImportRes.body.error.code).toBe('IMPORT_NOT_ALLOWED');
  });
});
