import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import {
  CreateProductRequestSchema,
  UpdateProductRequestSchema,
  getDefaultTrackStock,
  ProductUnit,
} from '@pos/shared';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';
import {
  requireEmployee,
  requirePermission,
  requirePlanFeature,
} from '../middleware/auth.js';
import {
  imageUploadMiddleware,
  processAndSaveImage,
  deleteUploadedFile,
} from '../lib/uploads.js';
import { parseCsv, stringifyCsv } from '../lib/csv.js';

export const productsRouter: Router = Router();

productsRouter.use(requireEmployee);

// Multer memory storage for CSV file upload
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/**
 * Generates an 11-digit barcode starting with '20' unique within business (BR-08, AC-17).
 */
export async function generateUniqueBarcode(businessId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let digits = '';
    for (let i = 0; i < 9; i++) {
      digits += Math.floor(Math.random() * 10).toString();
    }
    const barcode = `20${digits}`;
    const existing = await prisma.product.findUnique({
      where: {
        businessId_barcode: {
          businessId,
          barcode,
        },
      },
    });
    if (!existing) {
      return barcode;
    }
  }
  throw AppError.internal('Unable to generate unique barcode.');
}

/**
 * GET /products
 * Catalog list, optional filtering by search, category, active.
 */
productsRouter.get('/', requirePermission('products.view'), async (req: Request, res: Response) => {
  const { search, category, active } = req.query;

  const where: Record<string, unknown> = {
    businessId: req.business!.id,
  };

  if (active !== undefined && active !== '') {
    where.active = active === 'true';
  }

  if (category && typeof category === 'string' && category.trim() !== '') {
    where.category = category.trim();
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const term = search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { barcode: { contains: term, mode: 'insensitive' } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      taxRate: {
        select: {
          id: true,
          name: true,
          rate: true,
          mode: true,
          category: true,
        },
      },
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  res.json({
    data: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      barcode: p.barcode,
      imagePath: p.imagePath,
      purchasePrice: Number(p.purchasePrice),
      sellPrice: Number(p.sellPrice),
      taxRateId: p.taxRateId,
      taxRate: {
        id: p.taxRate.id,
        name: p.taxRate.name,
        rate: Number(p.taxRate.rate),
        mode: p.taxRate.mode,
        category: p.taxRate.category,
      },
      unit: p.unit,
      trackStock: p.trackStock,
      stock: p.stock,
      minStock: p.minStock,
      supplierId: p.supplierId,
      supplierName: p.supplier?.name ?? null,
      batchNo: p.batchNo,
      expiryDate: p.expiryDate ? p.expiryDate.toISOString().split('T')[0] : null,
      active: p.active,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
});

/**
 * GET /products/categories
 * Returns distinct category names for the business.
 */
productsRouter.get(
  '/categories',
  requirePermission('products.view'),
  async (req: Request, res: Response) => {
    const categories = await prisma.product.findMany({
      where: { businessId: req.business!.id },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    res.json({
      data: categories.map((c) => c.category),
    });
  }
);

/**
 * GET /products/import-template.csv
 * Downloads product import CSV template (F-07).
 */
productsRouter.get(
  '/import-template.csv',
  requirePermission('products.import_export'),
  requirePlanFeature('import_export'),
  async (_req: Request, res: Response) => {
    const headers = [
      'Product Name',
      'Barcode',
      'Category',
      'Purchase Price',
      'Selling Price',
      'GST Rate',
      'Unit',
      'Opening Stock',
      'Minimum Stock',
      'Supplier',
    ];
    const sampleRows = [
      ['Red Label Tea 250g', '', 'Beverages', '100.00', '135.00', '5', 'pc', '20', '5', ''],
      ['Detergent Powder 1kg', '', 'Household', '120.00', '170.00', '5', 'pc', '15', '3', ''],
    ];

    const csvContent = stringifyCsv(headers, sampleRows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
    res.status(200).send(csvContent);
  }
);

/**
 * GET /products/export.csv
 * Exports products as CSV with formula-injection guard and UTF-8 BOM (F-07, AC-21).
 */
productsRouter.get(
  '/export.csv',
  requirePermission('products.import_export'),
  requirePlanFeature('import_export'),
  async (req: Request, res: Response) => {
    const products = await prisma.product.findMany({
      where: { businessId: req.business!.id },
      include: {
        taxRate: true,
        supplier: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const headers = [
      'Product Name',
      'Barcode',
      'Category',
      'Purchase Price',
      'Selling Price',
      'GST Rate',
      'Unit',
      'Current Stock',
      'Minimum Stock',
      'Supplier',
      'Track Stock',
      'Active',
    ];

    const rows = products.map((p) => [
      p.name,
      p.barcode,
      p.category,
      Number(p.purchasePrice).toFixed(2),
      Number(p.sellPrice).toFixed(2),
      Number(p.taxRate.rate),
      p.unit,
      p.trackStock ? p.stock : 'N/A',
      p.minStock,
      p.supplier?.name ?? '',
      p.trackStock ? 'Yes' : 'No',
      p.active ? 'Yes' : 'No',
    ]);

    const csvContent = stringifyCsv(headers, rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.status(200).send(csvContent);
  }
);

/**
 * POST /products/import
 * Imports products from CSV, creating or updating rows and tracking stock adjustments (F-07, AC-20).
 */
productsRouter.post(
  '/import',
  requirePermission('products.import_export'),
  requirePlanFeature('import_export'),
  csvUpload.single('file'),
  async (req: Request, res: Response) => {
    let rawCsv = '';

    if (req.file) {
      rawCsv = req.file.buffer.toString('utf-8');
    } else if (typeof req.body === 'string') {
      rawCsv = req.body;
    } else if (req.body && typeof req.body.csv === 'string') {
      rawCsv = req.body.csv;
    } else {
      throw AppError.validationError('CSV file or raw CSV text is required.');
    }

    const rows = parseCsv(rawCsv);
    if (rows.length < 2) {
      throw AppError.validationError('CSV file has no data rows.');
    }

    // Active tax rates for the business
    const taxRates = await prisma.taxRate.findMany({
      where: { businessId: req.business!.id, active: true },
    });

    // Suppliers for the business
    const suppliers = await prisma.supplier.findMany({
      where: { businessId: req.business!.id, active: true },
    });

    let created = 0;
    let updated = 0;
    const skipped: { row: number; error: string }[] = [];

    // Row 0 is header, data rows start at index 1 -> row number 2 (1-based)
    for (let i = 1; i < rows.length; i++) {
      const rowNum = i + 1;
      const row = rows[i];
      if (!row) {
        continue;
      }

      const name = row[0]?.trim();
      const barcodeInput = row[1]?.trim();
      const category = row[2]?.trim() || 'Uncategorized';
      const purchasePriceStr = row[3]?.trim();
      const sellPriceStr = row[4]?.trim();
      const gstRateStr = row[5]?.trim();
      const unitStr = (row[6]?.trim() || 'pc') as ProductUnit;
      const stockStr = row[7]?.trim();
      const minStockStr = row[8]?.trim();
      const supplierName = row[9]?.trim();

      if (!name) {
        skipped.push({ row: rowNum, error: 'Product Name is required.' });
        continue;
      }

      const sellPrice = parseFloat(sellPriceStr || '0');
      if (isNaN(sellPrice) || sellPrice <= 0) {
        skipped.push({ row: rowNum, error: 'Selling Price must be greater than 0.' });
        continue;
      }

      const purchasePrice = parseFloat(purchasePriceStr || '0');

      // Match GST rate percentage
      const gstRateVal = parseFloat(gstRateStr || '0');
      const matchedTaxRate = taxRates.find((t) => Number(t.rate) === gstRateVal);
      if (!matchedTaxRate) {
        skipped.push({
          row: rowNum,
          error: `GST rate ${gstRateStr}% doesn't match an active tax rate`,
        });
        continue;
      }

      // Match supplier if provided
      const matchedSupplier = supplierName
        ? suppliers.find((s) => s.name.toLowerCase() === supplierName.toLowerCase())
        : null;

      const trackStock = getDefaultTrackStock(req.business!.type, unitStr);
      const stockVal = stockStr ? parseInt(stockStr, 10) : 0;
      const minStockVal = minStockStr ? parseInt(minStockStr, 10) : 0;

      // Check if product with this barcode already exists
      let existingProduct = null;
      if (barcodeInput) {
        existingProduct = await prisma.product.findUnique({
          where: {
            businessId_barcode: {
              businessId: req.business!.id,
              barcode: barcodeInput,
            },
          },
        });
      }

      if (existingProduct) {
        // Update product
        const oldStock = existingProduct.stock;
        const stockDiff = stockVal - oldStock;

        await prisma.$transaction(async (tx) => {
          await tx.product.update({
            where: { id: existingProduct.id },
            data: {
              name,
              category,
              purchasePrice,
              sellPrice,
              taxRateId: matchedTaxRate.id,
              unit: unitStr,
              minStock: minStockVal,
              supplierId: matchedSupplier ? matchedSupplier.id : existingProduct.supplierId,
              stock: trackStock ? stockVal : existingProduct.stock,
            },
          });

          // If stock changed and tracking is enabled, record adjustment movement (AC-20)
          if (trackStock && stockDiff !== 0) {
            await tx.stockMovement.create({
              data: {
                businessId: req.business!.id,
                productId: existingProduct.id,
                type: 'adjustment',
                qty: stockDiff,
                stockAfter: stockVal,
                reason: 'CSV import',
                createdBy: req.employee!.id,
              },
            });
          }
        });

        updated++;
      } else {
        // Create new product
        const barcode = barcodeInput || (await generateUniqueBarcode(req.business!.id));

        await prisma.$transaction(async (tx) => {
          const newProduct = await tx.product.create({
            data: {
              businessId: req.business!.id,
              name,
              barcode,
              category,
              purchasePrice,
              sellPrice,
              taxRateId: matchedTaxRate.id,
              unit: unitStr,
              trackStock,
              stock: trackStock ? stockVal : 0,
              minStock: minStockVal,
              supplierId: matchedSupplier?.id,
            },
          });

          // Opening stock movement if stock > 0 and trackStock is true
          if (trackStock && stockVal > 0) {
            await tx.stockMovement.create({
              data: {
                businessId: req.business!.id,
                productId: newProduct.id,
                type: 'opening_stock',
                qty: stockVal,
                stockAfter: stockVal,
                reason: 'Opening stock (CSV import)',
                createdBy: req.employee!.id,
              },
            });
          }
        });

        created++;
      }
    }

    // Write audit log
    await writeAuditLog({
      businessId: req.business!.id,
      actorEmployeeId: req.employee!.id,
      actorName: req.employee!.name,
      action: 'products_imported',
      entityType: 'product',
      detail: `Created ${created}, updated ${updated}, skipped ${skipped.length}`,
    });

    res.json({
      created,
      updated,
      skipped,
      data: {
        created,
        updated,
        skipped,
      },
    });
  }
);

/**
 * POST /products
 * Creates a new product with auto-generated barcode and opening stock movement (BR-08, BR-09, AC-17, AC-18).
 */
productsRouter.post('/', requirePermission('products.manage'), async (req: Request, res: Response) => {
  const body = CreateProductRequestSchema.parse(req.body);

  // BR-08: If barcode is empty/null, generate 11-digit barcode starting with 20
  let barcode = body.barcode?.trim();
  if (!barcode) {
    barcode = await generateUniqueBarcode(req.business!.id);
  } else {
    // Uniqueness check within business (AC-17)
    const existing = await prisma.product.findUnique({
      where: {
        businessId_barcode: {
          businessId: req.business!.id,
          barcode,
        },
      },
    });
    if (existing) {
      throw AppError.barcodeTaken(`Barcode ${barcode} is already in use by another product.`);
    }
  }

  // Validate tax rate exists and is active
  const taxRate = await prisma.taxRate.findFirst({
    where: { id: body.taxRateId, businessId: req.business!.id, active: true },
  });
  if (!taxRate) {
    throw AppError.validationError('Selected tax rate is invalid or inactive (BR-10).');
  }

  // BR-09: Default trackStock logic
  const trackStock =
    body.trackStock !== undefined
      ? body.trackStock
      : getDefaultTrackStock(req.business!.type, body.unit as ProductUnit);

  const openingStock = trackStock ? body.openingStock ?? 0 : 0;

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        businessId: req.business!.id,
        name: body.name,
        category: body.category || 'Uncategorized',
        barcode,
        purchasePrice: body.purchasePrice ?? 0,
        sellPrice: body.sellPrice,
        taxRateId: body.taxRateId,
        unit: body.unit,
        trackStock,
        stock: openingStock,
        minStock: body.minStock ?? 0,
        supplierId: body.supplierId,
        batchNo: body.batchNo,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
      },
      include: {
        taxRate: true,
      },
    });

    // Opening stock movement if openingStock > 0 and trackStock is true
    if (trackStock && openingStock > 0) {
      await tx.stockMovement.create({
        data: {
          businessId: req.business!.id,
          productId: created.id,
          type: 'opening_stock',
          qty: openingStock,
          stockAfter: openingStock,
          reason: 'Opening stock',
          createdBy: req.employee!.id,
        },
      });
    }

    await writeAuditLog(
      {
        businessId: req.business!.id,
        actorEmployeeId: req.employee!.id,
        actorName: req.employee!.name,
        action: 'product_created',
        entityType: 'product',
        entityId: created.id,
        detail: `${created.name} (Barcode: ${created.barcode})`,
      },
      tx
    );

    return created;
  });

  res.status(201).json({
    data: {
      id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      purchasePrice: Number(product.purchasePrice),
      sellPrice: Number(product.sellPrice),
      taxRateId: product.taxRateId,
      unit: product.unit,
      trackStock: product.trackStock,
      stock: product.stock,
      minStock: product.minStock,
      supplierId: product.supplierId,
      active: product.active,
      createdAt: product.createdAt.toISOString(),
    },
  });
});

/**
 * PATCH /products/:id
 * Edits a product (not stock). Checks barcode uniqueness and audits price changes (BR-08, AC-17, AC-19).
 */
productsRouter.patch(
  '/:id',
  requirePermission('products.manage'),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = UpdateProductRequestSchema.parse(req.body);

    const existing = await prisma.product.findFirst({
      where: { id, businessId: req.business!.id },
    });

    if (!existing) {
      throw AppError.notFound('Product not found.');
    }

    // BR-08 / AC-17: Check barcode uniqueness on edit as well
    if (body.barcode && body.barcode !== existing.barcode) {
      const duplicate = await prisma.product.findUnique({
        where: {
          businessId_barcode: {
            businessId: req.business!.id,
            barcode: body.barcode,
          },
        },
      });
      if (duplicate && duplicate.id !== existing.id) {
        throw AppError.barcodeTaken(`Barcode ${body.barcode} is already in use by another product.`);
      }
    }

    // Validate tax rate if changing
    if (body.taxRateId && body.taxRateId !== existing.taxRateId) {
      const taxRate = await prisma.taxRate.findFirst({
        where: { id: body.taxRateId, businessId: req.business!.id, active: true },
      });
      if (!taxRate) {
        throw AppError.validationError('Selected tax rate is invalid or inactive (BR-10).');
      }
    }

    const oldPrice = Number(existing.sellPrice);
    const newPrice = body.sellPrice !== undefined ? Number(body.sellPrice) : oldPrice;
    const isPriceChanged = body.sellPrice !== undefined && oldPrice !== newPrice;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.product.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          category: body.category,
          barcode: body.barcode,
          purchasePrice: body.purchasePrice,
          sellPrice: body.sellPrice,
          taxRateId: body.taxRateId,
          unit: body.unit,
          trackStock: body.trackStock,
          minStock: body.minStock,
          supplierId: body.supplierId,
          batchNo: body.batchNo,
          expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
          active: body.active,
        },
      });

      // AC-19: Audit row "Price changed" with "Nu. 135.00 → Nu. 140.00" and the employee's name
      if (isPriceChanged) {
        await writeAuditLog(
          {
            businessId: req.business!.id,
            actorEmployeeId: req.employee!.id,
            actorName: req.employee!.name,
            action: 'price_changed',
            entityType: 'product',
            entityId: existing.id,
            detail: `Nu. ${oldPrice.toFixed(2)} → Nu. ${newPrice.toFixed(2)}`,
          },
          tx
        );
      } else if (body.active === false && existing.active === true) {
        await writeAuditLog(
          {
            businessId: req.business!.id,
            actorEmployeeId: req.employee!.id,
            actorName: req.employee!.name,
            action: 'product_deactivated',
            entityType: 'product',
            entityId: existing.id,
            detail: `Deactivated product ${existing.name}`,
          },
          tx
        );
      } else {
        await writeAuditLog(
          {
            businessId: req.business!.id,
            actorEmployeeId: req.employee!.id,
            actorName: req.employee!.name,
            action: 'product_updated',
            entityType: 'product',
            entityId: existing.id,
            detail: `Updated product details for ${res.name}`,
          },
          tx
        );
      }

      return res;
    });

    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        category: updated.category,
        barcode: updated.barcode,
        purchasePrice: Number(updated.purchasePrice),
        sellPrice: Number(updated.sellPrice),
        taxRateId: updated.taxRateId,
        unit: updated.unit,
        trackStock: updated.trackStock,
        stock: updated.stock,
        minStock: updated.minStock,
        active: updated.active,
      },
    });
  }
);

