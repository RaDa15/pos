import { Router, type Request, type Response } from 'express';
import { RegisterRequestSchema, getBusinessTypeConfig } from '@pos/shared';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, assertPasswordPolicy } from '../lib/passwords.js';
import { generateUniqueBusinessCode } from '../lib/business-code.js';
import { writeAuditLog } from '../lib/audit.js';
import { registerRateLimit } from '../middleware/rateLimit.js';

export const registerRouter: Router = Router();

/**
 * GET /register/name-available?name=
 * Check if business name is unique across the platform (case-insensitive, trimmed).
 * Reference: docs/02-BUSINESS-RULES.md BR-01.
 */
registerRouter.get('/name-available', async (req: Request, res: Response) => {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  if (!name) {
    res.json({ available: false });
    return;
  }

  const nameKey = name.toLowerCase();
  const existing = await prisma.business.findUnique({
    where: { nameKey },
    select: { id: true },
  });

  res.json({ available: !existing });
});

/**
 * POST /register
 * Create business, first admin, tax rates, customer discounts, trial subscription.
 * Reference: docs/02-BUSINESS-RULES.md BR-01, BR-03, BR-10.
 */
registerRouter.post('/', registerRateLimit, async (req: Request, res: Response) => {
  const body = RegisterRequestSchema.parse(req.body);

  const trimmedName = body.business.name.trim();
  const nameKey = trimmedName.toLowerCase();

  // BR-01: Business names are unique across the platform, ignoring case and surrounding spaces
  const existingName = await prisma.business.findUnique({
    where: { nameKey },
    select: { id: true },
  });

  if (existingName) {
    throw AppError.businessNameTaken('Business name is already registered.');
  }

  // Password policy check
  assertPasswordPolicy(body.password, {
    businessName: trimmedName,
    username: 'admin',
  });

  const businessCode = await generateUniqueBusinessCode();
  const passwordHash = await hashPassword(body.password);
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const currentYear = new Date().getFullYear();

  const business = await prisma.$transaction(async (tx) => {
    // 1. Business
    const biz = await tx.business.create({
      data: {
        name: trimmedName,
        nameKey,
        businessCode,
        type: body.business.type,
        ownerName: body.business.ownerName,
        phone: body.business.phone,
        email: body.business.email,
        address: body.business.address || null,
        gstNo: body.business.gstNo || null,
        gstRegistered: Boolean(body.business.gstNo),
        passwordHash,
      },
    });

    // 2. First Admin Employee (BR-02, BR-03)
    await tx.employee.create({
      data: {
        businessId: biz.id,
        name: body.business.ownerName,
        username: 'admin',
        usernameKey: 'admin',
        role: 'admin',
        passwordHash,
        active: true,
        mustChangePassword: false,
      },
    });

    // 3. Default Tax Rates (BR-10)
    await tx.taxRate.createMany({
      data: [
        {
          businessId: biz.id,
          name: 'GST Standard 5% exclusive (default)',
          rate: 5.0,
          mode: 'exclusive',
          category: 'standard',
          isDefault: true,
          active: true,
          effectiveDate: new Date(),
        },
        {
          businessId: biz.id,
          name: 'GST Zero-rated 0%',
          rate: 0.0,
          mode: 'exclusive',
          category: 'zero_rated',
          isDefault: false,
          active: true,
          effectiveDate: new Date(),
        },
        {
          businessId: biz.id,
          name: 'GST Exempt 0%',
          rate: 0.0,
          mode: 'exclusive',
          category: 'exempt',
          isDefault: false,
          active: true,
          effectiveDate: new Date(),
        },
      ],
    });

    // 4. Default Customer-Type Discounts (BR-34, BR-35)
    const allowedCustomerTypes = getBusinessTypeConfig(biz.type).allowedCustomerTypes;
    await tx.customerTypeDiscount.createMany({
      data: allowedCustomerTypes.map((customerType) => ({
        businessId: biz.id,
        customerType,
        discountPct: 0.0,
      })),
    });

    // 5. Subscription (BR-03: status 'trial', 14 days)
    await tx.subscription.create({
      data: {
        businessId: biz.id,
        plan: body.plan,
        status: 'trial',
        expiresAt: trialEndsAt,
      },
    });

    // 6. Subscription Event
    await tx.subscriptionEvent.create({
      data: {
        businessId: biz.id,
        event: 'registered',
        plan: body.plan,
        detail: '14-day trial started',
      },
    });

    // 7. Initial Counters
    await tx.counter.createMany({
      data: [
        { businessId: biz.id, name: 'invoice', year: currentYear, value: 0 },
        { businessId: biz.id, name: 'kot', year: 0, value: 0 },
        { businessId: biz.id, name: 'credit_settlement', year: 0, value: 0 },
        { businessId: biz.id, name: 'purchase', year: currentYear, value: 0 },
      ],
    });

    // 8. Audit Log
    await writeAuditLog(
      {
        businessId: biz.id,
        actorName: body.business.ownerName,
        action: 'Registration',
        entityType: 'business',
        entityId: biz.id,
        detail: `Registered ${biz.name} with plan ${body.plan}`,
      },
      tx
    );

    return biz;
  });

  res.status(201).json({
    data: {
      businessCode: business.businessCode,
      name: business.name,
      trialEndsAt: trialEndsAt.toISOString(),
    },
  });
});
