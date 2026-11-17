import { Router } from 'express';
import type { AppDeps } from '../../http/app.js';
import { auditSummary } from './audit.service.js';

export function auditRoutes({ db }: AppDeps): Router {
  const r = Router();
  r.get('/summary', async (_req, res) => {
    res.json(await auditSummary(db));
  });
  return r;
}
