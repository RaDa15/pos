import { describe, it, expect } from 'vitest';
import { parseCsv, stringifyCsv, sanitizeCsvCell } from './csv.js';

describe('CSV parser & serializer (F-07, AC-20, AC-21)', () => {
  it('parses quoted fields with commas (AC-20)', () => {
    const csv = 'Name,Price,Stock\r\n"Rice, Red 5kg",450,10\r\nTea,135,20';
    const parsed = parseCsv(csv);
    expect(parsed).toEqual([
      ['Name', 'Price', 'Stock'],
      ['Rice, Red 5kg', '450', '10'],
      ['Tea', '135', '20'],
    ]);
  });

  it('escapes quotes inside quoted strings', () => {
    const csv = 'Name,Notes\r\n"He said ""Hello""",Test';
    const parsed = parseCsv(csv);
    expect(parsed[1]?.[0]).toBe('He said "Hello"');
  });

  it('strips UTF-8 BOM when parsing', () => {
    const csv = '\uFEFFHeader1,Header2\r\nVal1,Val2';
    const parsed = parseCsv(csv);
    expect(parsed[0]?.[0]).toBe('Header1');
  });

  it('sanitizes cells starting with =, +, -, @ to prevent formula injection (AC-21)', () => {
    expect(sanitizeCsvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
    expect(sanitizeCsvCell('+12345')).toBe('"\' +12345"'.replace(' ', ''));
    expect(sanitizeCsvCell('-50')).toBe('"\' -50"'.replace(' ', ''));
    expect(sanitizeCsvCell('@test')).toBe('"\'@test"');
    expect(sanitizeCsvCell('Normal Text')).toBe('Normal Text');
  });

  it('prepends UTF-8 BOM when stringifying (AC-21)', () => {
    const headers = ['Product Name', 'Barcode'];
    const rows = [['=SUM(A1)', '20123456789']];
    const out = stringifyCsv(headers, rows);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain('"\'=SUM(A1)"');
  });
});
