import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../db/client.js';
import { resetRateLimits } from '../middleware/rateLimit.js';

describe('Phase 5: Products & Catalogue API (AC-17, AC-18, AC-19, AC-20, AC-21, BR-08, BR-09)', () => {
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

  it('AC-17: Product created with blank barcode gets 11 digits starting "20"; duplicate on edit returns 409 BARCODE_TAKEN', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    // Get a valid tax rate
    const taxRate = await prisma.taxRate.findFirst({
      where: { business: { name: 'Pema Store' }, active: true },
    });
    expect(taxRate).toBeDefined();

    // 1. Create product with blank barcode
    const createRes1 = await agent
      .post('/api/v1/products')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Auto Barcode Product A',
        barcode: null,
        category: 'Test Category',
        purchasePrice: 50,
        sellPrice: 75,
        taxRateId: taxRate!.id,
        unit: 'pc',
      });

    expect(createRes1.status).toBe(201);
    const autoBarcode = createRes1.body.data.barcode;
    expect(autoBarcode).toMatch(/^20\d{9}$/); // 11 digits starting with 20

    // 2. Create another product with its own barcode
    const uniqueBBarcode = `20${Math.floor(100000000 + Math.random() * 900000000)}`;
    const createRes2 = await agent
      .post('/api/v1/products')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Product B',
        barcode: uniqueBBarcode,
        category: 'Test Category',
        sellPrice: 90,
        taxRateId: taxRate!.id,
      });

    expect(createRes2.status).toBe(201);
    const prodBId = createRes2.body.data.id;

    // 3. Edit Product B to use Product A's barcode -> 409 BARCODE_TAKEN
    const editRes = await agent
      .patch(`/api/v1/products/${prodBId}`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        barcode: autoBarcode,
      });

    expect(editRes.status).toBe(409);
    expect(editRes.body.error.code).toBe('BARCODE_TAKEN');
  });

  it('AC-18: Restaurant menu item with unit plate has trackStock = false by default (BR-09)', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Test Restaurant', 'admin');

    const taxRate = await prisma.taxRate.findFirst({
      where: { business: { name: 'Test Restaurant' }, active: true },
    });

    const createRes = await agent
      .post('/api/v1/products')
      .set('X-CSRF-Token', csrfToken)
      .send({
        name: 'Ema Datshi',
        category: 'Main Course',
        sellPrice: 150,
        taxRateId: taxRate!.id,
        unit: 'plate',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.trackStock).toBe(false);
    expect(createRes.body.data.stock).toBe(0);

    // Verify no opening stock movement was created for untracked product
    const movement = await prisma.stockMovement.findFirst({
      where: { productId: createRes.body.data.id },
    });
    expect(movement).toBeNull();

    // Clean up test product
    await prisma.product.delete({ where: { id: createRes.body.data.id } });
  });

  it('AC-19: Inventory Officer changes product price -> audit row "Nu. 135.00 → Nu. 140.00" with employee name', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    // Login as Inventory Officer in Pema Store
    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'inventoryofficer1');

    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    const taxRate = await prisma.taxRate.findFirst({
      where: { businessId: pemaBiz!.id, active: true },
    });

    // Create product at 135.00
    const teaBarcode = `20${Math.floor(100000000 + Math.random() * 900000000)}`;
    const prod = await prisma.product.create({
      data: {
        businessId: pemaBiz!.id,
        name: `Test Tea ${Date.now()}`,
        barcode: teaBarcode,
        category: 'Beverages',
        purchasePrice: 100,
        sellPrice: 135.0,
        taxRateId: taxRate!.id,
        unit: 'pc',
        trackStock: true,
      },
    });

    // Inventory Officer edits price from 135.00 to 140.00
    const editRes = await agent
      .patch(`/api/v1/products/${prod.id}`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        sellPrice: 140.0,
      });

    expect(editRes.status).toBe(200);

    // Verify audit log row
    const auditRow = await prisma.auditLog.findFirst({
      where: {
        businessId: pemaBiz!.id,
        action: 'price_changed',
        entityId: prod.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(auditRow).toBeDefined();
    expect(auditRow?.detail).toBe('Nu. 135.00 → Nu. 140.00');
    expect(auditRow?.actorName).toBe('Sample Inventory Officer');
  });

  it('AC-20: CSV import handles quoted comma, updates stock with adjustment movement, and skips invalid GST rates', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    const taxRate = await prisma.taxRate.findFirst({
      where: { businessId: pemaBiz!.id, rate: 5, active: true },
    });

    // Create an existing product with stock 40
    const existingBarcode = `20${Math.floor(100000000 + Math.random() * 900000000)}`;
    const existing = await prisma.product.create({
      data: {
        businessId: pemaBiz!.id,
        name: `Existing Item ${Date.now()}`,
        barcode: existingBarcode,
        category: 'Staples',
        purchasePrice: 30,
        sellPrice: 50,
        taxRateId: taxRate!.id,
        unit: 'pc',
        trackStock: true,
        stock: 40,
      },
    });

    // CSV with:
    // Row 2: new product "Rice, Red 5kg" (quoted comma)
    // Row 3: existing barcode with stock changed from 40 to 45
    // Row 4: invalid GST rate 12%
    const csvContent = [
      'Product Name,Barcode,Category,Purchase Price,Selling Price,GST Rate,Unit,Opening Stock,Minimum Stock,Supplier',
      '"Rice, Red 5kg",,Grains,300.00,450.00,5,kg,10,2,',
      `Existing Item,${existingBarcode},Staples,30.00,50.00,5,pc,45,5,`,
      'Invalid Tax Item,,Snacks,20.00,30.00,12,pc,5,1,',
    ].join('\r\n');

    const res = await agent
      .post('/api/v1/products/import')
      .set('X-CSRF-Token', csrfToken)
      .send({ csv: csvContent });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.updated).toBe(1);
    expect(res.body.skipped).toEqual([
      { row: 4, error: "GST rate 12% doesn't match an active tax rate" },
    ]);

    // Check newly created product name preserved quoted comma
    const newProd = await prisma.product.findFirst({
      where: { businessId: pemaBiz!.id, name: 'Rice, Red 5kg' },
    });
    expect(newProd).toBeDefined();
    expect(newProd?.name).toBe('Rice, Red 5kg');

    // Check existing product stock updated to 45
    const updatedProd = await prisma.product.findUnique({
      where: { id: existing.id },
    });
    expect(updatedProd?.stock).toBe(45);

    // Check adjustment movement of +5 with reason "CSV import" exists
    const adjMovement = await prisma.stockMovement.findFirst({
      where: {
        productId: existing.id,
        type: 'adjustment',
        reason: 'CSV import',
      },
    });
    expect(adjMovement).toBeDefined();
    expect(adjMovement?.qty).toBe(5);
    expect(adjMovement?.stockAfter).toBe(45);
  });

  it('AC-21: CSV export guards against formula injection (=,+,-,@) and includes UTF-8 BOM', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    const taxRate = await prisma.taxRate.findFirst({
      where: { businessId: pemaBiz!.id, active: true },
    });

    // Create product named "=SUM(A1)"
    const formulaBarcode = `20${Math.floor(100000000 + Math.random() * 900000000)}`;
    await prisma.product.create({
      data: {
        businessId: pemaBiz!.id,
        name: '=SUM(A1)',
        barcode: formulaBarcode,
        category: 'Test',
        sellPrice: 100,
        taxRateId: taxRate!.id,
      },
    });

    const exportRes = await agent
      .get('/api/v1/products/export.csv')
      .set('X-CSRF-Token', csrfToken);

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/csv');

    // Check BOM
    const text = exportRes.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);

    // Cell value is '=SUM(A1) (escaped in quotes)
    expect(text).toContain('"\'=SUM(A1)"');
  });

  it('Product image upload rejects SVG with 415 and processes valid image to WebP', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.token;

    await loginAsEmployee(agent, csrfToken, 'Pema Store', 'admin');

    const pemaBiz = await prisma.business.findFirst({ where: { name: 'Pema Store' } });
    const prod = await prisma.product.findFirst({ where: { businessId: pemaBiz!.id } });
    expect(prod).toBeDefined();

    // Reject SVG
    const svgRes = await agent
      .post(`/api/v1/products/${prod!.id}/image`)
      .set('X-CSRF-Token', csrfToken)
      .attach('file', Buffer.from('<svg></svg>'), 'test.svg');

    expect(svgRes.status).toBe(415);

    // Accept valid 1x1 PNG
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const pngRes = await agent
      .post(`/api/v1/products/${prod!.id}/image`)
      .set('X-CSRF-Token', csrfToken)
      .attach('file', png1x1, 'product.png');

    expect(pngRes.status).toBe(200);
    expect(pngRes.body.data.imagePath).toMatch(/\.webp$/);

    // Delete image
    const delRes = await agent
      .delete(`/api/v1/products/${prod!.id}/image`)
      .set('X-CSRF-Token', csrfToken);

    expect(delRes.status).toBe(200);
    expect(delRes.body.data.imagePath).toBeNull();
  });
});
