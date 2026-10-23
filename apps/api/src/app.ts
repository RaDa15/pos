import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { createSessionMiddleware } from './middleware/session.js';
import { csrfProtection } from './middleware/csrf.js';
import { globalApiRateLimit } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { registerRouter } from './routes/register.js';
import { authRouter, meRouter } from './routes/auth.js';
import { employeesRouter } from './routes/employees.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(cookieParser(env.SESSION_SECRET));
  app.use(express.json());

  if (env.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger }));
  }

  // Rate limiting & sessions
  app.use(globalApiRateLimit);
  app.use(createSessionMiddleware());

  // CSRF double-submit protection
  app.use(csrfProtection);

  // Health endpoint
  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  // API v1 Routes
  app.use('/api/v1/register', registerRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/me', meRouter);
  app.use('/api/v1/employees', employeesRouter);

  // Centralized Error Handler (07-API-SPEC.md §2)
  app.use(errorHandler);

  return app;
}
