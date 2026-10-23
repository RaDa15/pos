import { z } from 'zod';
import { EMPLOYEE_ROLES } from '../enums.js';

export const CreateEmployeeRequestSchema = z
  .object({
    name: z.string().min(1, 'Enter employee name.').max(80),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters.')
      .max(40)
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, underscores, dots, and hyphens.'),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
    role: z.enum(EMPLOYEE_ROLES),
  })
  .strict();
export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequestSchema>;

export const UpdateEmployeeRequestSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    role: z.enum(EMPLOYEE_ROLES).optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateEmployeeRequest = z.infer<typeof UpdateEmployeeRequestSchema>;

export const ResetPasswordRequestSchema = z
  .object({
    temporaryPassword: z.string().min(8, 'Temporary password must be at least 8 characters.').max(128),
  })
  .strict();
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
