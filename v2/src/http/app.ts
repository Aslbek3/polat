// Express ilovasini yig'adi. Global holat yo'q — barcha bog'liqliklar
// `AppDeps` orqali; testlarda alohida baza bilan to'liq ilova quriladi.
//
// Ulanish tartibi muhim (eski server/index.js bilan bir xil mantiq):
//   1. ochiq yo'llar: ping/health, /api/login|logout, /api/customer/*
//   2. requireAuth (xodim cookie'si + rol hududlari)
//   3. rolga yopilgan API'lar
//   4. statik fayllar (sahifalar ham requireAuth'dan o'tadi)
import express, { Router, type Express } from 'express';
import type { Database } from '../db/pool.js';
import type { Env } from '../config/env.js';
import type { Logger } from '../lib/logger.js';
import { errorHandler, requestLogger, securityHeaders } from './middleware.js';
import { NotFoundError } from './errors.js';
import { DEFAULT_PUBLIC_DIR, staticFiles } from './static.js';
import { createStaffSessionCodec } from '../modules/auth/staffSession.js';
import { createRequireAuth, requireRole } from '../modules/auth/auth.middleware.js';
import { meRoutes, publicAuthRoutes } from '../modules/auth/auth.routes.js';
import { usersRoutes } from '../modules/users/users.routes.js';
import { auditRoutes } from '../modules/audit/audit.routes.js';
import { createCustomerSessions } from '../modules/customers/customerSession.js';
import { customerAccountRoutes, customerAuthRoutes, requireCustomer } from '../modules/customers/customers.routes.js';
import './types.js';

export interface AppDeps {
  env: Env;
  db: Database;
  logger: Logger;
}

export function createApp(deps: AppDeps): Express {
  const { env, db, logger } = deps;
  const app = express();
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const staffCodec = createStaffSessionCodec(env.SESSION_SECRET);
  const customerSessions = createCustomerSessions(db, env.SESSION_SECRET);
  app.locals.deps = deps;
  app.locals.customerSessions = customerSessions;

  app.use(requestLogger(logger));
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));

  // ---- 1. Ochiq yo'llar
  app.get('/api/ping', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/health', async (_req, res) => {
    const dbOk = await db.ping();
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk ? 'ok' : 'down', uptime_s: Math.round(process.uptime()) });
  });
  app.get('/', (_req, res) => res.redirect('/landing/'));
  app.use('/api', publicAuthRoutes(deps, staffCodec));
  app.use('/api/customer/auth', customerAuthRoutes(deps, customerSessions));
  app.use('/api/customer', requireCustomer(customerSessions), customerAccountRoutes(deps, customerSessions));

  // ---- 2. Xodimlar autentifikatsiyasi
  app.use(createRequireAuth(db, staffCodec));

  // ---- 3. Rolga yopilgan API'lar
  app.use('/api/me', meRoutes(deps));
  const admin = Router();
  admin.use(requireRole('admin'));
  admin.use('/users', usersRoutes(deps));
  admin.use('/audit', auditRoutes(deps));
  app.use('/api/admin', admin);

  app.use('/api', (_req, _res, next) => next(new NotFoundError("API yo'li topilmadi")));

  // ---- 4. Statik fayllar
  app.use(staticFiles(env.PUBLIC_DIR ?? DEFAULT_PUBLIC_DIR));

  app.use(errorHandler(logger));
  return app;
}
