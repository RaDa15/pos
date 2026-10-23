import { z } from 'zod';
import { ORDER_TYPES } from '../enums.js';
import { BillDiscountSchema, CreateSaleLineSchema, PaymentLineSchema } from './sales.js';

export const HeldOrderPayloadSchema = z
  .object({
    lines: z.array(CreateSaleLineSchema),
    payments: z.array(PaymentLineSchema).optional().default([]),
    charges: z.number().nonnegative().optional().default(0),
    orderType: z.enum(ORDER_TYPES),
    tableNo: z.string().nullable().optional(),
    customerId: z.string().uuid().nullable().optional(),
    billDiscount: BillDiscountSchema.nullable().optional(),
    kitchenOrderId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type HeldOrderPayload = z.infer<typeof HeldOrderPayloadSchema>;
