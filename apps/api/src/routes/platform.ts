import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import crypto from 'node:crypto';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { requirePlatformAdmin } from '../middleware/platformAuth.js';
import {
  generateTotpSecret,
  verifyTotpCode,
  encryptTotpSecret,
  decryptTotpSecret,
} from '../lib/totp.js';
import { computeEffectiveStatus } from '../middleware/auth.js';
import {
  SubscriptionStatus,
  SubscriptionEventType,
  SubscriptionPaymentStatus,
  PlanCode,
} from '@prisma/client';

export const platformRouter: Router = Router();

// ============================================================================
// Platform Admin Authentication Endpoints (SCR-25, AC-57)
// ============================================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpToken: z.string().optional(),
  code: z.string().optional(),
});

platformRouter.post(['/auth/login', '/login'], async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.validationError('Invalid login credentials format', {
      errors: parsed.error.format(),
    });
  }

  const { email, password, totpToken, code } = parsed.data;
  const totpCode = code || totpToken;

  const admin = await prisma.platformAdmin.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!admin || !admin.active) {
    throw AppError.invalidCredentials('Invalid email or password.');
  }

  const passwordValid = await argon2.verify(admin.passwordHash, password);
  if (!passwordValid) {
    throw AppError.invalidCredentials('Invalid email or password.');
  }

  // If TOTP is enabled, verify the 6-digit TOTP code (AC-57)
  if (admin.totpEnabled) {
    if (!totpCode || totpCode.trim().length !== 6) {
      throw AppError.invalidCredentials('Two-factor authentication code is required.');
    }

    if (!admin.totpSecretEnc) {
      throw AppError.internal('TOTP configuration error.');
    }

    const secret = decryptTotpSecret(admin.totpSecretEnc);
    const isValidCode = verifyTotpCode(secret, totpCode.trim());
    if (!isValidCode) {
      throw AppError.invalidCredentials('Invalid two-factor authentication code.');
    }
  }

  // Regenerate session to prevent fixation
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.kind = 'platform';
  req.session.platformAdminId = admin.id;

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  res.status(200).json({
    message: 'Signed in successfully.',
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      totpEnabled: admin.totpEnabled,
      mustChangePassword: admin.mustChangePassword,
    },
  });
});

platformRouter.get(['/auth/me', '/me'], requirePlatformAdmin, async (req: Request, res: Response) => {
  res.status(200).json({ admin: req.platformAdmin });
});

platformRouter.post('/auth/totp/setup', requirePlatformAdmin, async (req: Request, res: Response) => {
  const adminId = req.platformAdmin!.id;
  const adminEmail = req.platformAdmin!.email;

  const { secret, qrUri } = generateTotpSecret(adminEmail);
  const encrypted = encryptTotpSecret(secret);

  await prisma.platformAdmin.update({
    where: { id: adminId },
    data: { totpSecretEnc: encrypted },
  });

  res.status(200).json({ secret, qrUri });
});

const verifyTotpSchema = z.object({
  code: z.string().min(6).max(6),
});

platformRouter.post('/auth/totp/verify', requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = verifyTotpSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.validationError('Invalid code format. 6 digits required.');
  }

  const adminId = req.platformAdmin!.id;
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
    select: { totpSecretEnc: true },
  });

  if (!admin?.totpSecretEnc) {
    throw AppError.badRequest('Please initiate TOTP setup first.');
  }

  const secret = decryptTotpSecret(admin.totpSecretEnc);
  const valid = verifyTotpCode(secret, parsed.data.code.trim());

  if (!valid) {
    throw AppError.badRequest('Invalid verification code.');
  }

  await prisma.platformAdmin.update({
    where: { id: adminId },
    data: { totpEnabled: true },
  });

  res.status(200).json({ message: 'Two-factor authentication enabled successfully.' });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

