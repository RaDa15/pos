import { z } from 'zod';
import { BILL_DISCOUNT_TYPES, ORDER_TYPES, PAYMENT_METHODS } from '../enums.js';

export const CreateSaleLineSchema = z
  .object({
    productId: z.string().uuid(),
    qty: z.number().int().positive('Quantity must be at least 1.'),
    unitPrice: z.number().nonnegative(),
    lineDiscount: z.number().nonnegative().optional().default(0),
  })
  .strict();
export type CreateSaleLine = z.infer<typeof CreateSaleLineSchema>;

export const BillDiscountSchema = z
  .object({
    type: z.enum(BILL_DISCOUNT_TYPES),
    value: z.number().nonnegative(),
  })
  .strict();
export type BillDiscount = z.infer<typeof BillDiscountSchema>;

export const PaymentLineSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    amount: z.number().positive('Payment amount must be greater than 0.'),
    cashReceived: z.number().nonnegative().nullable().optional(),
    fee: z.number().nonnegative().optional().default(0),
    bankName: z.string().nullable().optional(),
    journalNo: z.string().nullable().optional(),
    remarks: z.string().nullable().optional(),
  })
  .strict();
export type PaymentLine = z.infer<typeof PaymentLineSchema>;

export const CreateSaleRequestSchema = z
  .object({
    orderType: z.enum(ORDER_TYPES),
    tableNo: z.string().nullable().optional(),
    customerId: z.string().uuid().nullable().optional(),
    kitchenOrderId: z.string().uuid().nullable().optional(),
    heldOrderId: z.string().uuid().nullable().optional(),
    lines: z.array(CreateSaleLineSchema).min(1, 'Cart cannot be empty.'),
    billDiscount: BillDiscountSchema.nullable().optional(),
    charges: z.number().nonnegative().optional().default(0),
    payments: z.array(PaymentLineSchema).min(1, 'At least one payment line is required.'),
    expectedTotal: z.number().nonnegative(),
  })
  .strict();
export type CreateSaleRequest = z.infer<typeof CreateSaleRequestSchema>;

export const VoidSaleRequestSchema = z
  .object({
    reason: z.string().min(1, 'Enter a void reason.').max(255),
  })
  .strict();
export type VoidSaleRequest = z.infer<typeof VoidSaleRequestSchema>;