/**
 * POST /products/:id/image
 * Uploads a product image, converted to WebP via sharp (max 2MB, rejects SVG).
 */
productsRouter.post(
  '/:id/image',
  requirePermission('products.manage'),
  imageUploadMiddleware,
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (!req.file) {
      throw AppError.validationError('No image file provided in "file" field.');
    }

    const existing = await prisma.product.findFirst({
      where: { id, businessId: req.business!.id },
    });

    if (!existing) {
      throw AppError.notFound('Product not found.');
    }

    const relativePath = await processAndSaveImage(req.file.buffer, 'products');

    if (existing.imagePath) {
      await deleteUploadedFile(existing.imagePath);
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.id },
        data: { imagePath: relativePath },
      });

      await writeAuditLog(
        {
          businessId: req.business!.id,
          actorEmployeeId: req.employee!.id,
          actorName: req.employee!.name,
          action: 'product_image_updated',
          entityType: 'product',
          entityId: existing.id,
          detail: `Uploaded new image for product ${existing.name}`,
        },
        tx
      );
    });

    res.json({
      data: {
        imagePath: relativePath,
      },
    });
  }
);

/**
 * DELETE /products/:id/image
 * Removes product image.
 */
productsRouter.delete(
  '/:id/image',
  requirePermission('products.manage'),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const existing = await prisma.product.findFirst({
      where: { id, businessId: req.business!.id },
    });

    if (!existing) {
      throw AppError.notFound('Product not found.');
    }

    if (existing.imagePath) {
      await deleteUploadedFile(existing.imagePath);
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.id },
        data: { imagePath: null },
      });

      await writeAuditLog(
        {
          businessId: req.business!.id,
          actorEmployeeId: req.employee!.id,
          actorName: req.employee!.name,
          action: 'product_image_deleted',
          entityType: 'product',
          entityId: existing.id,
          detail: `Deleted image for product ${existing.name}`,
        },
        tx
      );
    });

    res.json({
      data: {
        imagePath: null,
      },
    });
  }
);