platformRouter.post('/auth/password', requirePlatformAdmin, async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.validationError('New password must be at least 8 characters.');
  }

  const adminId = req.platformAdmin!.id;
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
  });

  if (!admin) {
    throw AppError.unauthenticated();
  }

  const currentValid = await argon2.verify(admin.passwordHash, parsed.data.currentPassword);
  if (!currentValid) {
    throw AppError.invalidCredentials('Current password is incorrect.');
  }

  const newHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });

  await prisma.platformAdmin.update({
    where: { id: adminId },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
    },
  });

  res.status(200).json({ message: 'Password changed successfully.' });
});

platformRouter.post(['/auth/logout', '/logout'], async (req: Request, res: Response) => {
  if (req.session) {
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
  }
  res.clearCookie('sid');
  res.status(200).json({ message: 'Signed out successfully.' });
});

const getParamId = (req: Request): string =>
  Array.isArray(req.params.id) ? req.params.id[0]! : (req.params.id as string);

// ============================================================================
// Business Directory & Management (SCR-26, AC-57)
// ============================================================================

platformRouter.get('/businesses', requirePlatformAdmin, async (req: Request, res: Response) => {
  const { search, status, plan } = req.query as {
    search?: string;
    status?: string;
    plan?: string;
  };

  const whereClause: Record<string, unknown> = {};

  if (search) {
    const s = search.trim();
    whereClause.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { businessCode: { contains: s, mode: 'insensitive' } },
      { ownerName: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }

  if (plan && Object.values(PlanCode).includes(plan as PlanCode)) {
    whereClause.subscription = { plan: plan as PlanCode };
  }

  const businesses = await prisma.business.findMany({
    where: whereClause,
    include: {
      subscription: true,
      employees: {
        where: { active: true, role: { not: 'admin' } },
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const now = Date.now();
  const formatted = businesses
    .map((biz) => {
      const sub = biz.subscription;
      const subStatus = sub?.status ?? 'trial';
      const expiresAt = sub?.expiresAt ?? new Date();
      const effectiveStatus = computeEffectiveStatus(subStatus, expiresAt);
      const msLeft = expiresAt.getTime() - now;
      const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

      return {
        id: biz.id,
        businessCode: biz.businessCode,
        name: biz.name,
        type: biz.type,
        ownerName: biz.ownerName,
        phone: biz.phone,
        email: biz.email,
        plan: sub?.plan ?? 'starter',
        status: subStatus,
        effectiveStatus,
        expiresAt: expiresAt.toISOString(),
        daysLeft,
        activeEmployeeCount: biz.employees.length,
        createdAt: biz.createdAt.toISOString(),
      };
    })
    .filter((b) => (!status || status === 'all' ? true : b.effectiveStatus === status));

  res.status(200).json({ data: formatted });
});

platformRouter.get('/businesses/:id', requirePlatformAdmin, async (req: Request, res: Response) => {
  const id = getParamId(req);

  const biz = await prisma.business.findUnique({
    where: { id },
    include: {
      subscription: true,
      subscriptionEvents: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      subscriptionPayments: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      employees: {
        where: { active: true, role: { not: 'admin' } },
        select: { id: true },
      },
    },
  });

  if (!biz) {
    throw AppError.notFound('Business not found.');
  }

  const sub = biz.subscription;
  const expiresAt = sub?.expiresAt ?? new Date();
  const effectiveStatus = computeEffectiveStatus(sub?.status ?? 'trial', expiresAt);
  const now = Date.now();
  const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now) / (1000 * 60 * 60 * 24)));

  res.status(200).json({
    data: {
      id: biz.id,
      businessCode: biz.businessCode,
      name: biz.name,
      type: biz.type,
      ownerName: biz.ownerName,
      phone: biz.phone,
      email: biz.email,
      address: biz.address,
      gstNo: biz.gstNo,
      gstRegistered: biz.gstRegistered,
      subscription: sub
        ? {
            id: sub.id,
            plan: sub.plan,
            status: sub.status,
            effectiveStatus,
            expiresAt: sub.expiresAt.toISOString(),
            daysLeft,
          }
        : null,
      activeEmployeeCount: biz.employees.length,
      subscriptionEvents: biz.subscriptionEvents,
      subscriptionPayments: biz.subscriptionPayments,
      createdAt: biz.createdAt.toISOString(),
    },
  });
});

platformRouter.post('/businesses/:id/extend', requirePlatformAdmin, async (req: Request, res: Response) => {
  const id = getParamId(req);
  const admin = req.platformAdmin!;

  const biz = await prisma.business.findUnique({
    where: { id },
    include: { subscription: true },
  });

  if (!biz || !biz.subscription) {
    throw AppError.notFound('Business subscription not found.');
  }

  const sub = biz.subscription;
  const baseTime = Math.max(Date.now(), sub.expiresAt.getTime());
  const newExpiresAt = new Date(baseTime + 14 * 24 * 3600 * 1000);

  const updatedSub = await prisma.$transaction(async (tx) => {
    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: {
        expiresAt: newExpiresAt,
        status: sub.status === 'suspended' ? 'active' : sub.status,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        businessId: id,
        event: SubscriptionEventType.extended,
        plan: sub.plan,
        detail: 'Extended 14 days by Platform Admin',
        actorPlatformAdminId: admin.id,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: id,
        actorPlatformAdminId: admin.id,
        actorName: admin.email,
        action: 'extended',
        entityType: 'subscription',
        entityId: sub.id,
        detail: `Subscription extended 14 days to ${newExpiresAt.toISOString().slice(0, 10)}`,
      },
    });

    return updated;
  });

  res.status(200).json({
    message: 'Subscription extended by 14 days.',
    expiresAt: updatedSub.expiresAt.toISOString(),
  });
});

