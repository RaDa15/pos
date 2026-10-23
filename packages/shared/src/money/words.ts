/**
 * Number to words conversion in Bhutanese Ngultrum and Chhertum
 * Reference: docs/02-BUSINESS-RULES.md BR-37, AC-29.
 *
 * Example: 376.43 -> "Three Hundred Seventy-Six Ngultrum and Forty-Three Chhertum only"
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const;

function below1000(n: number): string {
  let rem = n;
  let out = '';

  if (rem >= 100) {
    out += `${ONES[Math.floor(rem / 100)]} Hundred`;
    rem %= 100;
    if (rem > 0) out += ' ';
  }

  if (rem >= 20) {
    out += TENS[Math.floor(rem / 10)];
    if (rem % 10 > 0) {
      out += `-${ONES[rem % 10]}`;
    }
  } else if (rem > 0) {
    out += ONES[rem];
  }

  return out;
}

/**
 * Converts a non-negative integer up to 999,999,999,999 into English words.
 */
export function numberToWords(n: number): string {
  let rem = Math.floor(Math.abs(n));
  if (rem === 0) return 'Zero';

  const units: Array<[number, string]> = [
    [1e9, 'Billion'],
    [1e6, 'Million'],
    [1e3, 'Thousand'],
  ];

  let out = '';
  for (const [val, name] of units) {
    if (rem >= val) {
      const chunk = Math.floor(rem / val);
      out += (out ? ' ' : '') + `${below1000(chunk)} ${name}`;
      rem %= val;
    }
  }

  if (rem > 0) {
    out += (out ? ' ' : '') + below1000(rem);
  }

  return out;
}

export interface AmountInWordsOptions {
  /** If true, the input amount is in integer chhertum rather than decimal Ngultrum. */
  inChhertum?: boolean;
}

/**
 * Converts an amount to standard receipt words (BR-37).
 * Format: "<Nu in words> Ngultrum[ and <Chhertum in words> Chhertum] only"
 */
export function amountInWords(amount: number, options?: AmountInWordsOptions): string {
  let nu: number;
  let ch: number;

  if (options?.inChhertum) {
    const totalCh = Math.round(Math.abs(amount));
    nu = Math.floor(totalCh / 100);
    ch = totalCh % 100;
  } else {
    const abs = Math.abs(amount);
    nu = Math.floor(abs + 1e-9);
    ch = Math.round((abs - nu) * 100);
  }

  const nuWords = numberToWords(nu);
  const chWords = ch > 0 ? numberToWords(ch) : '';

  return `${nuWords} Ngultrum${chWords ? ` and ${chWords} Chhertum` : ''} only`;
}
