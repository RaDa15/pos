/**
 * Password Policy and Common Passwords Check
 * Reference: docs/05-SECURITY-ACCESS.md §1.
 * Minimum 8 characters, maximum 128, not equal to username or business name,
 * not in common passwords list.
 */

// Top most common passwords list (frequent breach passwords)
export const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'qwertyuiop',
  '11111111',
  '123123123',
  'admin123',
  'admin1234',
  'administrator',
  'welcome1',
  'welcome123',
  'letmein1',
  'sunshine1',
  'iloveyou',
  'dragon123',
  'monkey123',
  'football1',
  'master123',
  'bhutan123',
  'thimphu123',
]);

export interface PasswordPolicyOptions {
  username?: string;
  businessName?: string;
}

export function validatePasswordPolicy(
  password: string,
  options?: PasswordPolicyOptions
): { valid: boolean; message?: string } {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters.' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password cannot exceed 128 characters.' };
  }

  const normalizedPwd = password.trim().toLowerCase();

  if (options?.username) {
    const normUsername = options.username.trim().toLowerCase();
    if (normUsername && normalizedPwd === normUsername) {
      return { valid: false, message: 'Password cannot be equal to your username.' };
    }
  }

  if (options?.businessName) {
    const normBiz = options.businessName.trim().toLowerCase();
    if (normBiz && normalizedPwd === normBiz) {
      return { valid: false, message: 'Password cannot be equal to your business name.' };
    }
  }

  if (COMMON_PASSWORDS.has(normalizedPwd)) {
    return { valid: false, message: 'Password is too common. Choose a stronger password.' };
  }

  return { valid: true };
}
