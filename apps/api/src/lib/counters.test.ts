import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../db/client.js';
import { nextNumber } from './counters.js';
import { CounterName, BusinessType } from '@prisma/client';

describe('Atomic Counters (lib/counters.ts)', () => {
  let testBusinessId: string;

  beforeAll(async () => {
    // Create a temporary business for testing counters
    const biz = await prisma.business.create({
      data: {
        businessCode: 'BIZ-TESTC',
        name: 'Counter Test Business',
        nameKey: 'counter test business',
        type: BusinessType.grocery,
        ownerName: 'Test Owner',
        phone: '+975 17000001',
        email: 'counter@test.bt',
        passwordHash: 'dummy-hash',
      },
    });
    testBusinessId = biz.id;
  });

  afterAll(async () => {
    if (testBusinessId) {
      await prisma.counter.deleteMany({ where: { businessId: testBusinessId } });
      await prisma.business.delete({ where: { id: testBusinessId } });
    }
  });

  it('formats invoice counters with year and 5 digits', async () => {
    const res = await prisma.$transaction(async (tx) => {
      return nextNumber(tx, testBusinessId, CounterName.invoice, 2026);
    });

    expect(res.value).toBe(1);
    expect(res.formatted).toBe('INV-2026-00001');

    const res2 = await prisma.$transaction(async (tx) => {
      return nextNumber(tx, testBusinessId, CounterName.invoice, 2026);
    });
    expect(res2.value).toBe(2);
    expect(res2.formatted).toBe('INV-2026-00002');
  });

  it('formats kot counters with 4 digits and year 0', async () => {
    const res = await prisma.$transaction(async (tx) => {
      return nextNumber(tx, testBusinessId, CounterName.kot);
    });

    expect(res.value).toBe(1);
    expect(res.formatted).toBe('KOT-0001');
  });

  it('formats credit settlement counters with 4 digits and CR prefix', async () => {
    const res = await prisma.$transaction(async (tx) => {
      return nextNumber(tx, testBusinessId, CounterName.credit_settlement);
    });

    expect(res.value).toBe(1);
    expect(res.formatted).toBe('CR-0001');
  });

  it('handles 50 parallel calls producing 50 distinct, gapless numbers', async () => {
    // Launch 50 concurrent transactions for the purchase counter
    const tasks = Array.from({ length: 50 }).map(() =>
      prisma.$transaction(async (tx) => {
        return nextNumber(tx, testBusinessId, CounterName.purchase, 2026);
      })
    );

    const results = await Promise.all(tasks);
    const values = results.map((r) => r.value);

    // Verify 50 total results
    expect(values).toHaveLength(50);

    // Verify all 50 are unique
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(50);

    // Verify gapless sequence 1..50
    const sorted = [...values].sort((a, b) => a - b);
    expect(sorted[0]).toBe(1);
    expect(sorted[49]).toBe(50);
    for (let i = 0; i < 50; i++) {
      expect(sorted[i]).toBe(i + 1);
    }

    // Verify formatted values match sequence
    expect(results.find((r) => r.value === 1)?.formatted).toBe('PUR-2026-00001');
    expect(results.find((r) => r.value === 50)?.formatted).toBe('PUR-2026-00050');
  });
});
