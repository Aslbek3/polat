// { override: true } — savdo-hisob'dagi bilan bir xil sabab: bu jarayon ham
// claudeweb'ning bir nechta boshqa PM2 jarayoni bilan bitta muhitda ishga
// tushirilishi mumkin, shu ilovaning o'z `.env`i har doim g'olib chiqishi kerak.
require('dotenv').config({ override: true });

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const { createAuth } = require('./auth');
const { createRateLimiter } = require('./routeUtils');
const { requestIdMiddleware } = require('./logger');

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

// Har bir so'rovga qisqa id beriladi va u `X-Request-Id` sarlavhasida
// qaytadi (2026-09-10). Xodim "xatolik chiqdi" desa, ekrandagi
// `request_id` bo'yicha PM2 logidan aynan o'sha so'rovni topish mumkin:
//   pm2 logs polat --raw | jq 'select(.reqId=="a3f2c1")'
app.use(requestIdMiddleware);
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
//
// ⚠️ 2026-09-10 (UI/UX tahlili L-16): ilgari bron VA buyurtma BITTA
// chelakni (`publicWriteLimiter`, 5/daqiqa/IP) bo'lishardi. Restoran Wi-Fi'si
// yoki mobil operator NAT'i ortidagi mijozlar bitta IP'dan chiqadi — bir
// stol mehmonlari bir daqiqada 5 ta so'rov yuborsa, oltinchi mijoz
// buyurtma bera olmasdi; bron qilgan kishi esa kimningdir buyurtmasini
// "yeb" qo'yardi. Endi ikkalasi ALOHIDA, har biri 15/daqiqa/IP. Bu hamon
// skript bilan bazani to'ldirishni to'sadi (validation.js dagi uzunlik
// chegaralari bilan birga), lekin haqiqiy mijozlarga xalaqit bermaydi.
const PUBLIC_WRITE_WINDOW_MS = 60_000;
const PUBLIC_WRITE_MAX = 15;
const PUBLIC_WRITE_MESSAGE = "Juda ko'p so'rov yuborildi, birozdan so'ng qayta urinib ko'ring";
const publicReservationLimiter = createRateLimiter({
  windowMs: PUBLIC_WRITE_WINDOW_MS,
  max: PUBLIC_WRITE_MAX,
  message: PUBLIC_WRITE_MESSAGE,
});
const publicOrderLimiter = createRateLimiter({
  windowMs: PUBLIC_WRITE_WINDOW_MS,
  max: PUBLIC_WRITE_MAX,
  message: PUBLIC_WRITE_MESSAGE,
});
app.use('/api/public/reservations', publicReservationLimiter, require('./routes/publicReservations'));
app.use('/api/public/menu', require('./routes/publicMenu'));
app.use('/api/public/orders', publicOrderLimiter, require('./routes/publicCustomerOrders'));
// Restoran nomi/aloqa/yetkazib berish shartlari (2026-09-10, L-29) — faqat
// o'qish, faqat mijozga xavfsiz maydonlar (services/settings.js oq ro'yxati).
app.use('/api/public/settings', require('./routes/publicSettings'));

app.use(auth.requireAuth);
app.get('/api/me', auth.meRoute);

// ─────────────────────────────────────────────────────────────────────────
// RUXSATLAR (2026-09-10, 3-bosqich)
//
// Endi har bir mount ROL NOMINI emas, IMKONIYATNI (capability) talab qiladi.
// "Kim nima qila oladi" degan savolga javob YAGONA joyda —
// `server/permissions.js` dagi jadvalda. Yangi rol qo'shilganda yoki mavjud
// rolga bitta huquq berilganda bu fayl O'ZGARMAYDI.
//
// `requireCapability` bir nechta imkoniyat qabul qiladi — ulardan BIRI
// yetarli.
const cap = require('./permissions').CAPABILITIES;
const need = require('./permissions').requireCapability;

app.use('/api/admin/menu', need(cap.MENU_MANAGE), require('./routes/adminMenu'));
app.use('/api/admin/inventory', need(cap.MENU_MANAGE), require('./routes/adminInventory'));
app.use('/api/admin/users', need(cap.ADMIN_MANAGE), require('./routes/adminUsers'));
app.use('/api/admin/tables', need(cap.ADMIN_MANAGE), require('./routes/adminTables'));
app.use('/api/admin/expenses', need(cap.ADMIN_MANAGE), require('./routes/adminExpenses'));
app.use('/api/admin/reports', need(cap.ADMIN_MANAGE), require('./routes/adminReports'));
app.use('/api/admin/reservations', need(cap.ADMIN_MANAGE), require('./routes/adminReservations'));
app.use('/api/admin/customer-orders', need(cap.ADMIN_MANAGE), require('./routes/adminCustomerOrders'));
app.use('/api/admin/print-requests', need(cap.ADMIN_MANAGE), require('./routes/adminPrintRequests'));
// 2026-09-10 (UI/UX tahlili L-29, A-03/A-04/A-05/A-09): restoran sozlamalari
// va bosh sahifa "ertalabki brifingi".
app.use('/api/admin/settings', need(cap.ADMIN_MANAGE), require('./routes/adminSettings'));
app.use('/api/admin/dashboard', need(cap.ADMIN_MANAGE), require('./routes/adminDashboard'));
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
// 2026-09-10: endi bu "kim chek chop eta oladi" degan IMKONIYAT bilan
// boshqariladi (hozircha admin + kassir — permissions.js dagi izohga qarang).
app.use('/api/qz', need(cap.RECEIPT_PRINT), require('./routes/adminQz'));

// 2026-09-10: bu 4 ta mount ILGARI YAGONA edi — requireRole()siz, faqat
// requireAuth()dagi URL-prefiks tekshiruviga tayanardi (qolgan hamma
// guruhda aniq requireRole bor edi). Yuqoridagi "case sensitive routing"
// izohiga qarang: aynan shu yagona bo'shliq har qanday xodimga afitsiant
// endpointlarini (stol yopish, chek, taom qo'shish) ochib qo'yardi.
// Endi himoya ikki qatlamli va prefiks harfiga bog'liq emas.
app.use('/api/waiter', need(cap.TABLES_VIEW), require('./routes/waiterTables'));
app.use('/api/waiter', need(cap.MENU_VIEW), require('./routes/waiterMenu'));
app.use('/api/waiter', need(cap.ORDERS_WRITE), require('./routes/waiterOrders'));
app.use('/api/waiter/notifications', need(cap.WAITER_ALERTS), require('./routes/waiterNotifications'));

app.use('/api/chef', need(cap.KITCHEN_VIEW), require('./routes/chefKitchen'));

app.use('/api/courier', need(cap.DELIVERY_VIEW), require('./routes/courierOrders'));

app.use('/api/kassir', need(cap.TABLES_VIEW, cap.ORDERS_CLOSE), require('./routes/kassirTables'));
app.use('/api/kassir', need(cap.BILLING_WRITE, cap.BILLING_VIEW), require('./routes/kassirBilling'));
app.use('/api/kassir', need(cap.MENU_VIEW), require('./routes/kassirMenu'));

app.use('/api/delivery-alerts', need(cap.DELIVERY_ALERTS), require('./routes/deliveryAlerts'));

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
