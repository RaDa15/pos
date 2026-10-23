import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 3: Registration API (AC-01, AC-02, AC-03, AC-62)', () => {
  const app = createApp();

  beforeEach(() => {
    resetRateLimits();
  });

  it('AC-62: rejects non-GET request without valid X-CSRF-Token with 403 CSRF_INVALID', async () => {
    const res = await request(app)
      .post('/api/v1/register')
      .send({ business: { name: 'Test' } });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('GET /api/v1/register/name-available checks uniqueness case-insensitively', async () => {
    const res1 = await request(app).get('/api/v1/register/name-available?name=Pema Store');
    expect(res1.status).toBe(200);
    // Pema Store exists in demo seed
    expect(res1.body.available).toBe(false);

    const res2 = await request(app).get('/api/v1/register/name-available?name=  pema store  ');
    expect(res2.status).toBe(200);
    expect(res2.body.available).toBe(false);

    const res3 = await request(app).get('/api/v1/register/name-available?name=Brand New Nonexistent Biz 999');
    expect(res3.status).toBe(200);
    expect(res3.body.available).toBe(true);
  });

  it('AC-01: Registers a new business with BIZ-XXXXX, Admin admin, 3 tax rates, trial 14 days', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    const uniqueName = `Thimphu Grill House ${Date.now()}`;
    const payload = {
      business: {
        name: uniqueName,
        type: 'restaurant',
        ownerName: 'Karma Wangchuk',
        phone: '+975 17123499',
        email: `karma.${Date.now()}@grillhouse.bt`,
        gstNo: 'GST-99887766',
        address: 'Clock Tower Square, Thimphu',
      },
      password: 'SecurePassword123!',
      plan: 'professional',
    };

    const res = await agent
      .post('/api/v1/register')
      .set('X-CSRF-Token', csrfToken)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('businessCode');
    expect(res.body.data.businessCode).toMatch(/^BIZ-[A-Z0-9]{5}$/);
    expect(res.body.data.name).toBe(uniqueName);
    expect(res.body.data).toHaveProperty('trialEndsAt');

    // Verify DB entities created
    const biz = await prisma.business.findUnique({
      where: { businessCode: res.body.data.businessCode },
      include: {
        employees: true,
        taxRates: true,
        subscription: true,
        customerTypeDiscounts: true,
      },
    });

    expect(biz).not.toBeNull();
    expect(biz!.gstRegistered).toBe(true);
    expect(biz!.employees).toHaveLength(1);
    expect(biz!.employees[0]!.username).toBe('admin');
    expect(biz!.employees[0]!.role).toBe('admin');
    expect(biz!.taxRates).toHaveLength(3);

    const standardRate = biz!.taxRates.find((r) => r.isDefault);
    expect(standardRate?.rate.toNumber()).toBe(5.0);
    expect(standardRate?.category).toBe('standard');

    expect(biz!.subscription?.status).toBe('trial');
    expect(biz!.subscription?.plan).toBe('professional');

    const expectedExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).getTime();
    expect(Math.abs(biz!.subscription!.expiresAt.getTime() - expectedExpiry)).toBeLessThan(60000);
  });

  it('AC-02: Returns 409 BUSINESS_NAME_TAKEN for duplicate name ignoring case and whitespace', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    const payload = {
      business: {
        name: '  pema STORE ',
        type: 'grocery',
        ownerName: 'Duplicate Attempt',
        phone: '+975 17000000',
        email: 'dup@store.bt',
      },
      password: 'SecurePassword123!',
      plan: 'starter',
    };

    const res = await agent
      .post('/api/v1/register')
      .set('X-CSRF-Token', csrfToken)
      .send(payload);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BUSINESS_NAME_TAKEN');
  });

  it('AC-03: Registration without TPN creates business with gstRegistered = false', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    const uniqueName = `Simple Village Shop ${Date.now()}`;
    const payload = {
      business: {
        name: uniqueName,
        type: 'grocery',
        ownerName: 'Sonam Dorji',
        phone: '+975 17888888',
        email: `sonam.${Date.now()}@village.bt`,
        gstNo: null,
      },
      password: 'VillagePassword123!',
      plan: 'starter',
    };

    const res = await agent
      .post('/api/v1/register')
      .set('X-CSRF-Token', csrfToken)
      .send(payload);

    expect(res.status).toBe(201);

    const biz = await prisma.business.findUnique({
      where: { businessCode: res.body.data.businessCode },
    });
    expect(biz?.gstRegistered).toBe(false);
    expect(biz?.gstNo).toBeNull();
  });
});
