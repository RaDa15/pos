import { Router, type Request, type Response } from 'express';
import { prisma } from '../db/client.js';
import { requireEmployee, requirePermission } from '../middleware/auth.js';
import { parseRangeToUtc } from '../lib/dates.js';
import { Prisma } from '@prisma/client';

export const auditRouter: Router = Router();

auditRouter.use(requireEmployee);
auditRouter.use(requirePermission('audit.view'));

/**
 * GET /api/v1/audit-logs
 * Immutable audit activity log viewer (SCR-22, AC-56).
 * Strictly read-only; no modification or deletion routes exist.
 */
auditRouter.get('/', async (req: Request, res: Response) => {
  const businessId = req.business!.id;
  const { action, employeeId, from, to, page = '1', limit = '200' } = req.query as {
    action?: string;
    employeeId?: string;
    from?: string;
    to?: string;
    page?: string;
    limit?: string;
  };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 200));
  const skip = (pageNum - 1) * limitNum;

  const where: Prisma.AuditLogWhereInput = {
    businessId,
  };

  if (action && action.trim() !== '') {
    where.action = { contains: action.trim(), mode: 'insensitive' };
  }

  if (employeeId && employeeId.trim() !== '') {
    where.actorEmployeeId = employeeId.trim();
  }

  const { fromUtc, toUtc } = parseRangeToUtc(from, to);
  if (fromUtc || toUtc) {
    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (fromUtc) createdAtFilter.gte = fromUtc;
    if (toUtc) createdAtFilter.lte = toUtc;
    where.createdAt = createdAtFilter;
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
      select: {
        id: true,
        actorName: true,
        actorEmployeeId: true,
        actorPlatformAdminId: true,
        action: true,
        entityType: true,
        entityId: true,
        detail: true,
        createdAt: true,
      },
    }),
  ]);

  res.status(200).json({
    data: logs.map((l) => ({
      id: l.id,
      actorName: l.actorName,
      actorEmployeeId: l.actorEmployeeId,
      actorPlatformAdminId: l.actorPlatformAdminId,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      detail: l.detail,
      createdAt: l.createdAt.toISOString(),
    })),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  });
});
