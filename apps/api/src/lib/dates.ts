/**
 * Asia/Thimphu (UTC+6) Date and Time Utilities
 * Reference: docs/02-BUSINESS-RULES.md BR-33.
 */

export const BTT_OFFSET_HOURS = 6;
export const BTT_OFFSET_MS = BTT_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Returns current or given UTC date converted to BTT representation.
 */
export function getBttDate(utcDate: Date = new Date()): {
  bttTime: Date;
  businessDateStr: string;
  businessDate: Date;
} {
  const bttTime = new Date(utcDate.getTime() + BTT_OFFSET_MS);
  const businessDateStr = bttTime.toISOString().slice(0, 10);
  const businessDate = new Date(`${businessDateStr}T00:00:00.000Z`);
  return { bttTime, businessDateStr, businessDate };
}

/**
 * Parses a date or datetime string assumed to be in Asia/Thimphu into UTC Date bounds.
 * e.g. "2026-11-03" -> [2026-11-02T18:00:00.000Z, 2026-11-03T17:59:59.999Z]
 * e.g. "2026-11-01T00:00" -> 2026-10-31T18:00:00.000Z
 */
export function parseBttDateTime(input: string, isEndOfDay = false): Date {
  const trimmed = input.trim();
  // Check if date only YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const time = isEndOfDay ? '23:59:59.999' : '00:00:00.000';
    return new Date(`${trimmed}T${time}+06:00`);
  }

  // If format is YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss without timezone offset
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(trimmed)) {
    return new Date(`${trimmed}+06:00`);
  }

  // Already has Z or +/- offset
  return new Date(trimmed);
}

/**
 * Parses `from` and `to` query params into UTC Date range bounds for completedAt / createdAt queries.
 */
export function parseRangeToUtc(
  fromParam?: string,
  toParam?: string
): { fromUtc?: Date; toUtc?: Date; fromDateStr?: string; toDateStr?: string } {
  let fromUtc: Date | undefined;
  let toUtc: Date | undefined;
  let fromDateStr: string | undefined;
  let toDateStr: string | undefined;

  if (fromParam) {
    fromUtc = parseBttDateTime(fromParam, false);
    fromDateStr = fromParam.slice(0, 10);
  }
  if (toParam) {
    toUtc = parseBttDateTime(toParam, true);
    toDateStr = toParam.slice(0, 10);
  }

  return { fromUtc, toUtc, fromDateStr, toDateStr };
}

/**
 * Formats a Date to YYYY-MM-DD in Asia/Thimphu.
 */
export function formatBttDate(utcDate: Date): string {
  const btt = new Date(utcDate.getTime() + BTT_OFFSET_MS);
  return btt.toISOString().slice(0, 10);
}
