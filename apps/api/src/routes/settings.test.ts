import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 5: Settings & Business Profile API (AC-52, AC-53, BR-10, BR-11, BR-34)', () => {
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

  it('GET /api/v1/settings/tax-rates returns tax rates for the business', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsAdmin(agent, csrfToken);

    const res = await agent.get('/api/v1/settings/tax-rates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const defaultRate = res.body.data.find((r: { isDefault: boolean }) => r.isDefault);
    expect(defaultRate).toBeDefined();
    expect(defaultRate.rate).toBe(5);
  });

  it('AC-52: PATCH tax-rate rate/mode/category is rejected with 400 (BR-10 immutability)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsAdmin(agent, csrfToken);

    const listRes = await agent.get('/api/v1/settings/tax-rates');
    const stdRate = listRes.body.data.find((r: { name: string }) => r.name.includes('Standard'));
    expect(stdRate).toBeDefined();

    // Trying to PATCH rate from 5 to 7 must be rejected with 400 (AC-52)
    const patchRes = await agent
      .patch(`/api/v1/settings/tax-rates/${stdRate.id}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ rate: 7 });

    expect(patchRes.status).toBe(400);

    // Can create a new rate "GST 7%"
    const createRes = await agent
      .post('/api/v1/settings/tax-rates')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'GST 7%',
        rate: 7,
        mode: 'exclusive',
        category: 'standard',
        effectiveDate: '2026-11-01',
        isDefault: false,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.rate).toBe(7);

    // Can update name of standard rate
    const updateRes = await agent
      .patch(`/api/v1/settings/tax-rates/${stdRate.id}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ name: 'GST Standard 5% Exclusive' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('GST Standard 5% Exclusive');
  });

  it('Customer-type discounts can be read and updated (BR-34)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsAdmin(agent, csrfToken);

    const getRes = await agent.get('/api/v1/settings/customer-discounts');
    expect(getRes.status).toBe(200);
    expect(Array.isArray(getRes.body.data)).toBe(true);

    // Set VIP discount to 5% (BR-34)
    const putRes = await agent
      .put('/api/v1/settings/customer-discounts')
      .set('X-CSRF-Token', csrfToken)
      .send({
        items: [
          { customerType: 'vip', discountPct: 5 },
          { customerType: 'wholesale', discountPct: 10 },
        ],
      });

    expect(putRes.status).toBe(200);

    const vipItem = putRes.body.data.find((d: { customerType: string }) => d.customerType === 'vip');
    expect(vipItem?.discountPct).toBe(5);
  });

  it('AC-53: Business switches gstRegistered to false and audits the change (BR-11)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsAdmin(agent, csrfToken);

    const patchRes = await agent
      .patch('/api/v1/business')
      .set('X-CSRF-Token', csrfToken)
      .send({ gstRegistered: false });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.gstRegistered).toBe(false);

    // Verify audit log row was written
    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    const auditRow = await prisma.auditLog.findFirst({
      where: {
        businessId: pemaBiz!.id,
        action: 'gst_registered_changed',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).toBeDefined();
    expect(auditRow?.detail).toContain('Not Registered');

    // Restore to true
    await agent
      .patch('/api/v1/business')
      .set('X-CSRF-Token', csrfToken)
      .send({ gstRegistered: true });
  });

  it('Business logo upload rejects SVG with 415 and accepts PNG', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsAdmin(agent, csrfToken);

    // Reject SVG
    const svgRes = await agent
      .post('/api/v1/business/logo')
      .set('X-CSRF-Token', csrfToken)
      .attach('file', Buffer.from('<svg></svg>'), 'logo.svg');

    expect(svgRes.status).toBe(415);

    // Accept valid 1x1 PNG
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const pngRes = await agent
      .post('/api/v1/business/logo')
      .set('X-CSRF-Token', csrfToken)
      .attach('file', png1x1, 'logo.png');

    expect(pngRes.status).toBe(200);
    expect(pngRes.body.data.logoUrl).toMatch(/\.webp$/);

    // Delete logo
    const delRes = await agent.delete('/api/v1/business/logo').set('X-CSRF-Token', csrfToken);
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.logoUrl).toBeNull();
  });
});
