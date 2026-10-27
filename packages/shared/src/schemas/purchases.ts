import { z } from 'zod';

export const PurchaseItemInputSchema = z
  .object({
    productId: z.string().uuid('Product ID must be a valid UUID'),
    qty: z.number().int().positive('Quantity must be at least 1'),
    unitCost: z.number().min(0, 'Unit cost cannot be negative'),
    batchNo: z.string().trim().optional().nullable(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date must be in YYYY-MM-DD format')
      .optional()
      .nullable(),
  })
  .strict();

export const CreatePurchaseRequestSchema = z
  .object({
    supplierId: z.string().uuid('Supplier ID must be a valid UUID'),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Purchase date must be in YYYY-MM-DD format')
      .or(z.string().datetime()),
    amountPaid: z.number().min(0, 'Amount paid cannot be negative').default(0),
    note: z.string().trim().optional().nullable(),
    items: z.array(PurchaseItemInputSchema).min(1, 'At least one purchase item is required'),
  })
  .strict();

export type PurchaseItemInput = z.infer<typeof PurchaseItemInputSchema>;
export type CreatePurchaseRequest = z.infer<typeof CreatePurchaseRequestSchema>;
