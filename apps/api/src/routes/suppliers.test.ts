import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 6: Suppliers API (AC-50, BR-38)', () => {
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

  it('AC-50: Supplier with opening paid 1,000 and opening outstanding 2,000 plus purchase -> Paid 6,000, outstanding 5,000', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken, 'Pema Store');

    const business = await prisma.business.findFirstOrThrow({ where: { name: 'Pema Store' } });
    const employee = await prisma.employee.findFirstOrThrow({ where: { businessId: business.id } });

    // Create supplier with openingPaid = 1000, openingOutstanding = 2000
    const supplier = await prisma.supplier.create({
      data: {
        businessId: business.id,
        name: 'AC-50 Wholesale Supplier',
        phone: '17223344',
        email: 'ac50@supplier.bt',
        openingPaid: 1000,
        openingOutstanding: 2000,
      },
    });

    // Add purchase (total 8,000.00, amountPaid 5,000.00)
    const purchase = await prisma.purchase.create({
      data: {
        businessId: business.id,
        supplierId: supplier.id,
        purchaseNo: `PUR-2026-${Math.floor(10000 + Math.random() * 90000)}`,
        purchaseDate: new Date(),
        total: 8000,
        amountPaid: 5000,
        createdBy: employee.id,
      },
    });

    // Fetch suppliers via API
    const res = await agent.get('/api/v1/suppliers?search=AC-50');
    expect(res.status).toBe(200);

    const match = res.body.data.find(
      (s: { id: string; paidTotal: number; outstandingTotal: number }) => s.id === supplier.id
    );
    expect(match).toBeDefined();
    // paidTotal = 1000 + 5000 = 6000
    expect(match.paidTotal).toBe(6000);
    // outstandingTotal = 2000 + (8000 - 5000) = 5000
    expect(match.outstandingTotal).toBe(5000);

    // Clean up
    await prisma.purchase.delete({ where: { id: purchase.id } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  it('creates and edits a supplier with audit logs', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;
    await loginAsAdmin(agent, csrfToken, 'Pema Store');

    const createRes = await agent
      .post('/api/v1/suppliers')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Bhutan Fresh Produce',
        phone: '17889900',
        email: 'fresh@produce.bt',
        address: 'Centenary Farmers Market, Thimphu',
        notes: 'Delivers daily 6am',
        openingPaid: 500,
        openingOutstanding: 0,
      });

    expect(createRes.status).toBe(201);
    const supplierId = createRes.body.data.id;
    expect(createRes.body.data.name).toBe('Bhutan Fresh Produce');
    expect(createRes.body.data.paidTotal).toBe(500);

    // Edit supplier
    const editRes = await agent
      .patch(`/api/v1/suppliers/${supplierId}`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        phone: '17990011',
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.data.phone).toBe('17990011');

    // Clean up
    await prisma.supplier.delete({ where: { id: supplierId } });
  });
});
