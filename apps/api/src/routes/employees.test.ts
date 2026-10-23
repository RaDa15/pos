import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 3: Employees API (AC-12, AC-13, AC-06, BR-02, BR-07)', () => {
  const app = createApp();

  beforeEach(() => {
    resetRateLimits();
  });

  async function loginAsAdmin(agent: ReturnType<typeof request.agent>, csrfToken: string, companyName = 'Pema Store') {
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: companyName, password: 'demo_password_1234' });

    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'admin', password: 'demo_password_1234' });
  }

  it('GET /api/v1/employees lists employees for the business', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsAdmin(agent, csrfToken);

    const res = await agent.get('/api/v1/employees');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const usernames = res.body.data.map((e: { username: string }) => e.username);
    expect(usernames).toContain('admin');
    expect(usernames).toContain('cashier1');
  });

  it('AC-12: Adding employee with duplicate username (case-insensitive) returns 409 USERNAME_TAKEN', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsAdmin(agent, csrfToken);

    // cashier1 exists in Pema Store; try adding Cashier1
    const res = await agent
      .post('/api/v1/employees')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'New Cashier',
        username: 'Cashier1',
        password: 'Password999!',
        role: 'cashier',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('AC-13: Last active Admin cannot be disabled or have their role changed (409 LAST_ADMIN)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsAdmin(agent, csrfToken);

    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    const adminEmp = await prisma.employee.findUnique({
      where: {
        businessId_usernameKey: {
          businessId: pemaBiz!.id,
          usernameKey: 'admin',
        },
      },
    });

    // Attempt 1: Demote role of the only active Admin
    const roleChangeRes = await agent
      .patch(`/api/v1/employees/${adminEmp!.id}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ role: 'manager' });

    expect(roleChangeRes.status).toBe(409);
    expect(roleChangeRes.body.error.code).toBe('LAST_ADMIN');

    // Attempt 2: Disable the only active Admin
    const disableRes = await agent
      .patch(`/api/v1/employees/${adminEmp!.id}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ active: false });

    expect(disableRes.status).toBe(409);
    expect(disableRes.body.error.code).toBe('LAST_ADMIN');
  });

  it('AC-06 & BR-07: Plan limit blocks adding non-admin employees on Starter plan', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    // Create a new business on Starter plan
    const uniqueName = `Starter Bakery ${Date.now()}`;
    const regRes = await agent
      .post('/api/v1/register')
      .set('X-CSRF-Token', csrfToken)
      .send({
        business: {
          name: uniqueName,
          type: 'grocery',
          ownerName: 'Bakery Owner',
          phone: '+975 17111222',
          email: `starter.${Date.now()}@bakery.bt`,
        },
        password: 'BakeryPassword123!',
        plan: 'starter',
      });
    expect(regRes.status).toBe(201);

    // Sign in as Admin of Starter Bakery
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: uniqueName, password: 'BakeryPassword123!' });
    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'admin', password: 'BakeryPassword123!' });

    // Add 1st active non-admin employee (Starter allows 1) -> should succeed
    const emp1 = await agent
      .post('/api/v1/employees')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'First Cashier',
        username: 'startercashier1',
        password: 'Password999!',
        role: 'cashier',
      });
    expect(emp1.status).toBe(201);

    // Add 2nd active non-admin employee -> must return 403 PLAN_LIMIT
    const emp2 = await agent
      .post('/api/v1/employees')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Second Cashier',
        username: 'startercashier2',
        password: 'Password999!',
        role: 'cashier',
      });
    expect(emp2.status).toBe(403);
    expect(emp2.body.error.code).toBe('PLAN_LIMIT');
    expect(emp2.body.error.message).toContain('allows up to 1');
  });

  it('Admin can reset an employee password to temporary (sets mustChangePassword)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsAdmin(agent, csrfToken);

    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    const cashier = await prisma.employee.findUnique({
      where: {
        businessId_usernameKey: {
          businessId: pemaBiz!.id,
          usernameKey: 'cashier1',
        },
      },
    });

    const resetRes = await agent
      .post(`/api/v1/employees/${cashier!.id}/reset-password`)
      .set('X-CSRF-Token', csrfToken)
      .send({ temporaryPassword: 'TemporaryPass123!' });

    expect(resetRes.status).toBe(200);

    const updated = await prisma.employee.findUnique({ where: { id: cashier!.id } });
    expect(updated?.mustChangePassword).toBe(true);

    // Clean up: restore cashier1
    await prisma.employee.update({
      where: { id: cashier!.id },
      data: { passwordHash: cashier!.passwordHash, mustChangePassword: false },
    });
  });
});
