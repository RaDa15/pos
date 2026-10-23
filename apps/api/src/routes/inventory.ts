import { Router, Request, Response } from 'express';
import { MovementType, Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { CreateStockMovementRequestSchema } from '@pos/shared';
import { writeAuditLog } from '../lib/audit.js';

export const inventoryRouter: Router = Router();
inventoryRouter.use(requireEmployee);

/**
 * GET /inventory/stock?status=low|out|ok&search=&page=&limit=
 * Returns current stock levels with status.
 */
inventoryRouter.get(
  '/stock',
  requirePermission('inventory.view'),
  async (req: Request, res: Response) => {
    const { status, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      businessId: req.business!.id,
      active: true,
    };

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Status filtering
    if (status === 'out') {
      where.trackStock = true;
      where.stock = { lte: 0 };
    } else if (status === 'low') {
      where.trackStock = true;
      where.stock = { gt: 0 };
      // minStock > 0 and stock <= minStock
      where.minStock = { gt: 0 };
    }

    const [rawProducts, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          category: true,
          barcode: true,
          unit: true,
          trackStock: true,
          stock: true,
          minStock: true,
          purchasePrice: true,
          sellPrice: true,
          batchNo: true,
          expiryDate: true,
          active: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    // For 'low' filter, double check stock <= minStock in JS because Prisma does not support comparing two columns directly in where
    let products = rawProducts;
    if (status === 'low') {
      products = rawProducts.filter((p) => p.stock <= p.minStock);
    }

    const data = products.map((p) => {
      let stockStatus: 'untracked' | 'out' | 'low' | 'ok' = 'ok';
      if (!p.trackStock) {
        stockStatus = 'untracked';
      } else if (p.stock <= 0) {
        stockStatus = 'out';
      } else if (p.minStock > 0 && p.stock <= p.minStock) {
        stockStatus = 'low';
      }

      return {
        ...p,
        purchasePrice: parseFloat(p.purchasePrice.toString()),
        sellPrice: parseFloat(p.sellPrice.toString()),
        expiryDate: p.expiryDate ? p.expiryDate.toISOString().slice(0, 10) : null,
        stockStatus,
      };
    });

    res.json({
      data,
      meta: {
        page,
        limit,
        total,
      },
    });
  }
);

/**
 * GET /inventory/alerts
 * Returns low-stock, out-of-stock, and expiring soon/expired items and counts (BR-26).
 */
inventoryRouter.get(
  '/alerts',
  requirePermission('inventory.view'),
  async (req: Request, res: Response) => {
    const businessId = req.business!.id;
    const now = new Date();
    // Start of today UTC
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const trackedProducts = await prisma.product.findMany({
      where: {
        businessId,
        active: true,
      },
      select: {
        id: true,
        name: true,
        barcode: true,
        category: true,
        unit: true,
        trackStock: true,
        stock: true,
        minStock: true,
        batchNo: true,
        expiryDate: true,
      },
      orderBy: { name: 'asc' },
    });

    const lowStockItems: typeof trackedProducts = [];
    const outOfStockItems: typeof trackedProducts = [];
    const expiringSoonItems: Array<(typeof trackedProducts)[0] & { daysLeft: number; isExpired: boolean }> = [];
    let expiredCount = 0;

    for (const p of trackedProducts) {
      if (p.trackStock) {
        if (p.stock <= 0) {
          outOfStockItems.push(p);
        } else if (p.minStock > 0 && p.stock <= p.minStock) {
          lowStockItems.push(p);
        }
      }

      if (p.expiryDate) {
        const expTime = new Date(p.expiryDate).getTime();
        const todayTime = today.getTime();
        const diffDays = Math.ceil((expTime - todayTime) / (24 * 60 * 60 * 1000));

        if (diffDays < 0) {
          expiredCount++;
          expiringSoonItems.push({
            ...p,
            daysLeft: diffDays,
            isExpired: true,
          });
        } else if (diffDays <= 30) {
          expiringSoonItems.push({
            ...p,
            daysLeft: diffDays,
            isExpired: false,
          });
        }
      }
    }

    // BR-26 / AC-24: Sidebar badge shows low-stock count including out-of-stock items (stock <= min_stock)
    const badgeCount = lowStockItems.length + outOfStockItems.length;

    res.json({
      data: {
        counts: {
          lowStock: lowStockItems.length,
          outOfStock: outOfStockItems.length,
          badgeCount,
          expiringSoon: expiringSoonItems.filter((i) => !i.isExpired).length,
          expired: expiredCount,
        },
        lowStockItems: lowStockItems.slice(0, 50),
        outOfStockItems: outOfStockItems.slice(0, 50),
        expiringSoonItems: expiringSoonItems.map((item) => ({
          ...item,
          expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null,
        })),
      },
    });
  }
);

/**
 * GET /stock-movements?productId=&type=&from=&to=&page=&limit=
 * Movement history for the business.
 */
export const stockMovementsRouter: Router = Router();
stockMovementsRouter.use(requireEmployee);

stockMovementsRouter.get(
  '/',
  requirePermission('inventory.view'),
  async (req: Request, res: Response) => {
    const { productId, type, from, to } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const where: Prisma.StockMovementWhereInput = {
      businessId: req.business!.id,
    };

    if (productId && typeof productId === 'string') {
      where.productId = productId;
    }

    if (type && typeof type === 'string' && Object.values(MovementType).includes(type as MovementType)) {
      where.type = type as MovementType;
    }

    if (from && typeof from === 'string') {
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter), gte: new Date(from) };
    }

    if (to && typeof to === 'string') {
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter), lte: new Date(to) };
    }

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              unit: true,
              barcode: true,
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    res.json({
      data: movements.map((m) => ({
        id: m.id,
        productId: m.productId,
        productName: m.product.name,
        productUnit: m.product.unit,
        productBarcode: m.product.barcode,
        type: m.type,
        qty: m.qty,
        stockAfter: m.stockAfter,
        reason: m.reason,
        createdAt: m.createdAt.toISOString(),
        createdBy: m.creator ? m.creator.name : 'System',
      })),
      meta: {
        page,
        limit,
        total,
      },
    });
  }
);

