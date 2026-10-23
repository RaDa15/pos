import { z } from 'zod';
import { TAX_MODES, TAX_CATEGORIES, CUSTOMER_TYPES } from '../enums.js';

export const CreateTaxRateRequestSchema = z
  .object({
    name: z.string().min(1, 'Tax rate name is required.').max(80),
    rate: z.number().min(0, 'Rate cannot be negative.').max(100, 'Rate cannot exceed 100%.'),
    mode: z.enum(TAX_MODES).default('exclusive'),
    category: z.enum(TAX_CATEGORIES).default('standard'),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective date must be YYYY-MM-DD.'),
    isDefault: z.boolean().optional().default(false),
  })
  .strict();
export type CreateTaxRateRequest = z.infer<typeof CreateTaxRateRequestSchema>;

export const UpdateTaxRateRequestSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    active: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();
export type UpdateTaxRateRequest = z.infer<typeof UpdateTaxRateRequestSchema>;

export const CustomerDiscountItemSchema = z
  .object({
    customerType: z.enum(CUSTOMER_TYPES),
    discountPct: z.number().min(0).max(100),
  })
  .strict();
export type CustomerDiscountItem = z.infer<typeof CustomerDiscountItemSchema>;

export const UpdateCustomerDiscountsRequestSchema = z
  .object({
    items: z.array(CustomerDiscountItemSchema),
  })
  .strict();
export type UpdateCustomerDiscountsRequest = z.infer<typeof UpdateCustomerDiscountsRequestSchema>;

export const UpdateBusinessProfileRequestSchema = z
  .object({
    ownerName: z.string().min(1, 'Owner name is required.').max(120).optional(),
    phone: z.string().min(1, 'Phone is required.').max(40).optional(),
    email: z.string().email('Invalid email address.').optional(),
    address: z.string().max(255).nullable().optional(),
    gstNo: z.string().max(40).nullable().optional(),
    gstRegistered: z.boolean().optional(),
  })
  .strict();
export type UpdateBusinessProfileRequest = z.infer<typeof UpdateBusinessProfileRequestSchema>;
