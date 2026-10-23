import { z } from 'zod';

export const CUSTOMER_TYPE_OPTIONS = [
  'regular',
  'vip',
  'corporate',
  'wholesale',
  'retail',
  'credit',
  'government_institutional',
  'online',
  'delivery',
] as const;

export const CreateCustomerRequestSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  phone: z.string().trim().optional().nullable(),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .optional()
    .nullable()
    .or(z.literal('')),
  address: z.string().trim().optional().nullable(),
  gstId: z.string().trim().optional().nullable(),
  type: z.enum(CUSTOMER_TYPE_OPTIONS).default('regular'),
  creditLimit: z.number().min(0, 'Credit limit must be non-negative').optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const UpdateCustomerRequestSchema = z.object({
  name: z.string().trim().min(1, 'Customer name cannot be empty').optional(),
  phone: z.string().trim().optional().nullable(),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .optional()
    .nullable()
    .or(z.literal('')),
  address: z.string().trim().optional().nullable(),
  gstId: z.string().trim().optional().nullable(),
  type: z.enum(CUSTOMER_TYPE_OPTIONS).optional(),
  creditLimit: z.number().min(0, 'Credit limit must be non-negative').optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
});

export const SETTLEMENT_PAYMENT_METHODS = [
  'cash',
  'card',
  'mbob',
  'mpay',
  'dk_bank',
  'tpay',
  'other_wallet',
  'bank',
] as const;

export const CreateCreditSettlementRequestSchema = z
  .object({
    amount: z.number().positive('Settlement amount must be greater than 0'),
    method: z.enum(SETTLEMENT_PAYMENT_METHODS),
    bankName: z.string().trim().optional().nullable(),
    journalNo: z.string().trim().optional().nullable(),
    remarks: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // BR-17: bank requires bank name and journal number
    if (data.method === 'bank') {
      if (!data.bankName || data.bankName.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankName'],
          message: 'Bank name is required for bank transfer settlements (BR-17)',
        });
      }
      if (!data.journalNo || data.journalNo.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['journalNo'],
          message: 'Journal/Reference number is required for bank transfer settlements (BR-17)',
        });
      }
    }

    // BR-17: wallet methods require transaction ID (in journalNo)
    const walletMethods = ['mbob', 'mpay', 'dk_bank', 'tpay', 'other_wallet'];
    if (walletMethods.includes(data.method)) {
      if (!data.journalNo || data.journalNo.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['journalNo'],
          message: 'Transaction ID is required for mobile wallet settlements (BR-17)',
        });
      }
    }
  });

export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequestSchema>;
export type CreateCreditSettlementRequest = z.infer<typeof CreateCreditSettlementRequestSchema>;
