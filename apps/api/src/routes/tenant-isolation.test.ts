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
});
