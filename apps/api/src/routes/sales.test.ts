import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 7: Sales, POS & Held Orders Integration Tests (AC-26 to AC-36, AC-39, AC-40, AC-48)', () => {
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

  it('AC-26: Scans barcode exact lookup or returns 404 for unknown barcode', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const product = await prisma.product.findFirst({
      where: { business: { name: 'Pema Store' }, active: true },
    });
    expect(product).toBeDefined();

    // Found barcode
    const res = await agent.get(`/api/v1/pos/products/by-barcode/${product!.barcode}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(product!.id);
    expect(res.body.data.barcode).toBe(product!.barcode);

    // Unknown barcode
    const unknownRes = await agent.get('/api/v1/pos/products/by-barcode/99999999999');
    expect(unknownRes.status).toBe(404);
  });

  it('AC-29: Worked example produces exact numbers (376.43 total, words, tax breakdown)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const business = await prisma.business.findFirst({
      where: { name: 'Pema Store' },
      include: { taxRates: true },
    });
    expect(business).toBeDefined();

    // Standard 5% exclusive tax rate
    let taxRate5 = business!.taxRates.find((t) => Number(t.rate) === 5 && t.mode === 'exclusive');
    if (!taxRate5) {
      taxRate5 = await prisma.taxRate.create({
        data: {
          businessId: business!.id,
          name: 'GST 5% Exclusive',
          rate: 5,
          mode: 'exclusive',
          category: 'standard',
          effectiveDate: new Date('2026-01-01'),
        },
      });
    }

    // Configure VIP customer type discount to 5%
    await prisma.customerTypeDiscount.upsert({
      where: {
        businessId_customerType: {
          businessId: business!.id,
          customerType: 'vip',
        },
      },
      update: { discountPct: 5 },
      create: {
        businessId: business!.id,
        customerType: 'vip',
        discountPct: 5,
      },
    });

    // Create VIP Customer
    const vipCustomer = await prisma.customer.create({
      data: {
        businessId: business!.id,
        name: 'Karma Wangchuk VIP',
        phone: '+975 17234567',
        type: 'vip',
        creditLimit: 10000,
        outstandingBalance: 0,
      },
    });

    // Create Tea product: 135.00
    const tea = await prisma.product.create({
      data: {
        businessId: business!.id,
        name: 'Red Label Tea 250g',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        sellPrice: 135.0,
        purchasePrice: 100.0,
        taxRateId: taxRate5.id,
        stock: 50,
        trackStock: true,
      },
    });

    // Create Detergent product: 170.00
    const detergent = await prisma.product.create({
      data: {
        businessId: business!.id,
        name: 'Detergent Powder 1kg',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        sellPrice: 170.0,
        purchasePrice: 120.0,
        taxRateId: taxRate5.id,
        stock: 50,
        trackStock: true,
      },
    });

    // Execute worked checkout
    const checkoutRes = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        customerId: vipCustomer.id,
        orderType: 'walk_in',
        lines: [
          { productId: tea.id, qty: 2, unitPrice: 135.0, lineDiscount: 0 },
          { productId: detergent.id, qty: 1, unitPrice: 170.0, lineDiscount: 10.0 },
        ],
        billDiscount: { type: 'amount', value: 50.0 },
        charges: 0,
        payments: [
          { method: 'cash', amount: 200.0, cashReceived: 500.0 },
          { method: 'mbob', amount: 176.43, journalNo: '48211904' },
        ],
        expectedTotal: 376.43,
      });

    expect(checkoutRes.status).toBe(201);
    const sale = checkoutRes.body.data;

    // Verify AC-29 worked example numbers
    expect(sale.subtotal).toBe(440.0);
    expect(sale.discountTotal).toBe(81.5);
    expect(sale.customerTypePct).toBe(5);
    expect(sale.customerTypeAmt).toBe(21.5);
    expect(sale.billDiscount).toEqual({ type: 'amount', value: 50.0, amount: 50.0 });
    expect(sale.taxableAmount).toBe(358.5);
    expect(sale.taxAmount).toBe(17.93);
    expect(sale.total).toBe(376.43);
    expect(sale.amountInWords).toBe(
      'Three Hundred Seventy-Six Ngultrum and Forty-Three Chhertum only'
    );
    expect(sale.invoiceNo).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(sale.paymentSummary).toBe('Split');

    // Payments change check
    const cashPay = sale.payments.find((p: { method: string }) => p.method === 'cash');
    expect(cashPay.cashReceived).toBe(500.0);
    expect(cashPay.changeGiven).toBe(300.0);

    const mbobPay = sale.payments.find((p: { method: string }) => p.method === 'mbob');
    expect(mbobPay.journalNo).toBe('48211904');

    // Check stock was decremented
    const teaAfter = await prisma.product.findUnique({ where: { id: tea.id } });
    expect(teaAfter!.stock).toBe(48); // 50 - 2
  });

  it('AC-27: Rejects checkout when payments do not equal grand total (422 PAYMENT_MISMATCH)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const product = await prisma.product.findFirst({
      where: { business: { name: 'Pema Store' }, active: true },
    });

    const res = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: product!.id, qty: 1, unitPrice: Number(product!.sellPrice) }],
        payments: [{ method: 'cash', amount: 10.0 }], // Not equal to product price
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PAYMENT_MISMATCH');
  });

  it('AC-28: Requires transaction ID for digital wallet and rejects cash received < amount', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const product = await prisma.product.findFirst({
      where: { business: { name: 'Pema Store' }, active: true },
    });
    const price = Number(product!.sellPrice);

    // Wallet without journalNo
    const walletRes = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: product!.id, qty: 1, unitPrice: price }],
        payments: [{ method: 'mbob', amount: price }], // Missing journalNo
      });

    expect(walletRes.status).toBe(422);
    expect(walletRes.body.error.code).toBe('PAYMENT_DETAILS_REQUIRED');

    // Cash received < amount
    const cashRes = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: product!.id, qty: 1, unitPrice: price }],
        payments: [{ method: 'cash', amount: price, cashReceived: price - 10 }],
      });

    expect(cashRes.status).toBe(422);
  });

  it('AC-32: Credit requires customer; credit exceeding limit returns warning', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const business = await prisma.business.findFirst({
      where: { name: 'Pema Store' },
      include: { taxRates: true },
    });

    // Create 0% tax item to simplify exact price match
    let taxRate0 = business!.taxRates.find((t) => Number(t.rate) === 0);
    if (!taxRate0) {
      taxRate0 = await prisma.taxRate.create({
        data: {
          businessId: business!.id,
          name: 'Zero Rated',
          rate: 0,
          mode: 'exclusive',
          category: 'zero_rated',
          effectiveDate: new Date('2026-01-01'),
        },
      });
    }

    const product = await prisma.product.create({
      data: {
        businessId: business!.id,
        name: 'Credit Test Item',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        sellPrice: 20.0,
        taxRateId: taxRate0.id,
        stock: 10,
        trackStock: false,
      },
    });

    // 1. Credit without customer -> 422 CREDIT_REQUIRES_CUSTOMER
    const noCustomerRes = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        customerId: null,
        lines: [{ productId: product.id, qty: 1, unitPrice: 20.0 }],
        payments: [{ method: 'credit', amount: 20.0 }],
      });

    expect(noCustomerRes.status).toBe(422);
    expect(noCustomerRes.body.error.code).toBe('CREDIT_REQUIRES_CUSTOMER');

    // 2. Customer with credit limit 50, owes 40, buys item worth 20 on credit -> Warning CREDIT_LIMIT_EXCEEDED
    const customer = await prisma.customer.create({
      data: {
        businessId: business!.id,
        name: 'Credit Test Customer',
        phone: '+975 17888999',
        type: 'credit',
        creditLimit: 50,
        outstandingBalance: 40,
      },
    });

    const creditSaleRes = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        customerId: customer.id,
        orderType: 'walk_in',
        lines: [{ productId: product.id, qty: 1, unitPrice: 20.0 }],
        payments: [{ method: 'credit', amount: 20.0 }],
      });

    expect(creditSaleRes.status).toBe(201);
    expect(creditSaleRes.body.warnings).toContain('CREDIT_LIMIT_EXCEEDED');

    const updatedCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(Number(updatedCustomer!.outstandingBalance)).toBe(40 + 20.0);
  });

  it('AC-34: Fails checkout with 409 INSUFFICIENT_STOCK if stock is less than cart qty', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const business = await prisma.business.findFirst({
      where: { name: 'Pema Store' },
      include: { taxRates: true },
    });

    const lowStockProduct = await prisma.product.create({
      data: {
        businessId: business!.id,
        name: 'Last Unit Item',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        sellPrice: 50.0,
        taxRateId: business!.taxRates[0]!.id,
        stock: 1,
        trackStock: true,
      },
    });

    const res = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: lowStockProduct.id, qty: 2, unitPrice: 50.0 }],
        payments: [{ method: 'cash', amount: 100.0 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('AC-35: Replaying checkout with same Idempotency-Key returns 201 without duplicate sale', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const business = await prisma.business.findFirst({
      where: { name: 'Pema Store' },
      include: { taxRates: true },
    });

    let taxRate0 = business!.taxRates.find((t) => Number(t.rate) === 0);
    if (!taxRate0) {
      taxRate0 = await prisma.taxRate.create({
        data: {
          businessId: business!.id,
          name: 'Zero Tax Idem',
          rate: 0,
          mode: 'exclusive',
          category: 'zero_rated',
          effectiveDate: new Date('2026-01-01'),
        },
      });
    }

    const product = await prisma.product.create({
      data: {
        businessId: business!.id,
        name: 'Idempotency Product',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        sellPrice: 60.0,
        taxRateId: taxRate0.id,
        stock: 10,
        trackStock: false,
      },
    });

    const idempotencyKey = `sale-idem-${Date.now()}`;

    // First attempt
    const res1 = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: product.id, qty: 1, unitPrice: 60.0 }],
        payments: [{ method: 'cash', amount: 60.0 }],
      });

    expect(res1.status).toBe(201);
    const saleId = res1.body.data.id;
    const invoiceNo = res1.body.data.invoiceNo;

    // Retry with same Idempotency-Key
    const res2 = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: product.id, qty: 1, unitPrice: 60.0 }],
        payments: [{ method: 'cash', amount: 60.0 }],
      });

    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBe(saleId);
    expect(res2.body.data.invoiceNo).toBe(invoiceNo);
  });

  it('AC-36: Price changed returns 409 PRICE_CHANGED', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const product = await prisma.product.findFirst({
      where: { business: { name: 'Pema Store' }, active: true },
    });

    const res = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: product!.id, qty: 1, unitPrice: Number(product!.sellPrice) + 10 }],
        payments: [{ method: 'cash', amount: Number(product!.sellPrice) + 10 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
  });

  it('AC-33: Held order lifecycle (hold cart, list, resume and delete)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const payload = {
      orderType: 'dine_in',
      tableNo: '4',
      lines: [{ productId: 'dummy-prod', qty: 3, unitPrice: 100 }],
      billDiscount: { type: 'percent', value: 10 },
      payments: [{ method: 'cash', amount: 270 }],
    };

    // Hold order
    const holdRes = await agent
      .post('/api/v1/held-orders')
      .set('X-CSRF-Token', csrfToken)
      .send({ payload });

    expect(holdRes.status).toBe(201);
    const heldId = holdRes.body.data.id;
    expect(holdRes.body.data.label).toMatch(/^Held \d{2}:\d{2} — /);

    // List held orders
    const listRes = await agent.get('/api/v1/held-orders');
    expect(listRes.status).toBe(200);
    const found = listRes.body.data.find((o: { id: string }) => o.id === heldId);
    expect(found).toBeDefined();

    // Resume order (retrieves payload & deletes order)
    const resumeRes = await agent
      .post(`/api/v1/held-orders/${heldId}/resume`)
      .set('X-CSRF-Token', csrfToken);

    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.payload).toEqual(payload);

    // Order should now be gone from held orders
    const listAfterRes = await agent.get('/api/v1/held-orders');
    const foundAfter = listAfterRes.body.data.find((o: { id: string }) => o.id === heldId);
    expect(foundAfter).toBeUndefined();
  });

  it('AC-39: Voiding a completed sale restocks items, marks payments voided, and rejects double void', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const business = await prisma.business.findFirst({
      where: { name: 'Pema Store' },
      include: { taxRates: true },
    });

    let taxRate0 = business!.taxRates.find((t) => Number(t.rate) === 0);
    if (!taxRate0) {
      taxRate0 = await prisma.taxRate.create({
        data: {
          businessId: business!.id,
          name: 'Zero Tax Void',
          rate: 0,
          mode: 'exclusive',
          category: 'zero_rated',
          effectiveDate: new Date('2026-01-01'),
        },
      });
    }

    const product = await prisma.product.create({
      data: {
        businessId: business!.id,
        name: 'Item to Void',
        barcode: `20${Math.floor(100000000 + Math.random() * 900000000)}`,
        sellPrice: 100.0,
        taxRateId: taxRate0.id,
        stock: 20,
        trackStock: true,
      },
    });

    // Make sale
    const saleRes = await agent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', csrfToken)
      .send({
        orderType: 'walk_in',
        lines: [{ productId: product.id, qty: 5, unitPrice: 100.0 }],
        payments: [{ method: 'cash', amount: 500.0 }],
      });

    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.data.id;

    // Check stock was decremented to 15
    const prodAfterSale = await prisma.product.findUnique({ where: { id: product.id } });
    expect(prodAfterSale!.stock).toBe(15);

    // Void sale
    const voidRes = await agent
      .post(`/api/v1/sales/${saleId}/void`)
      .set('X-CSRF-Token', csrfToken)
      .send({ reason: 'Customer changed mind' });

    expect(voidRes.status).toBe(200);
    expect(voidRes.body.data.status).toBe('voided');
    expect(voidRes.body.data.voided.reason).toBe('Customer changed mind');

    // Check stock was restored to 20
    const prodAfterVoid = await prisma.product.findUnique({ where: { id: product.id } });
    expect(prodAfterVoid!.stock).toBe(20);

    // Check void_restock movement created
    const movement = await prisma.stockMovement.findFirst({
      where: { saleId, type: 'void_restock' },
    });
    expect(movement).toBeDefined();
    expect(movement!.qty).toBe(5);

    // Voiding again returns 409 ALREADY_VOIDED
    const doubleVoidRes = await agent
      .post(`/api/v1/sales/${saleId}/void`)
      .set('X-CSRF-Token', csrfToken)
      .send({ reason: 'Try void again' });

    expect(doubleVoidRes.status).toBe(409);
    expect(doubleVoidRes.body.error.code).toBe('ALREADY_VOIDED');
  });
});
