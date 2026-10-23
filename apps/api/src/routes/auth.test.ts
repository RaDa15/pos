import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 3: Auth API (AC-08, AC-09, AC-10, AC-11, AC-14, AC-63)', () => {
  const app = createApp();

  beforeEach(() => {
    resetRateLimits();
  });

  it('AC-08: Two-step login (Company + Employee) sets device & session cookies and audits Login', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    // Step 1: Company Login (case-insensitive "pema store")
    const compRes = await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({
        identifier: 'pema store',
        password: 'demo_password_1234',
        rememberDevice: false,
      });

    expect(compRes.status).toBe(200);
    expect(compRes.body.data.business.name).toBe('Pema Store');
    expect(compRes.body.data.subscriptionBlocked).toBe(false);

    // Step 2: Employee Login
    const empRes = await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({
        username: 'cashier1',
        password: 'demo_password_1234',
      });

    expect(empRes.status).toBe(200);
    expect(empRes.body.data.employee.username).toBe('cashier1');
    expect(empRes.body.data.employee.role).toBe('cashier');
    expect(empRes.body.data.dashboardLens).toBe('sales');
    expect(empRes.body.data.permissions).toContain('pos.sell');

    // GET /auth/me returns the signed-in session
    const meRes = await agent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.employee.username).toBe('cashier1');

    // Audit log should contain Login
    const audit = await prisma.auditLog.findFirst({
      where: {
        actorName: empRes.body.data.employee.name,
        action: 'Login',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('AC-09: 5 failed login attempts lock account for 15 minutes with 423 ACCOUNT_LOCKED', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    // First do company login
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({
        identifier: 'Pema Store',
        password: 'demo_password_1234',
      });

    // Reset failed count and lock on cashier1 for clean test
    await prisma.employee.updateMany({
      where: { usernameKey: 'cashier1' },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    // 5 failed password attempts
    for (let i = 1; i <= 5; i++) {
      const failRes = await agent
        .post('/api/v1/auth/employee-login')
        .set('X-CSRF-Token', csrfToken)
        .send({
          username: 'cashier1',
          password: 'WrongPassword999!',
        });
      expect(failRes.status).toBe(401);
      expect(failRes.body.error.code).toBe('INVALID_CREDENTIALS');
    }

    // 6th attempt (even with right password) must return 423 ACCOUNT_LOCKED
    const lockedRes = await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({
        username: 'cashier1',
        password: 'demo_password_1234',
      });

    expect(lockedRes.status).toBe(423);
    expect(lockedRes.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(lockedRes.body.error.message).toContain('Too many attempts');

    // Clean up
    await prisma.employee.updateMany({
      where: { usernameKey: 'cashier1' },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });

  it('AC-10: Remember device cookie persists company details on GET /auth/device', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({
        identifier: 'Pema Store',
        password: 'demo_password_1234',
        rememberDevice: true,
      });

    const devRes = await agent.get('/api/v1/auth/device');
    expect(devRes.status).toBe(200);
    expect(devRes.body.data.business.name).toBe('Pema Store');
  });

  it('AC-11: When Admin disables an employee, their next request returns 401', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    // Login as cashier1
    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: 'Pema Store', password: 'demo_password_1234' });
    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'cashier1', password: 'demo_password_1234' });

    // Confirm session is active
    const me1 = await agent.get('/api/v1/auth/me');
    expect(me1.status).toBe(200);

    // Admin disables cashier1 in DB
    await prisma.employee.updateMany({
      where: { usernameKey: 'cashier1' },
      data: { active: false },
    });

    // Cashier1's next request must return 401 UNAUTHENTICATED
    const me2 = await agent.get('/api/v1/auth/me');
    expect(me2.status).toBe(401);
    expect(me2.body.error.code).toBe('UNAUTHENTICATED');

    // Restore cashier1
    await prisma.employee.updateMany({
      where: { usernameKey: 'cashier1' },
      data: { active: true },
    });
  });

  it('AC-14: Forced password change blocks other endpoints until new password is set', async () => {
    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    expect(pemaBiz).not.toBeNull();

    const originalEmp = await prisma.employee.findUnique({
      where: {
        businessId_usernameKey: {
          businessId: pemaBiz!.id,
          usernameKey: 'cashier1',
        },
      },
    });
    expect(originalEmp).not.toBeNull();

    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    try {
      // Set mustChangePassword = true for Pema Store's cashier1
      await prisma.employee.update({
        where: { id: originalEmp!.id },
        data: { mustChangePassword: true },
      });

      // Sign in
      await agent
        .post('/api/v1/auth/company-login')
        .set('X-CSRF-Token', csrfToken)
        .send({ identifier: 'Pema Store', password: 'demo_password_1234' });
      await agent
        .post('/api/v1/auth/employee-login')
        .set('X-CSRF-Token', csrfToken)
        .send({ username: 'cashier1', password: 'demo_password_1234' });

      // Calling another endpoint like /api/v1/employees should return 403 PASSWORD_CHANGE_REQUIRED
      const blockedRes = await agent.get('/api/v1/employees');
      expect(blockedRes.status).toBe(403);
      expect(blockedRes.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      // Calling POST /api/v1/me/password succeeds
      const changeRes = await agent
        .post('/api/v1/me/password')
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'demo_password_1234',
          newPassword: 'BrandNewPassword123!',
        });
      expect(changeRes.status).toBe(200);

      // Verify mustChangePassword is now false
      const updatedEmp = await prisma.employee.findUnique({
        where: { id: originalEmp!.id },
      });
      expect(updatedEmp?.mustChangePassword).toBe(false);
    } finally {
      // Restore original password and flags
      await prisma.employee.update({
        where: { id: originalEmp!.id },
        data: {
          passwordHash: originalEmp!.passwordHash,
          mustChangePassword: false,
          active: true,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
    }
  });

  it('AC-63: All passwords in DB start with $argon2id$ and no plain-text passwords exist', async () => {
    const employees = await prisma.employee.findMany({ select: { passwordHash: true } });
    const businesses = await prisma.business.findMany({ select: { passwordHash: true } });

    for (const emp of employees) {
      expect(emp.passwordHash).toMatch(/^\$argon2id\$/);
    }
    for (const biz of businesses) {
      expect(biz.passwordHash).toMatch(/^\$argon2id\$/);
    }
  });

  it('POST /auth/logout ends employee session and writes audit log', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: 'Pema Store', password: 'demo_password_1234' });
    await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'cashier1', password: 'demo_password_1234' });

    const logoutRes = await agent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', csrfToken);
    expect(logoutRes.status).toBe(200);

    // Next request to /me is unauthenticated
    const meRes = await agent.get('/api/v1/auth/me');
    expect(meRes.status).toBe(401);
  });
});
