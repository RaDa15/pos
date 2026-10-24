import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../lib/audit.js';
import { getBttDate, parseBttDateTime } from '../lib/dates.js';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from '@pos/shared';
import { Prisma } from '@prisma/client';

export const expensesRouter: Router = Router();

// Apply auth to all expense endpoints
expensesRouter.use(requireAuth);

const createExpenseSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(200),
    category: z.enum(EXPENSE_CATEGORIES),
    amount: z.number().positive('Amount must be greater than zero'),
    businessDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
      .optional(),
    paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).default('cash'),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict();

const updateExpenseSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    amount: z.number().positive().optional(),
    businessDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
      .optional(),
    paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .strict();

/**
 * GET /api/v1/expenses
 * List expenses with totalInRange.
 */
expensesRouter.get(
  '/',
  requirePermission('expenses.view'),
  async (req: Request, res: Response) => {
    const businessId = req.session.businessId!;
    const { from, to, category } = req.query as {
      from?: string;
      to?: string;
      category?: string;
    };

    const where: Prisma.ExpenseWhereInput = { businessId };

    if (category && (EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      where.category = category as ExpenseCategory;
    }

    if (from || to) {
      where.businessDate = {};
      if (from) {
        where.businessDate.gte = parseBttDateTime(from, false);
      }
      if (to) {
        where.businessDate.lte = parseBttDateTime(to, true);
      }
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        creator: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });

    const totalInRangeChhertum = expenses.reduce((sum, e) => {
      return sum + Math.round(Number(e.amount) * 100);
    }, 0);

    const records = expenses.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      amount: Number(e.amount),
      businessDate: e.businessDate.toISOString().slice(0, 10),
      paymentMethod: e.paymentMethod,
      description: e.description,
      createdBy: e.createdBy,
      creatorName: e.creator?.name || 'Unknown',
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));

    res.json({
      data: {
        records,
        totalInRange: totalInRangeChhertum / 100,
      },
    });
  }
);

/**
 * POST /api/v1/expenses
 * Record an expense (audited).
 */
expensesRouter.post(
  '/',
  requirePermission('expenses.manage'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;
    const employeeId = req.employee!.id;
    const employeeName = req.employee?.name || 'Staff';

    const parseResult = createExpenseSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid expense payload',
          details: parseResult.error.errors,
        },
      });
      return;
    }

    const body = parseResult.data;
    const bDate = body.businessDate
      ? new Date(`${body.businessDate}T00:00:00.000Z`)
      : getBttDate().businessDate;

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          businessId,
          name: body.name,
          category: body.category as ExpenseCategory,
          amount: new Prisma.Decimal(body.amount.toFixed(2)),
          businessDate: bDate,
          paymentMethod: body.paymentMethod as ExpensePaymentMethod,
          description: body.description ?? null,
          createdBy: employeeId,
        },
        include: {
          creator: { select: { id: true, name: true, role: true } },
        },
      });

      await writeAuditLog(
        {
          businessId,
          actorEmployeeId: employeeId,
          actorName: employeeName,
          action: 'Expense recorded',
          entityType: 'expense',
          entityId: created.id,
          detail: `${created.name} — Nu. ${body.amount.toFixed(2)} (${created.category})`,
        },
        tx
      );

      return created;
    });

    res.status(201).json({
      data: {
        expense: {
          id: expense.id,
          name: expense.name,
          category: expense.category,
          amount: Number(expense.amount),
          businessDate: expense.businessDate.toISOString().slice(0, 10),
          paymentMethod: expense.paymentMethod,
          description: expense.description,
          createdBy: expense.createdBy,
          creatorName: expense.creator?.name || employeeName,
          createdAt: expense.createdAt.toISOString(),
          updatedAt: expense.updatedAt.toISOString(),
        },
      },
    });
  }
);

/**
 * PATCH /api/v1/expenses/:id
 * Edit an expense (audited).
 */
expensesRouter.patch(
  '/:id',
  requirePermission('expenses.manage'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;
    const employeeId = req.employee!.id;
    const employeeName = req.employee?.name || 'Staff';
    const id = req.params.id as string;

    const existing = await prisma.expense.findFirst({
      where: { id, businessId },
    });

    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Expense not found.' },
      });
      return;
    }

    const parseResult = updateExpenseSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid expense update payload',
          details: parseResult.error.errors,
        },
      });
      return;
    }

    const body = parseResult.data;
    const updateData: Prisma.ExpenseUpdateInput = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.category !== undefined) updateData.category = body.category as ExpenseCategory;
    if (body.amount !== undefined) updateData.amount = new Prisma.Decimal(body.amount.toFixed(2));
    if (body.businessDate !== undefined) {
      updateData.businessDate = new Date(`${body.businessDate}T00:00:00.000Z`);
    }
    if (body.paymentMethod !== undefined) {
      updateData.paymentMethod = body.paymentMethod as ExpensePaymentMethod;
    }
    if (body.description !== undefined) updateData.description = body.description;

    const updated = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.update({
        where: { id },
        data: updateData,
        include: { creator: { select: { id: true, name: true, role: true } } },
      });

      const oldAmount = Number(existing.amount);
      const newAmount = body.amount !== undefined ? body.amount : oldAmount;
      const amountChange =
        oldAmount !== newAmount
          ? `Nu. ${oldAmount.toFixed(2)} → Nu. ${newAmount.toFixed(2)}`
          : `Nu. ${newAmount.toFixed(2)}`;

      await writeAuditLog(
        {
          businessId,
          actorEmployeeId: employeeId,
          actorName: employeeName,
          action: 'Expense changed',
          entityType: 'expense',
          entityId: exp.id,
          detail: `${existing.name}: ${amountChange}`,
        },
        tx
      );

      return exp;
    });

    res.json({
      data: {
        expense: {
          id: updated.id,
          name: updated.name,
          category: updated.category,
          amount: Number(updated.amount),
          businessDate: updated.businessDate.toISOString().slice(0, 10),
          paymentMethod: updated.paymentMethod,
          description: updated.description,
          createdBy: updated.createdBy,
          creatorName: (updated as typeof updated & { creator?: { name?: string } }).creator?.name || 'Staff',
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
    });
  }
);

/**
 * DELETE /api/v1/expenses/:id
 * Delete an expense (audited).
 */
expensesRouter.delete(
  '/:id',
  requirePermission('expenses.manage'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;
    const employeeId = req.employee!.id;
    const employeeName = req.employee?.name || 'Staff';
    const id = req.params.id as string;

    const existing = await prisma.expense.findFirst({
      where: { id, businessId },
    });

    if (!existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Expense not found.' },
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.expense.delete({
        where: { id },
      });

      await writeAuditLog(
        {
          businessId,
          actorEmployeeId: employeeId,
          actorName: employeeName,
          action: 'Expense deleted',
          entityType: 'expense',
          entityId: id,
          detail: `${existing.name} — Nu. ${Number(existing.amount).toFixed(2)}`,
        },
        tx
      );
    });

    res.json({
      data: { success: true },
    });
  }
);
