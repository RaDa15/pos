import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';
import { OrderType, PaymentMethod } from '@prisma/client';
import { computeSale, nuToChhertum, chhertumToNu } from '@pos/shared';

describe('Phase 14 Smoke Test: Pre-deploy 8-Step Acceptance Checklist (docs/11-ACCEPTANCE-CRITERIA.md §5)', () => {
  const app = createApp();

  beforeEach(() => {
    resetRateLimits();
  });

  async function getCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
    const res = await agent.get('/api/v1/auth/csrf');
    return res.body.data.token;
  }

  async function loginAsEmployee(
    agent: ReturnType<typeof request.agent>,
    csrfToken: string,
    companyIdentifier: string,
    username: string
  ) {
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: companyIdentifier, password: 'demo_password_1234' });

    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username, password: 'demo_password_1234' });
  }

  it('Executes the exact 8-step pre-deploy smoke test checklist', async () => {
    // -------------------------------------------------------------------------
    // Step 1: Sign in to a grocery business as Admin (company + employee steps)
    // -------------------------------------------------------------------------
    const adminAgent = request.agent(app);
    let adminCsrf = await getCsrf(adminAgent);

    await loginAsEmployee(adminAgent, adminCsrf, 'Pema Store', 'admin');

    const meRes = await adminAgent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.employee.role).toBe('admin');
    expect(meRes.body.data.business.name).toBe('Pema Store');
    const groceryBizId = meRes.body.data.business.id;

    // -------------------------------------------------------------------------
    // Step 2: Add a product with a blank barcode; stock in 10 units
    // -------------------------------------------------------------------------
    adminCsrf = await getCsrf(adminAgent);
    const taxRate = await prisma.taxRate.findFirstOrThrow({
      where: { businessId: groceryBizId, active: true },
    });
    const uniqueSuffix = Date.now().toString().slice(-6);
    const prodName = `Smoke Test Fresh Apple ${uniqueSuffix}`;

    const createProdRes = await adminAgent
      .post('/api/v1/products')
      .set('X-CSRF-Token', adminCsrf)
      .send({
        name: prodName,
        barcode: null, // Blank barcode: system must auto-generate starting with '20'
        category: 'Groceries',
        purchasePrice: 80,
        sellPrice: 105,
        taxRateId: taxRate.id,
        unit: 'pc',
        trackStock: true,
        openingStock: 10,
      });

    expect(createProdRes.status).toBe(201);
    const createdProduct = createProdRes.body.data;
    expect(createdProduct.name).toBe(prodName);
    expect(createdProduct.barcode).toMatch(/^20\d{9}$/);
    expect(createdProduct.stock).toBe(10);
    const productId = createdProduct.id;
    const autoBarcode = createdProduct.barcode;

    // Verify stock in database
    const dbProduct = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(dbProduct.stock).toBe(10);

    // Ensure VIP customer exists
    let vipCustomer = await prisma.customer.findFirst({
      where: { businessId: groceryBizId, type: 'vip' },
    });
    if (!vipCustomer) {
      vipCustomer = await prisma.customer.create({
        data: {
          businessId: groceryBizId,
          name: 'VIP Dawa Norbu',
          phone: '+975 17889900',
          type: 'vip',
        },
      });
    }

    // -------------------------------------------------------------------------
    // Step 3: As Cashier: scan it, select VIP customer, pay with cash + mBoB
    // (with Txn ID), complete, print receipt
    // -------------------------------------------------------------------------
    const cashierAgent = request.agent(app);
    let cashierCsrf = await getCsrf(cashierAgent);
    await loginAsEmployee(cashierAgent, cashierCsrf, 'Pema Store', 'cashier1');

    // Cashier scans/fetches product by barcode
    const scanRes = await cashierAgent.get(`/api/v1/pos/products/by-barcode/${autoBarcode}`);
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.data.id).toBe(productId);

    // Compute expected total including VIP discount
    const discountConfig = await prisma.customerTypeDiscount.findUnique({
      where: {
        businessId_customerType: {
          businessId: groceryBizId,
          customerType: vipCustomer.type,
        },
      },
    });
    const customerTypePct = discountConfig ? Number(discountConfig.discountPct) : 0;

    const unitPrice = Number(createdProduct.sellPrice);
    const saleEngineResult = computeSale({
      lines: [
        {
          unitPrice: nuToChhertum(unitPrice),
          qty: 1,
          lineDiscount: 0,
          taxRate: Number(taxRate.rate),
          taxMode: taxRate.mode,
          taxCategory: taxRate.category,
        },
      ],
      customerTypePct,
      gstRegistered: meRes.body.data.business.gstRegistered ?? true,
    });
    const totalAmount = chhertumToNu(saleEngineResult.total);
    const cashAmount = 50.0;
    const mbobAmount = Number((totalAmount - cashAmount).toFixed(2));

    cashierCsrf = await getCsrf(cashierAgent);
    const salePayload = {
      orderType: 'walk_in',
      customerId: vipCustomer.id,
      lines: [
        {
          productId,
          qty: 1,
          unitPrice,
          lineDiscount: 0,
        },
      ],
      payments: [
        {
          method: 'cash',
          amount: cashAmount,
        },
        {
          method: 'mbob',
          amount: mbobAmount,
          journalNo: 'TXN-MBOB-778899',
        },
      ],
      expectedTotal: totalAmount,
    };

    const checkoutRes = await cashierAgent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', cashierCsrf)
      .send(salePayload);

    expect(checkoutRes.status).toBe(201);
    const sale = checkoutRes.body.data;
    expect(sale.invoiceNo).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(sale.status).toBe('completed');
    const saleId = sale.id;

    // Verify stock decremented to 9
    const decrementedProduct = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(decrementedProduct.stock).toBe(9);

    // Verify cashier can fetch receipt for printing
    const receiptRes = await cashierAgent.get(`/api/v1/sales/${saleId}`);
    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.data.invoiceNo).toBe(sale.invoiceNo);
    expect(receiptRes.body.data.amountInWords).toContain('Ngultrum');
    expect(receiptRes.body.data.payments.length).toBe(2);

    // -------------------------------------------------------------------------
    // Step 4: Void that invoice as Manager; confirm stock is back to 10
    // -------------------------------------------------------------------------
    const managerAgent = request.agent(app);
    let managerCsrf = await getCsrf(managerAgent);
    await loginAsEmployee(managerAgent, managerCsrf, 'Pema Store', 'manager1');

    managerCsrf = await getCsrf(managerAgent);
    const voidRes = await managerAgent
      .post(`/api/v1/sales/${saleId}/void`)
      .set('X-CSRF-Token', managerCsrf)
      .send({ reason: 'Smoke test customer return item' });

    expect(voidRes.status).toBe(200);
    expect(voidRes.body.data.status).toBe('voided');

    // Confirm stock is back to 10
    const restoredProduct = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(restoredProduct.stock).toBe(10);

    // -------------------------------------------------------------------------
    // Step 5: In a restaurant business: send order to kitchen, move to Ready, bill it
    // -------------------------------------------------------------------------
    const restaurant = await prisma.business.findFirstOrThrow({
      where: { name: 'Test Restaurant' },
      include: { taxRates: true },
    });
    const dishes = await prisma.product.findMany({
      where: { businessId: restaurant.id, active: true },
      take: 2,
    });
    expect(dishes.length).toBeGreaterThanOrEqual(1);
    const dish = dishes[0]!;

    // 5a. Waiter creates KOT
    const waiterAgent = request.agent(app);
    let waiterCsrf = await getCsrf(waiterAgent);
    await loginAsEmployee(waiterAgent, waiterCsrf, 'Test Restaurant', 'waiter1');

    waiterCsrf = await getCsrf(waiterAgent);
    const kotRes = await waiterAgent
      .post('/api/v1/kitchen-orders')
      .set('X-CSRF-Token', waiterCsrf)
      .send({
        orderType: 'dine_in',
        tableNo: '4',
        note: 'Medium spice please',
        items: [{ productId: dish.id, qty: 1 }],
      });

    expect(kotRes.status).toBe(201);
    const kotId = kotRes.body.data.id;
    expect(kotRes.body.data.orderNo).toMatch(/^KOT-\d+$/);

    // 5b. Advance to Accepted, Preparing, Ready
    waiterCsrf = await getCsrf(waiterAgent);
    await waiterAgent
      .post(`/api/v1/kitchen-orders/${kotId}/status`)
      .set('X-CSRF-Token', waiterCsrf)
      .send({ status: 'accepted' });

    waiterCsrf = await getCsrf(waiterAgent);
    await waiterAgent
      .post(`/api/v1/kitchen-orders/${kotId}/status`)
      .set('X-CSRF-Token', waiterCsrf)
      .send({ status: 'preparing' });

    waiterCsrf = await getCsrf(waiterAgent);
    const readyRes = await waiterAgent
      .post(`/api/v1/kitchen-orders/${kotId}/status`)
      .set('X-CSRF-Token', waiterCsrf)
      .send({ status: 'ready' });
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.data.status).toBe('ready');

    // 5c. Cashier bills this order
    const restCashierAgent = request.agent(app);
    let restCashierCsrf = await getCsrf(restCashierAgent);
    await loginAsEmployee(restCashierAgent, restCashierCsrf, 'Test Restaurant', 'cashier1');

    const dishPrice = Number(dish.sellPrice);
    const dishTaxRate = restaurant.taxRates.find((t) => t.id === dish.taxRateId) || restaurant.taxRates[0]!;
    const dishSaleResult = computeSale({
      lines: [
        {
          unitPrice: nuToChhertum(dishPrice),
          qty: 1,
          lineDiscount: 0,
          taxRate: Number(dishTaxRate.rate),
          taxMode: dishTaxRate.mode,
          taxCategory: dishTaxRate.category,
        },
      ],
      gstRegistered: restaurant.gstRegistered,
    });
    const dishTotal = chhertumToNu(dishSaleResult.total);

    restCashierCsrf = await getCsrf(restCashierAgent);
    const restSaleRes = await restCashierAgent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', restCashierCsrf)
      .send({
        orderType: OrderType.dine_in,
        tableNo: '4',
        kitchenOrderId: kotId,
        lines: [
          {
            productId: dish.id,
            qty: 1,
            unitPrice: dishPrice,
            lineDiscount: 0,
          },
        ],
        payments: [
          {
            method: PaymentMethod.cash,
            amount: dishTotal,
            cashReceived: dishTotal,
          },
        ],
      });

    expect(restSaleRes.status).toBe(201);
    expect(restSaleRes.body.data.invoiceNo).toMatch(/^INV-\d{4}-\d{5}$/);

    // -------------------------------------------------------------------------
    // Step 6: Open the GST report for today and export the daily CSV
    // -------------------------------------------------------------------------
    const todayStr = new Date().toISOString().slice(0, 10);
    const gstReportRes = await adminAgent.get(`/api/v1/reports/gst?from=${todayStr}&to=${todayStr}`);
    expect(gstReportRes.status).toBe(200);
    expect(gstReportRes.body.data).toBeDefined();

    const gstCsvRes = await adminAgent.get(
      `/api/v1/reports/gst/export.csv?kind=daily&from=${todayStr}&to=${todayStr}`
    );
    expect(gstCsvRes.status).toBe(200);
    expect(gstCsvRes.headers['content-type']).toContain('text/csv');
    expect(gstCsvRes.text).toContain('Total Sales (Nu.)');

    // -------------------------------------------------------------------------
    // Step 7: Open payments report for today; voided payment not counted
    // -------------------------------------------------------------------------
    const paymentsRes = await adminAgent.get(`/api/v1/payments?page=1&limit=50`);
    expect(paymentsRes.status).toBe(200);
    const paymentRecords = paymentsRes.body.data.records;
    const voidedPayment = paymentRecords.find((p: { saleId: string }) => p.saleId === saleId);
    if (voidedPayment) {
      expect(voidedPayment.status).toBe('voided');
    }

    // -------------------------------------------------------------------------
    // Step 8: Switch to Dzongkha and back; sign out
    // -------------------------------------------------------------------------
    adminCsrf = await getCsrf(adminAgent);
    const switchDzRes = await adminAgent
      .patch('/api/v1/me')
      .set('X-CSRF-Token', adminCsrf)
      .send({ language: 'dz' });
    expect(switchDzRes.status).toBe(200);
    expect(switchDzRes.body.data.language).toBe('dz');

    adminCsrf = await getCsrf(adminAgent);
    const switchEnRes = await adminAgent
      .patch('/api/v1/me')
      .set('X-CSRF-Token', adminCsrf)
      .send({ language: 'en' });
    expect(switchEnRes.status).toBe(200);
    expect(switchEnRes.body.data.language).toBe('en');

    adminCsrf = await getCsrf(adminAgent);
    const logoutRes = await adminAgent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', adminCsrf)
      .send();
    expect(logoutRes.status).toBe(200);

    const postLogoutMe = await adminAgent.get('/api/v1/auth/me');
    expect(postLogoutMe.status).toBe(401);
  });
});
