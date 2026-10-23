import { z } from 'zod';

export const CreateSupplierRequestSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required'),
  phone: z.string().trim().optional().nullable(),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .optional()
    .nullable()
    .or(z.literal('')),
  address: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  openingPaid: z.number().min(0, 'Opening paid amount must be non-negative').default(0),
  openingOutstanding: z
    .number()
    .min(0, 'Opening outstanding amount must be non-negative')
    .default(0),
});

export const UpdateSupplierRequestSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name cannot be empty').optional(),
  phone: z.string().trim().optional().nullable(),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .optional()
    .nullable()
    .or(z.literal('')),
  address: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  openingPaid: z.number().min(0, 'Opening paid amount must be non-negative').optional(),
  openingOutstanding: z
    .number()
    .min(0, 'Opening outstanding amount must be non-negative')
    .optional(),
  active: z.boolean().optional(),
});

export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequestSchema>;
export type UpdateSupplierRequest = z.infer<typeof UpdateSupplierRequestSchema>;
