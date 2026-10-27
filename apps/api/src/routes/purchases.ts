import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission, requireGrocery } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { CreatePurchaseRequestSchema } from '@pos/shared';
import { nextNumber } from '../lib/counters.js';
import { CounterName } from '@prisma/client';
import { writeAuditLog } from '../lib/audit.js';
import { withIdempotency } from '../lib/idempotency.js';

export const purchasesRouter: Router = Router();

// Gated by employee auth, permission, and grocery business type
purchasesRouter.use(requireEmployee);
purchasesRouter.use(requireGrocery);

/**
 * GET /purchases?supplierId=&from=&to=&page=&limit=
 * List supplier purchases (BR-38).
 */
purchasesRouter.get(
  '/',
  requirePermission('purchases.manage'),
  async (req: Request, res: Response) => {
    const { supplierId, from, to, page, limit } = req.query;

    const where: Prisma.PurchaseWhereInput = {
      businessId: req.business!.id,
    };

    if (supplierId && typeof supplierId === 'string' && supplierId.trim() !== '') {
      where.supplierId = supplierId.trim();
    }

    if (from || to) {
      where.purchaseDate = {};
      if (from && typeof from === 'string') {
        where.purchaseDate.gte = new Date(from);
      }
      if (to && typeof to === 'string') {
        where.purchaseDate.lte = new Date(to);
      }
    }

    const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(String(limit || '50'), 10) || 50));
    const skip = (pageNum - 1) * take;

    const [totalCount, purchases] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        include: {
          supplier: {
            select: { id: true, name: true, phone: true },
          },
          creator: {
            select: { id: true, name: true, username: true },
          },
          items: {
            select: {
              id: true,
              productId: true,
              qty: true,
              unitCost: true,
              lineTotal: true,
              batchNo: true,
              expiryDate: true,
              product: {
                select: { id: true, name: true, barcode: true, unit: true },
              },
            },
          },
        },
      }),
    ]);

    let sumTotal = 0;
    let sumPaid = 0;
    let sumOutstanding = 0;

    const data = purchases.map((p) => {
      const total = parseFloat(p.total.toString());
      const amountPaid = parseFloat(p.amountPaid.toString());
      const outstanding = Math.round((total - amountPaid) * 100) / 100;

      sumTotal += total;
      sumPaid += amountPaid;
      sumOutstanding += outstanding;

      return {
        id: p.id,
        purchaseNo: p.purchaseNo,
        supplierId: p.supplierId,
        supplierName: p.supplier.name,
        purchaseDate: p.purchaseDate.toISOString().slice(0, 10),
        total,
        amountPaid,
        outstanding,
        note: p.note,
        createdBy: p.creator.name,
        itemsCount: p.items.length,
        items: p.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          barcode: item.product.barcode,
          unit: item.product.unit,
          qty: item.qty,
          unitCost: parseFloat(item.unitCost.toString()),
          lineTotal: parseFloat(item.lineTotal.toString()),
          batchNo: item.batchNo,
          expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null,
        })),
        createdAt: p.createdAt.toISOString(),
      };
    });

    res.json({
      data,
      pagination: {
        page: pageNum,
        limit: take,
        total: totalCount,
        totalPages: Math.ceil(totalCount / take),
      },
      summary: {
        totalAmount: Math.round(sumTotal * 100) / 100,
        totalPaid: Math.round(sumPaid * 100) / 100,
        totalOutstanding: Math.round(sumOutstanding * 100) / 100,
      },
    });
  }
);

/**
 * GET /purchases/:id
 * Purchase detail with items.
 */
purchasesRouter.get(
  '/:id',
  requirePermission('purchases.manage'),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const purchase = await prisma.purchase.findFirst({
      where: {
        id,
        businessId: req.business!.id,
      },
      include: {
        supplier: {
          select: { id: true, name: true, phone: true, email: true, address: true },
        },
        creator: {
          select: { id: true, name: true, username: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, barcode: true, unit: true, trackStock: true, stock: true },
            },
          },
        },
      },
    });

    if (!purchase) {
      throw AppError.notFound('Purchase record not found.');
    }

    const total = parseFloat(purchase.total.toString());
    const amountPaid = parseFloat(purchase.amountPaid.toString());
    const outstanding = Math.round((total - amountPaid) * 100) / 100;

    res.json({
      data: {
        id: purchase.id,
        purchaseNo: purchase.purchaseNo,
        supplierId: purchase.supplierId,
        supplier: purchase.supplier,
        purchaseDate: purchase.purchaseDate.toISOString().slice(0, 10),
        total,
        amountPaid,
        outstanding,
        note: purchase.note,
        createdBy: purchase.creator.name,
        createdAt: purchase.createdAt.toISOString(),
        items: purchase.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          barcode: item.product.barcode,
          unit: item.product.unit,
          qty: item.qty,
          unitCost: parseFloat(item.unitCost.toString()),
          lineTotal: parseFloat(item.lineTotal.toString()),
          batchNo: item.batchNo,
          expiryDate: item.expiryDate ? item.expiryDate.toISOString().slice(0, 10) : null,
          trackStock: item.product.trackStock,
          currentStock: item.product.stock,
        })),
      },
    });
  }
);

/**
 * POST /purchases
 * Record a purchase (BR-38, AC-25).
 * Idempotency-Key supported.
 */
