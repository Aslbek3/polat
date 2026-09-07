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
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// Unauthenticated health check.
app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

// Bosh sahifa (/) — endi to'g'ridan-to'g'ri login so'ramaydi, mijozlar uchun
// ochiq landing sahifasiga yo'naltiradi. Xodimlar (admin/afitsiant) landing
// header'idagi "Kirish" tugmasi orqali /login.html'ga o'tadi.
app.get('/', (req, res) => res.redirect('/landing/'));

const auth = createAuth({ sessionSecret: SESSION_SECRET });

app.post('/api/login', auth.loginRoute);
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
app.use('/api/admin/users', auth.requireRole('admin'), require('./routes/adminUsers'));
app.use('/api/admin/tables', auth.requireRole('admin'), require('./routes/adminTables'));
app.use('/api/admin/expenses', auth.requireRole('admin'), require('./routes/adminExpenses'));
app.use('/api/admin/reports', auth.requireRole('admin'), require('./routes/adminReports'));
app.use('/api/admin/reservations', auth.requireRole('admin'), require('./routes/adminReservations'));
app.use('/api/admin/customer-orders', auth.requireRole('admin'), require('./routes/adminCustomerOrders'));
app.use('/api/admin/print-requests', auth.requireRole('admin'), require('./routes/adminPrintRequests'));
app.use('/api/admin/qz', auth.requireRole('admin'), require('./routes/adminQz'));

app.use('/api/waiter', require('./routes/waiterTables'));
app.use('/api/waiter', require('./routes/waiterMenu'));
app.use('/api/waiter', require('./routes/waiterOrders'));
app.use('/api/waiter/notifications', require('./routes/waiterNotifications'));

app.use('/api/chef', auth.requireRole(['admin', 'chef']), require('./routes/chefKitchen'));

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
