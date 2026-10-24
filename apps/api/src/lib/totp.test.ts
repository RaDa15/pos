import { describe, it, expect } from 'vitest';
import {
  generateTotpSecret,
  computeTotp,
  verifyTotpCode,
  encryptTotpSecret,
  decryptTotpSecret,
  base32Encode,
  base32Decode,
} from './totp.js';

describe('TOTP Utility (RFC 6238)', () => {
  it('Base32 round-trip preserves raw bytes', () => {
    const raw = Buffer.from('hello world 12345', 'utf8');
    const encoded = base32Encode(raw);
    const decoded = base32Decode(encoded);
    expect(decoded.toString('utf8')).toBe('hello world 12345');
  });

  it('Generates a valid secret and verifies current code', () => {
    const { secret, qrUri } = generateTotpSecret('admin@yuevaan.bt');
    expect(secret.length).toBeGreaterThan(16);
    expect(qrUri).toContain('otpauth://totp/');
    expect(qrUri).toContain(secret);

    const now = Date.now();
    const currentStep = Math.floor(now / 30000);
    const code = computeTotp(secret, currentStep);

    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, now)).toBe(true);

    // Rejects invalid codes
    expect(verifyTotpCode(secret, '000000', now)).toBe(false);
    expect(verifyTotpCode(secret, 'invalid', now)).toBe(false);
  });

  it('Encrypts and decrypts secret at rest with AES-256-GCM', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).toContain(':');
    const decrypted = decryptTotpSecret(encrypted);
    expect(decrypted).toBe(secret);
  });
});
