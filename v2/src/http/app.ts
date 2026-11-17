// Express ilovasini yig'adi. Hech qanday global holat yo'q — barcha
// bog'liqliklar (baza, logger, sozlamalar) `AppDeps` orqali beriladi, shu
// sabab testlarda alohida baza bilan to'liq ilova yaratish mumkin.
import express, { type Express } from 'express';
import type { Database } from '../db/pool.js';
import type { Env } from '../config/env.js';
import type { Logger } from '../lib/logger.js';
import { errorHandler, requestLogger, securityHeaders } from './middleware.js';
import { NotFoundError } from './errors.js';

export interface AppDeps {
  env: Env;
  db: Database;
  logger: Logger;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  if (deps.env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.locals.deps = deps;

  app.use(requestLogger(deps.logger));
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));

  // Eski klient bilan moslik uchun (frontend shu yo'lni ishlatadi).
  app.get('/api/ping', (_req, res) => {
    res.json({ ok: true });
  });

  // Monitoring uchun: baza ishlamasa 503.
  app.get('/api/health', async (_req, res) => {
    const dbOk = await deps.db.ping();
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk ? 'ok' : 'down', uptime_s: Math.round(process.uptime()) });
  });

  // Keyingi bosqichlarda modul route'lari shu yerga ulanadi.

  app.use('/api', (_req, _res, next) => next(new NotFoundError("API yo'li topilmadi")));
  app.use(errorHandler(deps.logger));
  return app;
}
