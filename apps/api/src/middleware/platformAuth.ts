import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';

export interface AuthenticatedPlatformAdmin {
  id: string;
  email: string;
  name: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      platformAdmin?: AuthenticatedPlatformAdmin;
    }
  }
}

/**
 * Middleware: requires an authenticated Platform Administrator session.
 * Rejects business sessions and unauthenticated requests with 401 UNAUTHENTICATED.
 * Reference: docs/05-SECURITY-ACCESS.md §1.2 & AC-57.
 */
export async function requirePlatformAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const kind = req.session?.kind;
  const platformAdminId = req.session?.platformAdminId;

  if (kind !== 'platform' || !platformAdminId) {
    throw AppError.unauthenticated('Platform administrator sign-in required.');
  }

  const admin = await prisma.platformAdmin.findUnique({
    where: { id: platformAdminId },
    select: {
      id: true,
      email: true,
      name: true,
      totpEnabled: true,
      mustChangePassword: true,
      active: true,
    },
  });

  if (!admin || !admin.active) {
    if (req.session) {
      await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    }
    throw AppError.unauthenticated('Platform administrator account is disabled or does not exist.');
  }

  req.platformAdmin = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    totpEnabled: admin.totpEnabled,
    mustChangePassword: admin.mustChangePassword,
  };

  next();
}
