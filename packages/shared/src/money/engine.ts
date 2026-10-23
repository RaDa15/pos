/**
 * Core Financial Math Engine for POS SYSTEM
 *
 * Implements Bhutan GST calculations, discount allocations, and caps.
 * ALL internal calculations are performed in integer chhertum (1 Nu. = 100 chhertum).
 * Reference: docs/02-BUSINESS-RULES.md §3.1–3.3, BR-11, BR-12, BR-13, BR-14, BR-16.
 */

/** Money in integer chhertum (1 Nu. = 100 chhertum). Never use floating point money. */
export type Money = number;

import { BillDiscountType, TaxCategory, TaxMode } from '../enums.js';

export type { BillDiscountType, TaxCategory, TaxMode };

/**
 * Converts decimal Ngultrum to integer chhertum.
 * e.g. 135.50 -> 13550
 */
export function nuToChhertum(nu: number): Money {
  return roundHalfUp(nu * 100);
}

/**
 * Converts integer chhertum to decimal Ngultrum.
 * e.g. 13550 -> 135.50
 */
export function chhertumToNu(ch: Money): number {
  return ch / 100;
}

/**
 * Standard half-up integer rounding (e.g. 0.5 rounds up to 1).
 */
export function roundHalfUp(n: number): number {
  return Math.floor(n + 0.5 + 1e-9);
}

export interface LineInput {
  unitPrice: Money; // integer chhertum (selling price)
  qty: number; // positive integer
  lineDiscount?: Money; // integer chhertum (default: 0)
  taxRate: number; // e.g. 5 for 5%, 0 for zero-rated/exempt
  taxMode: TaxMode;
  taxCategory?: TaxCategory;
}

export interface LineResult {
  unitPrice: Money;
  qty: number;
  lineDiscount: Money; // capped to unitPrice * qty (BR-14)
  gross: Money; // unitPrice * qty - lineDiscount
  allocatedDiscount: Money; // from customer-type and bill discounts (§3.2)
  totalDiscount: Money; // lineDiscount + allocatedDiscount
  net: Money; // gross - allocatedDiscount
  taxRate: number; // effective rate (0 if not gstRegistered)
  taxMode: TaxMode;
  taxCategory: TaxCategory;
  taxable: Money; // taxable amount in chhertum
  tax: Money; // GST in chhertum
  total: Money; // taxable + tax (exclusive) or net (inclusive)
}

export interface BillDiscountInput {
  type: BillDiscountType;
  /**
   * If type === 'percent', value is a percentage (0-100).
   * If type === 'amount', value is integer chhertum.
   */
  value: number;
}

export interface DiscountAllocation {
  base: Money; // sum of gross_i
  customerTypePct: number; // clamped 0-100
  customerTypeAmt: Money; // round(base * customerTypePct / 100)
  remaining: Money; // base - customerTypeAmt
  billDiscountType: BillDiscountType;
  billDiscountValue: number;
  billDiscountAmt: Money; // capped to remaining
  extra: Money; // customerTypeAmt + billDiscountAmt
  allocations: Money[]; // allocated_i for each line
}

export interface SaleInput {
  lines: LineInput[];
  customerTypePct?: number; // 0-100, default 0
  billDiscount?: BillDiscountInput;
  charges?: Money; // integer chhertum, default 0 (BR-15)
  gstRegistered?: boolean; // default true (BR-11)
}

export interface TaxBreakdownItem {
  rate: number;
  category: TaxCategory;
  taxable: Money;
  tax: Money;
}

export interface SaleResult {
  lines: LineResult[];
  subtotal: Money; // sum(unitPrice * qty)
  grossTotal: Money; // sum(gross_i)
  lineDiscountTotal: Money; // sum(lineDiscount_i)
  customerTypeDiscount: Money; // customerTypeAmt
  billDiscount: Money; // billDiscountAmt
  discountTotal: Money; // sum(lineDiscount_i + allocatedDiscount_i)
  taxableAmount: Money; // sum(taxable_i)
  taxAmount: Money; // sum(tax_i)
  charges: Money; // non-negative charges added after tax (BR-15)
  total: Money; // sum(total_i) + charges
  allocation: DiscountAllocation;
  taxBreakdown: TaxBreakdownItem[];
}

