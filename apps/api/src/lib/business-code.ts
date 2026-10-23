import { randomBytes } from 'node:crypto';
import { prisma } from '../db/client.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRandomCode(length = 5): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      result += CHARS[byte % CHARS.length];
    }
  }
  return result;
}

/**
 * Generates a unique Business ID matching format BIZ-[A-Z0-9]{5}.
 * Reference: docs/02-BUSINESS-RULES.md BR-01.
 */
export async function generateUniqueBusinessCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `BIZ-${generateRandomCode(5)}`;
    const exists = await prisma.business.findUnique({
      where: { businessCode: code },
      select: { id: true },
    });
    if (!exists) {
      return code;
    }
  }
  throw new Error('Failed to generate unique business code after multiple attempts');
}