platformRouter.post('/businesses/:id/suspend', requirePlatformAdmin, async (req: Request, res: Response) => {
  const id = getParamId(req);
  const admin = req.platformAdmin!;

  const sub = await prisma.subscription.findUnique({
    where: { businessId: id },
  });

  if (!sub) {
    throw AppError.notFound('Business subscription not found.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: SubscriptionStatus.suspended },
    });

    await tx.subscriptionEvent.create({
      data: {
        businessId: id,
        event: SubscriptionEventType.suspended,
        plan: sub.plan,
        detail: 'Suspended by Platform Admin',
        actorPlatformAdminId: admin.id,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: id,
        actorPlatformAdminId: admin.id,
        actorName: admin.email,
        action: 'suspended',
        entityType: 'subscription',
        entityId: sub.id,
        detail: 'Subscription suspended by Platform Admin',
      },
    });
  });

  res.status(200).json({ message: 'Business subscription suspended.' });
});

platformRouter.post('/businesses/:id/reactivate', requirePlatformAdmin, async (req: Request, res: Response) => {
  const id = getParamId(req);
  const admin = req.platformAdmin!;

  const sub = await prisma.subscription.findUnique({
    where: { businessId: id },
  });

  if (!sub) {
    throw AppError.notFound('Business subscription not found.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: SubscriptionStatus.active },
    });

    await tx.subscriptionEvent.create({
      data: {
        businessId: id,
        event: SubscriptionEventType.reactivated,
        plan: sub.plan,
        detail: 'Reactivated by Platform Admin',
        actorPlatformAdminId: admin.id,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: id,
        actorPlatformAdminId: admin.id,
        actorName: admin.email,
        action: 'reactivated',
        entityType: 'subscription',
        entityId: sub.id,
        detail: 'Subscription reactivated by Platform Admin',
      },
    });
  });

  res.status(200).json({ message: 'Business subscription reactivated.' });
});

platformRouter.post('/businesses/:id/reset-password', requirePlatformAdmin, async (req: Request, res: Response) => {
  const id = getParamId(req);
  const admin = req.platformAdmin!;

  const tempPassword = `Pema${crypto.randomInt(100000, 999999)}!`;
  const hash = await argon2.hash(tempPassword, { type: argon2.argon2id });

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id },
      data: {
        passwordHash: hash,
        mustChangePassword: true,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: id,
        actorPlatformAdminId: admin.id,
        actorName: admin.email,
        action: 'company password reset',
        entityType: 'business',
        entityId: id,
        detail: 'Temporary company password generated by Platform Admin',
      },
    });
  });

  res.status(200).json({
    message: 'Company password reset successfully.',
    temporaryPassword: tempPassword,
  });
});

