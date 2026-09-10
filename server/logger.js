// Structured logging — 2026-09-10 (3-bosqich).
//
// NEGA BU FAYL BOR
// ────────────────
// Ilgari yagona xato logi `console.error(err)` edi (`server/routeUtils.js`).
// PM2 logida bu shunchaki stack-trace bo'lib chiqardi:
//   - QAYSI so'rov (yo'l, metod) xatoga olib kelgani ko'rinmasdi;
//   - KIM (qaysi foydalanuvchi/rol) qilgani ko'rinmasdi;
//   - bir vaqtda kelgan so'rovlarning loglari aralashib ketardi;
//   - loglarni `grep`/`jq` bilan filtrlash imkonsiz edi.
// Restoranda "kechqurun chek chiqmadi" degan shikoyatni tekshirish uchun
// bu yetarli emas.
//
// Endi har bir yozuv — bitta qatorli JSON. PM2 uni o'zgarishsiz saqlaydi,
// keyin `jq` bilan filtrlash mumkin:
//   pm2 logs polat --raw | jq 'select(.level=="error")'
//   pm2 logs polat --raw | jq 'select(.reqId=="a3f2c1")'
//
// MAXFIYLIK: `redact()` parol/token/kalit ko'rinishidagi maydonlarni
// avtomatik `[REDACTED]` qiladi. Log fayllari odatda zaxira nusxaga
// tushadi va ularni ko'radigan odamlar doirasi kengroq bo'ladi.

const crypto = require('crypto');

// Qiymati logga TUSHMASLIGI kerak bo'lgan maydon nomlari (kichik harfda
// qidiriladi, qismiy moslik bo'yicha — `password_hash`, `newPassword`,
// `session_secret` kabilarni ham qamrab oladi).
const SECRET_KEY_PATTERN = /pass|token|secret|cookie|authorization|salt|hash|kalit|parol/i;

function redact(value, depth = 0) {
  if (depth > 6) return '[TOO_DEEP]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, status: value.status };
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) {
    return value.slice(0, 500) + `…(+${value.length - 500})`;
  }
  return value;
}

function write(level, message, fields = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...redact(fields),
  };
  // ATAYLAB `console.log`/`console.error` — PM2 stdout/stderr'ni o'zi
  // fayllarga yozadi, qo'shimcha kutubxona kerak emas (loyihaning mavjud
  // falsafasi: `helmet` va rate-limiter ham shunday qo'lda yozilgan).
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
}

const logger = {
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
};

// Har bir so'rovga qisqa, tasodifiy id beradi va uni javob sarlavhasiga
// ham qo'yadi. Foydalanuvchi "xatolik chiqdi" desa, ekrandagi/tarmoqdagi
// `X-Request-Id` bo'yicha logdan aynan o'sha so'rovni topish mumkin.
function requestIdMiddleware(req, res, next) {
  req.id = crypto.randomBytes(3).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
}

// So'rov konteksti — xato logiga qo'shiladigan umumiy maydonlar.
function requestContext(req) {
  return {
    reqId: req.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.user ? req.user.id : null,
    role: req.user ? req.user.role : null,
  };
}

module.exports = { logger, redact, requestIdMiddleware, requestContext };
