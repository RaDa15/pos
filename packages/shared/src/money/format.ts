/**
 * Currency Formatting for Bhutanese Ngultrum
 * Reference: docs/09-DESIGN.md line 71.
 *
 * Always formats as `Nu. 1,23,456.00` (Indian number grouping, 2 decimals).
 */

import { Money } from './engine.js';

function formatIndianInteger(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const remaining = intStr.slice(0, -3);
  const parts: string[] = [];

  let i = remaining.length;
  while (i > 0) {
    const start = Math.max(0, i - 2);
    parts.unshift(remaining.slice(start, i));
    i -= 2;
  }

  return `${parts.join(',')},${last3}`;
}

export interface FormatMoneyOptions {
  /** If true, the input amount is in integer chhertum rather than decimal Ngultrum. */
  inChhertum?: boolean;
  /** Custom currency prefix. Defaults to "Nu. " */
  prefix?: string;
}

/**
 * Formats an amount into standard Bhutanese currency string.
 * Example: 123456 -> "Nu. 1,23,456.00"
 */
export function formatMoney(amount: number, options?: FormatMoneyOptions): string {
  const prefix = options?.prefix ?? 'Nu. ';
  const isNegative = amount < 0;

  let totalCh: number;
  if (options?.inChhertum) {
    totalCh = Math.round(Math.abs(amount));
  } else {
    totalCh = Math.round(Math.abs(amount) * 100);
  }

  const nu = Math.floor(totalCh / 100);
  const ch = totalCh % 100;
  const dec = ch.toString().padStart(2, '0');
  const formattedNu = formatIndianInteger(nu.toString());

  return `${isNegative ? '-' : ''}${prefix}${formattedNu}.${dec}`;
}

/**
 * Formats integer chhertum directly into "Nu. 1,23,456.00".
 */
export function formatChhertum(ch: Money, prefix = 'Nu. '): string {
  return formatMoney(ch, { inChhertum: true, prefix });
}
