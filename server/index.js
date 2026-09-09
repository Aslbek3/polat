// { override: true } — savdo-hisob'dagi bilan bir xil sabab: bu jarayon ham
// claudeweb'ning bir nechta boshqa PM2 jarayoni bilan bitta muhitda ishga
// tushirilishi mumkin, shu ilovaning o'z `.env`i har doim g'olib chiqishi kerak.
require('dotenv').config({ override: true });

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const { createAuth } = require('./auth');
const { createRateLimiter } = require('./routeUtils');

const PORT = process.env.PORT || 3213;
const HOST = process.env.HOST || '127.0.0.1';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

// SESSION_SECRET (2026-09-10): bo'sh bo'lsa avvalgidek tasodifiy kalit
// yaratiladi (dev uchun qulay), LEKIN endi bu jimgina emas — server har
// qayta ishga tushganda barcha xodimlar tizimdan chiqib ketishini
// ogohlantirib aytadi. PM2 crash-loop bo'lsa bu "nega hamma doim chiqib
// ketyapti?" degan tushunarsiz muammoga aylanardi.
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  console.warn(
    '[polat] ⚠️  SESSION_SECRET .env da qo\'yilmagan — vaqtinchalik tasodifiy kalit ' +
    "ishlatilmoqda. Server qayta ishga tushganda BARCHA xodimlar tizimdan chiqib " +
    'ketadi. Doimiy qiymat qo\'ying:\n' +
    '    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
  return crypto.randomBytes(32).toString('hex');
})();

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);

// ⚠️ 2026-09-10 — AVTORIZATSIYANI BUTUNLAY CHETLAB O'TISH XATOSI TUZATILDI.
// Express'da `case sensitive routing` STANDART HOLATDA O'CHIQ, ya'ni
// `app.use('/api/waiter', ...)` `/api/WAITER/...` so'rovini ham qabul qiladi.
// `server/auth.js` dagi rol-hudud tekshiruvi esa `req.path.startsWith(
// '/api/waiter/')` — HARFGA SEZGIR. Natijada prefiks harfini o'zgartirish
// tekshiruvni butunlay o'tkazib yuborardi:
//     dastavkachi sessiyasi + POST /api/WAITER/tables/1/close  ->  200
//     (stol yopildi, total_amount yozildi, chek navbatiga tushdi)
// Chef/courier/kassir uchun ham xuddi shunday ishlardi.
// Ikki qatlamli tuzatish: (1) shu sozlama, (2) pastda /api/waiter ga ham
// boshqalar kabi ANIQ requireRole() qo'shildi — himoya endi prefiks
// tasodifiga emas, aniq ro'yxatga tayanadi.
app.set('case sensitive routing', true);
app.set('strict routing', false);
app.use(express.json({ limit: '1mb' }));

// Xavfsizlik sarlavhalari (2026-09-10). ATAYLAB `helmet` o'rniga qo'lda —
// loyihaning mavjud falsafasi shu (rate-limiter ham shunday yozilgan):
// keraklisi 20 qator, tashqi dependency esa yangilanish/audit yuki qo'shadi.
//
// CSP ro'yxati loyihada HAQIQATDA ishlatiladigan manbalardan tuzilgan:
//   cdn.jsdelivr.net    — QZ Tray kutubxonasi (public/app.js loadQzTray)
//   fonts.googleapis.com — landing sahifa shriftlari
//   images.unsplash.com  — landing sahifa suratlari
//   www.google.com       — landing "Aloqa" bo'limidagi xarita iframe'i
//   ws/wss localhost     — QZ Tray mahalliy dasturi bilan aloqa (chek chop etish)
//
// ⚠️ 'unsafe-inline': public/login.html ichida inline <script> bor va butun
// loyihada 90+ inline style="..." atributi ishlatiladi. Ularsiz sahifalar
// ishlamay qoladi. Shu sabab CSP bu yerda XSS'ga qarshi TO'LIQ himoya emas —
// asosiy himoya hamon escapeHtml(). Lekin u baribir muhim narsani beradi:
// tashqi (begona domendagi) skript yuklanishini va ma'lumot chiqarib
// yuborilishini bloklaydi.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https://images.unsplash.com",
  "frame-src https://www.google.com",
  "connect-src 'self' ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:*",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

