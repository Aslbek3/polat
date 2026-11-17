// Xodimlar uchun kirish nazorati (eski server/auth.js requireAuth bilan bir
// xil qoidalar):
//  - ochiq yo'llar (login sahifasi, landing, uploads, robots...) — o'tadi;
//  - login qilmagan: /api/* -> 401, sahifa -> /login.html'ga;
//  - /<rol>/* va /api/<rol>/* faqat shu rol (admin hammasiga);
//  - rol prefiksiga mos kelmagan /api/* — faqat SHARED ro'yxatdagilar, qolgani 403
//    ("standart holda taqiqlash": yangi route'ga ruxsat qo'yish unutilsa ochiq qolmaydi).
import type { RequestHandler } from 'express';
import type { Database } from '../../db/pool.js';
import { readCookie, writeCookie } from '../../lib/cookies.js';
import { ForbiddenError, UnauthorizedError } from '../../http/errors.js';
import { findActiveUser } from './auth.service.js';
import { homeForRole, ROLE_NAMES, type Role } from './roles.js';
import { STAFF_COOKIE, STAFF_SESSION_MAX_AGE, type StaffSessionCodec } from './staffSession.js';

export const OPEN_PATHS = new Set([
  '/login.html',
  '/login.js',
  '/api/login',
  '/api/logout',
  '/api/ping',
  '/api/health',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg',
  '/robots.txt',
  '/sitemap.xml',
  '/googlea333966d6ffa2376.html',
]);

export const SHARED_API_PREFIXES = ['/api/me', '/api/qz', '/api/delivery-alerts'];

function isOpenPath(path: string): boolean {
  return (
    OPEN_PATHS.has(path) ||
    path === '/landing' ||
    path.startsWith('/landing/') ||
    path.startsWith('/uploads/') ||
    path.startsWith('/api/public/') ||
    path.startsWith('/api/customer/')
  );
}

export function createRequireAuth(db: Database, codec: StaffSessionCodec): RequestHandler {
  return async (req, res, next) => {
    if (isOpenPath(req.path)) return next();

    const parsed = codec.decode(readCookie(req, STAFF_COOKIE));
    const user = parsed ? await findActiveUser(db, parsed.userId) : null;
    if (!parsed || !user || user.session_version !== parsed.version) {
      if (req.path.startsWith('/api/')) throw new UnauthorizedError();
      return res.redirect('/login.html');
    }
    if (parsed.legacy) {
      // Eski formatdagi cookie'ni yangi (versiyali) formatga almashtiramiz.
      writeCookie(req, res, STAFF_COOKIE, codec.encode(user.id, user.session_version), STAFF_SESSION_MAX_AGE);
    }
    req.user = user;

    const areaRole = ROLE_NAMES.find((r) => req.path.startsWith(`/${r}/`) || req.path.startsWith(`/api/${r}/`));
    if (areaRole) {
      if (user.role !== areaRole && user.role !== 'admin') {
        if (req.path.startsWith('/api/')) throw new ForbiddenError();
        return res.redirect(homeForRole(user.role));
      }
    } else if (req.path.startsWith('/api/')) {
      const shared = SHARED_API_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`));
      if (!shared) throw new ForbiddenError();
    }
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw new ForbiddenError();
    next();
  };
}
