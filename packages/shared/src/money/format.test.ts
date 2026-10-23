import { describe, expect, it } from 'vitest';
import { formatChhertum, formatMoney } from './format.js';

describe('Currency Formatting (Indian grouping, Nu. prefix)', () => {
  it('formats standard amounts with Indian grouping', () => {
    expect(formatMoney(0)).toBe('Nu. 0.00');
    expect(formatMoney(5)).toBe('Nu. 5.00');
    expect(formatMoney(376.43)).toBe('Nu. 376.43');
    expect(formatMoney(1000)).toBe('Nu. 1,000.00');
    expect(formatMoney(10000)).toBe('Nu. 10,000.00');
    expect(formatMoney(123456)).toBe('Nu. 1,23,456.00');
    expect(formatMoney(1234567.89)).toBe('Nu. 12,34,567.89');
  });

  it('formats chhertum directly via formatChhertum', () => {
    expect(formatChhertum(37643)).toBe('Nu. 376.43');
    expect(formatChhertum(12345600)).toBe('Nu. 1,23,456.00');
  });

  it('handles negative numbers properly', () => {
    expect(formatMoney(-50)).toBe('-Nu. 50.00');
    expect(formatMoney(-123456)).toBe('-Nu. 1,23,456.00');
  });
});
