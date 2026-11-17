// Mijoz sessiyasi (`polat_customer`). Format va kalit eski tizim bilan BIR XIL
// (server/customerAuth.js): "c.<id>.<sessionVersion>.<hmac>", kalit =
// HMAC(SESSION_SECRET, 'polat-customer-session-v1'). Shu sabab v2'ga o'tganda
// mijozlar hisobdan chiqib ketmaydi. Xodim cookie'sidan butunlay alohida.
import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Database } from '../../db/pool.js';
import { hmacHex, safeEqual } from '../../lib/crypto.js';
import { readCookie, writeCookie } from '../../lib/cookies.js';
import type { CustomerUser } from '../../http/types.js';

export const CUSTOMER_COOKIE = 'polat_customer';
const MAX_AGE_SECONDS = 60 * 24 * 60 * 60; // 60 kun
const RESOLVED = Symbol('customerResolved');

export function createCustomerSessions(db: Database, sessionSecret: string) {
  const key = createHmac('sha256', sessionSecret).update('polat-customer-session-v1').digest();

  function encode(id: number, version: number): string {
    const value = `c.${id}.${version}`;
    return `${value}.${hmacHex(key, value)}`;
  }

  /** Cookie'dan mijozni aniqlaydi (bir so'rovda bir marta, natija keshlanadi). */
  async function current(req: Request): Promise<CustomerUser | null> {
    const cached = (req as unknown as Record<symbol, CustomerUser | null>)[RESOLVED];
    if (cached !== undefined) return cached;
    let customer: CustomerUser | null = null;
    const raw = readCookie(req, CUSTOMER_COOKIE);
    const idx = raw ? raw.lastIndexOf('.') : -1;
    if (raw && idx > 0) {
      const value = raw.slice(0, idx);
      const [prefix, idStr, verStr] = value.split('.');
      if (prefix === 'c' && safeEqual(raw.slice(idx + 1), hmacHex(key, value))) {
        const { rows } = await db.query<CustomerUser>(
          'SELECT id, phone, full_name, session_version, created_at FROM customers WHERE id = $1 AND is_active',
          [Number(idStr)],
        );
        if (rows[0] && rows[0].session_version === Number(verStr)) customer = rows[0];
      }
    }
    (req as unknown as Record<symbol, CustomerUser | null>)[RESOLVED] = customer;
    return customer;
  }

  return {
    encode,
    current,
    login(req: Request, res: Response, c: { id: number; session_version: number }) {
      writeCookie(req, res, CUSTOMER_COOKIE, encode(c.id, c.session_version), MAX_AGE_SECONDS);
    },
    logout(req: Request, res: Response) {
      writeCookie(req, res, CUSTOMER_COOKIE, '', 0);
    },
  };
}

export type CustomerSessions = ReturnType<typeof createCustomerSessions>;
