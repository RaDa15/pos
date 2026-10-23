import { Router, Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission, requireActiveSubscription } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';

export const posRouter: Router = Router();

posRouter.use(requireEmployee);
posRouter.use(requirePermission('pos.sell'));
posRouter.use(requireActiveSubscription);

/**
 * GET /pos/products?search=
 * Active products for the POS catalog/search table.
 */
posRouter.get('/products', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const whereClause: Record<string, unknown> = {
    businessId,
    active: true,
  };

  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { barcode: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ];
  }

  const products = await prisma.product.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      barcode: true,
      category: true,
      unit: true,
      sellPrice: true,
      stock: true,
      trackStock: true,
      minStock: true,
      imagePath: true,
      taxRate: {
        select: {
          id: true,
          rate: true,
          mode: true,
          category: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const formatted = products.map((p) => ({
    id: p.id,
    name: p.name,
    barcode: p.barcode,
    category: p.category,
    unit: p.unit,
    sellPrice: Number(p.sellPrice),
    stock: p.stock,
    trackStock: p.trackStock,
    minStock: p.minStock,
    imagePath: p.imagePath,
    taxRate: {
      id: p.taxRate.id,
      rate: Number(p.taxRate.rate),
      mode: p.taxRate.mode,
      category: p.taxRate.category,
    },
  }));

  res.json({ data: formatted });
});

/**
 * GET /pos/products/by-barcode/:barcode
 * Exact barcode lookup for barcode scanner (AC-26).
 */
posRouter.get('/products/by-barcode/:barcode', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const rawBarcode = req.params.barcode;
  const barcode = (typeof rawBarcode === 'string' ? rawBarcode : '').trim();

  const product = await prisma.product.findFirst({
    where: {
      businessId,
      barcode,
      active: true,
    },
    select: {
      id: true,
      name: true,
      barcode: true,
      category: true,
      unit: true,
      sellPrice: true,
      stock: true,
      trackStock: true,
      minStock: true,
      imagePath: true,
      taxRate: {
        select: {
          id: true,
          rate: true,
          mode: true,
          category: true,
        },
      },
    },
  });

  if (!product) {
    throw AppError.notFound(`No product matches "${barcode}".`);
  }

  res.json({
    data: {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      category: product.category,
      unit: product.unit,
      sellPrice: Number(product.sellPrice),
      stock: product.stock,
      trackStock: product.trackStock,
      minStock: product.minStock,
      imagePath: product.imagePath,
      taxRate: {
        id: product.taxRate.id,
        rate: Number(product.taxRate.rate),
        mode: product.taxRate.mode,
        category: product.taxRate.category,
      },
    },
  });
});

/**
 * GET /pos/customers?search=
 * Active customers for the POS dropdown with discounts (AC-48).
 */
posRouter.get('/customers', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const subscription = req.subscription;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  // Starter plan does not include customer ledger/credit (BR-07)
  const isStarter = subscription?.plan?.toLowerCase() === 'starter';
  if (isStarter) {
    res.json({ data: [] });
    return;
  }

  const whereClause: Record<string, unknown> = {
    businessId,
    active: true,
  };

  if (search) {
    whereClause.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { gstId: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Fetch discount map for business
  const discountConfigs = await prisma.customerTypeDiscount.findMany({
    where: { businessId },
  });
  const discountMap = new Map<string, number>();
  for (const d of discountConfigs) {
    discountMap.set(d.customerType, Number(d.discountPct));
  }

  const customers = await prisma.customer.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      phone: true,
      type: true,
      creditLimit: true,
      outstandingBalance: true,
      gstId: true,
    },
    orderBy: { name: 'asc' },
    take: 100,
  });

  const formatted = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    type: c.type,
    creditLimit: c.creditLimit !== null ? Number(c.creditLimit) : null,
    outstandingBalance: Number(c.outstandingBalance),
    discountPct: discountMap.get(c.type) || 0,
    gstId: c.gstId,
  }));

  res.json({ data: formatted });
});
