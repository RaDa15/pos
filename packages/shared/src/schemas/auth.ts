import { z } from 'zod';

export const CompanyLoginRequestSchema = z
  .object({
    identifier: z.string().min(1, 'Enter your business name or Business ID.'),
    password: z.string().min(1, 'Enter company password.'),
    rememberDevice: z.boolean().optional().default(false),
  })
  .strict();
export type CompanyLoginRequest = z.infer<typeof CompanyLoginRequestSchema>;

export const EmployeeLoginRequestSchema = z
  .object({
    username: z.string().min(1, 'Enter your username.'),
    password: z.string().min(1, 'Enter your password.'),
  })
  .strict();
export type EmployeeLoginRequest = z.infer<typeof EmployeeLoginRequestSchema>;

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter current password.'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
  })
  .strict();
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const UpdateLanguageRequestSchema = z
  .object({
    language: z.enum(['en', 'dz']),
  })
  .strict();
export type UpdateLanguageRequest = z.infer<typeof UpdateLanguageRequestSchema>;
