import type { Request, Response, NextFunction } from 'express';
import {
  ROLE_PERMISSIONS,
  type PermissionKey,
  type PlanCode,
  type EmployeeRole,
  type UILanguage,
  type BusinessType,
  type SubscriptionStatus,
  PLAN_LIMITS,
  type PlanFeature,
  isPlanFeatureAllowed,
} from '@pos/shared';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';

export type DashboardLens = 'full' | 'finance' | 'sales' | 'inventory' | 'floor';

export interface AuthenticatedEmployee {
  id: string;
  name: string;
  username: string;
  role: EmployeeRole;
  language: UILanguage;
  mustChangePassword: boolean;
  permissions: readonly PermissionKey[];
  dashboardLens: DashboardLens;
}

export interface AuthenticatedBusiness {
  id: string;
  businessCode: string;
  name: string;
  type: BusinessType;
  gstRegistered: boolean;
  gstNo: string | null;
  address: string | null;
  phone: string;
  email: string;
  logoUrl: string | null;
}

export interface AuthenticatedSubscription {
  plan: PlanCode;
  status: SubscriptionStatus;
  effectiveStatus: 'trial' | 'active' | 'expired' | 'suspended' | 'cancelled';
  expiresAt: string;
  daysLeft: number;
  planFeatures: PlanFeature[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      employee?: AuthenticatedEmployee;
      business?: AuthenticatedBusiness;
      subscription?: AuthenticatedSubscription;
    }
  }
}

export function computeEffectiveStatus(
  status: SubscriptionStatus,
  expiresAt: Date
): 'trial' | 'active' | 'expired' | 'suspended' | 'cancelled' {
  if (status === 'cancelled' || status === 'suspended') {
    return status;
  }
  if (expiresAt.getTime() < Date.now()) {
    return 'expired';
  }
  return status;
}

export function computeDashboardLens(role: EmployeeRole): DashboardLens {
  switch (role) {
    case 'admin':
    case 'manager':
      return 'full';
    case 'accountant':
      return 'finance';
    case 'cashier':
      return 'sales';
    case 'inventory_officer':
    case 'storekeeper':
      return 'inventory';
    case 'waiter':
    case 'kitchen_staff':
      return 'floor';
    default:
      return 'sales';
  }
}

/**
 * Middleware: reloads employee, business, and subscription on EVERY request.
 * Reference: docs/05-SECURITY-ACCESS.md §1 & §4.
 */
export async function requireEmployee(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const employeeId = req.session?.employeeId;
  const businessId = req.session?.businessId;

  if (!employeeId || !businessId) {
    throw AppError.unauthenticated('Please sign in to access this resource.');
  }

  // Reload employee from DB
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      business: {
        include: {
          subscription: true,
        },
      },
    },
  });

  if (!employee || !employee.active || employee.businessId !== businessId) {
    // If employee deleted, disabled, or tenant mismatch, terminate session
    if (req.session) {
      await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    }
    throw AppError.unauthenticated('Your account has been disabled or removed.');
  }

  const biz = employee.business;
  const sub = biz.subscription;

  if (!sub) {
    throw AppError.internal('Business subscription configuration missing.');
  }

  const effectiveStatus = computeEffectiveStatus(sub.status, sub.expiresAt);
  const now = Date.now();
  const msRemaining = sub.expiresAt.getTime() - now;
  const daysLeft = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  const allowedPlanFeatures = (
    Object.keys(PLAN_LIMITS[sub.plan].allowedFeatures) as PlanFeature[]
  ).filter((feat) => PLAN_LIMITS[sub.plan].allowedFeatures[feat]);

  const permissions = ROLE_PERMISSIONS[employee.role] ?? [];
  const dashboardLens = computeDashboardLens(employee.role);

  req.employee = {
    id: employee.id,
    name: employee.name,
    username: employee.username,
    role: employee.role,
    language: employee.language,
    mustChangePassword: employee.mustChangePassword,
    permissions,
    dashboardLens,
  };

  req.business = {
    id: biz.id,
    businessCode: biz.businessCode,
    name: biz.name,
    type: biz.type,
    gstRegistered: biz.gstRegistered,
    gstNo: biz.gstNo,
    address: biz.address,
    phone: biz.phone,
    email: biz.email,
    logoUrl: biz.logoPath,
  };

  req.subscription = {
    plan: sub.plan,
    status: sub.status,
    effectiveStatus,
    expiresAt: sub.expiresAt.toISOString(),
    daysLeft,
    planFeatures: allowedPlanFeatures,
  };

  // Enforce password change requirement (only allow /me/password, /auth/me, /auth/logout)
  if (employee.mustChangePassword) {
    const allowedPaths = ['/api/v1/me/password', '/api/v1/auth/me', '/api/v1/auth/logout'];
    if (!allowedPaths.includes(req.baseUrl + req.path) && !allowedPaths.includes(req.path)) {
      throw AppError.passwordChangeRequired('You must change your password before continuing.');
    }
  }

  next();
}

/**
 * Middleware: requires specific permission key.
 */
export function requirePermission(permission: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.employee) {
      throw AppError.unauthenticated();
    }
    if (!req.employee.permissions.includes(permission)) {
      throw AppError.forbidden('You do not have permission to perform this action.');
    }
    next();
  };
}

/**
 * Middleware: requires an active or trial subscription (BR-05).
 */
export function requireActiveSubscription(req: Request, _res: Response, next: NextFunction): void {
  if (!req.subscription) {
    throw AppError.unauthenticated();
  }
  if (
    req.subscription.effectiveStatus !== 'active' &&
    req.subscription.effectiveStatus !== 'trial'
  ) {
    throw AppError.subscriptionInactive(
      'Your subscription is inactive. Ask an Admin to renew or contact support.'
    );
  }
  next();
}

/**
 * Middleware: requires a plan feature (BR-07).
 */
export function requirePlanFeature(feature: PlanFeature) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.subscription) {
      throw AppError.unauthenticated();
    }
    if (!isPlanFeatureAllowed(req.subscription.plan, feature)) {
      throw AppError.planLimit(
        `Feature "${feature}" is not available on the ${req.subscription.plan} plan.`
      );
    }
    next();
  };
}

/**
 * Middleware: requires business type to be restaurant (AC-37).
 */
export function requireRestaurant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.business) {
    throw AppError.unauthenticated();
  }
  if (req.business.type !== 'restaurant') {
    throw AppError.forbidden('Kitchen orders are only available for restaurant businesses.');
  }
  next();
}