/**
 * Computes a single line's gross, net, tax, and total.
 * Enforces BR-14 discount caps and BR-11 GST-registered toggle.
 */
export function computeLine(
  line: LineInput,
  allocatedDiscount: Money = 0,
  gstRegistered = true
): LineResult {
  const qty = Math.max(1, Math.floor(line.qty));
  const unitPrice = Math.max(0, line.unitPrice);
  const rawLineDiscount = Math.max(0, line.lineDiscount ?? 0);

  // BR-14: line_discount_i <= unit_price_i * qty_i
  const lineDiscount = Math.min(rawLineDiscount, unitPrice * qty);
  const gross = unitPrice * qty - lineDiscount;

  // Allocated discount cannot exceed gross
  const cappedAllocated = Math.max(0, Math.min(allocatedDiscount, gross));
  const net = gross - cappedAllocated;

  const taxCategory = line.taxCategory ?? (line.taxRate === 0 ? 'zero_rated' : 'standard');
  const effectiveRate = gstRegistered && taxCategory !== 'exempt' ? Math.max(0, line.taxRate) : 0;

  let taxable: Money;
  let tax: Money;
  let total: Money;

  if (effectiveRate === 0) {
    // Zero-rated, exempt, or non-GST registered
    taxable = net;
    tax = 0;
    total = net;
  } else if (line.taxMode === 'inclusive') {
    // Inclusive: total_i = net_i; taxable_i = round(net_i * 100 / (100 + rate_i)); tax_i = total_i - taxable_i
    total = net;
    taxable = roundHalfUp((net * 100) / (100 + effectiveRate));
    tax = total - taxable;
  } else {
    // Exclusive: taxable_i = net_i; tax_i = round(net_i * rate_i / 100); total_i = taxable_i + tax_i
    taxable = net;
    tax = roundHalfUp((net * effectiveRate) / 100);
    total = taxable + tax;
  }

  return {
    unitPrice,
    qty,
    lineDiscount,
    gross,
    allocatedDiscount: cappedAllocated,
    totalDiscount: lineDiscount + cappedAllocated,
    net,
    taxRate: effectiveRate,
    taxMode: line.taxMode,
    taxCategory,
    taxable,
    tax,
    total,
  };
}

/**
 * Allocates customer-type and bill discounts across cart lines per §3.2.
 * Spreads proportionally before tax, with leftover distributed in cart order.
 */
