/**
 * Subscription Plans and Feature Limits
 * Reference: docs/02-BUSINESS-RULES.md §3.6, BR-07.
 */

import { PlanCode } from './enums.js';

export type PlanFeature =
  | 'customers'
  | 'suppliers'
  | 'gst_reports'
  | 'payment_reports'
  | 'sales_charts'
  | 'import_export'
  | 'kitchen_orders';

export interface PlanLimits {
  code: PlanCode;
  name: string;
  priceNu: number; // monthly price in Nu.
  maxNonAdminEmployees: number; // Number.POSITIVE_INFINITY for unlimited
  allowedFeatures: Record<PlanFeature, boolean>;
}

export const PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  starter: {
    code: 'starter',
    name: 'Starter',
    priceNu: 800,
    maxNonAdminEmployees: 1,
    allowedFeatures: {
      customers: false,
      suppliers: false,
      gst_reports: false,
      payment_reports: false,
      sales_charts: false,
      import_export: false,
      kitchen_orders: true,
    },
  },
  professional: {
    code: 'professional',
    name: 'Professional',
    priceNu: 2200,
    maxNonAdminEmployees: 10,
    allowedFeatures: {
      customers: true,
      suppliers: true,
      gst_reports: true,
      payment_reports: true,
      sales_charts: true,
      import_export: true,
      kitchen_orders: true,
    },
  },
  enterprise: {
    code: 'enterprise',
    name: 'Enterprise',
    priceNu: 4500,
    maxNonAdminEmployees: Number.POSITIVE_INFINITY,
    allowedFeatures: {
      customers: true,
      suppliers: true,
      gst_reports: true,
      payment_reports: true,
      sales_charts: true,
      import_export: true,
      kitchen_orders: true,
    },
  },
};

/**
 * Checks whether a feature is permitted on the given plan.
 */
export function isPlanFeatureAllowed(plan: PlanCode, feature: PlanFeature): boolean {
  return PLAN_LIMITS[plan]?.allowedFeatures[feature] ?? false;
}

/**
 * Checks whether an active non-admin employee can be added under the plan limit.
 */
export function canAddEmployeeUnderPlan(
  plan: PlanCode,
  currentNonAdminCount: number
): boolean {
  const limit = PLAN_LIMITS[plan]?.maxNonAdminEmployees ?? 0;
  return currentNonAdminCount < limit;
}