purchasesRouter.post(
  '/',
  requirePermission('purchases.manage'),
  async (req: Request, res: Response) => {
    const parseResult = CreatePurchaseRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw AppError.validation('Invalid purchase data.', parseResult.error.format());
    }
    const body = parseResult.data;

    const idempotencyKey = req.header('Idempotency-Key');

    const executePurchase = async () => {
      // 1. Verify supplier belongs to business
      const supplier = await prisma.supplier.findFirst({
        where: {
          id: body.supplierId,
          businessId: req.business!.id,
          active: true,
        },
      });
      if (!supplier) {
        throw AppError.notFound('Supplier not found or is inactive.');
      }

      // 2. Verify all products belong to business
      const productIds = body.items.map((i) => i.productId);
      const products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          businessId: req.business!.id,
        },
      });

      if (products.length !== productIds.length) {
        throw AppError.notFound('One or more products were not found.');
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // 3. Compute totals
      let totalAmount = 0;
      const computedItems = body.items.map((item) => {
        const product = productMap.get(item.productId)!;
        const lineTotal = Math.round(item.qty * item.unitCost * 100) / 100;
        totalAmount += lineTotal;
        return {
          ...item,
          product,
          lineTotal,
        };
      });

      totalAmount = Math.round(totalAmount * 100) / 100;

      if (body.amountPaid > totalAmount) {
        throw AppError.validation('Amount paid cannot exceed total purchase amount.', {
          amountPaid: body.amountPaid,
          total: totalAmount,
        });
      }

      // 4. Execute atomic transaction
      const result = await prisma.$transaction(async (tx) => {
        // Generate sequential PUR-YYYY-NNNNN
        const nextPur = await nextNumber(tx, req.business!.id, CounterName.purchase);

        // Create purchase record
        const purchase = await tx.purchase.create({
          data: {
            businessId: req.business!.id,
            purchaseNo: nextPur.formatted,
            supplierId: supplier.id,
            purchaseDate: new Date(body.purchaseDate),
            total: totalAmount,
            amountPaid: body.amountPaid,
            note: body.note || null,
            createdBy: req.employee!.id,
          },
        });

        // Process line items, product prices, stock movements
        const createdItems = [];
        for (const item of computedItems) {
          const purchaseItem = await tx.purchaseItem.create({
            data: {
              purchaseId: purchase.id,
              businessId: req.business!.id,
              productId: item.productId,
              qty: item.qty,
              unitCost: item.unitCost,
              lineTotal: item.lineTotal,
              batchNo: item.batchNo || null,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            },
          });
          createdItems.push(purchaseItem);

          // Update product purchase price (BR-38)
          const productUpdateData: Prisma.ProductUpdateInput = {
            purchasePrice: item.unitCost,
          };

          if (item.batchNo) {
            productUpdateData.batchNo = item.batchNo;
          }
          if (item.expiryDate) {
            productUpdateData.expiryDate = new Date(item.expiryDate);
          }

          // If product tracks stock, increment stock and create stock movement
          if (item.product.trackStock) {
            const updatedProduct = await tx.product.update({
              where: { id: item.productId },
              data: {
                ...productUpdateData,
                stock: {
                  increment: item.qty,
                },
              },
            });

            await tx.stockMovement.create({
              data: {
                businessId: req.business!.id,
                productId: item.productId,
                type: 'purchase',
                qty: item.qty,
                stockAfter: updatedProduct.stock,
                purchaseId: purchase.id,
                reason: `Supplier purchase ${purchase.purchaseNo}`,
                createdBy: req.employee!.id,
              },
            });
          } else {
            await tx.product.update({
              where: { id: item.productId },
              data: productUpdateData,
            });
          }
        }

        // Audit log
        await writeAuditLog(
          {
            businessId: req.business!.id,
            actorEmployeeId: req.employee!.id,
            actorName: req.employee!.name,
            action: 'purchase_recorded',
            entityType: 'purchase',
            entityId: purchase.id,
            detail: `Recorded purchase ${purchase.purchaseNo} (Nu. ${totalAmount.toFixed(2)}) from supplier ${supplier.name}`,
          },
          tx
        );

        return {
          id: purchase.id,
          purchaseNo: purchase.purchaseNo,
          supplierId: purchase.supplierId,
          supplierName: supplier.name,
          purchaseDate: purchase.purchaseDate.toISOString().slice(0, 10),
          total: totalAmount,
          amountPaid: body.amountPaid,
          outstanding: Math.round((totalAmount - body.amountPaid) * 100) / 100,
          note: purchase.note,
          itemsCount: createdItems.length,
          items: createdItems.map((ci) => ({
            id: ci.id,
            productId: ci.productId,
            qty: ci.qty,
            unitCost: parseFloat(ci.unitCost.toString()),
            lineTotal: parseFloat(ci.lineTotal.toString()),
            batchNo: ci.batchNo,
            expiryDate: ci.expiryDate ? ci.expiryDate.toISOString().slice(0, 10) : null,
          })),
          createdAt: purchase.createdAt.toISOString(),
        };
      });

      return result;
    };

    const result = await withIdempotency(
      req.business!.id,
      req.employee!.id,
      idempotencyKey,
      'POST /purchases',
      async () => {
        const purchaseData = await executePurchase();
        return {
          statusCode: 201,
          data: purchaseData,
        };
      }
    );

    res.status(result.statusCode).json({
      data: result.data,
      ...(result.replayed ? { replayed: true } : {}),
    });
  }
);