export function allocateDiscounts(
  grossAmounts: Money[],
  customerTypePct = 0,
  billDiscount?: BillDiscountInput
): DiscountAllocation {
  const base = grossAmounts.reduce((sum, g) => sum + Math.max(0, g), 0);

  // Customer-type discount % clamped between 0 and 100
  const clampedCustomerPct = Math.max(0, Math.min(100, customerTypePct));
  const customerTypeAmt = base > 0 ? Math.min(base, roundHalfUp((base * clampedCustomerPct) / 100)) : 0;
  const remaining = base - customerTypeAmt;

  // Bill discount clamped to remaining after customer-type discount (BR-14)
  const billType: BillDiscountType = billDiscount?.type ?? 'percent';
  const billVal = billDiscount?.value ?? 0;

  let billDiscountAmt = 0;
  if (remaining > 0) {
    if (billType === 'percent') {
      const clampedPct = Math.max(0, Math.min(100, billVal));
      billDiscountAmt = roundHalfUp((remaining * clampedPct) / 100);
    } else {
      billDiscountAmt = Math.max(0, Math.min(billVal, remaining));
    }
  }

  const extra = customerTypeAmt + billDiscountAmt;
  const allocations: Money[] = new Array(grossAmounts.length).fill(0);

  if (base > 0 && extra > 0) {
    let allocatedSum = 0;

    // Allocate for each line except the last
    for (let i = 0; i < grossAmounts.length - 1; i++) {
      const g = grossAmounts[i]!;
      const share = Math.min(g, roundHalfUp((extra * g) / base));
      allocations[i] = share;
      allocatedSum += share;
    }

    // Last line gets remainder, capped at gross_last
    if (grossAmounts.length > 0) {
      const lastIdx = grossAmounts.length - 1;
      const lastGross = grossAmounts[lastIdx]!;
      const lastShare = Math.min(lastGross, Math.max(0, extra - allocatedSum));
      allocations[lastIdx] = lastShare;
      allocatedSum += lastShare;
    }

    // If anything is left over due to caps / rounding, distribute to earlier lines in cart order
    let leftover = extra - allocatedSum;
    if (leftover > 0) {
      for (let i = 0; i < grossAmounts.length && leftover > 0; i++) {
        const capacity = grossAmounts[i]! - allocations[i]!;
        if (capacity > 0) {
          const add = Math.min(leftover, capacity);
          allocations[i] = (allocations[i] ?? 0) + add;
          leftover -= add;
        }
      }
    }
  }

  return {
    base,
    customerTypePct: clampedCustomerPct,
    customerTypeAmt,
    remaining,
    billDiscountType: billType,
    billDiscountValue: billVal,
    billDiscountAmt,
    extra,
    allocations,
  };
}

/**
 * Computes a full sale with line items, discount allocations, charges, and tax breakdowns.
 */
export function computeSale(input: SaleInput): SaleResult {
  const gstRegistered = input.gstRegistered ?? true;
  const charges = Math.max(0, input.charges ?? 0);

  // Compute gross for each line after line discount cap (BR-14)
  const grossAmounts = input.lines.map((l) => {
    const qty = Math.max(1, Math.floor(l.qty));
    const price = Math.max(0, l.unitPrice);
    const disc = Math.min(Math.max(0, l.lineDiscount ?? 0), price * qty);
    return price * qty - disc;
  });

  const allocation = allocateDiscounts(
    grossAmounts,
    input.customerTypePct ?? 0,
    input.billDiscount
  );

  const lines = input.lines.map((l, i) =>
    computeLine(l, allocation.allocations[i], gstRegistered)
  );

  let subtotal = 0;
  let grossTotal = 0;
  let lineDiscountTotal = 0;
  let taxableAmount = 0;
  let taxAmount = 0;
  let totalLines = 0;

  const breakdownMap = new Map<string, TaxBreakdownItem>();

  for (const l of lines) {
    subtotal += l.unitPrice * l.qty;
    grossTotal += l.gross;
    lineDiscountTotal += l.lineDiscount;
    taxableAmount += l.taxable;
    taxAmount += l.tax;
    totalLines += l.total;

    const key = `${l.taxRate}_${l.taxCategory}`;
    const existing = breakdownMap.get(key);
    if (existing) {
      existing.taxable += l.taxable;
      existing.tax += l.tax;
    } else {
      breakdownMap.set(key, {
        rate: l.taxRate,
        category: l.taxCategory,
        taxable: l.taxable,
        tax: l.tax,
      });
    }
  }

  const taxBreakdown = Array.from(breakdownMap.values()).sort(
    (a, b) => a.rate - b.rate || a.category.localeCompare(b.category)
  );

  return {
    lines,
    subtotal,
    grossTotal,
    lineDiscountTotal,
    customerTypeDiscount: allocation.customerTypeAmt,
    billDiscount: allocation.billDiscountAmt,
    discountTotal: lineDiscountTotal + allocation.extra,
    taxableAmount,
    taxAmount,
    charges,
    total: totalLines + charges,
    allocation,
    taxBreakdown,
  };
}
