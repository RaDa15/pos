import { describe, expect, it } from 'vitest';
import { amountInWords, numberToWords } from './words.js';

describe('Number and Currency to Words (BR-37)', () => {
  describe('numberToWords', () => {
    it('converts small numbers and zero', () => {
      expect(numberToWords(0)).toBe('Zero');
      expect(numberToWords(1)).toBe('One');
      expect(numberToWords(14)).toBe('Fourteen');
      expect(numberToWords(20)).toBe('Twenty');
      expect(numberToWords(42)).toBe('Forty-Two');
      expect(numberToWords(99)).toBe('Ninety-Nine');
    });

    it('converts hundreds and thousands', () => {
      expect(numberToWords(100)).toBe('One Hundred');
      expect(numberToWords(105)).toBe('One Hundred Five');
      expect(numberToWords(376)).toBe('Three Hundred Seventy-Six');
      expect(numberToWords(1000)).toBe('One Thousand');
      expect(numberToWords(1234)).toBe('One Thousand Two Hundred Thirty-Four');
    });

    it('converts millions and billions', () => {
      expect(numberToWords(1000000)).toBe('One Million');
      expect(numberToWords(2500000)).toBe('Two Million Five Hundred Thousand');
      expect(numberToWords(1000000000)).toBe('One Billion');
    });
  });

  describe('amountInWords', () => {
    it('formats worked example AC-29', () => {
      expect(amountInWords(376.43)).toBe(
        'Three Hundred Seventy-Six Ngultrum and Forty-Three Chhertum only'
      );
      expect(amountInWords(37643, { inChhertum: true })).toBe(
        'Three Hundred Seventy-Six Ngultrum and Forty-Three Chhertum only'
      );
    });

    it('formats exact Ngultrum without Chhertum', () => {
      expect(amountInWords(100.0)).toBe('One Hundred Ngultrum only');
      expect(amountInWords(10000, { inChhertum: true })).toBe('One Hundred Ngultrum only');
    });

    it('formats zero amounts', () => {
      expect(amountInWords(0)).toBe('Zero Ngultrum only');
      expect(amountInWords(0.05)).toBe('Zero Ngultrum and Five Chhertum only');
    });
  });
});
