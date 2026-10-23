import { Router, type Request, type Response } from 'express';
import {
  CompanyLoginRequestSchema,
  EmployeeLoginRequestSchema,
  ChangePasswordRequestSchema,
  UpdateLanguageRequestSchema,
  ROLE_PERMISSIONS,
  PLAN_LIMITS,
  type PlanFeature,
} from '@pos/shared';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { verifyPassword, hashPassword, assertPasswordPolicy } from '../lib/passwords.js';
import { writeAuditLog } from '../lib/audit.js';
import { env } from '../config/env.js';
import { generateCsrfToken } from '../middleware/csrf.js';
import { companyLoginRateLimit } from '../middleware/rateLimit.js';
import {
  requireEmployee,
  requirePermission,
  computeEffectiveStatus,
  computeDashboardLens,
} from '../middleware/auth.js';

export const authRouter: Router = Router();

const isProduction = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';

/**
 * GET /auth/csrf
 * Issues CSRF token, sets 'csrf' cookie, returns token.
 */
authRouter.get('/csrf', (req: Request, res: Response) => {
  const token = generateCsrfToken();
  res.cookie('csrf', token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
  if (req.session) {
    req.session.csrfToken = token;
  }
  res.json({ data: { token } });
});

/**
 * GET /auth/device
 * Retrieves remembered company from signed 'device' cookie.
 */
authRouter.get('/device', async (req: Request, res: Response) => {
  const deviceBusinessId = req.signedCookies?.['device'];
  if (!deviceBusinessId) {
    res.json({ data: { business: null } });
    return;
  }

  const biz = await prisma.business.findUnique({
    where: { id: deviceBusinessId },
    select: {
      name: true,
      businessCode: true,
      logoPath: true,
    },
  });

  if (!biz) {
    res.clearCookie('device');
    res.json({ data: { business: null } });
    return;
  }

  res.json({
    data: {
      business: {
        name: biz.name,
        businessCode: biz.businessCode,
        logoUrl: biz.logoPath,
      },
    },
  });
});

/**
 * POST /auth/company-login
 * Step 1 of sign-in: verifies company name or Business ID + company password.
 * Sets signed 'device' cookie.
 * Reference: docs/05-SECURITY-ACCESS.md §1 & docs/07-API-SPEC.md §3.1.
 */
authRouter.post('/company-login', companyLoginRateLimit, async (req: Request, res: Response) => {
  const body = CompanyLoginRequestSchema.parse(req.body);

  const trimmedIdentifier = body.identifier.trim();
  const nameKey = trimmedIdentifier.toLowerCase();
  const businessCode = trimmedIdentifier.toUpperCase();

  // Find business by name or code
  const biz = await prisma.business.findFirst({
    where: {
      OR: [{ nameKey }, { businessCode }],
    },
    include: {
      subscription: true,
    },
  });

  if (!biz) {
    throw AppError.invalidCredentials();
  }

  const isValidPassword = await verifyPassword(biz.passwordHash, body.password);
  if (!isValidPassword) {
    throw AppError.invalidCredentials();
  }

  const effectiveStatus = biz.subscription
    ? computeEffectiveStatus(biz.subscription.status, biz.subscription.expiresAt)
    : 'expired';

  const subscriptionBlocked =
    effectiveStatus === 'expired' ||
    effectiveStatus === 'cancelled' ||
    effectiveStatus === 'suspended';

  // Set signed device cookie
  const maxAge = body.rememberDevice
    ? env.REMEMBER_DEVICE_DAYS * 24 * 3600 * 1000
    : 12 * 3600 * 1000;

  res.cookie('device', biz.id, {
    signed: true,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge,
    path: '/',
  });

  res.json({
    data: {
      business: {
        name: biz.name,
        businessCode: biz.businessCode,
        type: biz.type,
        logoUrl: biz.logoPath,
      },
      subscriptionBlocked,
    },
  });
});

/**
 * POST /auth/employee-login
 * Step 2 of sign-in: username + password within the device's company.
 * Implements lockout after 5 failed attempts (AC-09).
 */
authRouter.post('/employee-login', async (req: Request, res: Response) => {
  const businessId = req.signedCookies?.['device'];
  if (!businessId) {
    throw AppError.unauthenticated('Device cookie missing. Please sign in to your company first.');
  }

  const body = EmployeeLoginRequestSchema.parse(req.body);
  const usernameKey = body.username.trim().toLowerCase();

  const employee = await prisma.employee.findUnique({
    where: {
      businessId_usernameKey: {
        businessId,
        usernameKey,
      },
    },
    include: {
      business: {
        include: {
          subscription: true,
        },
      },
    },
  });

  const now = Date.now();

  // Check lockout
  if (employee?.lockedUntil && employee.lockedUntil.getTime() > now) {
    throw AppError.accountLocked('Too many attempts. Try again in 15 minutes.');
  }

  const isPasswordValid = employee && employee.active
    ? await verifyPassword(employee.passwordHash, body.password)
    : false;

  if (!isPasswordValid || !employee) {
    if (employee) {
      const newCount = employee.failedLoginCount + 1;
      const shouldLock = newCount >= 5;
      await prisma.employee.update({
        where: { id: employee.id },
        data: {
          failedLoginCount: shouldLock ? 5 : newCount,
          lockedUntil: shouldLock ? new Date(now + 15 * 60 * 1000) : null,
        },
      });
    }

    await writeAuditLog({
      businessId,
      actorName: body.username,
      action: 'Login failed',
      detail: `Failed login attempt for username: ${body.username}`,
    });

    throw AppError.invalidCredentials();
  }

  // Password valid: reset failed attempts & update lastLoginAt
  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  // Regenerate session to prevent fixation
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  req.session.kind = 'employee';
  req.session.businessId = businessId;
  req.session.employeeId = employee.id;

  await writeAuditLog({
    businessId,
    actorEmployeeId: employee.id,
    actorName: employee.name,
    action: 'Login',
    detail: `Employee ${employee.username} logged in successfully`,
  });

  const biz = employee.business;
  const sub = biz.subscription!;
  const effectiveStatus = computeEffectiveStatus(sub.status, sub.expiresAt);
  const msRemaining = sub.expiresAt.getTime() - now;
  const daysLeft = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  const allowedPlanFeatures = (
    Object.keys(PLAN_LIMITS[sub.plan].allowedFeatures) as PlanFeature[]
  ).filter((feat) => PLAN_LIMITS[sub.plan].allowedFeatures[feat]);

  const permissions = ROLE_PERMISSIONS[employee.role] ?? [];
  const dashboardLens = computeDashboardLens(employee.role);

  res.json({
    data: {
      employee: {
        id: employee.id,
        name: employee.name,
        username: employee.username,
        role: employee.role,
        language: employee.language,
        mustChangePassword: employee.mustChangePassword,
      },
      business: {
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
      },
      subscription: {
        plan: sub.plan,
        status: sub.status,
        effectiveStatus,
        expiresAt: sub.expiresAt.toISOString(),
        daysLeft,
      },
      permissions,
      dashboardLens,
      planFeatures: allowedPlanFeatures,
    },
  });
});

/**
 * POST /auth/logout
 */
authRouter.post('/logout', requireEmployee, async (req: Request, res: Response) => {
  await writeAuditLog({
    businessId: req.business!.id,
    actorEmployeeId: req.employee!.id,
    actorName: req.employee!.name,
    action: 'Logout',
    detail: `Employee ${req.employee!.username} logged out`,
  });

  await new Promise<void>((resolve) => {
    req.session.destroy(() => resolve());
  });

  res.clearCookie('sid');
  res.json({ data: { success: true } });
});

/**
 * POST /auth/forget-device
 */
authRouter.post('/forget-device', (_req: Request, res: Response) => {
  res.clearCookie('device');
  res.json({ data: { success: true } });
});

/**
 * GET /auth/me
 */
authRouter.get('/me', requireEmployee, (req: Request, res: Response) => {
  res.json({
    data: {
      employee: req.employee,
      business: req.business,
      subscription: req.subscription,
      permissions: req.employee!.permissions,
      dashboardLens: req.employee!.dashboardLens,
      planFeatures: req.subscription!.planFeatures,
    },
  });
});

/**
 * POST /me/password
 * Change own password (requires me.manage permission).
 */
export const meRouter: Router = Router();

meRouter.post('/password', requireEmployee, requirePermission('me.manage'), async (req: Request, res: Response) => {
  const body = ChangePasswordRequestSchema.parse(req.body);

  const emp = await prisma.employee.findUnique({
    where: { id: req.employee!.id },
    select: { passwordHash: true },
  });

  if (!emp) {
    throw AppError.unauthenticated();
  }

  const isCurrentValid = await verifyPassword(emp.passwordHash, body.currentPassword);
  if (!isCurrentValid) {
    throw AppError.validationError('Current password does not match.', {
      fields: { currentPassword: 'Wrong current password.' },
    });
  }

  assertPasswordPolicy(body.newPassword, {
    username: req.employee!.username,
    businessName: req.business!.name,
  });

  const newHash = await hashPassword(body.newPassword);

  await prisma.employee.update({
    where: { id: req.employee!.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
    },
  });

  await writeAuditLog({
    businessId: req.business!.id,
    actorEmployeeId: req.employee!.id,
    actorName: req.employee!.name,
    action: 'Password changed',
    detail: `Employee ${req.employee!.username} changed password`,
  });

  res.json({ data: { success: true } });
});

/**
 * PATCH /me
 * Change own language preference.
 */
meRouter.patch('/', requireEmployee, requirePermission('me.manage'), async (req: Request, res: Response) => {
  const body = UpdateLanguageRequestSchema.parse(req.body);

  const updated = await prisma.employee.update({
    where: { id: req.employee!.id },
    data: {
      language: body.language,
    },
    select: {
      language: true,
    },
  });

  res.json({ data: { language: updated.language } });
});
