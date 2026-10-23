/**
 * CSV parser and serializer compliant with RFC 4180,
 * with UTF-8 BOM support and CSV formula-injection protection (F-07, AC-21).
 */

const FORMULA_PREFIXES = ['=', '+', '-', '@'];

/**
 * Escapes a cell for CSV export, applying formula-injection guards.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let str = String(value);

  // F-07 / AC-21: Prefix formula injection characters with single quote
  if (FORMULA_PREFIXES.some((prefix) => str.startsWith(prefix))) {
    str = `'${str}`;
  }

  // If contains commas, double quotes, newlines, or begins with a quote
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.startsWith("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes rows of data into a CSV string with UTF-8 BOM.
 */
export function stringifyCsv(headers: string[], rows: (unknown[])[]): string {
  const headerLine = headers.map(sanitizeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(sanitizeCsvCell).join(','));
  // Prepend UTF-8 BOM for Excel compatibility with Dzongkha / Unicode (AC-21)
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n') + '\r\n';
}

/**
 * Parses a CSV string into an array of rows (each row is an array of strings).
 * Handles quoted fields, quoted commas, escaped quotes, and newlines in quotes.
 */
export function parseCsv(csvText: string): string[][] {
  // Strip UTF-8 BOM if present
  let text = csvText;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End of quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push last field and row if there's remaining content
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Filter out any trailing completely empty rows
  return rows.filter((row) => row.length > 0 && !(row.length === 1 && (row[0] ?? '').trim() === ''));
}
