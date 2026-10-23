import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

// Extend express-session types
declare module 'express-session' {
  interface SessionData {
    kind?: 'employee' | 'platform';
    businessId?: string;
    employeeId?: string;
    platformAdminId?: string;
    csrfToken?: string;
  }
}

const PgSession = connectPgSimple(session);

let pgPool: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  if (!pgPool) {
    pgPool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: env.NODE_ENV === 'test' ? 5 : 20,
    });
  }
  return pgPool;
}

export function createSessionMiddleware(): RequestHandler {
  const isProduction = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';

  return session({
    name: 'sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PgSession({
      pool: getPgPool(),
      tableName: 'sessions',
      createTableIfMissing: false,
      pruneSessionInterval: 60 * 15, // prune expired every 15 min
    }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: env.SESSION_TTL_HOURS * 3600 * 1000, // 12 hours
    },
  });
}
