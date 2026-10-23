import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';

interface RateRecord {
  timestamps: number[];
}

const companyLoginAttempts = new Map<string, RateRecord>();
const registerAttempts = new Map<string, RateRecord>();
const globalAttempts = new Map<string, RateRecord>();

// Helper to get client IP
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(
  storage: Map<string, RateRecord>,
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  let record = storage.get(key);
  if (!record) {
    record = { timestamps: [] };
    storage.set(key, record);
  }

  // Prune timestamps older than window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    return false;
  }

  record.timestamps.push(now);
  return true;
}

/**
 * Company sign-in: 10 attempts per IP per 15 minutes.
 */
export function companyLoginRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const allowed = checkRateLimit(companyLoginAttempts, ip, 10, 15 * 60 * 1000);
  if (!allowed) {
    throw AppError.rateLimited('Too many company sign-in attempts. Try again in 15 minutes.');
  }
  next();
}

/**
 * Registration: 5 per hour per IP.
 */
export function registerRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const allowed = checkRateLimit(registerAttempts, ip, 5, 60 * 60 * 1000);
  if (!allowed) {
    throw AppError.rateLimited('Too many registration attempts from this IP. Try again later.');
  }
  next();
}

/**
 * Global API limit: 300 requests/min per session (or IP).
 */
export function globalApiRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const key = req.sessionID || getClientIp(req);
  const allowed = checkRateLimit(globalAttempts, key, 300, 60 * 1000);
  if (!allowed) {
    throw AppError.rateLimited('Rate limit exceeded. Maximum 300 requests per minute.');
  }
  next();
}

/**
 * For testing purposes: clear in-memory rate limits.
 */
export function resetRateLimits(): void {
  companyLoginAttempts.clear();
  registerAttempts.clear();
  globalAttempts.clear();
}
