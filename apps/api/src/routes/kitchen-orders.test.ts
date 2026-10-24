import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';
import { KitchenStatus, OrderType, PaymentMethod } from '@prisma/client';
import { computeSale, nuToChhertum, chhertumToNu } from '@pos/shared';

describe('Phase 9: Kitchen Orders Integration Tests (AC-37, AC-38)', () => {
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

  it('AC-37: Restaurant A: Waiter sends 2 dishes for table 4; Kitchen moves New → Accepted → Preparing → Ready; Ready → New returns 409 INVALID_TRANSITION; grocery returns 403', async () => {
    // 1. Grocery business gets 403 on kitchen routes
    const groceryAgent = request.agent(app);
    const groceryCsrf = (await groceryAgent.get('/api/v1/auth/csrf')).body.data.token;
    await loginAsEmployee(groceryAgent, groceryCsrf, 'Pema Store', 'admin');

    const groceryGetRes = await groceryAgent.get('/api/v1/kitchen-orders');
    expect(groceryGetRes.status).toBe(403);
    expect(groceryGetRes.body.error?.code).toBe('FORBIDDEN');

    const groceryBillableRes = await groceryAgent.get('/api/v1/kitchen-orders/billable');
    expect(groceryBillableRes.status).toBe(403);

    const groceryPostRes = await groceryAgent.post('/api/v1/kitchen-orders').set('X-CSRF-Token', groceryCsrf).send({
      items: [{ productId: '00000000-0000-0000-0000-000000000000', qty: 1 }],
    });
    expect(groceryPostRes.status).toBe(403);

    // 2. Restaurant A: Waiter signs in
    const restaurant = await prisma.business.findFirstOrThrow({
      where: { name: 'Test Restaurant' },
    });
    const dishes = await prisma.product.findMany({
      where: { businessId: restaurant.id, active: true, trackStock: false },
      orderBy: { name: 'asc' },
      take: 2,
    });
    expect(dishes.length).toBeGreaterThanOrEqual(2);
    const d1 = dishes[0]!;
    const d2 = dishes[1]!;

    const waiterAgent = request.agent(app);
    const waiterCsrf = (await waiterAgent.get('/api/v1/auth/csrf')).body.data.token;
    await loginAsEmployee(waiterAgent, waiterCsrf, 'Test Restaurant', 'waiter1');

    // Waiter creates KOT for table 4 with 2 dishes
    const sendRes = await waiterAgent
      .post('/api/v1/kitchen-orders')
      .set('X-CSRF-Token', waiterCsrf)
      .send({
        orderType: 'dine_in',
        tableNo: '4',
        note: 'Medium spice please',
        items: [
          { productId: d1.id, qty: 2 },
          { productId: d2.id, qty: 1 },
        ],
      });

    expect(sendRes.status).toBe(201);
    const order = sendRes.body.data;
    expect(order.orderNo).toMatch(/^KOT-\d{4,}$/);
    expect(order.status).toBe('new');
    expect(order.tableNo).toBe('4');
    expect(order.orderType).toBe('dine_in');
    expect(order.items.length).toBe(2);

    // 3. Kitchen Staff signs in
    const kitchenAgent = request.agent(app);
    const kitchenCsrf = (await kitchenAgent.get('/api/v1/auth/csrf')).body.data.token;
    await loginAsEmployee(kitchenAgent, kitchenCsrf, 'Test Restaurant', 'kitchenstaff1');

    // Moves New → Accepted
    const acceptRes = await kitchenAgent
      .post(`/api/v1/kitchen-orders/${order.id}/status`)
      .set('X-CSRF-Token', kitchenCsrf)
      .send({ status: 'accepted' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('accepted');

    // Moves Accepted → Preparing
    const prepRes = await kitchenAgent
      .post(`/api/v1/kitchen-orders/${order.id}/status`)
      .set('X-CSRF-Token', kitchenCsrf)
      .send({ status: 'preparing' });
    expect(prepRes.status).toBe(200);
    expect(prepRes.body.data.status).toBe('preparing');

    // Moves Preparing → Ready
    const readyRes = await kitchenAgent
      .post(`/api/v1/kitchen-orders/${order.id}/status`)
      .set('X-CSRF-Token', kitchenCsrf)
      .send({ status: 'ready' });
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.data.status).toBe('ready');

    // Tries Ready → New (backwards transition)
    const invalidRes = await kitchenAgent
      .post(`/api/v1/kitchen-orders/${order.id}/status`)
      .set('X-CSRF-Token', kitchenCsrf)
      .send({ status: 'new' });
    expect(invalidRes.status).toBe(409);
    expect(invalidRes.body.error?.code).toBe('INVALID_TRANSITION');
  });

  it('AC-38: Ready KOT billed by Cashier, completes sale and marks KOT served & billed; second attempt returns 409 NOT_BILLABLE', async () => {
    const restaurant = await prisma.business.findFirstOrThrow({
      where: { name: 'Test Restaurant' },
    });
    const dishes = await prisma.product.findMany({
      where: { businessId: restaurant.id, active: true, trackStock: false },
      include: { taxRate: true },
      orderBy: { name: 'asc' },
      take: 2,
    });
    expect(dishes.length).toBeGreaterThanOrEqual(2);
    const p1 = dishes[0]!;
    const p2 = dishes[1]!;

    // 1. Waiter creates KOT for table 4
    const waiterAgent = request.agent(app);
    const waiterCsrf = (await waiterAgent.get('/api/v1/auth/csrf')).body.data.token;
    await loginAsEmployee(waiterAgent, waiterCsrf, 'Test Restaurant', 'waiter1');

    const kotRes = await waiterAgent
      .post('/api/v1/kitchen-orders')
      .set('X-CSRF-Token', waiterCsrf)
      .send({
        orderType: 'dine_in',
        tableNo: '4',
        items: [
          { productId: p1.id, qty: 1 },
          { productId: p2.id, qty: 2 },
        ],
      });
    const kotId = kotRes.body.data.id;

    // Advance to Ready
    await waiterAgent
      .post(`/api/v1/kitchen-orders/${kotId}/status`)
      .set('X-CSRF-Token', waiterCsrf)
      .send({ status: 'accepted' });
    await waiterAgent
      .post(`/api/v1/kitchen-orders/${kotId}/status`)
      .set('X-CSRF-Token', waiterCsrf)
      .send({ status: 'preparing' });
    await waiterAgent
      .post(`/api/v1/kitchen-orders/${kotId}/status`)
      .set('X-CSRF-Token', waiterCsrf)
      .send({ status: 'ready' });

    // 2. Cashier signs in and checks billable orders
    const cashierAgent = request.agent(app);
    const cashierCsrf = (await cashierAgent.get('/api/v1/auth/csrf')).body.data.token;
    await loginAsEmployee(cashierAgent, cashierCsrf, 'Test Restaurant', 'cashier1');

    const billableRes = await cashierAgent.get('/api/v1/kitchen-orders/billable');
    expect(billableRes.status).toBe(200);
    const found = billableRes.body.data.find((o: { id: string }) => o.id === kotId);
    expect(found).toBeDefined();
    expect(found.tableNo).toBe('4');
    expect(found.items.length).toBe(2);

    // 3. Cashier bills this order through POST /sales
    const lines = [
      { productId: p1.id, qty: 1, unitPrice: Number(p1.sellPrice), lineDiscount: 0 },
      { productId: p2.id, qty: 2, unitPrice: Number(p2.sellPrice), lineDiscount: 0 },
    ];

    const saleResult = computeSale({
      lines: [
        {
          unitPrice: nuToChhertum(Number(p1.sellPrice)),
          qty: 1,
          lineDiscount: 0,
          taxRate: Number(p1.taxRate.rate),
          taxMode: p1.taxRate.mode,
          taxCategory: p1.taxRate.category,
        },
        {
          unitPrice: nuToChhertum(Number(p2.sellPrice)),
          qty: 2,
          lineDiscount: 0,
          taxRate: Number(p2.taxRate.rate),
          taxMode: p2.taxRate.mode,
          taxCategory: p2.taxRate.category,
        },
      ],
      gstRegistered: restaurant.gstRegistered,
    });
    const totalAmount = chhertumToNu(saleResult.total);

    const saleRes = await cashierAgent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', cashierCsrf)
      .send({
        orderType: OrderType.dine_in,
        tableNo: '4',
        kitchenOrderId: kotId,
        lines,
        payments: [
          {
            method: PaymentMethod.cash,
            amount: totalAmount,
            cashReceived: totalAmount,
          },
        ],
      });

    if (saleRes.status !== 201) {
      console.error('AC-38 sale checkout failed:', JSON.stringify(saleRes.body));
    }
    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.data.id;
    expect(saleRes.body.data.invoiceNo).toMatch(/^INV-\d{4}-\d{5}$/);

    // 4. Verify KOT is now served, billed, and linked to sale
    const kotAfter = await prisma.kitchenOrder.findUniqueOrThrow({
      where: { id: kotId },
    });
    expect(kotAfter.status).toBe(KitchenStatus.served);
    expect(kotAfter.billed).toBe(true);
    expect(kotAfter.saleId).toBe(saleId);

    // 5. Verify KOT no longer appears in GET /kitchen-orders/billable
    const billableAfter = await cashierAgent.get('/api/v1/kitchen-orders/billable');
    expect(billableAfter.body.data.some((o: { id: string }) => o.id === kotId)).toBe(false);

    // 6. Second attempt to bill the same KOT returns 409 NOT_BILLABLE
    const secondSaleRes = await cashierAgent
      .post('/api/v1/sales')
      .set('X-CSRF-Token', cashierCsrf)
      .send({
        orderType: OrderType.dine_in,
        tableNo: '4',
        kitchenOrderId: kotId,
        lines,
        payments: [
          {
            method: PaymentMethod.cash,
            amount: totalAmount,
            cashReceived: totalAmount,
          },
        ],
      });

    expect(secondSaleRes.status).toBe(409);
    expect(secondSaleRes.body.error?.code).toBe('NOT_BILLABLE');

    // 7. Attempting to cancel an already billed order returns 409 INVALID_TRANSITION
    const cancelRes = await waiterAgent
      .post(`/api/v1/kitchen-orders/${kotId}/status`)
      .set('X-CSRF-Token', waiterCsrf)
      .send({ status: 'cancelled' });
    expect(cancelRes.status).toBe(409);
    expect(cancelRes.body.error?.code).toBe('INVALID_TRANSITION');
  });
});
