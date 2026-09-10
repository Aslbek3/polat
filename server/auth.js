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

  // Foydalanuvchining "autentifikatsiya muhri" — parol xeshi va
  // session_version'dan olingan qisqa HMAC (2026-09-10).
  //
  // NEGA XESHNING O'ZI EMAS: cookie ichiga parol xeshini qo'yish uni
  // brauzerga oshkor qilardi. HMAC esa faqat SESSION_SECRET bilan qayta
  // hisoblanadi — mijoz undan hech narsa bilib ololmaydi.
  //
  // NEGA session_version'ning O'ZI EMAS: u faqat kod uni oshirishni
  // ESLAGAN joyda ishlaydi. Parol xeshini ham aralashtirish parol
  // O'ZGARISHINING HAR QANDAY YO'LINI (API, qo'lda SQL, kelajakdagi yangi
  // route) avtomatik qamrab oladi — "versiyani oshirishni unutish" degan
  // xatolar sinfini butunlay yo'q qiladi.
  function authStamp(user) {
    return crypto
      .createHmac('sha256', sessionSecret)
      .update(`${user.password_hash}.${Number(user.session_version) || 0}`)
      .digest('hex')
      .slice(0, 16);
  }

  // Cookie ichidagi imzolangan qiymat formati (2026-09-10):
  //     "<userId>.<authStamp>.<issuedAtMs>"
  //
  // ILGARI faqat "<userId>" imzolanardi. Uch jiddiy kamchiligi bor edi:
  //   1. Cookie HECH QACHON eskirmasdi — `Max-Age` faqat BRAUZER tomonida,
  //      server uni umuman tekshirmasdi. O'g'irlangan cookie abadiy ishlardi.
  //   2. Parolni tiklash eski sessiyani bekor qilmasdi — xodim ishdan
  //      ketganda parolini almashtirish yetarli emas edi.
  //   3. Sessiyani bekor qilishning yagona yo'li `is_active = 0` edi, ya'ni
  //      hisobni butunlay bloklash.
  //
  // Endi `sessionVersion` bazadagi qiymatga MOS kelishi shart (parol
  // tiklanganda oshiriladi — server/routes/adminUsers.js), va `issuedAtMs`
  // SESSION_MAX_AGE_MS dan eski bo'lsa cookie rad etiladi.
  //
  // ESKI FORMATDAGI cookie'lar (faqat raqam) endi qabul qilinmaydi — bu
  // ATAYLAB: yangi versiya joylashtirilganda hamma bir marta qayta login
  // qiladi, shundan keyin barcha eski (potentsial o'g'irlangan) cookie'lar
  // kuchini yo'qotadi.
  const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun

  function currentUser(req) {
    const raw = parseCookies(req)[COOKIE_NAME];
    const value = verify(raw);
    if (!value) return null;

    const parts = value.split('.');
    if (parts.length !== 3) return null;

    const id = Number(parts[0]);
    const stamp = parts[1];
    const issuedAt = Number(parts[2]);
    if (!Number.isInteger(id) || !Number.isInteger(issuedAt) || !stamp) return null;

    // Kelajakdagi sana (soat noto'g'ri qo'yilgan mijoz yoki soxta cookie) ham
    // rad etiladi — aks holda "abadiy" cookie yasash mumkin bo'lardi.
    const age = Date.now() - issuedAt;
    if (age < 0 || age > SESSION_MAX_AGE_MS) return null;

    const user = getUserById.get(id);
    if (!user) return null;

    // Muhrni doimiy vaqtda solishtiramiz — bu yerda maxfiylik sizishi
    // ehtimoli past, lekin imzo tekshiruvi bilan bir xil qat'iylik saqlanadi.
    const expected = Buffer.from(authStamp(user));
    const given = Buffer.from(stamp);
    if (given.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(given, expected)) return null;

    return user;
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
    // X-10 (2026-09-10): qidiruv katta-kichik harfga BEFARQ (`COLLATE NOCASE`).
    // NEGA: ilgari `WHERE username = ?` harfga SEZGIR edi, index.js'dagi
    // rate-limiter kaliti esa `toLowerCase()` qilinadi. Telefon klaviaturasi
    // birinchi harfni avtomatik kattalashtiradi -> "Afitsiant" -> 401 -> ...
    // 10-urinishda to'g'ri yozilgan "afitsiant" ham 15 daqiqaga qulflanardi
    // (ikkalasi limiterda BIR kalit). Endi qidiruv va limiter bir xil
    // qoidada ishlaydi. Parol esa, albatta, harfga sezgirligicha qoladi.
    //
    // TO'QNASHUV (bazada faqat harf registri bilan farqli ikki login bo'lsa,
    // masalan "Ali" va "ali" — yangi yaratishda services/users.js buni endi
    // rad etadi, lekin eski bazada qolgan bo'lishi mumkin): natija
    // deterministik —
    //   1) AYNAN mos (harfi ham bir xil) login birinchi olinadi — shu tufayli
    //      bu tuzatishdan OLDIN ishlayotgan hisob kirishdan mahrum bo'lmaydi;
    //   2) aniq mos yo'q bo'lsa — eng kichik id'li (eng birinchi yaratilgan)
    //      faol hisob olinadi.
    // Ikkinchi hisob parolini tekshirishga urinilmaydi — "qaysi biriga
    // kirdim" noaniq bo'lib qolmasin. Bunday juftlikni admin qo'lda
    // (birining loginini o'zgartirib/bloklab) hal qilishi kerak.
    //
    // ESLATMA: SQLite NOCASE faqat ASCII harflarni tenglashtiradi (A-Z).
    // Kirill harfli login'lar uchun registr hamon farq qiladi — lekin
    // loyihadagi login'lar lotin/ASCII.
    const user = db
      .prepare(
        `SELECT * FROM users
         WHERE username = ? COLLATE NOCASE AND is_active = 1
         ORDER BY (username = ?) DESC, id ASC
         LIMIT 1`
      )
      .get(username.trim(), username.trim());
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: "Login yoki parol noto'g'ri" });
    }
    // Cookie'ning `Max-Age`i va serverdagi SESSION_MAX_AGE_MS bir xil (30 kun)
    // bo'lishi kerak — biri brauzerni tozalaydi, ikkinchisi serverda majburlaydi.
    const token = sign(`${user.id}.${authStamp(user)}.${Date.now()}`);
    setCookie(res, req, token, SESSION_MAX_AGE_MS / 1000);
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
