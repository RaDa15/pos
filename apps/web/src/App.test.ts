import { describe, it, expect } from 'vitest';
import { APP_NAME } from '@pos/shared';

describe('App smoke test', () => {
  it('has shared app name constant', () => {
    expect(APP_NAME).toBe('POS SYSTEM');
  });
});