app.use((req, res, next) => {
  // Brauzer Content-Type'ni "taxmin qilmasin" — yuklangan rasm papkasi
  // (public/uploads/, login talab qilmaydi) uchun ayniqsa muhim: mimetype
  // mijoz tomonidan beriladi, sniffing bo'lsa .png nomli fayl HTML sifatida
  // bajarilib ketishi mumkin edi.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=()');
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

// Unauthenticated health check.
app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

// Bosh sahifa (/) — endi to'g'ridan-to'g'ri login so'ramaydi, mijozlar uchun
// ochiq landing sahifasiga yo'naltiradi. Xodimlar (admin/afitsiant) landing
// header'idagi "Kirish" tugmasi orqali /login.html'ga o'tadi.
app.get('/', (req, res) => res.redirect('/landing/'));

const auth = createAuth({ sessionSecret: SESSION_SECRET });

// 2026-09-10: `/api/login` da HECH QANDAY cheklov yo'q edi (CLAUDE.md
// "Xavfsizlik — 2026-08-26" bo'limida ataylab qoldirilgan deb belgilangan).
// Ikki oqibati bor edi:
//   1. Brute-force — parol minimumi 6 belgi, urinishlar soni cheksiz.
//   2. DoS — parol tekshiruvi `scrypt` (~50-100 ms) va u SINXRON, ya'ni
//      Node event loop'ini bloklaydi. Bir necha o'nlab parallel login
//      so'rovi butun saytni (chek chop etish, oshxona ekrani — hammasini)
//      qotirib qo'yardi.
//
// Ikki qatlam qo'yiladi va IKKALASI ham faqat MUVAFFAQIYATSIZ urinishni
// sanaydi (`skipSuccessful`) — normal ishlayotgan xodim hech qachon
// cheklovga urilmaydi:
//   - HISOB bo'yicha (10/15 daq) — asosiy himoya. Hujumchi IP almashtirsa
//     ham bitta hisobga urinishlar soni cheklangan.
//   - IP bo'yicha (40/15 daq) — hajmli hujumga qarshi ikkinchi qatlam.
//     Ataylab yuqoriroq: bitta NAT ortidagi butun restoran xodimlari
//     (bir nechta planshet) bir IP'dan kirishi mumkin.
const LOGIN_WINDOW_MS = 15 * 60_000;

const loginAccountLimiter = createRateLimiter({
  windowMs: LOGIN_WINDOW_MS,
  max: 10,
  skipSuccessful: true,
  keyFn: (req) => {
    const username = req.body && req.body.username;
    if (typeof username !== 'string') return null;
    const trimmed = username.trim();
    if (!trimmed) return null;
    // ⚠️ 2026-09-10: UZUNLIK CHEGARASI SHART. Bu satr Map KALITI sifatida
    // butun 15 daqiqalik oyna davomida xotirada saqlanadi. Chegara
    // bo'lmasa: IP-limiter 40 muvaffaqiyatsiz urinishga ruxsat beradi ->
    // har biri ~1 MB unikal `username` bilan -> bitta IP'dan 40 MB, 15
    // daqiqa ushlab turiladi. Bir necha IP -> GB'lar. PM2 FORK rejimida
    // (bitta process) bu butun ilovani o'ldirardi, ya'ni limiter aynan
    // o'zi to'sishi kerak bo'lgan DoS uchun vosita bo'lib qolardi.
    // Haqiqiy login 64 belgidan uzun bo'lmaydi.
    if (trimmed.length > 64) return null;
    return `user:${trimmed.toLowerCase()}`;
  },
  message: "Bu hisobga juda ko'p urinish bo'ldi. 15 daqiqadan so'ng qayta urinib ko'ring",
});

const loginIpLimiter = createRateLimiter({
  windowMs: LOGIN_WINDOW_MS,
  max: 40,
  skipSuccessful: true,
  message: "Juda ko'p urinish bo'ldi. 15 daqiqadan so'ng qayta urinib ko'ring",
});

app.post('/api/login', loginIpLimiter, loginAccountLimiter, auth.loginRoute);
app.post('/api/logout', auth.logoutRoute);

// Landing sahifadagi bron oynasi va menyu/savat/buyurtma — mehmon login
// qilmasdan yuboradi, shu sabab requireAuth'dan OLDIN ulanadi (boshqa
// /api/admin, /api/waiter kabi emas). Login shart emasligi sababli, spam/DoS
// oldini olish uchun yozuvchi (POST) yo'llarga IP-asosli rate-limit qo'yiladi
// (2026-09-04 tekshiruvda topilgan kamchilik — o'qish uchun /menu limitsiz).
const publicWriteLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: "Juda ko'p so'rov yuborildi, birozdan so'ng qayta urinib ko'ring",
});
app.use('/api/public/reservations', publicWriteLimiter, require('./routes/publicReservations'));
app.use('/api/public/menu', require('./routes/publicMenu'));
app.use('/api/public/orders', publicWriteLimiter, require('./routes/publicCustomerOrders'));

