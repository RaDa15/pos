import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().optional().default('postgresql://pos:pos_dev_pass@localhost:5432/pos_dev?schema=public'),
  SESSION_SECRET: z.string().min(16).default('development-session-secret-at-least-32-chars-long!'),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  REMEMBER_DEVICE_DAYS: z.coerce.number().default(30),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_UPLOAD_BASE_URL: z.string().default('/uploads'),
  TOTP_ENCRYPTION_KEY: z.string().default('MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE='),
  SEED_DEMO_BUSINESSES: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  SEED_DEMO_PASSWORD: z.string().default('demo_password_1234'),
  PLATFORM_ADMIN_EMAIL: z.string().email().default('admin@pos.bt'),
  PLATFORM_ADMIN_INITIAL_PASSWORD: z.string().default('ChangeMeOnFirstLogin123!'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Environment configuration error');
}

export const env = parsed.data;
