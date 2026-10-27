import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 3: Tenant Isolation Test Harness (AC-58, AC-59, AC-60)', () => {
  const app = createApp();

  beforeEach(() => {
    resetRateLimits();
  });

  async function loginAsCompanyAdmin(agent: ReturnType<typeof request.agent>, csrfToken: string, companyName: string) {
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: companyName, password: 'demo_password_1234' });

    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'admin', password: 'demo_password_1234' });
  }

  it('AC-58: Calling GET /employees as Grocery A never returns Grocery B employees', async () => {
    // Grocery A: Pema Store
    const agentA = request.agent(app);
    const csrfResA = await agentA.get('/api/v1/auth/csrf');
    await loginAsCompanyAdmin(agentA, csrfResA.body.data.token, 'Pema Store');

    const resA = await agentA.get('/api/v1/employees');
    expect(resA.status).toBe(200);

    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    const norbuBiz = await prisma.business.findFirst({ where: { name: 'Norbu General Store' } });

    // Verify all returned employees belong to Pema Store and none to Norbu
    const returnedEmployeeIds = resA.body.data.map((e: { id: string }) => e.id);
    const norbuEmployees = await prisma.employee.findMany({ where: { businessId: norbuBiz!.id } });
    const norbuEmployeeIds = norbuEmployees.map((e) => e.id);

    for (const norbuId of norbuEmployeeIds) {
      expect(returnedEmployeeIds).not.toContain(norbuId);
    }

    // Every employee in resA must belong to Pema Store
    const pemaEmployees = await prisma.employee.findMany({ where: { businessId: pemaBiz!.id } });
    const pemaEmployeeIds = new Set(pemaEmployees.map((e) => e.id));

    for (const emp of resA.body.data) {
      expect(pemaEmployeeIds.has(emp.id)).toBe(true);
    }
  });

  it('AC-59: Updating or resetting Grocery B record by ID as Grocery A returns 404 NOT_FOUND (never 403)', async () => {
    const agentA = request.agent(app);
    const csrfResA = await agentA.get('/api/v1/auth/csrf');
    const csrfTokenA = csrfResA.body.data.token;
    await loginAsCompanyAdmin(agentA, csrfTokenA, 'Pema Store');

    // Get an employee belonging to Norbu General Store
    const norbuBiz = await prisma.business.findFirst({ where: { name: 'Norbu General Store' } });
    const norbuCashier = await prisma.employee.findFirst({
      where: { businessId: norbuBiz!.id, usernameKey: 'cashier1' },
    });
    expect(norbuCashier).not.toBeNull();

    // Pema Store Admin attempts to PATCH Norbu Cashier -> 404 NOT_FOUND
    const patchRes = await agentA
      .patch(`/api/v1/employees/${norbuCashier!.id}`)
      .set('X-CSRF-Token', csrfTokenA)
      .send({ name: 'Tampered Name' });

    expect(patchRes.status).toBe(404);
    expect(patchRes.body.error.code).toBe('NOT_FOUND');

    // Pema Store Admin attempts to reset Norbu Cashier password -> 404 NOT_FOUND
    const resetRes = await agentA
      .post(`/api/v1/employees/${norbuCashier!.id}/reset-password`)
      .set('X-CSRF-Token', csrfTokenA)
      .send({ temporaryPassword: 'HackedPassword123!' });

    expect(resetRes.status).toBe(404);
    expect(resetRes.body.error.code).toBe('NOT_FOUND');
  });

  it('AC-60: Injecting businessId into request body is rejected with 400 VALIDATION_ERROR by .strict() schemas', async () => {
    const agentA = request.agent(app);
    const csrfResA = await agentA.get('/api/v1/auth/csrf');
    const csrfTokenA = csrfResA.body.data.token;
    await loginAsCompanyAdmin(agentA, csrfTokenA, 'Pema Store');

    const norbuBiz = await prisma.business.findFirst({ where: { name: 'Norbu General Store' } });

    // Attempt to inject businessId into employee creation
    const res = await agentA
      .post('/api/v1/employees')
      .set('X-CSRF-Token', csrfTokenA)
      .send({
        name: 'Injected Employee',
        username: 'injected_emp1',
        password: 'Password999!',
        role: 'cashier',
        businessId: norbuBiz!.id, // Forbidden field
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    // Verify employee was NOT created in Norbu's business
    const injected = await prisma.employee.findFirst({
      where: { usernameKey: 'injected_emp1' },
    });
    expect(injected).toBeNull();
  });

  it('Tenant Isolation for Purchases: Pema Store cannot list, view, or inject into Norbu purchases', async () => {
    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    const norbuBiz = await prisma.business.findFirst({ where: { name: 'Norbu General Store' } });
    const norbuAdmin = await prisma.employee.findFirst({
      where: { businessId: norbuBiz!.id, role: 'admin' },
    });
    const norbuSupplier = await prisma.supplier.findFirst({
      where: { businessId: norbuBiz!.id },
    });
    const norbuProduct = await prisma.product.findFirst({
      where: { businessId: norbuBiz!.id },
    });

    // Create a purchase for Norbu General Store
    const norbuPurchase = await prisma.purchase.create({
      data: {
        businessId: norbuBiz!.id,
        purchaseNo: 'PUR-2026-99999',
        supplierId: norbuSupplier!.id,
        purchaseDate: new Date('2026-10-20'),
        total: 1000,
        amountPaid: 1000,
        createdBy: norbuAdmin!.id,
        items: {
          create: {
            businessId: norbuBiz!.id,
            productId: norbuProduct!.id,
            qty: 10,
            unitCost: 100,
            lineTotal: 1000,
          },
        },
      },
    });

    const agentA = request.agent(app);
    const csrfResA = await agentA.get('/api/v1/auth/csrf');
    const csrfTokenA = csrfResA.body.data.token;
    await loginAsCompanyAdmin(agentA, csrfTokenA, 'Pema Store');

    // 1. GET /purchases as Pema Store does NOT contain Norbu purchase
    const listRes = await agentA.get('/api/v1/purchases');
    expect(listRes.status).toBe(200);
    const purchaseIds = listRes.body.data.map((p: { id: string }) => p.id);
    expect(purchaseIds).not.toContain(norbuPurchase.id);

    // 2. GET /purchases/:id for Norbu purchase as Pema Store returns 404 NOT_FOUND
    const detailRes = await agentA.get(`/api/v1/purchases/${norbuPurchase.id}`);
    expect(detailRes.status).toBe(404);
    expect(detailRes.body.error.code).toBe('NOT_FOUND');

    // 3. Injecting businessId into POST /purchases is rejected with 400 VALIDATION_ERROR
    const pemaSupplier = await prisma.supplier.findFirst({ where: { businessId: pemaBiz!.id } });
    const pemaProduct = await prisma.product.findFirst({ where: { businessId: pemaBiz!.id } });
    const injectRes = await agentA
      .post('/api/v1/purchases')
      .set('X-CSRF-Token', csrfTokenA)
      .send({
        businessId: norbuBiz!.id,
        supplierId: pemaSupplier!.id,
        purchaseDate: '2026-10-21',
        amountPaid: 0,
        items: [{ productId: pemaProduct!.id, qty: 1, unitCost: 10 }],
      });
    expect(injectRes.status).toBe(400);
    expect(injectRes.body.error.code).toBe('VALIDATION_ERROR');

    // Clean up test purchase
    await prisma.purchaseItem.deleteMany({ where: { purchaseId: norbuPurchase.id } });
    await prisma.purchase.delete({ where: { id: norbuPurchase.id } });
  });
});