app.use(auth.requireAuth);
app.get('/api/me', auth.meRoute);

app.use('/api/admin/menu', auth.requireRole('admin'), require('./routes/adminMenu'));
app.use('/api/admin/inventory', auth.requireRole('admin'), require('./routes/adminInventory'));
app.use('/api/admin/users', auth.requireRole('admin'), require('./routes/adminUsers'));
app.use('/api/admin/tables', auth.requireRole('admin'), require('./routes/adminTables'));
app.use('/api/admin/expenses', auth.requireRole('admin'), require('./routes/adminExpenses'));
app.use('/api/admin/reports', auth.requireRole('admin'), require('./routes/adminReports'));
app.use('/api/admin/reservations', auth.requireRole('admin'), require('./routes/adminReservations'));
app.use('/api/admin/customer-orders', auth.requireRole('admin'), require('./routes/adminCustomerOrders'));
app.use('/api/admin/print-requests', auth.requireRole('admin'), require('./routes/adminPrintRequests'));
// '/api/admin/qz' EMAS, '/api/qz' — 2026-09-09'da topilgan bug: kassir
// sahifasi (public/kassir/*) chek chop etishda public/app.js'dagi UMUMIY
// printReceiptView()/setupQzSecurity() orqali shu yerga murojaat qiladi, lekin
// kassir 'admin' emas. requireRole(['admin','kassir']) yetarli emas edi —
// auth.js'dagi requireAuth() O'ZI, bu router'ga yetib kelishdan OLDIN, HAR
// QANDAY '/api/admin/*' yo'lni faqat 'admin' roliga yopib qo'yadi (areaRole
// tekshiruvi, URL prefiksiga qarab). Shu sabab yo'l butunlay '/api/admin/'
// prefiksidan tashqariga ('/api/qz') ko'chirildi — endi faqat pastdagi
// requireRole(['admin','kassir']) ishlaydi. Bu endpointlar faqat ochiq
// sertifikat + imzolash (yozish/o'qish huquqi bermaydi, faqat printer
// ulanishini tasdiqlaydi) — kassirga ham ochish xavfsiz.
app.use('/api/qz', auth.requireRole(['admin', 'kassir']), require('./routes/adminQz'));

// 2026-09-10: bu 4 ta mount ILGARI YAGONA edi — requireRole()siz, faqat
// requireAuth()dagi URL-prefiks tekshiruviga tayanardi (qolgan hamma
// guruhda aniq requireRole bor edi). Yuqoridagi "case sensitive routing"
// izohiga qarang: aynan shu yagona bo'shliq har qanday xodimga afitsiant
// endpointlarini (stol yopish, chek, taom qo'shish) ochib qo'yardi.
// Endi himoya ikki qatlamli va prefiks harfiga bog'liq emas.
const waiterOnly = auth.requireRole(['admin', 'waiter']);
app.use('/api/waiter', waiterOnly, require('./routes/waiterTables'));
app.use('/api/waiter', waiterOnly, require('./routes/waiterMenu'));
app.use('/api/waiter', waiterOnly, require('./routes/waiterOrders'));
app.use('/api/waiter/notifications', waiterOnly, require('./routes/waiterNotifications'));

app.use('/api/chef', auth.requireRole(['admin', 'chef']), require('./routes/chefKitchen'));

app.use('/api/courier', auth.requireRole(['admin', 'courier']), require('./routes/courierOrders'));

app.use('/api/kassir', auth.requireRole(['admin', 'kassir']), require('./routes/kassirTables'));
app.use('/api/kassir', auth.requireRole(['admin', 'kassir']), require('./routes/kassirBilling'));
app.use('/api/kassir', auth.requireRole(['admin', 'kassir']), require('./routes/kassirMenu'));

app.use('/api/delivery-alerts', auth.requireRole(['admin', 'chef', 'courier']), require('./routes/deliveryAlerts'));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Auth middleware'dan o'tgan (yoki OPEN_PATHS'dagi) hamma narsa uchun SPA-style
// fallback shart emas — har sahifa o'zining .html fayli, static middleware
// buni allaqachon hal qiladi. 404'larni ham shunchaki Expressning standart
// handleriga qoldiramiz.

// `require.main === module` — faqat `node server/index.js` sifatida to'g'ridan-to'g'ri
// ishga tushirilganda (production/PM2) real portda tinglaydi. Boshqa skript
// `require('./index.js')` qilsa, faqat `app` obyekti eksport qilinadi.
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`polat http://${HOST}:${PORT} manzilida ishga tushdi`);
  });
}

module.exports = app;
