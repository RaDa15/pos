import { Router, type Request, type Response } from 'express';
import {
  CreateTaxRateRequestSchema,
  UpdateTaxRateRequestSchema,
  UpdateCustomerDiscountsRequestSchema,
  getBusinessTypeConfig,
} from '@pos/shared';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireEmployee, requirePermission } from '../middleware/auth.js';

export const settingsRouter: Router = Router();

// All settings routes require employee authentication and settings.manage permission
settingsRouter.use(requireEmployee);
settingsRouter.use(requirePermission('settings.manage'));

/**
 * GET /settings/tax-rates
 * Returns all tax rates for the business.
 */
settingsRouter.get('/tax-rates', async (req: Request, res: Response) => {
  const taxRates = await prisma.taxRate.findMany({
    where: {
      businessId: req.business!.id,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  res.json({
    data: taxRates.map((t) => ({
      id: t.id,
      name: t.name,
      rate: Number(t.rate),
      mode: t.mode,
      category: t.category,
      effectiveDate: t.effectiveDate.toISOString().split('T')[0],
      active: t.active,
      isDefault: t.isDefault,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  });
});

/**
 * POST /settings/tax-rates
 * Creates a new tax rate (BR-10).
 */
settingsRouter.post('/tax-rates', async (req: Request, res: Response) => {
  const body = CreateTaxRateRequestSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    if (body.isDefault) {
      await tx.taxRate.updateMany({
        where: { businessId: req.business!.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const created = await tx.taxRate.create({
      data: {
        businessId: req.business!.id,
        name: body.name,
        rate: body.rate,
        mode: body.mode,
        category: body.category,
        effectiveDate: new Date(body.effectiveDate),
        isDefault: body.isDefault,
      },
    });

    await writeAuditLog(
      {
        businessId: req.business!.id,
        actorEmployeeId: req.employee!.id,
        actorName: req.employee!.name,
        action: 'tax_rate_created',
        entityType: 'tax_rate',
        entityId: created.id,
        detail: `${created.name} (${created.rate}%, ${created.mode})`,
      },
      tx
    );

    return created;
  });

  res.status(201).json({
    data: {
      id: result.id,
      name: result.name,
      rate: Number(result.rate),
      mode: result.mode,
      category: result.category,
      effectiveDate: result.effectiveDate.toISOString().split('T')[0],
      active: result.active,
      isDefault: result.isDefault,
    },
  });
});

/**
 * PATCH /settings/tax-rates/:id
 * Updates tax rate name, effective date, active, or default status.
 * BR-10 & AC-52: rate %, mode, and category are strictly immutable!
 */
settingsRouter.patch('/tax-rates/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;

  // AC-52 / BR-10: Reject if rate, mode, or category are present in payload
  const rawBody = req.body as Record<string, unknown>;
  if ('rate' in rawBody || 'mode' in rawBody || 'category' in rawBody) {
    throw AppError.validationError(
      'Tax rate percentage, mode, and category cannot be edited after creation (BR-10). Create a new tax rate instead.'
    );
  }

  const body = UpdateTaxRateRequestSchema.parse(req.body);

  const existing = await prisma.taxRate.findFirst({
    where: { id, businessId: req.business!.id },
  });

  if (!existing) {
    throw AppError.notFound('Tax rate not found.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (body.isDefault) {
      await tx.taxRate.updateMany({
        where: { businessId: req.business!.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const res = await tx.taxRate.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
        active: body.active,
        isDefault: body.isDefault,
      },
    });

    await writeAuditLog(
      {
        businessId: req.business!.id,
        actorEmployeeId: req.employee!.id,
        actorName: req.employee!.name,
        action: 'tax_rate_updated',
        entityType: 'tax_rate',
        entityId: res.id,
        detail: `Updated tax rate ${res.name}`,
      },
      tx
    );

    return res;
  });

  res.json({
    data: {
      id: updated.id,
      name: updated.name,
      rate: Number(updated.rate),
      mode: updated.mode,
      category: updated.category,
      effectiveDate: updated.effectiveDate.toISOString().split('T')[0],
      active: updated.active,
      isDefault: updated.isDefault,
    },
  });
});

/**
 * GET /settings/customer-discounts
 * Returns configured discounts per customer type for the business type.
 */
settingsRouter.get('/customer-discounts', async (req: Request, res: Response) => {
  const allowedCustomerTypes = getBusinessTypeConfig(req.business!.type).allowedCustomerTypes;

  const existing = await prisma.customerTypeDiscount.findMany({
    where: {
      businessId: req.business!.id,
    },
  });

  const discountMap = new Map(existing.map((d) => [d.customerType, Number(d.discountPct)]));

  const items = allowedCustomerTypes.map((type) => ({
    customerType: type,
    discountPct: discountMap.get(type) ?? 0,
  }));

  res.json({ data: items });
});

/**
 * PUT /settings/customer-discounts
 * Replaces all customer-type discounts for this business (BR-34).
 */
settingsRouter.put('/customer-discounts', async (req: Request, res: Response) => {
  const body = UpdateCustomerDiscountsRequestSchema.parse(req.body);
  const allowedCustomerTypes = getBusinessTypeConfig(req.business!.type).allowedCustomerTypes;

  // Validate only allowed customer types for this business
  for (const item of body.items) {
    if (!allowedCustomerTypes.includes(item.customerType)) {
      throw AppError.validationError(
        `Customer type "${item.customerType}" is not applicable to ${req.business!.type} businesses.`
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    // Delete existing
    await tx.customerTypeDiscount.deleteMany({
      where: { businessId: req.business!.id },
    });

    // Insert only items with discountPct > 0 or all configured
    if (body.items.length > 0) {
      await tx.customerTypeDiscount.createMany({
        data: body.items.map((i) => ({
          businessId: req.business!.id,
          customerType: i.customerType,
          discountPct: i.discountPct,
        })),
      });
    }

    await writeAuditLog(
      {
        businessId: req.business!.id,
        actorEmployeeId: req.employee!.id,
        actorName: req.employee!.name,
        action: 'customer_discounts_updated',
        entityType: 'customer_type_discounts',
        detail: `Updated customer discounts for ${body.items.length} types`,
      },
      tx
    );
  });

  const updated = await prisma.customerTypeDiscount.findMany({
    where: { businessId: req.business!.id },
  });

  res.json({
    data: updated.map((d) => ({
      customerType: d.customerType,
      discountPct: Number(d.discountPct),
    })),
  });
});
