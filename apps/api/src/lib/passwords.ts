import argon2 from 'argon2';
import { validatePasswordPolicy, type PasswordPolicyOptions } from '@pos/shared';
import { AppError } from './errors.js';

/**
 * Hashes a plaintext password using Argon2id with parameters from docs/05-SECURITY-ACCESS.md §1:
 * memory 19 MiB (19456 KiB), iterations 2, parallelism 1.
 */
export async function hashPassword(plainText: string): Promise<string> {
  return argon2.hash(plainText, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 */
export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch {
    return false;
  }
}

/**
 * Validates password policy and throws 400 VALIDATION_ERROR if invalid.
 */
export function assertPasswordPolicy(password: string, options?: PasswordPolicyOptions): void {
  const result = validatePasswordPolicy(password, options);
  if (!result.valid) {
    throw AppError.validationError(result.message ?? 'Password does not meet policy requirements.', {
      fields: { password: result.message ?? 'Password does not meet policy requirements.' },
    });
  }
}
