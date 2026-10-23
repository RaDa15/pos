import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
    return;
  }

  // Handle Multer upload errors
  if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'MulterError') {
    const multerErr = err as unknown as { code: string; message: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds maximum allowed limit (2 MB).',
          requestId,
        },
      });
      return;
    }
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: multerErr.message,
        requestId,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join('.') || 'body';
      fields[path] = issue.message;
    }
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: { fields },
        requestId,
      },
    });
    return;
  }

  logger.error({ err, requestId, url: req.originalUrl, method: req.method }, 'Unhandled internal error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred',
      requestId,
    },
  });
}
