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
const { ROLE_NAMES, homeForRole } = require('./roles');

// Cookie nomi ataylab "session"/"savdo_session" EMAS — umumiy nom ishlatilsa
// boshqa ilova bilan to'qnashish ehtimoli bor edi. ESKATMA (2026-09-09'da
// tuzatildi): bu ilova ILGARI asosiy saytning /polat/ ostki yo'lida proksi
// qilingan edi, lekin bu proksi allaqachon olib tashlangan — endi mustaqil
// polatuz.duckdns.org subdomenida ishlaydi (root CLAUDE.md'ga qarang). Nomi
// shunday (o'ziga xos) qoldirilgan — o'zgartirishga hojat yo'q.
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

  function requireAuth(req, res, next) {
    // /landing/* — mijozlar uchun ochiq marketing-sahifa (login shart emas).
    // /uploads/* — admin panelda taomga (ixtiyoriy) biriktirilgan rasmlar
    // (server/routes/adminMenu.js POST /upload-image) — bular ochiq landing
    // menyusida ham ko'rsatiladi, shu sabab login qilmagan mijoz brauzeri ham
    // (cookie'siz) shu rasmlarni yuklay olishi kerak (2026-09-07, rasm
    // qo'shilganda ochiq bo'lmagani sababli login sahifasiga 302 qilib
    // yuborilishi kuzatilgan bug'i tuzatildi).
    if (
      OPEN_PATHS.has(req.path) ||
      req.path === '/landing' || req.path.startsWith('/landing/') ||
      req.path.startsWith('/uploads/')
    ) {
      return next();
    }
    const user = currentUser(req);
    if (!user) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
      return res.redirect('/login.html');
    }
    req.user = user;

    // Rol bo'yicha ajratish: /admin/*, /chef/*, /waiter/*, /courier/* — har biri
    // faqat o'z roliga (admin esa hammasiga) ochiq. Har bir rol o'z nomi bilan
    // bir xil URL segmentiga ega bo'lgani uchun (masalan 'chef' -> /chef/),
    // qo'lda yozilgan ternary zanjiri o'rniga server/roles.js'dagi yagona
    // ro'yxat bo'ylab qidiramiz — yangi rol qo'shilganda bu joy o'zgarishsiz
    // qoladi (faqat roles.js'ga qo'shish kifoya).
    const areaRole = ROLE_NAMES.find(
      (r) => req.path.startsWith(`/${r}/`) || req.path.startsWith(`/api/${r}/`)
    ) || null;

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
