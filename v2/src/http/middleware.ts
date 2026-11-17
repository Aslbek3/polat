import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from './errors.js';
import type { Logger } from '../lib/logger.js';

// Eski serverdagi CSP bilan bir xil (frontend o'zgarmaydi): QZ Tray localhost
// websocket'lari, Leaflet (cdnjs), OSM tile'lari, Google Fonts/Maps.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'sha256-xjvELm8zHu267MhbI8FwS882YKOJgeSkpwtdxowQtwE='",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://images.unsplash.com https://*.tile.openstreetmap.org https://cdnjs.cloudflare.com",
  'frame-src https://www.google.com',
  "connect-src 'self' wss://localhost:* https://localhost:* ws://localhost:*",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

export const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
};

/** Har so'rovga ID (logda va javob sarlavhasida) + davomiylik logi. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header('x-request-id');
    const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    const log = logger.child({ reqId: id });
    res.locals.log = log;
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug';
      log[level]({ method: req.method, url: req.originalUrl, status: res.statusCode, ms: Math.round(ms) }, 'so\'rov');
    });
    next();
  };
}

// PostgreSQL xato kodlari -> foydalanuvchiga tushunarli javob. Baza
// cheklovi (CHECK/UNIQUE/FK) — oxirgi himoya chizig'i; odatda service
// qatlami bundan oldin aniqroq xabar beradi.
function mapPgError(err: { code?: string }): AppError | null {
  switch (err.code) {
    case '23505':
      return new AppError('Bunday yozuv allaqachon mavjud', 409, 'unique_violation');
    case '23503':
      return new AppError("Bog'liq yozuv topilmadi yoki ishlatilmoqda", 409, 'foreign_key_violation');
    case '23514':
    case '23502':
    case '22P02':
    case '22003':
      return new AppError("Ma'lumot noto'g'ri", 400, 'constraint_violation');
    case '40001':
    case '40P01':
      return new AppError("Bir vaqtda bir nechta o'zgarish bo'ldi, qayta urinib ko'ring", 409, 'serialization_failure');
    default:
      return null;
  }
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const log: Logger = res.locals.log ?? logger;
    // express.json() buzilgan JSON uchun
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: "So'rov tanasi noto'g'ri JSON", code: 'bad_json' });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: "So'rov juda katta", code: 'too_large' });
      return;
    }
    const appErr = err instanceof AppError ? err : mapPgError(err ?? {});
    if (appErr) {
      if (!(err instanceof AppError)) log.warn({ err, url: req.originalUrl }, 'Baza cheklovi ishladi');
      res.status(appErr.status).json({ error: appErr.message, code: appErr.code, ...appErr.details });
      return;
    }
    log.error({ err, url: req.originalUrl }, 'Kutilmagan xato');
    if (res.headersSent) return;
    res.status(500).json({ error: "Server xatosi, birozdan so'ng qayta urinib ko'ring", code: 'internal' });
  };
}
