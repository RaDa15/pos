import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission, requirePlanFeature } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { CreateSupplierRequestSchema, UpdateSupplierRequestSchema } from '@pos/shared';
import { writeAuditLog } from '../lib/audit.js';

export const suppliersRouter: Router = Router();

// Gated by employee login and Plan: Professional for all supplier routes
suppliersRouter.use(requireEmployee);
suppliersRouter.use(requirePlanFeature('suppliers'));

/**
 * GET /suppliers?search=&active=
 * List suppliers with computed paidTotal and outstandingTotal (BR-38, AC-50).
 */
suppliersRouter.get(
  '/',
  requirePermission('suppliers.view'),
  async (req: Request, res: Response) => {
    const { search, active } = req.query;

    const where: Prisma.SupplierWhereInput = {
      businessId: req.business!.id,
    };

    if (active !== undefined && active !== '') {
      where.active = active === 'true' || active === '1';
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
      ];
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        purchases: {
          select: {
            total: true,
            amountPaid: true,
          },
        },
      },
    });

    let totalPaidAll = 0;
    let totalOutstandingAll = 0;

    const data = suppliers.map((s) => {
      let purchasesPaid = 0;
      let purchasesOutstanding = 0;

      for (const p of s.purchases) {
        const total = parseFloat(p.total.toString());
        const paid = parseFloat(p.amountPaid.toString());
        purchasesPaid += paid;
        purchasesOutstanding += total - paid;
      }

      const openingPaid = parseFloat(s.openingPaid.toString());
      const openingOutstanding = parseFloat(s.openingOutstanding.toString());

      const paidTotal = Math.round((openingPaid + purchasesPaid) * 100) / 100;
      const outstandingTotal = Math.round((openingOutstanding + purchasesOutstanding) * 100) / 100;

      totalPaidAll += paidTotal;
      totalOutstandingAll += outstandingTotal;

      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        address: s.address,
        notes: s.notes,
        openingPaid,
        openingOutstanding,
        paidTotal,
        outstandingTotal,
        active: s.active,
        createdAt: s.createdAt.toISOString(),
      };
    });

    res.json({
      data,
      summary: {
        totalPaid: Math.round(totalPaidAll * 100) / 100,
        totalOutstanding: Math.round(totalOutstandingAll * 100) / 100,
      },
    });
  }
);

/**
 * POST /suppliers
 * Create a new supplier.
 */
suppliersRouter.post(
  '/',
  requirePermission('suppliers.manage'),
  async (req: Request, res: Response) => {
    const body = CreateSupplierRequestSchema.parse(req.body);

    const supplier = await prisma.supplier.create({
      data: {
        businessId: req.business!.id,
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        notes: body.notes || null,
        openingPaid: body.openingPaid,
        openingOutstanding: body.openingOutstanding,
      },
    });

    await writeAuditLog({
      businessId: req.business!.id,
      actorEmployeeId: req.employee!.id,
      actorName: req.employee!.name,
      action: 'supplier_created',
      entityType: 'supplier',
      entityId: supplier.id,
      detail: `Created supplier "${supplier.name}"`,
    });

    res.status(201).json({
      data: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
        openingPaid: parseFloat(supplier.openingPaid.toString()),
        openingOutstanding: parseFloat(supplier.openingOutstanding.toString()),
        paidTotal: parseFloat(supplier.openingPaid.toString()),
        outstandingTotal: parseFloat(supplier.openingOutstanding.toString()),
        active: supplier.active,
        createdAt: supplier.createdAt.toISOString(),
      },
    });
  }
);

/**
 * PATCH /suppliers/:id
 * Edit supplier details or deactivate/activate.
 */
suppliersRouter.patch(
  '/:id',
  requirePermission('suppliers.manage'),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = UpdateSupplierRequestSchema.parse(req.body);

    const existing = await prisma.supplier.findFirst({
      where: { id, businessId: req.business!.id },
    });

    if (!existing) {
      throw AppError.notFound('Supplier not found.');
    }

    const updated = await prisma.supplier.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        phone: body.phone !== undefined ? (body.phone || null) : undefined,
        email: body.email !== undefined ? (body.email || null) : undefined,
        address: body.address !== undefined ? (body.address || null) : undefined,
        notes: body.notes !== undefined ? (body.notes || null) : undefined,
        openingPaid: body.openingPaid !== undefined ? body.openingPaid : undefined,
        openingOutstanding: body.openingOutstanding !== undefined ? body.openingOutstanding : undefined,
        active: body.active !== undefined ? body.active : undefined,
      },
      include: {
        purchases: {
          select: {
            total: true,
            amountPaid: true,
          },
        },
      },
    });

    let purchasesPaid = 0;
    let purchasesOutstanding = 0;
    for (const p of updated.purchases) {
      const total = parseFloat(p.total.toString());
      const paid = parseFloat(p.amountPaid.toString());
      purchasesPaid += paid;
      purchasesOutstanding += total - paid;
    }

    const openingPaid = parseFloat(updated.openingPaid.toString());
    const openingOutstanding = parseFloat(updated.openingOutstanding.toString());
    const paidTotal = Math.round((openingPaid + purchasesPaid) * 100) / 100;
    const outstandingTotal = Math.round((openingOutstanding + purchasesOutstanding) * 100) / 100;

    await writeAuditLog({
      businessId: req.business!.id,
      actorEmployeeId: req.employee!.id,
      actorName: req.employee!.name,
      action: 'supplier_updated',
      entityType: 'supplier',
      entityId: updated.id,
      detail: `Updated supplier "${updated.name}"`,
    });

    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        address: updated.address,
        notes: updated.notes,
        openingPaid,
        openingOutstanding,
        paidTotal,
        outstandingTotal,
        active: updated.active,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  }
);
