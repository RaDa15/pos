import { Router, type Request, type Response } from 'express';
import { UpdateBusinessProfileRequestSchema } from '@pos/shared';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireEmployee, requirePermission } from '../middleware/auth.js';
import {
  imageUploadMiddleware,
  processAndSaveImage,
  deleteUploadedFile,
} from '../lib/uploads.js';

export const businessRouter: Router = Router();

businessRouter.use(requireEmployee);
businessRouter.use(requirePermission('settings.manage'));

/**
 * GET /business
 * Returns business profile and receipt configuration.
 */
businessRouter.get('/', async (req: Request, res: Response) => {
  const business = await prisma.business.findUnique({
    where: { id: req.business!.id },
    select: {
      id: true,
      businessCode: true,
      name: true,
      type: true,
      ownerName: true,
      phone: true,
      email: true,
      address: true,
      gstNo: true,
      gstRegistered: true,
      logoPath: true,
      createdAt: true,
    },
  });

  if (!business) {
    throw AppError.notFound('Business not found.');
  }

  res.json({
    data: {
      ...business,
      logoUrl: business.logoPath,
    },
  });
});

/**
 * PATCH /business
 * Updates business profile fields, including gstRegistered (BR-11, AC-53).
 */
businessRouter.patch('/', async (req: Request, res: Response) => {
  const body = UpdateBusinessProfileRequestSchema.parse(req.body);

  const existing = await prisma.business.findUnique({
    where: { id: req.business!.id },
  });

  if (!existing) {
    throw AppError.notFound('Business not found.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.business.update({
      where: { id: existing.id },
      data: {
        ownerName: body.ownerName,
        phone: body.phone,
        email: body.email,
        address: body.address,
        gstNo: body.gstNo,
        gstRegistered: body.gstRegistered,
      },
      select: {
        id: true,
        businessCode: true,
        name: true,
        type: true,
        ownerName: true,
        phone: true,
        email: true,
        address: true,
        gstNo: true,
        gstRegistered: true,
        logoPath: true,
        createdAt: true,
      },
    });

    if (body.gstRegistered !== undefined && body.gstRegistered !== existing.gstRegistered) {
      await writeAuditLog(
        {
          businessId: existing.id,
          actorEmployeeId: req.employee!.id,
          actorName: req.employee!.name,
          action: 'gst_registered_changed',
          entityType: 'business',
          entityId: existing.id,
          detail: `GST registration status changed to ${body.gstRegistered ? 'Registered' : 'Not Registered'}`,
        },
        tx
      );
    }

    await writeAuditLog(
      {
        businessId: existing.id,
        actorEmployeeId: req.employee!.id,
        actorName: req.employee!.name,
        action: 'business_profile_updated',
        entityType: 'business',
        entityId: existing.id,
        detail: 'Updated business contact and tax details',
      },
      tx
    );

    return res;
  });

  res.json({
    data: {
      ...updated,
      logoUrl: updated.logoPath,
    },
  });
});

/**
 * POST /business/logo
 * Uploads a logo for the business, processed through sharp to WebP.
 */
businessRouter.post('/logo', imageUploadMiddleware, async (req: Request, res: Response) => {
  if (!req.file) {
    throw AppError.validationError('No image file provided in "file" field.');
  }

  const existing = await prisma.business.findUnique({
    where: { id: req.business!.id },
    select: { logoPath: true },
  });

  // Process through sharp, strip metadata, convert to WebP
  const relativePath = await processAndSaveImage(req.file.buffer, 'logos');

  // Delete previous logo if present
  if (existing?.logoPath) {
    await deleteUploadedFile(existing.logoPath);
  }

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: req.business!.id },
      data: { logoPath: relativePath },
    });

    await writeAuditLog(
      {
        businessId: req.business!.id,
        actorEmployeeId: req.employee!.id,
        actorName: req.employee!.name,
        action: 'business_logo_updated',
        entityType: 'business',
        entityId: req.business!.id,
        detail: 'Uploaded new receipt logo',
      },
      tx
    );
  });

  res.json({
    data: {
      logoUrl: relativePath,
    },
  });
});

/**
 * DELETE /business/logo
 * Removes receipt logo (reverts to default logo).
 */
businessRouter.delete('/logo', async (req: Request, res: Response) => {
  const existing = await prisma.business.findUnique({
    where: { id: req.business!.id },
    select: { logoPath: true },
  });

  if (existing?.logoPath) {
    await deleteUploadedFile(existing.logoPath);
  }

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: req.business!.id },
      data: { logoPath: null },
    });

    await writeAuditLog(
      {
        businessId: req.business!.id,
        actorEmployeeId: req.employee!.id,
        actorName: req.employee!.name,
        action: 'business_logo_deleted',
        entityType: 'business',
        entityId: req.business!.id,
        detail: 'Deleted receipt logo',
      },
      tx
    );
  });

  res.json({
    data: {
      logoUrl: null,
    },
  });
});
