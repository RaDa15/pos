import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission, requireActiveSubscription } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';
import { Prisma } from '@prisma/client';

export const heldOrdersRouter: Router = Router();

heldOrdersRouter.use(requireEmployee);
heldOrdersRouter.use(requirePermission('pos.sell'));
heldOrdersRouter.use(requireActiveSubscription);

const holdOrderSchema = z.object({
  label: z.string().max(80).optional(),
  payload: z.record(z.unknown()),
});

/**
 * GET /held-orders
 * List active held orders for this business.
 */
heldOrdersRouter.get('/', async (req: Request, res: Response) => {
  const businessId = req.business!.id;

  const orders = await prisma.heldOrder.findMany({
    where: { businessId },
    include: {
      creator: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const formatted = orders.map((o) => ({
    id: o.id,
    label: o.label,
    createdAt: o.createdAt.toISOString(),
    creator: {
      id: o.creator.id,
      name: o.creator.name,
    },
    payload: o.payload,
  }));

  res.json({ data: formatted });
});

/**
 * POST /held-orders
 * Hold current cart / order state per BR-29.
 */
heldOrdersRouter.post('/', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const employee = req.employee!;

  const parseResult = holdOrderSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw AppError.badRequest(parseResult.error.errors[0]?.message || 'Invalid held order payload');
  }

  const { payload, label: rawLabel } = parseResult.data;

  // Default label: "Held HH:MM — <employee name>" in Asia/Thimphu (UTC+6)
  let label = rawLabel?.trim();
  if (!label) {
    const now = new Date();
    const bttTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const hh = String(bttTime.getUTCHours()).padStart(2, '0');
    const mm = String(bttTime.getUTCMinutes()).padStart(2, '0');
    label = `Held ${hh}:${mm} — ${employee.name}`;
  }

  const heldOrder = await prisma.heldOrder.create({
    data: {
      businessId,
      label,
      payload: payload as Prisma.InputJsonValue,
      createdBy: employee.id,
    },
    include: {
      creator: { select: { id: true, name: true } },
    },
  });

  await writeAuditLog({
    businessId,
    actorEmployeeId: employee.id,
    actorName: employee.name,
    action: 'order.held',
    entityType: 'held_order',
    entityId: heldOrder.id,
    detail: `Order held: "${label}"`,
  });

  res.status(201).json({
    data: {
      id: heldOrder.id,
      label: heldOrder.label,
      createdAt: heldOrder.createdAt.toISOString(),
      creator: {
        id: heldOrder.creator.id,
        name: heldOrder.creator.name,
      },
      payload: heldOrder.payload,
    },
  });
});

/**
 * POST /held-orders/:id/resume
 * Returns payload and deletes the held order.
 */
heldOrdersRouter.post('/:id/resume', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const orderId = req.params.id as string;

  const order = await prisma.heldOrder.findFirst({
    where: { id: orderId, businessId },
  });

  if (!order) {
    throw AppError.notFound('Held order not found');
  }

  // Delete held order upon resumption
  await prisma.heldOrder.delete({
    where: { id: order.id },
  });

  res.json({
    data: {
      id: order.id,
      label: order.label,
      payload: order.payload,
    },
  });
});

/**
 * DELETE /held-orders/:id
 * Delete a held order without resuming.
 */
heldOrdersRouter.delete('/:id', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const orderId = req.params.id as string;

  const order = await prisma.heldOrder.findFirst({
    where: { id: orderId, businessId },
  });

  if (!order) {
    throw AppError.notFound('Held order not found');
  }

  await prisma.heldOrder.delete({
    where: { id: order.id },
  });

  res.json({ data: { success: true } });
});
