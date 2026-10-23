import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';

export interface AuditParams {
  businessId?: string | null;
  actorEmployeeId?: string | null;
  actorPlatformAdminId?: string | null;
  actorName: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  detail?: string | null;
}

/**
 * Appends an entry to audit_logs table.
 * Reference: docs/05-SECURITY-ACCESS.md §7.
 */
export async function writeAuditLog(
  params: AuditParams,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      businessId: params.businessId ?? undefined,
      actorEmployeeId: params.actorEmployeeId ?? undefined,
      actorPlatformAdminId: params.actorPlatformAdminId ?? undefined,
      actorName: params.actorName,
      action: params.action,
      entityType: params.entityType ?? undefined,
      entityId: params.entityId ?? undefined,
      detail: params.detail ?? undefined,
    },
  });
}
