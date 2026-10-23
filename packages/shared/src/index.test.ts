import { describe, it, expect } from 'vitest';
import { APP_NAME, CURRENCY } from './index.js';

describe('shared package smoke test', () => {
  it('exports app name and currency constants', () => {
    expect(APP_NAME).toBe('POS SYSTEM');
    expect(CURRENCY).toBe('Nu.');
  });
});
