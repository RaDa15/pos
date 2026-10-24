import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission, computeEffectiveStatus } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { PLAN_LIMITS } from '@pos/shared';
import {
  SubscriptionStatus,
  SubscriptionEventType,
  SubscriptionPaymentMethod,
  SubscriptionPaymentStatus,
  PlanCode,
  Prisma,
} from '@prisma/client';

export const subscriptionRouter: Router = Router();

subscriptionRouter.use(requireEmployee);
subscriptionRouter.use(requirePermission('subscription.manage'));

/**
 * GET /api/v1/subscription
 * Retrieves current subscription details, status, entitlements, payments, and events history.
 * Accessible even if subscription is expired (BR-05, AC-04).
 */
subscriptionRouter.get('/', async (req: Request, res: Response) => {
  const businessId = req.business!.id;

  const sub = await prisma.subscription.findUnique({
    where: { businessId },
  });

  if (!sub) {
    throw AppError.notFound('Subscription record not found.');
  }

  const activeNonAdminCount = await prisma.employee.count({
    where: {
      businessId,
      active: true,
      role: { not: 'admin' },
    },
  });

  const now = Date.now();
  const expiresAt = sub.expiresAt;
  const effectiveStatus = computeEffectiveStatus(sub.status, expiresAt);
  const msLeft = expiresAt.getTime() - now;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

  const payments = await prisma.subscriptionPayment.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const history = await prisma.subscriptionEvent.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  res.status(200).json({
    data: {
      id: sub.id,
      plan: sub.plan,
      status: sub.status,
      effectiveStatus,
      startedAt: sub.startedAt.toISOString(),
      expiresAt: sub.expiresAt.toISOString(),
      daysLeft,
      planLimits: PLAN_LIMITS[sub.plan as PlanCode],
      activeNonAdminCount,
      payments: payments.map((p) => ({
        id: p.id,
        plan: p.plan,
        amount: Number(p.amount),
        method: p.method,
        bankName: p.bankName,
        reference: p.reference,
        paidOn: p.paidOn.toISOString().slice(0, 10),
        status: p.status,
        rejectReason: p.rejectReason,
        createdAt: p.createdAt.toISOString(),
      })),
      history: history.map((h) => ({
        id: h.id,
        event: h.event,
        plan: h.plan,
        amount: h.amount ? Number(h.amount) : null,
        detail: h.detail,
        createdAt: h.createdAt.toISOString(),
      })),
    },
  });
});

const submitPaymentSchema = z.object({
  method: z.nativeEnum(SubscriptionPaymentMethod),
  bankName: z.string().optional().nullable(),
  reference: z.string().min(1, 'Payment reference / transaction ID is required.'),
  paidOn: z.string().min(1, 'Paid on date is required.'),
  amount: z.number().positive('Amount must be greater than 0.'),
  plan: z.nativeEnum(PlanCode).optional(),
});

/**
 * POST /api/v1/subscription/payment
 * Submits an offline renewal payment reference for platform admin verification (BR-06, AC-05).
 */
subscriptionRouter.post('/payment', async (req: Request, res: Response) => {
  const parsed = submitPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.validationError('Invalid payment submission details', {
      errors: parsed.error.format(),
    });
  }

  const businessId = req.business!.id;
  const employeeId = req.employee!.id;
  const employeeName = req.employee!.name;

  const sub = await prisma.subscription.findUnique({
    where: { businessId },
  });

  if (!sub) {
    throw AppError.notFound('Subscription record not found.');
  }

  const targetPlan = parsed.data.plan || sub.plan;
  const paidOnDate = new Date(`${parsed.data.paidOn.slice(0, 10)}T00:00:00.000Z`);

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.subscriptionPayment.create({
      data: {
        businessId,
        plan: targetPlan,
        amount: new Prisma.Decimal(parsed.data.amount),
        method: parsed.data.method,
        bankName: parsed.data.bankName || null,
        reference: parsed.data.reference.trim(),
        paidOn: paidOnDate,
        status: SubscriptionPaymentStatus.pending,
        submittedBy: employeeId,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        businessId,
        event: SubscriptionEventType.payment_submitted,
        plan: targetPlan,
        amount: new Prisma.Decimal(parsed.data.amount),
        detail: `Payment submitted: ${parsed.data.method} ref ${parsed.data.reference.trim()} Nu. ${parsed.data.amount}`,
        actorEmployeeId: employeeId,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId,
        actorEmployeeId: employeeId,
        actorName: employeeName,
        action: 'payment submitted',
        entityType: 'subscription_payment',
        entityId: p.id,
        detail: `Payment submitted: ${parsed.data.reference.trim()} Nu. ${parsed.data.amount}`,
      },
    });

    return p;
  });

  res.status(201).json({
    message: 'Payment submitted successfully. Awaiting platform verification.',
    data: payment,
  });
});

