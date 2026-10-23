import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 6: Inventory & Stock Movements API (AC-22, AC-23, AC-24, BR-25, BR-26)', () => {
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

  it('AC-22: Sugar 1kg with stock 5 -> Stock out 7 returns 409 INSUFFICIENT_STOCK, stock unchanged', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken);

    // Create a product with initial stock 5
    const taxRate = await prisma.taxRate.findFirstOrThrow({
      where: { business: { name: 'Pema Store' }, active: true },
    });
    const uniqueBarcode = `20${Math.floor(100000000 + Math.random() * 900000000)}`;

    const createRes = await agent
      .post('/api/v1/products')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Test Sugar 1kg',
        barcode: uniqueBarcode,
        category: 'Groceries',
        purchasePrice: 40,
        sellPrice: 55,
        taxRateId: taxRate.id,
        unit: 'kg',
        trackStock: true,
        openingStock: 5,
        minStock: 2,
      });

    expect(createRes.status).toBe(201);
    const productId = createRes.body.data.id;
    expect(createRes.body.data.stock).toBe(5);

    // Attempt stock out of 7 -> expect 409 INSUFFICIENT_STOCK "Only 5 in stock."
    const outRes = await agent
      .post('/api/v1/stock-movements')
      .set('X-CSRF-Token', csrfToken)
      .send({
        productId,
        type: 'stock_out',
        qty: 7,
      });

    expect(outRes.status).toBe(409);
    expect(outRes.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(outRes.body.error.message).toContain('Only 5 in stock.');

    // Verify product stock is still 5
    const prodAfter = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(prodAfter.stock).toBe(5);

    // Clean up
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
  });

  it('AC-23: Consistency: products.stock = latest movement.stockAfter = sum of all movement qty', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken);

    const taxRate = await prisma.taxRate.findFirstOrThrow({
      where: { business: { name: 'Pema Store' }, active: true },
    });
    const uniqueBarcode = `20${Math.floor(100000000 + Math.random() * 900000000)}`;

    // Create product with 10 opening stock
    const createRes = await agent
      .post('/api/v1/products')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Test Consistency Item',
        barcode: uniqueBarcode,
        category: 'Test',
        purchasePrice: 10,
        sellPrice: 20,
        taxRateId: taxRate.id,
        unit: 'pc',
        trackStock: true,
        openingStock: 10,
      });

    const productId = createRes.body.data.id;

    // Movement 1: stock_in +15
    await agent
      .post('/api/v1/stock-movements')
      .set('X-CSRF-Token', csrfToken)
      .send({
        productId,
        type: 'stock_in',
        qty: 15,
      });

    // Movement 2: stock_out -4
    await agent
      .post('/api/v1/stock-movements')
      .set('X-CSRF-Token', csrfToken)
      .send({
        productId,
        type: 'stock_out',
        qty: 4,
      });

    // Movement 3: adjustment decrease -3
    await agent
      .post('/api/v1/stock-movements')
      .set('X-CSRF-Token', csrfToken)
      .send({
        productId,
        type: 'adjustment',
        direction: 'decrease',
        qty: 3,
        reason: 'Expired samples',
      });

    // Run consistency check (AC-23)
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const movements = await prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });

    const sumQty = movements.reduce((acc, m) => acc + m.qty, 0);
    const latestStockAfter = movements[0]!.stockAfter;

    expect(product.stock).toBe(18); // 10 + 15 - 4 - 3 = 18
    expect(latestStockAfter).toBe(18);
    expect(sumQty).toBe(18);
    expect(product.stock).toBe(latestStockAfter);
    expect(product.stock).toBe(sumQty);

    // Clean up
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
  });

  it('rejects stock movement for untracked products (BR-09)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken);

    const taxRate = await prisma.taxRate.findFirstOrThrow({
      where: { business: { name: 'Pema Store' }, active: true },
    });
    const uniqueBarcode = `20${Math.floor(100000000 + Math.random() * 900000000)}`;

    const createRes = await agent
      .post('/api/v1/products')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Untracked Item',
        barcode: uniqueBarcode,
        category: 'Dishes',
        purchasePrice: 50,
        sellPrice: 120,
        taxRateId: taxRate.id,
        unit: 'plate',
        trackStock: false,
      });

    const productId = createRes.body.data.id;

    const res = await agent
      .post('/api/v1/stock-movements')
      .set('X-CSRF-Token', csrfToken)
      .send({
        productId,
        type: 'stock_in',
        qty: 10,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');

    await prisma.product.delete({ where: { id: productId } });
  });

  it('AC-24: Inventory alerts calculates low, out, expiring soon, expired and sidebar badge', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken);

    const taxRate = await prisma.taxRate.findFirstOrThrow({
      where: { business: { name: 'Pema Store' }, active: true },
    });

    // A: stock 3, min 5 -> low stock
    // B: stock 0, min 2 -> out of stock
    // C: expiry in 10 days -> expiring soon
    // D: expiry yesterday -> expired
    // E: untracked, stock 0 -> untracked
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const in10Days = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);

    const ids: string[] = [];

    const pA = await prisma.product.create({
      data: {
        businessId: (await prisma.business.findFirstOrThrow({ where: { name: 'Pema Store' } })).id,
        name: 'Alert Product A',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        purchasePrice: 10,
        sellPrice: 20,
        taxRateId: taxRate.id,
        trackStock: true,
        stock: 3,
        minStock: 5,
      },
    });
    ids.push(pA.id);

    const pB = await prisma.product.create({
      data: {
        businessId: pA.businessId,
        name: 'Alert Product B',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        purchasePrice: 10,
        sellPrice: 20,
        taxRateId: taxRate.id,
        trackStock: true,
        stock: 0,
        minStock: 2,
      },
    });
    ids.push(pB.id);

    const pC = await prisma.product.create({
      data: {
        businessId: pA.businessId,
        name: 'Alert Product C',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        purchasePrice: 10,
        sellPrice: 20,
        taxRateId: taxRate.id,
        trackStock: true,
        stock: 20,
        minStock: 5,
        expiryDate: in10Days,
      },
    });
    ids.push(pC.id);

    const pD = await prisma.product.create({
      data: {
        businessId: pA.businessId,
        name: 'Alert Product D',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        purchasePrice: 10,
        sellPrice: 20,
        taxRateId: taxRate.id,
        trackStock: true,
        stock: 15,
        minStock: 5,
        expiryDate: yesterday,
      },
    });
    ids.push(pD.id);

    const pE = await prisma.product.create({
      data: {
        businessId: pA.businessId,
        name: 'Alert Product E',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        purchasePrice: 10,
        sellPrice: 20,
        taxRateId: taxRate.id,
        trackStock: false,
        stock: 0,
        minStock: 0,
      },
    });
    ids.push(pE.id);

    const res = await agent.get('/api/v1/inventory/alerts');
    expect(res.status).toBe(200);
    const { counts, lowStockItems, outOfStockItems, expiringSoonItems } = res.body.data;

    expect(counts.lowStock).toBeGreaterThanOrEqual(1);
    expect(counts.outOfStock).toBeGreaterThanOrEqual(1);
    expect(counts.badgeCount).toBeGreaterThanOrEqual(2);
    expect(counts.expiringSoon).toBeGreaterThanOrEqual(1);
    expect(counts.expired).toBeGreaterThanOrEqual(1);

    expect(lowStockItems.some((i: { id: string }) => i.id === pA.id)).toBe(true);
    expect(outOfStockItems.some((i: { id: string }) => i.id === pB.id)).toBe(true);
    expect(expiringSoonItems.some((i: { id: string; isExpired: boolean }) => i.id === pC.id && !i.isExpired)).toBe(true);
    expect(expiringSoonItems.some((i: { id: string; isExpired: boolean }) => i.id === pD.id && i.isExpired)).toBe(true);

    // Clean up
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  });
});
