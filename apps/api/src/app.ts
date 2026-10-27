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
import { prisma } from './db/client.js';
import path from 'node:path';
import { registerRouter } from './routes/register.js';
import { authRouter, meRouter } from './routes/auth.js';
import { employeesRouter } from './routes/employees.js';
import { settingsRouter } from './routes/settings.js';
import { businessRouter } from './routes/business.js';
import { productsRouter } from './routes/products.js';
import { inventoryRouter, stockMovementsRouter } from './routes/inventory.js';
import { customersRouter } from './routes/customers.js';
import { suppliersRouter } from './routes/suppliers.js';
import { posRouter } from './routes/pos.js';
import { salesRouter } from './routes/sales.js';
import { heldOrdersRouter } from './routes/held-orders.js';
import { paymentsRouter } from './routes/payments.js';
import { kitchenOrdersRouter } from './routes/kitchen-orders.js';
import { expensesRouter } from './routes/expenses.js';
import { dashboardRouter } from './routes/dashboard.js';
import { reportsRouter } from './routes/reports.js';
import { platformRouter } from './routes/platform.js';
import { subscriptionRouter } from './routes/subscription.js';
import { auditRouter } from './routes/audit.js';
import { purchasesRouter } from './routes/purchases.js';
import { dataRouter } from './routes/data.js';

export function createApp(): Express {
  const app = express();

  const isProduction = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';

  app.use(
    helmet({
      frameguard: { action: 'deny' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    })
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(cookieParser(env.SESSION_SECRET));
  app.use(express.json({ limit: '10mb' }));

  if (env.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger }));
  }

  // Rate limiting & sessions
  app.use(globalApiRateLimit);
  app.use(createSessionMiddleware());

  // CSRF double-submit protection
  app.use(csrfProtection);

  // Health & Uptime monitoring endpoints (root /health & /api/v1/health)
  const healthHandler = async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        status: 'ok',
        database: 'connected',
        uptime: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(503).json({
        status: 'degraded',
        database: 'disconnected',
        error: msg,
        timestamp: new Date().toISOString(),
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  // Serve uploads
  app.use(env.PUBLIC_UPLOAD_BASE_URL, express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)));

  // API v1 Routes
  app.use('/api/v1/register', registerRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/me', meRouter);
  app.use('/api/v1/employees', employeesRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1/business', businessRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/stock-movements', stockMovementsRouter);
  app.use('/api/v1/customers', customersRouter);
  app.use('/api/v1/suppliers', suppliersRouter);
  app.use('/api/v1/pos', posRouter);
  app.use('/api/v1/sales', salesRouter);
  app.use('/api/v1/held-orders', heldOrdersRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/kitchen-orders', kitchenOrdersRouter);
  app.use('/api/v1/expenses', expensesRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/platform', platformRouter);
  app.use('/api/v1/subscription', subscriptionRouter);
  app.use('/api/v1/audit-logs', auditRouter);
  app.use('/api/v1/purchases', purchasesRouter);
  app.use('/api/v1/data', dataRouter);

  // Centralized Error Handler (07-API-SPEC.md §2)
  app.use(errorHandler);

  return app;
}
