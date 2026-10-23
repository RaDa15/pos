import { describe, it, expect } from 'vitest';
import { prisma } from './client.js';
import { BusinessType, EmployeeRole, TaxCategory, PlanCode, SubscriptionStatus } from '@prisma/client';

describe('Seed Data Verification & AC-66 Compliance', () => {
  it('has seeded active platform admin', async () => {
    const admin = await prisma.platformAdmin.findUnique({
      where: { email: 'admin@pos.bt' },
    });
    expect(admin).toBeDefined();
    expect(admin?.active).toBe(true);
  });

  it('has seeded all 4 demo businesses with Professional active subscriptions', async () => {
    const demoBusinesses = await prisma.business.findMany({
      where: { isDemo: true },
      include: {
        subscription: true,
      },
    });

    expect(demoBusinesses.length).toBe(4);
    const names = demoBusinesses.map((b) => b.name).sort();
    expect(names).toEqual([
      'Menjong Kitchen',
      'Norbu General Store',
      'Pema Store',
      'Test Restaurant',
    ]);

    for (const biz of demoBusinesses) {
      expect(biz.subscription).toBeDefined();
      expect(biz.subscription?.status).toBe(SubscriptionStatus.active);
      expect(biz.subscription?.plan).toBe(PlanCode.professional);
    }
  });

  it('has seeded all 8 roles for each demo business', async () => {
    const demoBusinesses = await prisma.business.findMany({
      where: { isDemo: true },
      include: {
        employees: true,
      },
    });

    const expectedRoles = Object.values(EmployeeRole);

    for (const biz of demoBusinesses) {
      expect(biz.employees.length).toBe(8);
      const bizRoles = biz.employees.map((e) => e.role).sort();
      expect(bizRoles).toEqual([...expectedRoles].sort());
    }
  });

  it('AC-66: rice, cooking oil, and salt use GST Exempt (0%)', async () => {
    const groceryBusinesses = await prisma.business.findMany({
      where: { isDemo: true, type: BusinessType.grocery },
      select: { id: true, name: true },
    });

    expect(groceryBusinesses.length).toBe(2);

    for (const biz of groceryBusinesses) {
      const exemptProducts = await prisma.product.findMany({
        where: {
          businessId: biz.id,
          name: { in: ['Basmati Rice 5kg', 'Sunflower Oil 1L', 'Iodised Salt 1kg'] },
        },
        include: {
          taxRate: true,
        },
      });

      expect(exemptProducts.length).toBe(3);
      for (const prod of exemptProducts) {
        expect(prod.taxRate.category).toBe(TaxCategory.exempt);
        expect(Number(prod.taxRate.rate)).toBe(0);
      }
    }
  });

  it('AC-66: restaurant plate items have trackStock: false', async () => {
    const restaurantBusinesses = await prisma.business.findMany({
      where: { isDemo: true, type: BusinessType.restaurant },
      select: { id: true, name: true },
    });

    expect(restaurantBusinesses.length).toBe(2);

    for (const biz of restaurantBusinesses) {
      const plateItems = await prisma.product.findMany({
        where: {
          businessId: biz.id,
          unit: 'plate',
        },
      });

      expect(plateItems.length).toBeGreaterThan(0);
      for (const item of plateItems) {
        expect(item.trackStock).toBe(false);
      }
    }
  });

  it('AC-66: Walk-in is not present in customers table', async () => {
    const walkInCustomer = await prisma.customer.findFirst({
      where: {
        name: { contains: 'Walk-in', mode: 'insensitive' },
      },
    });

    expect(walkInCustomer).toBeNull();
  });
});
