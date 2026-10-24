import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import { computeTotp, encryptTotpSecret, generateTotpSecret } from '../lib/totp.js';
import { PlanCode, SubscriptionStatus } from '@prisma/client';

describe('Phase 11: Subscription, Plan Limits & Platform Admin Integration Tests', () => {
  const app = createApp();

  // Helper to create authenticated agent for an employee
  async function createAuthenticatedAgent(businessName: string, username: string) {
    const agent = request.agent(app);

    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    const compRes = await agent
      .post('/api/v1/auth/company-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ identifier: businessName, password: env.SEED_DEMO_PASSWORD });

    expect(compRes.status).toBe(200);

    const empRes = await agent
      .post('/api/v1/auth/employee-login')
      .set('X-CSRF-Token', csrfToken)
      .send({ username, password: env.SEED_DEMO_PASSWORD });

    expect(empRes.status).toBe(200);

    return { agent, csrfToken, employee: empRes.body.data.employee };
  }

  // Helper to create authenticated platform admin agent
  async function createPlatformAdminAgent() {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    return { agent, csrfToken };
  }

  let groceryBiz: Awaited<ReturnType<typeof prisma.business.findUniqueOrThrow>>;
  let adminAgent: ReturnType<typeof request.agent>;
  let adminCsrf: string;

  beforeAll(async () => {
    groceryBiz = await prisma.business.findFirstOrThrow({
      where: { name: 'Pema Store' },
      include: {
        subscription: true,
        employees: true,
      },
    });

    const adminSession = await createAuthenticatedAgent('Pema Store', 'admin');
    adminAgent = adminSession.agent;
    adminCsrf = adminSession.csrfToken;
  });

  // ==========================================================================
  // AC-04: Expired subscription blocks operational routes
  // ==========================================================================
  describe('AC-04: Expired subscription behavior', () => {
    it('Cashier signs in when expires_at yesterday; POS sale rejected with 403 SUBSCRIPTION_INACTIVE; Admin can access Dashboard, Subscription, Settings', async () => {
      // 1. Temporarily expire subscription
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      await prisma.subscription.update({
        where: { businessId: groceryBiz.id },
        data: { expiresAt: yesterday },
      });

      // 2. Cashier signs in
      const cashierSession = await createAuthenticatedAgent('Pema Store', 'cashier1');
      const cashierAgent = cashierSession.agent;

      // 3. POST /sales is called by Cashier -> returns 403 SUBSCRIPTION_INACTIVE
      const saleRes = await cashierAgent
        .post('/api/v1/sales')
        .set('X-CSRF-Token', cashierSession.csrfToken)
        .send({
          items: [],
          payments: [],
          orderType: 'walk_in',
        });

      expect(saleRes.status).toBe(403);
      expect(saleRes.body.error.code).toBe('SUBSCRIPTION_INACTIVE');

      // 4. Admin can still open Dashboard, Subscription and Settings
      const dashRes = await adminAgent.get('/api/v1/dashboard');
      expect(dashRes.status).toBe(200);

      const subRes = await adminAgent.get('/api/v1/subscription');
      expect(subRes.status).toBe(200);
      expect(subRes.body.data.effectiveStatus).toBe('expired');

      const settingsRes = await adminAgent.get('/api/v1/settings/tax-rates');
      expect(settingsRes.status).toBe(200);
    });
  });

  // ==========================================================================
  // AC-05: Offline payment submission & Platform Admin verification
  // ==========================================================================
  describe('AC-05: Subscription payment submission and verification', () => {
    it('Admin submits mBoB payment; Platform Admin verifies it; expires_at extended by 30 days', async () => {
      // Setup subscription expiring in 5 days
      const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 3600 * 1000);
      await prisma.subscription.update({
        where: { businessId: groceryBiz.id },
        data: {
          status: SubscriptionStatus.active,
          expiresAt: fiveDaysFromNow,
          plan: PlanCode.professional,
        },
      });

      // 1. Admin submits an mBoB payment
      const paymentRes = await adminAgent
        .post('/api/v1/subscription/payment')
        .set('X-CSRF-Token', adminCsrf)
        .send({
          method: 'mbob',
          reference: 'TXN-MBOB-998877',
          paidOn: new Date().toISOString().slice(0, 10),
          amount: 2200,
          plan: 'professional',
        });

      expect(paymentRes.status).toBe(201);
      const paymentId = paymentRes.body.data.id;
      expect(paymentRes.body.data.status).toBe('pending');

      // 2. Platform Admin signs in
      const platformUser = await prisma.platformAdmin.findUniqueOrThrow({
        where: { email: env.PLATFORM_ADMIN_EMAIL },
      });
      // Temporarily disable TOTP for this test step if needed
      await prisma.platformAdmin.update({
        where: { id: platformUser.id },
        data: { totpEnabled: false },
      });

      const { agent: platAgent, csrfToken: platCsrf } = await createPlatformAdminAgent();
      const loginRes = await platAgent
        .post('/api/v1/platform/auth/login')
        .set('X-CSRF-Token', platCsrf)
        .send({
          email: env.PLATFORM_ADMIN_EMAIL,
          password: env.PLATFORM_ADMIN_INITIAL_PASSWORD,
        });

      expect(loginRes.status).toBe(200);

      // Verify payment appears in pending queue
      const queueRes = await platAgent.get('/api/v1/platform/payments?status=pending');
      expect(queueRes.status).toBe(200);
      const foundInQueue = queueRes.body.data.some((p: { id: string }) => p.id === paymentId);
      expect(foundInQueue).toBe(true);

      // 3. Platform Admin verifies payment
      const verifyRes = await platAgent
        .post(`/api/v1/platform/payments/${paymentId}/verify`)
        .set('X-CSRF-Token', platCsrf)
        .send({});

      expect(verifyRes.status).toBe(200);

      // 4. Assert new expires_at = old expires_at + 30 days
      const updatedSub = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: groceryBiz.id },
      });

      expect(updatedSub.status).toBe('active');
      const expectedExpiryMs = fiveDaysFromNow.getTime() + 30 * 24 * 3600 * 1000;
      // Should match within a few seconds
      expect(Math.abs(updatedSub.expiresAt.getTime() - expectedExpiryMs)).toBeLessThan(5000);

      // 5. Verify subscription history has payment_submitted and payment_verified
      const history = await prisma.subscriptionEvent.findMany({
        where: { businessId: groceryBiz.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const eventTypes = history.map((h) => h.event);
      expect(eventTypes).toContain('payment_submitted');
      expect(eventTypes).toContain('payment_verified');
    });
  });

  // ==========================================================================
  // AC-06: Plan limits on active non-admin employees and feature gating
  // ==========================================================================
  describe('AC-06: Starter plan employee limit & feature gating', () => {
    it('Starter allows 1 active non-admin; adding second is rejected; GST report returns 403 PLAN_LIMIT', async () => {
      // 1. Switch business to Starter
      await prisma.subscription.update({
        where: { businessId: groceryBiz.id },
        data: {
          plan: PlanCode.starter,
          status: SubscriptionStatus.active,
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        },
      });

      // Ensure grocery has exactly 1 active non-admin employee
      const nonAdmins = await prisma.employee.findMany({
        where: { businessId: groceryBiz.id, role: { not: 'admin' } },
      });

      // Keep only first active, disable the rest
      for (let i = 0; i < nonAdmins.length; i++) {
        await prisma.employee.update({
          where: { id: nonAdmins[i]!.id },
          data: { active: i === 0 },
        });
      }

      // 2. Admin attempts to add another active non-admin employee
      const addEmpRes = await adminAgent
        .post('/api/v1/employees')
        .set('X-CSRF-Token', adminCsrf)
        .send({
          name: 'Extra Cashier',
          username: 'extracashier1',
          password: 'Password123!',
          role: 'cashier',
        });

      expect(addEmpRes.status).toBe(403);
      expect(addEmpRes.body.error.code).toBe('PLAN_LIMIT');

      // 3. Accountant attempts to call GET /reports/gst on Starter plan -> returns 403 PLAN_LIMIT
      // Enable accountant temporarily to test accountant login
      const accountant = nonAdmins.find((e) => e.role === 'accountant')!;
      await prisma.employee.update({
        where: { id: accountant.id },
        data: { active: true },
      });

      const accSession = await createAuthenticatedAgent('Pema Store', accountant.username);
      const gstRes = await accSession.agent.get('/api/v1/reports/gst');
      expect(gstRes.status).toBe(403);
      expect(gstRes.body.error.code).toBe('PLAN_LIMIT');
    });
  });

  // ==========================================================================
  // AC-07: Change plan limit check (downgrade prevention)
  // ==========================================================================
  describe('AC-07: Downgrade prevention when exceeding target limits', () => {
    it('Professional business with 4 active non-Admin employees cannot downgrade to Starter', async () => {
      // 1. Set business to Professional plan
      await prisma.subscription.update({
        where: { businessId: groceryBiz.id },
        data: { plan: PlanCode.professional },
      });

      // 2. Activate at least 4 non-admin employees
      const nonAdmins = await prisma.employee.findMany({
        where: { businessId: groceryBiz.id, role: { not: 'admin' } },
        take: 4,
      });

      for (const emp of nonAdmins) {
        await prisma.employee.update({
          where: { id: emp.id },
          data: { active: true },
        });
      }

      const activeCount = await prisma.employee.count({
        where: { businessId: groceryBiz.id, active: true, role: { not: 'admin' } },
      });
      expect(activeCount).toBeGreaterThanOrEqual(4);

      // 3. Admin attempts to downgrade to Starter (limit is 1)
      const changePlanRes = await adminAgent
        .post('/api/v1/subscription/change-plan')
        .set('X-CSRF-Token', adminCsrf)
        .send({ plan: 'starter' });

      expect(changePlanRes.status).toBe(403);
      expect(changePlanRes.body.error.code).toBe('PLAN_LIMIT');

      // Verify plan is unchanged
      const currentSub = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: groceryBiz.id },
      });
      expect(currentSub.plan).toBe('professional');
    });
  });

  // ==========================================================================
  // AC-56: Audit Log Recording & Immutability
  // ==========================================================================
  describe('AC-56: Audit Log API & Immutability', () => {
    it('Records audit rows for actions and returns them; no route can edit or delete them', async () => {
      // Read audit logs for grocery business
      const auditRes = await adminAgent.get('/api/v1/audit-logs?limit=50');
      expect(auditRes.status).toBe(200);
      expect(Array.isArray(auditRes.body.data)).toBe(true);
      expect(auditRes.body.data.length).toBeGreaterThan(0);

      const firstRow = auditRes.body.data[0];
      expect(firstRow).toHaveProperty('actorName');
      expect(firstRow).toHaveProperty('action');
      expect(firstRow).toHaveProperty('createdAt');

      // Attempt to modify or delete audit log -> 404 since no routes exist
      const patchRes = await adminAgent
        .patch(`/api/v1/audit-logs/${firstRow.id}`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ action: 'tampered' });
      expect(patchRes.status).toBe(404);

      const deleteRes = await adminAgent
        .delete(`/api/v1/audit-logs/${firstRow.id}`)
        .set('X-CSRF-Token', adminCsrf);
      expect(deleteRes.status).toBe(404);
    });
  });

  // ==========================================================================
  // AC-57: Platform Admin with TOTP & Session Isolation
  // ==========================================================================
  describe('AC-57: Platform Admin TOTP, Directory & Route Isolation', () => {
    it('Rejects login without TOTP code when enabled; accepts with valid code; allows extend/suspend/reactivate; blocks GET /sales', async () => {
      // 1. Setup Platform Admin with TOTP enabled
      const platformAdmin = await prisma.platformAdmin.findUniqueOrThrow({
        where: { email: env.PLATFORM_ADMIN_EMAIL },
      });

      const { secret } = generateTotpSecret(platformAdmin.email);
      await prisma.platformAdmin.update({
        where: { id: platformAdmin.id },
        data: {
          totpSecretEnc: encryptTotpSecret(secret),
          totpEnabled: true,
        },
      });

      const { agent: platAgent, csrfToken: platCsrf } = await createPlatformAdminAgent();

      // 2. Sign in without a code -> returns 401 INVALID_CREDENTIALS
      const noCodeRes = await platAgent
        .post('/api/v1/platform/auth/login')
        .set('X-CSRF-Token', platCsrf)
        .send({
          email: env.PLATFORM_ADMIN_EMAIL,
          password: env.PLATFORM_ADMIN_INITIAL_PASSWORD,
        });

      expect(noCodeRes.status).toBe(401);
      expect(noCodeRes.body.error.code).toBe('INVALID_CREDENTIALS');

      // 3. Sign in with valid 6-digit TOTP code
      const currentStep = Math.floor(Date.now() / 30000);
      const validCode = computeTotp(secret, currentStep);

      const withCodeRes = await platAgent
        .post('/api/v1/platform/auth/login')
        .set('X-CSRF-Token', platCsrf)
        .send({
          email: env.PLATFORM_ADMIN_EMAIL,
          password: env.PLATFORM_ADMIN_INITIAL_PASSWORD,
          code: validCode,
        });

      expect(withCodeRes.status).toBe(200);
      expect(withCodeRes.body.admin.email).toBe(env.PLATFORM_ADMIN_EMAIL);

      // 4. Open businesses directory
      const bizListRes = await platAgent.get('/api/v1/platform/businesses');
      expect(bizListRes.status).toBe(200);
      expect(Array.isArray(bizListRes.body.data)).toBe(true);

      const pemaStore = bizListRes.body.data.find(
        (b: { name: string }) => b.name === 'Pema Store'
      );
      expect(pemaStore).toBeDefined();
      expect(pemaStore).toHaveProperty('plan');
      expect(pemaStore).toHaveProperty('effectiveStatus');
      expect(pemaStore).toHaveProperty('activeEmployeeCount');

      // 5. Extend 14 days
      const extendRes = await platAgent
        .post(`/api/v1/platform/businesses/${groceryBiz.id}/extend`)
        .set('X-CSRF-Token', platCsrf)
        .send({});
      expect(extendRes.status).toBe(200);

      // 6. Suspend business
      const suspendRes = await platAgent
        .post(`/api/v1/platform/businesses/${groceryBiz.id}/suspend`)
        .set('X-CSRF-Token', platCsrf)
        .send({});
      expect(suspendRes.status).toBe(200);

      // 7. Reactivate business
      const reactivateRes = await platAgent
        .post(`/api/v1/platform/businesses/${groceryBiz.id}/reactivate`)
        .set('X-CSRF-Token', platCsrf)
        .send({});
      expect(reactivateRes.status).toBe(200);

      // 8. Session isolation: platform session calling GET /sales returns 401
      const salesRes = await platAgent.get('/api/v1/sales');
      expect(salesRes.status).toBe(401);
      expect(salesRes.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  afterAll(async () => {
    if (groceryBiz) {
      await prisma.subscription.update({
        where: { businessId: groceryBiz.id },
        data: {
          plan: PlanCode.professional,
          status: SubscriptionStatus.active,
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        },
      });

      await prisma.employee.updateMany({
        where: { businessId: groceryBiz.id },
        data: { active: true },
      });
    }
  });
});
