// Asosiy claude-code-web / savdo-hisob'dagi signed-cookie auth falsafasi
// (HMAC-SHA256 bilan imzolangan HttpOnly cookie, alohida session-store kerak
// emas) — lekin bu yerda BITTA umumiy parol emas, balki ko'p foydalanuvchi
// (admin + afitsiantlar, har biri o'z login/paroli) bor. Shu sabab cookie
// 'ok' emas, foydalanuvchi id'sini imzolaydi, va har so'rovda DB'dan
// `is_active=1` bilan qayta tekshiriladi — afitsiantni faolsizlantirish
// darhol kuchga kiradi (eski cookie ham endi ishlamay qoladi).
const crypto = require('crypto');
const { db } = require('./db');
const { verifyPassword } = require('./passwords');

// Cookie nomi ataylab "session"/"savdo_session" EMAS — bu ilova ham xuddi shu
// domenda /polat/ ostki yo'lida proksi qilinadi, nom to'qnashsa foydalanuvchini
// boshqa ilovadan chiqarib yuborishi mumkin edi.
const COOKIE_NAME = 'polat_session';

const OPEN_PATHS = new Set([
  '/login.html',
  '/api/login',
  '/api/ping',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg',
]);

function createAuth({ sessionSecret }) {
  function sign(value) {
    const h = crypto.createHmac('sha256', sessionSecret).update(value).digest('hex');
    return `${value}.${h}`;
  }

  function verify(signed) {
    if (!signed) return null;
    const idx = signed.lastIndexOf('.');
    if (idx < 0) return null;
    const value = signed.slice(0, idx);
    const sig = signed.slice(idx + 1);
    const expected = crypto.createHmac('sha256', sessionSecret).update(value).digest('hex');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    return crypto.timingSafeEqual(sigBuf, expBuf) ? value : null;
  }

  function parseCookies(req) {
    const header = req.headers.cookie;
    const out = {};
    if (!header) return out;
    header.split(';').forEach((part) => {
      const idx = part.indexOf('=');
      if (idx < 0) return;
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    });
    return out;
  }

  const getUserById = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1');

  function currentUser(req) {
    const raw = parseCookies(req)[COOKIE_NAME];
    const value = verify(raw);
    if (!value) return null;
    const id = Number(value);
    if (!Number.isFinite(id)) return null;
    const user = getUserById.get(id);
    return user || null;
  }

  function setCookie(res, req, token, maxAgeSeconds) {
    const secure = req.secure ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`
    );
  }

  // Har bir rol o'zining "uy" sahifasiga ega — boshqa rol hududiga kirmoqchi
  // bo'lganda shu yerga qaytariladi (pastdagi requireAuth va login.html'dagi
  // client js'da ham xuddi shu naqsh takrorlanadi).
  function homeForRole(role) {
    if (role === 'admin') return '/admin/index.html';
    if (role === 'chef') return '/chef/kitchen.html';
    return '/waiter/tables.html';
  }

  function requireAuth(req, res, next) {
    // /landing/* — mijozlar uchun ochiq marketing-sahifa (login shart emas).
    if (OPEN_PATHS.has(req.path) || req.path === '/landing' || req.path.startsWith('/landing/')) {
      return next();
    }
    const user = currentUser(req);
    if (!user) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
      return res.redirect('/login.html');
    }
    req.user = user;

    // Rol bo'yicha ajratish: /admin/*, /chef/*, /waiter/* — har biri faqat
    // o'z roliga (admin esa hammasiga) ochiq.
    const areaRole = req.path.startsWith('/admin/') || req.path.startsWith('/api/admin/')
      ? 'admin'
      : req.path.startsWith('/chef/') || req.path.startsWith('/api/chef/')
      ? 'chef'
      : req.path.startsWith('/waiter/') || req.path.startsWith('/api/waiter/')
      ? 'waiter'
      : null;

    if (areaRole && user.role !== areaRole && user.role !== 'admin') {
      if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'forbidden' });
      return res.redirect(homeForRole(user.role));
    }
    next();
  }

  // `roles` bitta satr ("admin") yoki massiv (['admin', 'chef']) bo'lishi mumkin.
  function requireRole(roles) {
    const allowed = Array.isArray(roles) ? roles : [roles];
    return (req, res, next) => {
      if (!req.user || !allowed.includes(req.user.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      next();
    };
  }

  function loginRoute(req, res) {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: "Login va parol kiritilishi shart" });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username.trim());
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: "Login yoki parol noto'g'ri" });
    }
    const token = sign(String(user.id));
    setCookie(res, req, token, 2592000);
    res.json({ ok: true, role: user.role, full_name: user.full_name || user.username });
  }

  function logoutRoute(req, res) {
    setCookie(res, req, '', 0);
    res.json({ ok: true });
  }

  function meRoute(req, res) {
    const { id, username, role, full_name } = req.user;
    res.json({ id, username, role, full_name });
  }

  return { requireAuth, requireRole, loginRoute, logoutRoute, meRoute, currentUser };
}

module.exports = { createAuth, COOKIE_NAME };
