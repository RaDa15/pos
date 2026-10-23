import { Router, type Request, type Response } from 'express';
import {
  CreateEmployeeRequestSchema,
  UpdateEmployeeRequestSchema,
  ResetPasswordRequestSchema,
  canAddEmployeeUnderPlan,
  PLAN_LIMITS,
} from '@pos/shared';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, assertPasswordPolicy } from '../lib/passwords.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireEmployee, requirePermission } from '../middleware/auth.js';

export const employeesRouter: Router = Router();

// All employee routes require employee authentication and employees.manage permission
employeesRouter.use(requireEmployee);
employeesRouter.use(requirePermission('employees.manage'));

/**
 * GET /employees
 * Lists employees for the tenant.
 */
employeesRouter.get('/', async (req: Request, res: Response) => {
  const employees = await prisma.employee.findMany({
    where: {
      businessId: req.business!.id,
    },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
      language: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  res.json({ data: employees });
});

/**
 * POST /employees
 * Creates a new employee in this business.
 * Reference: docs/02-BUSINESS-RULES.md BR-02, BR-07.
 */
employeesRouter.post('/', async (req: Request, res: Response) => {
  const body = CreateEmployeeRequestSchema.parse(req.body);
  const usernameKey = body.username.trim().toLowerCase();

  // BR-02: Username unique within business (case-insensitive)
  const existing = await prisma.employee.findUnique({
    where: {
      businessId_usernameKey: {
        businessId: req.business!.id,
        usernameKey,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw AppError.usernameTaken('Username is already taken in this business.');
  }

  // Password policy
  assertPasswordPolicy(body.password, {
    username: body.username,
    businessName: req.business!.name,
  });

  // BR-07: Plan limits for active non-admin employees
  if (body.role !== 'admin') {
    const activeNonAdminCount = await prisma.employee.count({
      where: {
        businessId: req.business!.id,
        role: { not: 'admin' },
        active: true,
      },
    });

    if (!canAddEmployeeUnderPlan(req.subscription!.plan, activeNonAdminCount)) {
      const limit = PLAN_LIMITS[req.subscription!.plan].maxNonAdminEmployees;
      throw AppError.planLimit(`Your plan allows up to ${limit} active employee(s). Upgrade to add more.`);
    }
  }

  const passwordHash = await hashPassword(body.password);

  const employee = await prisma.employee.create({
    data: {
      businessId: req.business!.id,
      name: body.name,
      username: body.username,
      usernameKey,
      role: body.role,
      passwordHash,
      active: true,
      mustChangePassword: false,
    },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
      language: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });

  await writeAuditLog({
    businessId: req.business!.id,
    actorEmployeeId: req.employee!.id,
    actorName: req.employee!.name,
    action: 'Employee created',
    entityType: 'employee',
    entityId: employee.id,
    detail: `Created employee ${employee.username} with role ${employee.role}`,
  });

  res.status(201).json({ data: employee });
});

/**
 * PATCH /employees/:id
 * Updates employee name, role, active status.
 * Enforces Last Admin protection (AC-13, BR-02) and plan limit on re-enabling.
 */
employeesRouter.patch('/:id', async (req: Request, res: Response) => {
  const body = UpdateEmployeeRequestSchema.parse(req.body);

  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  const target = await prisma.employee.findFirst({
    where: {
      id,
      businessId: req.business!.id,
    },
  });

  if (!target) {
    throw AppError.notFound('Employee not found in this business.');
  }

  // BR-02 & AC-13: Last Admin protection
  if (target.role === 'admin' && target.active) {
    const isDemotingRole = body.role !== undefined && body.role !== 'admin';
    const isDeactivating = body.active === false;

    if (isDemotingRole || isDeactivating) {
      const remainingActiveAdmins = await prisma.employee.count({
        where: {
          businessId: req.business!.id,
          role: 'admin',
          active: true,
          id: { not: target.id },
        },
      });

      if (remainingActiveAdmins === 0) {
        throw AppError.lastAdmin('Cannot disable or change the role of the last active Admin.');
      }
    }
  }

  // Plan limit check when activating a non-admin
  const targetNewRole = body.role ?? target.role;
  const isBecomingActive = body.active === true && target.active === false;
  if (isBecomingActive && targetNewRole !== 'admin') {
    const activeNonAdminCount = await prisma.employee.count({
      where: {
        businessId: req.business!.id,
        role: { not: 'admin' },
        active: true,
        id: { not: target.id },
      },
    });

    if (!canAddEmployeeUnderPlan(req.subscription!.plan, activeNonAdminCount)) {
      const limit = PLAN_LIMITS[req.subscription!.plan].maxNonAdminEmployees;
      throw AppError.planLimit(`Your plan allows up to ${limit} active employee(s). Upgrade to add more.`);
    }
  }

  const updated = await prisma.employee.update({
    where: { id: target.id },
    data: {
      name: body.name ?? undefined,
      role: body.role ?? undefined,
      active: body.active !== undefined ? body.active : undefined,
    },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
      language: true,
      mustChangePassword: true,
      updatedAt: true,
    },
  });

  await writeAuditLog({
    businessId: req.business!.id,
    actorEmployeeId: req.employee!.id,
    actorName: req.employee!.name,
    action: 'Employee changed',
    entityType: 'employee',
    entityId: updated.id,
    detail: `Updated employee ${updated.username}`,
  });

  res.json({ data: updated });
});

/**
 * POST /employees/:id/reset-password
 * Admin resets employee password to a temporary one and sets mustChangePassword = true (AC-14).
 */
employeesRouter.post('/:id/reset-password', async (req: Request, res: Response) => {
  const body = ResetPasswordRequestSchema.parse(req.body);

  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  const target = await prisma.employee.findFirst({
    where: {
      id,
      businessId: req.business!.id,
    },
  });

  if (!target) {
    throw AppError.notFound('Employee not found in this business.');
  }

  assertPasswordPolicy(body.temporaryPassword, {
    username: target.username,
    businessName: req.business!.name,
  });

  const newHash = await hashPassword(body.temporaryPassword);

  await prisma.employee.update({
    where: { id: target.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: true,
    },
  });

  await writeAuditLog({
    businessId: req.business!.id,
    actorEmployeeId: req.employee!.id,
    actorName: req.employee!.name,
    action: 'Password reset by Admin',
    entityType: 'employee',
    entityId: target.id,
    detail: `Admin reset password for ${target.username}`,
  });

  res.json({ data: { success: true } });
});
