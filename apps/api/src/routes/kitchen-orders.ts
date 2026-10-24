import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CounterName, KitchenStatus, OrderType } from '@prisma/client';
import { prisma } from '../db/client.js';
import {
  requireEmployee,
  requireActiveSubscription,
  requirePermission,
  requireRestaurant,
} from '../middleware/auth.js';
import { nextNumber } from '../lib/counters.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';

export const kitchenOrdersRouter: Router = Router();

// Gating: Sub, restaurant on all kitchen routes (AC-37)
kitchenOrdersRouter.use(requireEmployee);
kitchenOrdersRouter.use(requireActiveSubscription);
kitchenOrdersRouter.use(requireRestaurant);

const createKitchenOrderSchema = z.object({
  orderType: z
    .enum(['dine_in', 'takeaway', 'delivery', 'room_service', 'pre_booked'])
    .default('dine_in'),
  tableNo: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().int().positive('Quantity must be positive'),
      })
    )
    .min(1, 'Order must contain at least one item'),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(KitchenStatus),
});

const ALLOWED_TRANSITIONS: Record<KitchenStatus, KitchenStatus[]> = {
  [KitchenStatus.new]: [KitchenStatus.accepted, KitchenStatus.cancelled],
  [KitchenStatus.accepted]: [KitchenStatus.preparing, KitchenStatus.cancelled],
  [KitchenStatus.preparing]: [KitchenStatus.ready, KitchenStatus.cancelled],
  [KitchenStatus.ready]: [KitchenStatus.served, KitchenStatus.cancelled],
  [KitchenStatus.served]: [],
  [KitchenStatus.cancelled]: [],
};

/**
 * GET /kitchen-orders
 * Kitchen board data (default: open orders + served/cancelled from today)
 */
kitchenOrdersRouter.get('/', requirePermission('kitchen.view'), async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const statusQuery = req.query.status as KitchenStatus | undefined;
  const fromQuery = req.query.from as string | undefined;

  let whereClause: Record<string, unknown> = { businessId };

  if (statusQuery && Object.values(KitchenStatus).includes(statusQuery)) {
    whereClause = { businessId, status: statusQuery };
  } else {
    const fromDate = fromQuery
      ? new Date(fromQuery)
      : new Date(new Date().setHours(0, 0, 0, 0));

    whereClause = {
      businessId,
      OR: [
        { status: { in: [KitchenStatus.new, KitchenStatus.accepted, KitchenStatus.preparing, KitchenStatus.ready] } },
        {
          status: { in: [KitchenStatus.served, KitchenStatus.cancelled] },
          createdAt: { gte: fromDate },
        },
      ],
    };
  }

  const orders = await prisma.kitchenOrder.findMany({
    where: whereClause,
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              unit: true,
              category: true,
              sellPrice: true,
            },
          },
        },
      },
      creator: { select: { id: true, name: true, username: true, role: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const formatted = orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    orderType: o.orderType,
    tableNo: o.tableNo,
    note: o.note,
    status: o.status,
    billed: o.billed,
    saleId: o.saleId,
    customerId: o.customerId,
    customer: o.customer ? { id: o.customer.id, name: o.customer.name, phone: o.customer.phone } : null,
    createdBy: o.createdBy,
    creator: o.creator ? { id: o.creator.id, name: o.creator.name, role: o.creator.role } : null,
    statusChangedAt: o.statusChangedAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      qty: i.qty,
      unit: i.product?.unit || 'pc',
      category: i.product?.category || '',
      sellPrice: i.product ? Number(i.product.sellPrice) : 0,
    })),
  }));

  res.json({ data: formatted });
});

/**
 * GET /kitchen-orders/billable
 * Ready/Served orders that have not yet been billed (for POS billing flow)
 */
kitchenOrdersRouter.get('/billable', requirePermission('pos.sell'), async (req: Request, res: Response) => {
  const businessId = req.business!.id;

  const orders = await prisma.kitchenOrder.findMany({
    where: {
      businessId,
      status: { in: [KitchenStatus.ready, KitchenStatus.served] },
      billed: false,
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          type: true,
          creditLimit: true,
          outstandingBalance: true,
        },
      },
      creator: { select: { id: true, name: true } },
      items: {
        include: {
          product: {
            include: {
              taxRate: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const formatted = orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    orderType: o.orderType,
    tableNo: o.tableNo,
    note: o.note,
    status: o.status,
    billed: o.billed,
    createdAt: o.createdAt.toISOString(),
    customer: o.customer
      ? {
          id: o.customer.id,
          name: o.customer.name,
          phone: o.customer.phone,
          type: o.customer.type,
          creditLimit: o.customer.creditLimit !== null ? Number(o.customer.creditLimit) : null,
          outstandingBalance: Number(o.customer.outstandingBalance),
        }
      : null,
    creator: o.creator ? { id: o.creator.id, name: o.creator.name } : null,
    items: o.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            barcode: item.product.barcode,
            category: item.product.category,
            unit: item.product.unit,
            sellPrice: Number(item.product.sellPrice),
            stock: item.product.stock,
            trackStock: item.product.trackStock,
            minStock: item.product.minStock,
            taxRate: {
              id: item.product.taxRate.id,
              rate: Number(item.product.taxRate.rate),
              mode: item.product.taxRate.mode,
              category: item.product.taxRate.category,
            },
          }
        : null,
    })),
  }));

  res.json({ data: formatted });
});

