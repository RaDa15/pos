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
