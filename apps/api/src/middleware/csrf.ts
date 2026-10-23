import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Double-submit CSRF cookie protection.
 * Reference: docs/05-SECURITY-ACCESS.md §6 & docs/07-API-SPEC.md §1.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const isProduction = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';

  // For safe methods, issue cookie if missing
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    if (!req.cookies?.csrf) {
      const token = generateCsrfToken();
      res.cookie('csrf', token, {
        httpOnly: false, // Accessible to client-side scripts to read and send back in header
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
      });
      if (req.session) {
        req.session.csrfToken = token;
      }
    }
    next();
    return;
  }

  // For modifying methods (POST, PUT, PATCH, DELETE):
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.csrf;

  const validHeader = typeof headerToken === 'string' && headerToken.length > 0 ? headerToken : null;
  const validCookie = typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : null;

  if (!validHeader || !validCookie || validHeader !== validCookie) {
    throw AppError.csrfInvalid('Missing or invalid X-CSRF-Token header.');
  }

  next();
}
