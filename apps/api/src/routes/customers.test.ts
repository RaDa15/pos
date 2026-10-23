import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 6: Customers & Credit API (AC-49, BR-19, BR-20, BR-35)', () => {
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

  it('creates and lists customers with header totals', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken);

    const createRes = await agent
      .post('/api/v1/customers')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Tashi Wangchuk',
        phone: '17123456',
        email: 'tashi@example.bt',
        type: 'regular',
        creditLimit: 5000,
        notes: 'Good customer',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.name).toBe('Tashi Wangchuk');
    expect(createRes.body.data.creditLimit).toBe(5000);
    const customerId = createRes.body.data.id;

    const listRes = await agent.get('/api/v1/customers?search=Tashi');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((c: { id: string }) => c.id === customerId)).toBe(true);
    expect(listRes.body.headerTotals).toBeDefined();

    // Clean up
    await prisma.customer.delete({ where: { id: customerId } });
  });

  it('validates customer types allowed for business type (BR-35)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    // Log in to Test Restaurant (restaurant business type)
    await loginAsAdmin(agent, csrfToken, 'Test Restaurant');

    // Restaurant doesn't allow 'wholesale'
    const res = await agent
      .post('/api/v1/customers')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Invalid Type Customer',
        type: 'wholesale',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('not allowed for restaurant');
  });

  it('AC-49: Customer owes 3,200.00; settlement of 4,000.00 rejected, 1,000.00 succeeds with CR-NNNN', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken, 'Pema Store');

    const business = await prisma.business.findFirstOrThrow({ where: { name: 'Pema Store' } });

    // Create customer with outstandingBalance = 3200
    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        name: 'AC49 Test Customer',
        phone: '17998877',
        type: 'credit',
        creditLimit: 10000,
        outstandingBalance: 3200,
      },
    });

    // Attempt settlement of 4,000.00 -> 422 SETTLEMENT_EXCEEDS_BALANCE
    const rejectRes = await agent
      .post(`/api/v1/customers/${customer.id}/settlements`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        amount: 4000,
        method: 'cash',
      });

    expect(rejectRes.status).toBe(422);
    expect(rejectRes.body.error.code).toBe('SETTLEMENT_EXCEEDS_BALANCE');

    // Valid settlement of 1,000.00 by mPay with Txn ID
    const validRes = await agent
      .post(`/api/v1/customers/${customer.id}/settlements`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({
        amount: 1000,
        method: 'mpay',
        journalNo: 'MP77812345',
        remarks: 'Part payment',
      });

    expect(validRes.status).toBe(201);
    expect(validRes.body.data.payment.receiptNo).toMatch(/^CR-\d{4}$/);
    expect(validRes.body.data.customer.outstandingBalance).toBe(2200);

    // Verify history endpoint
    const historyRes = await agent.get(`/api/v1/customers/${customer.id}/history`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.settlements.length).toBe(1);
    expect(historyRes.body.data.settlements[0].receiptNo).toBe(validRes.body.data.payment.receiptNo);
    expect(historyRes.body.data.settlements[0].amount).toBe(1000);

    // Test idempotency replay
    const replayRes = await agent
      .post(`/api/v1/customers/${customer.id}/settlements`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({
        amount: 1000,
        method: 'mpay',
        journalNo: 'MP77812345',
        remarks: 'Part payment',
      });

    expect(replayRes.status).toBe(201);
    expect(replayRes.body.data.payment.receiptNo).toBe(validRes.body.data.payment.receiptNo);

    // Ensure customer balance was NOT double-decremented
    const custAfter = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(parseFloat(custAfter.outstandingBalance.toString())).toBe(2200);

    // Clean up
    await prisma.payment.deleteMany({ where: { customerId: customer.id } });
    await prisma.idempotencyKey.deleteMany({ where: { key: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });
});
