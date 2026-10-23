import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './client.js';
import { getTenantClient, TenantScopeError } from './tenant.js';
import { BusinessType, EmployeeRole, TaxMode, TaxCategory } from '@prisma/client';

describe('Tenant Isolation Extension (db/tenant.ts)', () => {
  let biz1Id: string;
  let biz2Id: string;
  let biz1TaxRateId: string;
  let biz2TaxRateId: string;

  const runId = Math.random().toString(36).substring(2, 7).toUpperCase();

  beforeAll(async () => {
    // Clean up any stale records from previous runs
    const staleBiz = await prisma.business.findMany({
      where: { businessCode: { in: ['BIZ-TEN1', 'BIZ-TEN2'] } },
      select: { id: true },
    });
    if (staleBiz.length > 0) {
      const sIds = staleBiz.map((b) => b.id);
      await prisma.product.deleteMany({ where: { businessId: { in: sIds } } });
      await prisma.taxRate.deleteMany({ where: { businessId: { in: sIds } } });
      await prisma.employee.deleteMany({ where: { businessId: { in: sIds } } });
      await prisma.business.deleteMany({ where: { id: { in: sIds } } });
    }

    // Create two distinct businesses
    const b1 = await prisma.business.create({
      data: {
        businessCode: `BIZ-T1-${runId}`,
        name: `Tenant 1 Grocery ${runId}`,
        nameKey: `tenant 1 grocery ${runId.toLowerCase()}`,
        type: BusinessType.grocery,
        ownerName: 'Owner 1',
        phone: '+975 17111111',
        email: `t1-${runId}@pos.bt`,
        passwordHash: 'hash-1',
      },
    });
    biz1Id = b1.id;

    const b2 = await prisma.business.create({
      data: {
        businessCode: `BIZ-T2-${runId}`,
        name: `Tenant 2 Restaurant ${runId}`,
        nameKey: `tenant 2 restaurant ${runId.toLowerCase()}`,
        type: BusinessType.restaurant,
        ownerName: 'Owner 2',
        phone: '+975 17222222',
        email: `t2-${runId}@pos.bt`,
        passwordHash: 'hash-2',
      },
    });
    biz2Id = b2.id;

    // Create a tax rate for each
    const t1 = await prisma.taxRate.create({
      data: {
        businessId: biz1Id,
        name: 'T1 Standard',
        rate: 5,
        mode: TaxMode.exclusive,
        category: TaxCategory.standard,
        effectiveDate: new Date(),
      },
    });
    biz1TaxRateId = t1.id;

    const t2 = await prisma.taxRate.create({
      data: {
        businessId: biz2Id,
        name: 'T2 Standard',
        rate: 5,
        mode: TaxMode.exclusive,
        category: TaxCategory.standard,
        effectiveDate: new Date(),
      },
    });
    biz2TaxRateId = t2.id;
  });

  afterAll(async () => {
    const ids = [biz1Id, biz2Id].filter(Boolean);
    if (ids.length > 0) {
      await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
      await prisma.taxRate.deleteMany({ where: { businessId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { businessId: { in: ids } } });
      await prisma.business.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  it('requires a non-empty businessId when instantiating tenant client', () => {
    expect(() => getTenantClient(prisma, '')).toThrow(TenantScopeError);
    expect(() => getTenantClient(prisma, '   ')).toThrow(TenantScopeError);
    expect(() => getTenantClient(prisma, { businessId: '' })).toThrow(TenantScopeError);
  });

  it('automatically injects businessId on create', async () => {
    const t1Client = getTenantClient(prisma, biz1Id);

    const emp = await t1Client.employee.create({
      data: {
        username: 'cashier1',
        usernameKey: 'cashier1',
        name: 'Cashier One',
        role: EmployeeRole.cashier,
        passwordHash: 'hash',
      } as unknown as Parameters<typeof t1Client.employee.create>[0]['data'],
    });

    expect(emp.businessId).toBe(biz1Id);
    expect(emp.name).toBe('Cashier One');
  });

  it('rejects create if mismatched businessId is passed in data', async () => {
    const t1Client = getTenantClient(prisma, biz1Id);

    await expect(
      t1Client.employee.create({
        data: {
          businessId: biz2Id, // Attempt cross-tenant injection
          username: 'hacker',
          usernameKey: 'hacker',
          name: 'Hacker',
          role: EmployeeRole.cashier,
          passwordHash: 'hash',
        },
      })
    ).rejects.toThrow(TenantScopeError);
  });

  it('scopes findMany and count strictly to tenant', async () => {
    const t1Client = getTenantClient(prisma, biz1Id);
    const t2Client = getTenantClient(prisma, biz2Id);

    // Create a product in biz1
    await t1Client.product.create({
      data: {
        name: 'Tenant 1 Apple',
        category: 'Fruits',
        barcode: '2000000001',
        sellPrice: 50,
        taxRateId: biz1TaxRateId,
      } as unknown as Parameters<typeof t1Client.product.create>[0]['data'],
    });

    // Create a product in biz2
    await t2Client.product.create({
      data: {
        name: 'Tenant 2 Orange',
        category: 'Fruits',
        barcode: '2000000002',
        sellPrice: 60,
        taxRateId: biz2TaxRateId,
      } as unknown as Parameters<typeof t2Client.product.create>[0]['data'],
    });

    // Biz1 client only sees Biz1 product
    const p1List = await t1Client.product.findMany();
    expect(p1List.every((p) => p.businessId === biz1Id)).toBe(true);
    expect(p1List.some((p) => p.name === 'Tenant 1 Apple')).toBe(true);
    expect(p1List.some((p) => p.name === 'Tenant 2 Orange')).toBe(false);

    // Biz2 client only sees Biz2 product
    const p2List = await t2Client.product.findMany();
    expect(p2List.every((p) => p.businessId === biz2Id)).toBe(true);
    expect(p2List.some((p) => p.name === 'Tenant 2 Orange')).toBe(true);
    expect(p2List.some((p) => p.name === 'Tenant 1 Apple')).toBe(false);

    // Counts match isolation
    const p1Count = await t1Client.product.count();
    const p2Count = await t2Client.product.count();
    expect(p1Count).toBe(1);
    expect(p2Count).toBe(1);
  });

  it('rejects findMany with conflicting where.businessId', async () => {
    const t1Client = getTenantClient(prisma, biz1Id);

    await expect(
      t1Client.product.findMany({
        where: { businessId: biz2Id },
      })
    ).rejects.toThrow(TenantScopeError);
  });

  it('prevents IDOR via findUnique by ID across tenants', async () => {
    const t1Client = getTenantClient(prisma, biz1Id);
    const t2Client = getTenantClient(prisma, biz2Id);

    // Create product in Biz2
    const p2 = await t2Client.product.create({
      data: {
        name: 'Tenant 2 Mango',
        category: 'Fruits',
        barcode: '2000000003',
        sellPrice: 80,
        taxRateId: biz2TaxRateId,
      } as unknown as Parameters<typeof t2Client.product.create>[0]['data'],
    });

    // Biz1 attempts to fetch Biz2 product by its UUID
    const queriedByBiz1 = await t1Client.product.findUnique({
      where: { id: p2.id },
    });

    // Must return null for another tenant's item
    expect(queriedByBiz1).toBeNull();

    // findUniqueOrThrow must throw not found error
    await expect(
      t1Client.product.findUniqueOrThrow({
        where: { id: p2.id },
      })
    ).rejects.toThrow();

    // Biz2 can fetch its own product
    const queriedByBiz2 = await t2Client.product.findUnique({
      where: { id: p2.id },
    });
    expect(queriedByBiz2).not.toBeNull();
    expect(queriedByBiz2?.id).toBe(p2.id);
  });

  it('rejects cross-tenant updates and deletes', async () => {
    const t1Client = getTenantClient(prisma, biz1Id);
    const t2Client = getTenantClient(prisma, biz2Id);

    const p2 = await t2Client.product.create({
      data: {
        name: 'Tenant 2 Banana',
        category: 'Fruits',
        barcode: '2000000004',
        sellPrice: 40,
        taxRateId: biz2TaxRateId,
      } as unknown as Parameters<typeof t2Client.product.create>[0]['data'],
    });

    // Biz1 attempts to update Biz2 product by ID
    await expect(
      t1Client.product.update({
        where: { id: p2.id },
        data: { name: 'Hacked Banana' },
      })
    ).rejects.toThrow(TenantScopeError);

    // Biz1 attempts to delete Biz2 product by ID
    await expect(
      t1Client.product.delete({
        where: { id: p2.id },
      })
    ).rejects.toThrow(TenantScopeError);
  });
});
