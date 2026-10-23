import { Prisma, CounterName } from '@prisma/client';

export interface NextNumberResult {
  value: number;
  formatted: string;
}

/**
 * Atomically generates the next sequential number for a given business and counter.
 *
 * Implements strict gapless, concurrency-safe counter generation inside a transaction:
 * - Invoices: `INV-YYYY-NNNNN` (5-digit padded, resets each year)
 * - Kitchen Orders: `KOT-NNNN` (4-digit padded, year=0)
 * - Credit Settlements: `CR-NNNN` (4-digit padded, year=0)
 * - Purchases: `PUR-YYYY-NNNNN` (5-digit padded, resets each year)
 */
export async function nextNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
  name: CounterName,
  yearOverride?: number
): Promise<NextNumberResult> {
  if (!businessId) {
    throw new Error('businessId is required for nextNumber');
  }

  // Determine year: KOT and credit settlements don't reset by year (year = 0)
  const isYearly = name === CounterName.invoice || name === CounterName.purchase;
  const currentYear = yearOverride ?? new Date().getFullYear();
  const counterYear = isYearly ? currentYear : 0;

  // Atomic PostgreSQL upsert & increment inside caller's transaction
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "counters" ("business_id", "name", "year", "value")
    VALUES (${businessId}::uuid, ${name}::"counter_name", ${counterYear}, 1)
    ON CONFLICT ("business_id", "name", "year")
    DO UPDATE SET "value" = "counters"."value" + 1
    RETURNING "value";
  `;

  const record = rows[0];
  if (!record || typeof record.value !== 'number') {
    throw new Error(`Failed to generate sequential counter for ${name}`);
  }

  const value = record.value;

  let formatted = '';
  switch (name) {
    case CounterName.invoice:
      formatted = `INV-${counterYear}-${String(value).padStart(5, '0')}`;
      break;
    case CounterName.kot:
      formatted = `KOT-${String(value).padStart(4, '0')}`;
      break;
    case CounterName.credit_settlement:
      formatted = `CR-${String(value).padStart(4, '0')}`;
      break;
    case CounterName.purchase:
      formatted = `PUR-${counterYear}-${String(value).padStart(5, '0')}`;
      break;
  }

  return { value, formatted };
}