// ============================================================================
// Subscription Payment Verification Queue (SCR-27, AC-05)
// ============================================================================

platformRouter.get('/payments', requirePlatformAdmin, async (req: Request, res: Response) => {
  const statusFilter = (req.query.status as SubscriptionPaymentStatus) || 'pending';

  const payments = await prisma.subscriptionPayment.findMany({
    where: { status: statusFilter },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          businessCode: true,
          type: true,
          ownerName: true,
          phone: true,
        },
      },
      submitter: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ data: payments });
});

platformRouter.post('/payments/:id/verify', requirePlatformAdmin, async (req: Request, res: Response) => {
  const id = getParamId(req);
  const admin = req.platformAdmin!;

  const payment = await prisma.subscriptionPayment.findUnique({
    where: { id },
    include: {
      business: {
        include: { subscription: true },
      },
    },
  });

  if (!payment) {
    throw AppError.notFound('Subscription payment record not found.');
  }

  if (payment.status !== 'pending') {
    throw AppError.badRequest(`Payment is already ${payment.status}.`);
  }

  const sub = payment.business.subscription;
  if (!sub) {
    throw AppError.notFound('Business subscription record not found.');
  }

  // BR-06, AC-05: new expires_at = later of (now, current expires_at) + 30 days
  const baseTime = Math.max(Date.now(), sub.expiresAt.getTime());
  const newExpiresAt = new Date(baseTime + 30 * 24 * 3600 * 1000);

  await prisma.$transaction(async (tx) => {
    // 1. Mark payment verified
    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: SubscriptionPaymentStatus.verified,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
    });

    // 2. Activate subscription and extend expiry
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.active,
        plan: payment.plan,
        expiresAt: newExpiresAt,
      },
    });

    // 3. Subscription event
    await tx.subscriptionEvent.create({
      data: {
        businessId: payment.businessId,
        event: SubscriptionEventType.payment_verified,
        plan: payment.plan,
        amount: payment.amount,
        detail: `Payment verified: ${payment.reference} Nu. ${payment.amount}`,
        actorPlatformAdminId: admin.id,
      },
    });

    // 4. Audit row
    await tx.auditLog.create({
      data: {
        businessId: payment.businessId,
        actorPlatformAdminId: admin.id,
        actorName: admin.email,
        action: 'payment verified',
        entityType: 'subscription_payment',
        entityId: payment.id,
        detail: `Payment verified: ${payment.reference} Nu. ${payment.amount}`,
      },
    });
  });

  res.status(200).json({
    message: 'Payment verified and subscription activated.',
    newExpiresAt: newExpiresAt.toISOString(),
  });
});

const rejectPaymentSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required.'),
});

platformRouter.post('/payments/:id/reject', requirePlatformAdmin, async (req: Request, res: Response) => {
  const id = getParamId(req);
  const admin = req.platformAdmin!;

  const parsed = rejectPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.validationError('Rejection reason is required.');
  }

  const payment = await prisma.subscriptionPayment.findUnique({
    where: { id },
  });

  if (!payment) {
    throw AppError.notFound('Subscription payment record not found.');
  }

  if (payment.status !== 'pending') {
    throw AppError.badRequest(`Payment is already ${payment.status}.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: SubscriptionPaymentStatus.rejected,
        rejectReason: parsed.data.reason,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        businessId: payment.businessId,
        event: SubscriptionEventType.payment_rejected,
        plan: payment.plan,
        amount: payment.amount,
        detail: `Payment rejected: ${parsed.data.reason}`,
        actorPlatformAdminId: admin.id,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: payment.businessId,
        actorPlatformAdminId: admin.id,
        actorName: admin.email,
        action: 'payment rejected',
        entityType: 'subscription_payment',
        entityId: payment.id,
        detail: `Payment rejected: ${parsed.data.reason}`,
      },
    });
  });

  res.status(200).json({ message: 'Payment rejected.' });
});
