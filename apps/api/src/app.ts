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

  // Centralized Error Handler (07-API-SPEC.md §2)
  app.use(errorHandler);

  return app;
}
