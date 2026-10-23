import { z } from 'zod';
import { PRODUCT_UNITS } from '../enums.js';

export const CreateProductRequestSchema = z
  .object({
    name: z.string().min(1, 'Enter product name.').max(120),
    category: z.string().min(1).max(80).optional().default('Uncategorized'),
    barcode: z.string().min(4).max(32).nullable().optional(),
    purchasePrice: z.number().nonnegative().optional().default(0),
    sellPrice: z.number().positive('Price must be greater than 0.'),
    taxRateId: z.string().uuid(),
    unit: z.enum(PRODUCT_UNITS).optional().default('pc'),
    trackStock: z.boolean().optional(),
    openingStock: z.number().int().nonnegative().optional().default(0),
    minStock: z.number().int().nonnegative().optional().default(0),
    supplierId: z.string().uuid().nullable().optional(),
    batchNo: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
  })
  .strict();
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    category: z.string().min(1).max(80).optional(),
    barcode: z.string().min(4).max(32).optional(),
    purchasePrice: z.number().nonnegative().optional(),
    sellPrice: z.number().positive().optional(),
    taxRateId: z.string().uuid().optional(),
    unit: z.enum(PRODUCT_UNITS).optional(),
    trackStock: z.boolean().optional(),
    minStock: z.number().int().nonnegative().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    batchNo: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;
