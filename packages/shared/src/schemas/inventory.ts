import { z } from 'zod';

export const CreateStockMovementRequestSchema = z
  .object({
    productId: z.string().uuid('Product ID must be a valid UUID'),
    type: z.enum(['stock_in', 'stock_out', 'adjustment']),
    qty: z.number().int().positive('Quantity must be a positive integer'),
    direction: z.enum(['increase', 'decrease']).optional(),
    reason: z.string().trim().optional(),
    batchNo: z.string().trim().optional().nullable(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expiry date must be in YYYY-MM-DD format')
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'adjustment') {
      if (!data.direction) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['direction'],
          message: 'Adjustment direction (increase or decrease) is required for adjustment movements (BR-25)',
        });
      }
      if (!data.reason || data.reason.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reason'],
          message: 'A reason is required for adjustment stock movements (BR-25)',
        });
      }
    }
  });

export type CreateStockMovementRequest = z.infer<typeof CreateStockMovementRequestSchema>;
