import { z } from 'zod';
import { BUSINESS_TYPES, PLAN_CODES } from '../enums.js';

export const RegisterRequestSchema = z
  .object({
    business: z
      .object({
        name: z.string().min(2, 'Business name must be at least 2 characters.').max(80),
        type: z.enum(BUSINESS_TYPES),
        ownerName: z.string().min(1, 'Enter owner name.').max(80),
        phone: z.string().min(8, 'Enter a valid phone number.').max(15),
        email: z.string().email('Enter a valid email.'),
        gstNo: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
      })
      .strict(),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    plan: z.enum(PLAN_CODES),
  })
  .strict();

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
