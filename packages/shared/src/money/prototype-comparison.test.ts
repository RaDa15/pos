import { describe, expect, it } from 'vitest';
import {
  computeSale,
  nuToChhertum,
  chhertumToNu,
  type LineInput,
} from './engine.js';

/* ---------------- Exact Prototype Code copied from pos/script.js ---------------- */
const round2 = (n: number) => Math.round(n * 100) / 100;

function protoComputeLineTax(
  price: number,
  qty: number,
  discount: number,
  taxRate: number,
  inclusive: boolean
) {
  const gross = price * qty - (discount || 0);
  if (inclusive) {
    const taxable = gross / (1 + taxRate / 100);
    return {
      taxable: round2(taxable),
      tax: round2(gross - taxable),
      total: round2(gross),
    };
  } else {
    const tax = gross * (taxRate / 100);
    return {
      taxable: round2(gross),
      tax: round2(tax),
      total: round2(gross + tax),
    };
  }
}

interface ProtoCartItem {
  price: number;
  qty: number;
  discount: number;
  taxRate: number;
  inclusive: boolean;
}

function protoComputeBillAdjust(
  cart: ProtoCartItem[],
  tierPct = 0,
  bd: { type: 'percent' | 'amount'; value: number } = { type: 'percent', value: 0 }
) {
  const base = round2(
    cart.reduce((s, c) => s + Math.max(0, c.price * c.qty - Number(c.discount || 0)), 0)
  );
  const tierAmt = round2((base * tierPct) / 100);
  const remain = Math.max(0, base - tierAmt);
  let manualAmt =
    bd.type === 'percent'
      ? (remain * Math.min(100, Number(bd.value) || 0)) / 100
      : Math.min(remain, Number(bd.value) || 0);
  manualAmt = round2(Math.max(0, manualAmt));
  return {
    base,
    tierPct,
    tierAmt,
    manualAmt,
    extra: round2(tierAmt + manualAmt),
    manualType: bd.type,
    manualValue: Number(bd.value) || 0,
  };
}

function protoEffectiveCart(
  cart: ProtoCartItem[],
  tierPct = 0,
  bd: { type: 'percent' | 'amount'; value: number } = { type: 'percent', value: 0 }
) {
  const adj = protoComputeBillAdjust(cart, tierPct, bd);
  if (!adj.extra || !cart.length || !adj.base) return { lines: cart, adj };
  let allocated = 0;
  const lines = cart.map((c, i) => {
    const gross = Math.max(0, c.price * c.qty - Number(c.discount || 0));
    let share =
      i === cart.length - 1
        ? round2(adj.extra - allocated)
        : round2((adj.extra * gross) / adj.base);
    share = Math.max(0, Math.min(share, gross));
    allocated = round2(allocated + share);
    return { ...c, discount: round2(Number(c.discount || 0) + share) };
  });
  return { lines, adj };
}

/* ---------------- 1,000 Random Carts Comparison Test ---------------- */

// Deterministic pseudo-random generator (Linear Congruential Generator)
function createRng(seed = 123456789) {
  let s = seed;
  return function next() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('Prototype vs v1 Engine Comparison (1,000 Random Carts)', () => {
  it('asserts v1 and prototype results differ by at most Nu. 0.01 per line', () => {
    const rng = createRng(42);
    const taxRates = [0, 5];

    for (let cartIdx = 0; cartIdx < 1000; cartIdx++) {
      const lineCount = 1 + Math.floor(rng() * 8); // 1 to 8 lines
      const protoCart: ProtoCartItem[] = [];
      const v1Lines: LineInput[] = [];

      for (let l = 0; l < lineCount; l++) {
        const price = round2(5 + rng() * 300); // 5.00 to 305.00 Nu
        const qty = 1 + Math.floor(rng() * 5); // 1 to 5
        const maxDisc = price * qty * 0.4;
        const discount = round2(rng() * maxDisc); // 0 to 40% line discount
        const taxRate = taxRates[Math.floor(rng() * taxRates.length)] ?? 0;
        const inclusive = rng() > 0.5;

        protoCart.push({ price, qty, discount, taxRate, inclusive });
        v1Lines.push({
          unitPrice: nuToChhertum(price),
          qty,
          lineDiscount: nuToChhertum(discount),
          taxRate,
          taxMode: inclusive ? 'inclusive' : 'exclusive',
        });
      }

      const custTierPct = rng() > 0.5 ? Math.floor(rng() * 10) : 0; // 0 to 10%
      const billDiscountType = rng() > 0.5 ? 'percent' : 'amount';
      const billDiscountValue =
        billDiscountType === 'percent'
          ? Math.floor(rng() * 15) // 0 to 15%
          : round2(rng() * 30); // 0 to 30 Nu

      // Prototype execution
      const protoResult = protoEffectiveCart(protoCart, custTierPct, {
        type: billDiscountType,
        value: billDiscountValue,
      });

      const protoLinesComputed = protoResult.lines.map((c) =>
        protoComputeLineTax(c.price, c.qty, c.discount, c.taxRate, c.inclusive)
      );

      // v1 execution
      const v1Result = computeSale({
        lines: v1Lines,
        customerTypePct: custTierPct,
        billDiscount: {
          type: billDiscountType,
          value:
            billDiscountType === 'percent'
              ? billDiscountValue
              : nuToChhertum(billDiscountValue),
        },
        charges: 0,
        gstRegistered: true,
      });

      // Assert parity: difference <= Nu. 0.01 per line
      for (let i = 0; i < lineCount; i++) {
        const pLine = protoLinesComputed[i]!;
        const vLine = v1Result.lines[i]!;

        const vTotalNu = chhertumToNu(vLine.total);
        const vTaxableNu = chhertumToNu(vLine.taxable);
        const vTaxNu = chhertumToNu(vLine.tax);

        const diffTotal = Math.abs(vTotalNu - pLine.total);
        const diffTaxable = Math.abs(vTaxableNu - pLine.taxable);
        const diffTax = Math.abs(vTaxNu - pLine.tax);

        expect(
          diffTotal,
          `Cart ${cartIdx} line ${i} total diff: v1=${vTotalNu}, proto=${pLine.total}`
        ).toBeLessThanOrEqual(0.010001);

        expect(
          diffTaxable,
          `Cart ${cartIdx} line ${i} taxable diff: v1=${vTaxableNu}, proto=${pLine.taxable}`
        ).toBeLessThanOrEqual(0.010001);

        expect(
          diffTax,
          `Cart ${cartIdx} line ${i} tax diff: v1=${vTaxNu}, proto=${pLine.tax}`
        ).toBeLessThanOrEqual(0.010001);
      }
    }
  });
});
