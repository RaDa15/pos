import { describe, expect, it } from 'vitest';
import {
  allocateDiscounts,
  computeLine,
  computeSale,
  nuToChhertum,
  chhertumToNu,
  roundHalfUp,
  type LineInput,
  type SaleInput,
} from './engine.js';
import { amountInWords } from './words.js';

describe('Financial Math Engine', () => {
  describe('Helper conversions and rounding', () => {
    it('converts between Ngultrum and integer chhertum correctly', () => {
      expect(nuToChhertum(135.5)).toBe(13550);
      expect(nuToChhertum(0)).toBe(0);
      expect(nuToChhertum(0.01)).toBe(1);
      expect(nuToChhertum(376.43)).toBe(37643);

      expect(chhertumToNu(13550)).toBe(135.5);
      expect(chhertumToNu(37643)).toBe(376.43);
      expect(chhertumToNu(0)).toBe(0);
    });

    it('rounds half-up correctly', () => {
      expect(roundHalfUp(1125.5)).toBe(1126);
      expect(roundHalfUp(1125.49)).toBe(1125);
      expect(roundHalfUp(0)).toBe(0);
      expect(roundHalfUp(-1.5)).toBe(-1);
      expect(roundHalfUp(-1.6)).toBe(-2);
    });
  });

  describe('AC-29: §3.3 Worked Example (Golden Test)', () => {
    it('produces the exact values from 02-BUSINESS-RULES.md §3.3', () => {
      const teaLine: LineInput = {
        unitPrice: nuToChhertum(135.0),
        qty: 2,
        lineDiscount: nuToChhertum(0),
        taxRate: 5,
        taxMode: 'exclusive',
        taxCategory: 'standard',
      };

      const detergentLine: LineInput = {
        unitPrice: nuToChhertum(170.0),
        qty: 1,
        lineDiscount: nuToChhertum(10.0),
        taxRate: 5,
        taxMode: 'exclusive',
        taxCategory: 'standard',
      };

      const saleInput: SaleInput = {
        lines: [teaLine, detergentLine],
        customerTypePct: 5, // VIP 5%
        billDiscount: {
          type: 'amount',
          value: nuToChhertum(50.0),
        },
        charges: 0,
        gstRegistered: true,
      };

      const result = computeSale(saleInput);

      // Verify intermediate allocations (§3.3)
      expect(result.allocation.base).toBe(nuToChhertum(430.0));
      expect(result.allocation.customerTypeAmt).toBe(nuToChhertum(21.5));
      expect(result.allocation.billDiscountAmt).toBe(nuToChhertum(50.0));
      expect(result.allocation.extra).toBe(nuToChhertum(71.5));

      // Tea line
      const tea = result.lines[0]!;
      expect(tea.gross).toBe(nuToChhertum(270.0));
      expect(tea.allocatedDiscount).toBe(nuToChhertum(44.9)); // 44.90
      expect(tea.net).toBe(nuToChhertum(225.1)); // 225.10
      expect(tea.taxable).toBe(nuToChhertum(225.1));
      expect(tea.tax).toBe(nuToChhertum(11.26)); // 11.26
      expect(tea.total).toBe(nuToChhertum(236.36)); // 236.36
      expect(tea.taxable + tea.tax).toBe(tea.total);

      // Detergent line
      const detergent = result.lines[1]!;
      expect(detergent.gross).toBe(nuToChhertum(160.0));
      expect(detergent.allocatedDiscount).toBe(nuToChhertum(26.6)); // 26.60
      expect(detergent.net).toBe(nuToChhertum(133.4)); // 133.40
      expect(detergent.taxable).toBe(nuToChhertum(133.4));
      expect(detergent.tax).toBe(nuToChhertum(6.67)); // 6.67
      expect(detergent.total).toBe(nuToChhertum(140.07)); // 140.07
      expect(detergent.taxable + detergent.tax).toBe(detergent.total);

      // Sale totals
      expect(result.subtotal).toBe(nuToChhertum(440.0));
      expect(result.discountTotal).toBe(nuToChhertum(81.5)); // 10.00 + 71.50
      expect(result.taxableAmount).toBe(nuToChhertum(358.5));
      expect(result.taxAmount).toBe(nuToChhertum(17.93));
      expect(result.total).toBe(nuToChhertum(376.43));
      expect(result.taxableAmount + result.taxAmount + result.charges).toBe(result.total);

      // Amount in words (BR-37)
      const words = amountInWords(chhertumToNu(result.total));
      expect(words).toBe(
        'Three Hundred Seventy-Six Ngultrum and Forty-Three Chhertum only'
      );
    });
  });

  describe('AC-30: 5% Inclusive Rate Test', () => {
    it('computes 1 x 105.00 at 5% inclusive as taxable 100.00, GST 5.00, total 105.00', () => {
      const line: LineInput = {
        unitPrice: nuToChhertum(105.0),
        qty: 1,
        taxRate: 5,
        taxMode: 'inclusive',
        taxCategory: 'standard',
      };

      const result = computeLine(line, 0, true);

      expect(result.gross).toBe(nuToChhertum(105.0));
      expect(result.net).toBe(nuToChhertum(105.0));
      expect(result.taxable).toBe(nuToChhertum(100.0));
      expect(result.tax).toBe(nuToChhertum(5.0));
      expect(result.total).toBe(nuToChhertum(105.0));
      expect(result.taxable + result.tax).toBe(result.total);
    });
  });

  describe('AC-31: Discount Caps (BR-14)', () => {
    it('caps line discount to unit_price * qty and prevents negative line total', () => {
      const line: LineInput = {
        unitPrice: nuToChhertum(65.0),
        qty: 1,
        lineDiscount: nuToChhertum(80.0), // larger than 65.00
        taxRate: 5,
        taxMode: 'exclusive',
      };

      const result = computeLine(line, 0, true);

      expect(result.lineDiscount).toBe(nuToChhertum(65.0));
      expect(result.gross).toBe(0);
      expect(result.net).toBe(0);
      expect(result.taxable).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.total).toBe(0);
    });

    it('caps bill discount percent to 100% and prevents negative totals', () => {
      const sale = computeSale({
        lines: [
          {
            unitPrice: nuToChhertum(65.0),
            qty: 1,
            taxRate: 5,
            taxMode: 'exclusive',
          },
        ],
        billDiscount: {
          type: 'percent',
          value: 150, // > 100%
        },
      });

      expect(sale.allocation.billDiscountAmt).toBe(nuToChhertum(65.0));
      expect(sale.discountTotal).toBe(nuToChhertum(65.0));
      expect(sale.taxableAmount).toBe(0);
      expect(sale.taxAmount).toBe(0);
      expect(sale.total).toBe(0);
    });
  });

  describe('BR-11: GST Registered Switch', () => {
    it('taxes all lines at 0% when business is not GST registered', () => {
      const sale = computeSale({
        lines: [
          {
            unitPrice: nuToChhertum(50.0),
            qty: 2,
            taxRate: 5,
            taxMode: 'exclusive',
          },
        ],
        gstRegistered: false,
      });

      expect(sale.lines[0]!.taxRate).toBe(0);
      expect(sale.lines[0]!.tax).toBe(0);
      expect(sale.lines[0]!.taxable).toBe(nuToChhertum(100.0));
      expect(sale.lines[0]!.total).toBe(nuToChhertum(100.0));
      expect(sale.taxAmount).toBe(0);
      expect(sale.total).toBe(nuToChhertum(100.0));
    });
  });

  describe('Zero-rate and exempt lines', () => {
    it('treats exempt and zero-rated items as 0% tax even if rate is set', () => {
      const sale = computeSale({
        lines: [
          {
            unitPrice: nuToChhertum(100.0),
            qty: 1,
            taxRate: 0,
            taxMode: 'exclusive',
            taxCategory: 'zero_rated',
          },
          {
            unitPrice: nuToChhertum(200.0),
            qty: 1,
            taxRate: 5, // should be ignored because exempt
            taxMode: 'exclusive',
            taxCategory: 'exempt',
          },
        ],
        gstRegistered: true,
      });

      expect(sale.lines[0]!.tax).toBe(0);
      expect(sale.lines[1]!.tax).toBe(0);
      expect(sale.taxAmount).toBe(0);
      expect(sale.total).toBe(nuToChhertum(300.0));
    });
  });

  describe('Charges (BR-15)', () => {
    it('adds non-negative charges after tax without taxing them', () => {
      const sale = computeSale({
        lines: [
          {
            unitPrice: nuToChhertum(100.0),
            qty: 1,
            taxRate: 5,
            taxMode: 'exclusive',
          },
        ],
        charges: nuToChhertum(20.0),
      });

      expect(sale.taxableAmount).toBe(nuToChhertum(100.0));
      expect(sale.taxAmount).toBe(nuToChhertum(5.0));
      expect(sale.charges).toBe(nuToChhertum(20.0));
      expect(sale.total).toBe(nuToChhertum(125.0));
    });
  });

  describe('30-line cart stress test', () => {
    it('maintains exact taxable + tax = total invariant across 30 arbitrary lines with discounts', () => {
      const lines: LineInput[] = [];
      for (let i = 1; i <= 30; i++) {
        lines.push({
          unitPrice: nuToChhertum(10 + i * 3.75),
          qty: (i % 4) + 1,
          lineDiscount: i % 3 === 0 ? nuToChhertum(5.0) : 0,
          taxRate: i % 2 === 0 ? 5 : 0,
          taxMode: i % 5 === 0 ? 'inclusive' : 'exclusive',
          taxCategory: i % 7 === 0 ? 'exempt' : 'standard',
        });
      }

      const sale = computeSale({
        lines,
        customerTypePct: 10,
        billDiscount: { type: 'percent', value: 15 },
        charges: nuToChhertum(50.0),
        gstRegistered: true,
      });

      expect(sale.lines.length).toBe(30);

      // Verify invariant on every single line
      for (const line of sale.lines) {
        expect(line.taxable + line.tax).toBe(line.total);
        expect(line.net).toBeGreaterThanOrEqual(0);
        expect(line.gross).toBeGreaterThanOrEqual(0);
        expect(line.allocatedDiscount).toBeLessThanOrEqual(line.gross);
      }

      // Verify invariant on whole sale
      expect(sale.taxableAmount + sale.taxAmount + sale.charges).toBe(sale.total);
    });
  });

  describe('Edge cases and boundary branches', () => {
    it('handles empty lines array gracefully', () => {
      const sale = computeSale({ lines: [] });
      expect(sale.total).toBe(0);
      expect(sale.lines).toEqual([]);
      expect(sale.taxBreakdown).toEqual([]);
    });

    it('handles zero base and negative input clamps', () => {
      const sale = computeSale({
        lines: [{ unitPrice: 0, qty: 1, taxRate: 5, taxMode: 'exclusive' }],
        customerTypePct: -10,
        charges: -50,
      });
      expect(sale.total).toBe(0);
      expect(sale.charges).toBe(0);
    });

    it('distributes leftover correctly when last line capacity is constrained', () => {
      // 10 lines of 3 and 1 line of 1 (base 31). Extra = 25.
      // Proportional shares round down (25*3/31 = 2.42 -> 2).
      // 10 * 2 = 20. Remaining 5 exceeds last line's capacity of 1.
      // Leftover 4 is distributed to earlier lines so total equals 25.
      const gross = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1];
      const allocation = allocateDiscounts(gross, 0, {
        type: 'amount',
        value: 25,
      });
      const sum = allocation.allocations.reduce((a, b) => a + b, 0);
      expect(sum).toBe(25);
      expect(allocation.allocations[10]).toBe(1); // last line capped at its gross
    });
  });
});