/**
 * POST /kitchen-orders
 * Create a new kitchen order (assigns sequential KOT-NNNN)
 */
kitchenOrdersRouter.post('/', requirePermission('kitchen.create'), async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const employeeId = req.employee!.id;

  const parsed = createKitchenOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.validationError('Invalid kitchen order details', {
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const body = parsed.data;

  const order = await prisma.$transaction(async (tx) => {
    // 1. Verify products exist and are active
    const productIds = body.items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        businessId,
        active: true,
      },
    });

    if (products.length !== productIds.length) {
      throw AppError.notFound('One or more selected products were not found or are inactive');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // 2. Generate sequential KOT number (BR-28)
    const { formatted: orderNo } = await nextNumber(tx, businessId, CounterName.kot);

    // 3. Create kitchen order and items
    const created = await tx.kitchenOrder.create({
      data: {
        businessId,
        orderNo,
        orderType: body.orderType as OrderType,
        tableNo: body.tableNo || null,
        note: body.note || null,
        customerId: body.customerId || null,
        createdBy: employeeId,
        status: KitchenStatus.new,
        billed: false,
        items: {
          create: body.items.map((i) => ({
            businessId,
            productId: i.productId,
            name: productMap.get(i.productId)!.name,
            qty: i.qty,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                sellPrice: true,
                category: true,
              },
            },
          },
        },
        creator: { select: { id: true, name: true, role: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    // 4. Audit Log
    await writeAuditLog(
      {
        businessId,
        actorEmployeeId: employeeId,
        actorName: req.employee!.name,
        action: 'kitchen_order.created',
        entityType: 'kitchen_order',
        entityId: created.id,
        detail: `Created ${orderNo} (${created.orderType}${created.tableNo ? ` table ${created.tableNo}` : ''}) with ${created.items.length} items`,
      },
      tx
    );

    return created;
  });

  res.status(201).json({
    data: {
      id: order.id,
      orderNo: order.orderNo,
      orderType: order.orderType,
      tableNo: order.tableNo,
      note: order.note,
      status: order.status,
      billed: order.billed,
      createdAt: order.createdAt.toISOString(),
      creator: order.creator,
      customer: order.customer,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        name: i.name,
        qty: i.qty,
        unit: i.product?.unit || 'pc',
        sellPrice: i.product ? Number(i.product.sellPrice) : 0,
      })),
    },
  });
});

/**
 * POST /kitchen-orders/:id/status
 * Transition kitchen order status per 02-BUSINESS-RULES.md §4.1 state machine
 */
kitchenOrdersRouter.post('/:id/status', requirePermission('kitchen.update'), async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const employeeId = req.employee!.id;
  const id = req.params.id as string;

  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.validationError('Invalid status transition', {
      errors: parsed.error.flatten().fieldErrors,
    });
  }

  const { status: targetStatus } = parsed.data;

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const existing = await tx.kitchenOrder.findFirst({
      where: { id, businessId },
    });

    if (!existing) {
      throw AppError.notFound('Kitchen order not found');
    }

    const currentStatus = existing.status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(targetStatus)) {
      throw AppError.invalidTransition(
        `Cannot transition order ${existing.orderNo} from "${currentStatus}" to "${targetStatus}". Valid next steps: ${allowed.join(', ') || 'none'}.`
      );
    }

    if (targetStatus === KitchenStatus.cancelled && existing.billed) {
      throw AppError.invalidTransition(`Cannot cancel order ${existing.orderNo} because it has already been billed.`);
    }

    const updated = await tx.kitchenOrder.update({
      where: { id },
      data: {
        status: targetStatus,
        statusChangedAt: new Date(),
      },
      include: {
        items: true,
        creator: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    await writeAuditLog(
      {
        businessId,
        actorEmployeeId: employeeId,
        actorName: req.employee!.name,
        action: 'kitchen_order.status_changed',
        entityType: 'kitchen_order',
        entityId: updated.id,
        detail: `Order ${updated.orderNo} status changed: ${currentStatus} → ${targetStatus}`,
      },
      tx
    );

    return updated;
  });

  res.json({
    data: {
      id: updatedOrder.id,
      orderNo: updatedOrder.orderNo,
      status: updatedOrder.status,
      billed: updatedOrder.billed,
      statusChangedAt: updatedOrder.statusChangedAt.toISOString(),
    },
  });
});
