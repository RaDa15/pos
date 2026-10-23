import { describe, expect, it } from 'vitest';
import {
  getDefaultTrackStock,
  isCustomerTypeAllowed,
  isOrderTypeAllowed,
} from './business-types.js';

describe('Business Types Configuration', () => {
  it('validates grocery allowed customer types and order types', () => {
    expect(isCustomerTypeAllowed('grocery', 'wholesale')).toBe(true);
    expect(isCustomerTypeAllowed('grocery', 'delivery')).toBe(false);

    expect(isOrderTypeAllowed('grocery', 'walk_in')).toBe(true);
    expect(isOrderTypeAllowed('grocery', 'dine_in')).toBe(false);
  });

  it('validates restaurant allowed customer types and order types', () => {
    expect(isCustomerTypeAllowed('restaurant', 'delivery')).toBe(true);
    expect(isCustomerTypeAllowed('restaurant', 'wholesale')).toBe(false);

    expect(isOrderTypeAllowed('restaurant', 'dine_in')).toBe(true);
    expect(isOrderTypeAllowed('restaurant', 'pre_booked')).toBe(false);
  });

  it('applies default stock tracking rules per BR-09', () => {
    expect(getDefaultTrackStock('grocery', 'plate')).toBe(true);
    expect(getDefaultTrackStock('grocery', 'pc')).toBe(true);

    expect(getDefaultTrackStock('restaurant', 'plate')).toBe(false);
    expect(getDefaultTrackStock('restaurant', 'pc')).toBe(true);

    expect(getDefaultTrackStock('unknown' as unknown as import('./enums.js').BusinessType, 'pc')).toBe(true);
  });
});
