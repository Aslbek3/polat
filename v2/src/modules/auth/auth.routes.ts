import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../../http/app.js';
import { parse } from '../../http/validate.js';
import { writeCookie } from '../../lib/cookies.js';
import { UnauthorizedError } from '../../http/errors.js';
import { login, revokeSessions } from './auth.service.js';
import { STAFF_COOKIE, STAFF_SESSION_MAX_AGE, type StaffSessionCodec } from './staffSession.js';

const LoginBody = z.object({
  username: z.string({ error: 'Login va parol kiritilishi shart' }).min(1, 'Login va parol kiritilishi shart').max(64),
  password: z.string({ error: 'Login va parol kiritilishi shart' }).min(1, 'Login va parol kiritilishi shart').max(200),
});

/** /api/login va /api/logout — ochiq (requireAuth'dan oldin). */
export function publicAuthRoutes({ db }: AppDeps, codec: StaffSessionCodec): Router {
  const r = Router();

  r.post('/login', async (req, res) => {
    const body = parse(LoginBody, req.body);
    const user = await login(db, { ...body, ip: req.ip });
    writeCookie(req, res, STAFF_COOKIE, codec.encode(user.id, user.session_version), STAFF_SESSION_MAX_AGE);
    res.json({ ok: true, role: user.role, full_name: user.full_name || user.username });
  });

  r.post('/logout', (req, res) => {
    writeCookie(req, res, STAFF_COOKIE, '', 0);
    res.json({ ok: true });
  });

  return r;
}

/** /api/me — login qilgan har qanday xodim. */
export function meRoutes({ db }: AppDeps): Router {
  const r = Router();

  r.get('/', (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    const { id, username, role, full_name } = req.user;
    res.json({ id, username, role, full_name });
  });

  // Yangi: o'zining barcha qurilmalaridagi sessiyalarini bekor qilish.
  r.post('/logout-all', async (req, res) => {
    if (!req.user) throw new UnauthorizedError();
    await revokeSessions(db, req.user.id);
    writeCookie(req, res, STAFF_COOKIE, '', 0);
    res.json({ ok: true });
  });

  return r;
}
