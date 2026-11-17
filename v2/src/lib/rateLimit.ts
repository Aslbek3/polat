// Bazada saqlanadigan qat'iy-oynali rate-limit. Bitta atomik UPSERT:
// oyna tugagan bo'lsa hisoblagich 1 dan boshlanadi, aks holda +1.
// Restart yoki bir nechta jarayon bo'lsa ham hisob umumiy qoladi.
import type { RequestHandler } from 'express';
import type { Database, Queryable } from '../db/pool.js';
import { TooManyRequestsError } from '../http/errors.js';

export interface RateLimitRule {
  name: string;
  windowMs: number;
  max: number;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
}

export async function hit(q: Queryable, key: string, windowMs: number, max: number): Promise<RateLimitResult> {
  const { rows } = await q.query<{ count: number; retry: number }>(
    `INSERT INTO rate_limit_hits AS r (key, count, reset_at)
     VALUES ($1, 1, now() + make_interval(secs => $2 / 1000.0))
     ON CONFLICT (key) DO UPDATE SET
       count    = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.count + 1 END,
       reset_at = CASE WHEN r.reset_at <= now() THEN now() + make_interval(secs => $2 / 1000.0) ELSE r.reset_at END
     RETURNING count, CEIL(EXTRACT(EPOCH FROM (reset_at - now())))::int AS retry`,
    [key, windowMs],
  );
  const row = rows[0]!;
  return { allowed: row.count <= max, count: row.count, retryAfterSec: Math.max(1, row.retry) };
}

/** Muddati o'tgan yozuvlarni tozalaydi (fon vazifasi chaqiradi). */
export async function purgeExpired(q: Queryable): Promise<number> {
  const r = await q.query("DELETE FROM rate_limit_hits WHERE reset_at < now() - interval '1 hour'");
  return r.rowCount ?? 0;
}

/** IP bo'yicha cheklovchi Express middleware. */
export function rateLimitByIp(db: Database, rule: RateLimitRule): RequestHandler {
  return async (req, res, next) => {
    const result = await hit(db, `${rule.name}:ip:${req.ip ?? 'unknown'}`, rule.windowMs, rule.max);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      throw new TooManyRequestsError(rule.message);
    }
    next();
  };
}