const changePlanSchema = z.object({
  plan: z.nativeEnum(PlanCode),
});

/**
 * POST /api/v1/subscription/change-plan
 * Upgrades or downgrades plan with strict limit check enforcement (BR-07, AC-07).
 */
subscriptionRouter.post('/change-plan', async (req: Request, res: Response) => {
  const parsed = changePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.validationError('Invalid plan selected.');
  }

  const businessId = req.business!.id;
  const employeeId = req.employee!.id;
  const employeeName = req.employee!.name;
  const targetPlan = parsed.data.plan;

  const sub = await prisma.subscription.findUnique({
    where: { businessId },
  });

  if (!sub) {
    throw AppError.notFound('Subscription record not found.');
  }

  if (sub.plan === targetPlan) {
    res.status(200).json({ message: 'Already on this plan.', plan: targetPlan });
    return;
  }

  // Check current non-admin employee count against target plan limits
  const activeNonAdminCount = await prisma.employee.count({
    where: {
      businessId,
      active: true,
      role: { not: 'admin' },
    },
  });

  const maxAllowed = PLAN_LIMITS[targetPlan].maxNonAdminEmployees;
  if (activeNonAdminCount > maxAllowed) {
    throw AppError.planLimit(
      `Your business has ${activeNonAdminCount} active non-admin employees, but the ${PLAN_LIMITS[targetPlan].name} plan allows only ${maxAllowed}. Please disable excess employees first.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { plan: targetPlan },
    });

    await tx.subscriptionEvent.create({
      data: {
        businessId,
        event: SubscriptionEventType.plan_changed,
        plan: targetPlan,
        detail: `Plan changed from ${sub.plan} to ${targetPlan}`,
        actorEmployeeId: employeeId,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId,
        actorEmployeeId: employeeId,
        actorName: employeeName,
        action: 'plan changed',
        entityType: 'subscription',
        entityId: sub.id,
        detail: `Plan changed: ${sub.plan} → ${targetPlan}`,
      },
    });
  });

  res.status(200).json({
    message: `Plan changed to ${PLAN_LIMITS[targetPlan].name}.`,
    plan: targetPlan,
  });
});

/**
 * POST /api/v1/subscription/cancel
 * Cancels subscription (BR-04, BR-05).
 */
subscriptionRouter.post('/cancel', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const employeeId = req.employee!.id;
  const employeeName = req.employee!.name;

  const sub = await prisma.subscription.findUnique({
    where: { businessId },
  });

  if (!sub) {
    throw AppError.notFound('Subscription record not found.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: SubscriptionStatus.cancelled },
    });

    await tx.subscriptionEvent.create({
      data: {
        businessId,
        event: SubscriptionEventType.cancelled,
        plan: sub.plan,
        detail: 'Subscription cancelled by Admin',
        actorEmployeeId: employeeId,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId,
        actorEmployeeId: employeeId,
        actorName: employeeName,
        action: 'cancelled',
        entityType: 'subscription',
        entityId: sub.id,
        detail: 'Subscription cancelled by Admin',
      },
    });
  });

  res.status(200).json({ message: 'Subscription cancelled.' });
});