/**
 * POST /stock-movements
 * Create a new stock in, stock out, or adjustment movement (BR-25, AC-22, AC-23).
 */
stockMovementsRouter.post(
  '/',
  requirePermission('inventory.adjust'),
  async (req: Request, res: Response) => {
    const body = CreateStockMovementRequestSchema.parse(req.body);

    const product = await prisma.product.findFirst({
      where: { id: body.productId, businessId: req.business!.id },
    });

    if (!product) {
      throw AppError.notFound('Product not found.');
    }

    // BR-09: Untracked products ignore stock in every rule (never move stock)
    if (!product.trackStock) {
      throw AppError.productUnavailable('Cannot record stock movement for untracked product (BR-09).');
    }

    // BR-25: Movement types and their sign
    let delta = 0;
    if (body.type === 'stock_in') {
      delta = body.qty;
    } else if (body.type === 'stock_out') {
      delta = -body.qty;
    } else if (body.type === 'adjustment') {
      delta = body.direction === 'increase' ? body.qty : -body.qty;
    }

    // BR-25 & AC-22: A movement that would make stock negative is rejected
    const newStock = product.stock + delta;
    if (newStock < 0) {
      throw AppError.insufficientStock(`Only ${product.stock} in stock.`, {
        items: [
          {
            productId: product.id,
            name: product.name,
            available: product.stock,
            requested: body.qty,
          },
        ],
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update product stock and optional batch/expiry
      const productUpdateData: Prisma.ProductUpdateInput = {
        stock: newStock,
      };

      if (body.type === 'stock_in') {
        if (body.batchNo !== undefined) {
          productUpdateData.batchNo = body.batchNo;
        }
        if (body.expiryDate) {
          productUpdateData.expiryDate = new Date(body.expiryDate);
        } else if (body.expiryDate === null) {
          productUpdateData.expiryDate = null;
        }
      }

      const updatedProduct = await tx.product.update({
        where: { id: product.id },
        data: productUpdateData,
      });

      // Insert stock movement
      const movement = await tx.stockMovement.create({
        data: {
          businessId: req.business!.id,
          productId: product.id,
          type: body.type as MovementType,
          qty: delta,
          stockAfter: newStock,
          reason: body.reason ?? null,
          createdBy: req.employee ? req.employee.id : null,
        },
      });

      // Audit log
      await writeAuditLog(
        {
          businessId: req.business!.id,
          actorEmployeeId: req.employee?.id,
          actorName: req.employee?.name || 'System',
          action: 'stock_adjusted',
          entityType: 'stock_movement',
          entityId: movement.id,
          detail: `${body.type.toUpperCase()}: ${delta > 0 ? '+' : ''}${delta} ${product.unit} for "${product.name}" (stock now ${newStock})${body.reason ? ` — ${body.reason}` : ''}`,
        },
        tx
      );

      return { movement, updatedProduct };
    });

    res.status(201).json({
      data: {
        movement: {
          id: result.movement.id,
          productId: result.movement.productId,
          type: result.movement.type,
          qty: result.movement.qty,
          stockAfter: result.movement.stockAfter,
          reason: result.movement.reason,
          createdAt: result.movement.createdAt.toISOString(),
        },
        product: {
          id: result.updatedProduct.id,
          name: result.updatedProduct.name,
          stock: result.updatedProduct.stock,
        },
      },
    });
  }
);
