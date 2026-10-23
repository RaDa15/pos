import { describe, expect, it } from 'vitest';
import { canAddEmployeeUnderPlan, isPlanFeatureAllowed, PLAN_LIMITS } from './plans.js';

describe('Subscription Plans (BR-07, §3.6)', () => {
  it('enforces monthly prices', () => {
    expect(PLAN_LIMITS.starter.priceNu).toBe(800);
    expect(PLAN_LIMITS.professional.priceNu).toBe(2200);
    expect(PLAN_LIMITS.enterprise.priceNu).toBe(4500);
  });

  it('enforces active employee limits excluding admins', () => {
    // Starter: max 1
    expect(canAddEmployeeUnderPlan('starter', 0)).toBe(true);
    expect(canAddEmployeeUnderPlan('starter', 1)).toBe(false);

    // Professional: max 10
    expect(canAddEmployeeUnderPlan('professional', 9)).toBe(true);
    expect(canAddEmployeeUnderPlan('professional', 10)).toBe(false);

    // Enterprise: unlimited
    expect(canAddEmployeeUnderPlan('enterprise', 9999)).toBe(true);
  });

  it('enforces feature gating', () => {
    expect(isPlanFeatureAllowed('starter', 'customers')).toBe(false);
    expect(isPlanFeatureAllowed('starter', 'gst_reports')).toBe(false);
    expect(isPlanFeatureAllowed('starter', 'kitchen_orders')).toBe(true);

    expect(isPlanFeatureAllowed('professional', 'customers')).toBe(true);
    expect(isPlanFeatureAllowed('professional', 'gst_reports')).toBe(true);
    expect(isPlanFeatureAllowed('professional', 'import_export')).toBe(true);

    expect(isPlanFeatureAllowed('enterprise', 'customers')).toBe(true);

    expect(isPlanFeatureAllowed('unknown' as unknown as import('./enums.js').PlanCode, 'customers')).toBe(false);
    expect(canAddEmployeeUnderPlan('unknown' as unknown as import('./enums.js').PlanCode, 0)).toBe(false);
  });
});
