// Mijoz kirishi (login shart emas) — 2026-11-01, "Mijoz hisobi".
// server/index.js'da requireAuth'dan OLDIN, /api/customer/auth ostida ulanadi.
//
//   POST /start        { phone }          -> { step: 'code' } yoki { step: 'link', bot_url, token }
//   POST /start-sms    { phone }          -> { step: 'code', via: 'sms' } (Telegram'i yo'qlar uchun, pullik)
//   GET  /link-status  ?token=...         -> { status: 'pending' | 'linked' | 'phone_mismatch' | 'expired' }
//   POST /verify       { phone, code }    -> cookie o'rnatiladi, { ok, customer, is_new }
//   GET  /session                       -> { customer: null } yoki { customer, addresses }
//   POST /logout
const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute, createRateLimiter } = require('../routeUtils');
const login = require('../services/customerLogin');

const router = express.Router();

// Kod so'rash — IP bo'yicha 1 daqiqada 5 ta (+ raqam bo'yicha 60 soniya kutish).
const startLimiter = createRateLimiter({ windowMs: 60_000, max: 5, message: "Juda ko'p urinish, 1 daqiqadan so'ng qayta urinib ko'ring" });
// Kod tekshirish — IP bo'yicha 10 daqiqada 15 ta (+ har kodga 5 ta urinish).
const verifyLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 15, message: "Juda ko'p urinish, birozdan so'ng qayta urinib ko'ring" });

function publicCustomer(c) {
  return { id: c.id, phone: c.phone, full_name: c.full_name || '', created_at: c.created_at };
}

router.post('/start', startLimiter, asyncRoute(async (req, res) => {
  const bot = req.app.locals.telegramBot;
  if (!bot || !bot.enabled) {
    return res.status(503).json({ error: "Telegram orqali kirish hozircha ishlamayapti. Birozdan so'ng urinib ko'ring." });
  }
  const phone = login.normalizePhone(req.body && req.body.phone);
  if (!phone) return res.status(400).json({ error: "Raqamni to'liq kiriting: 9 ta raqam", field: 'phone' });

  if (login.getTelegramChat(phone)) {
    const wait = login.secondsUntilResend(phone);
    if (wait > 0) {
      return res.status(429).json({ error: `Kod yuborilgan. Qayta so'rash uchun ${wait} soniya kuting`, retry_after: wait, step: 'code' });
    }
    const sent = await bot.sendCode(phone);
    if (sent) return res.json({ step: 'code', phone_masked: login.maskPhone(phone) });
    // Bot bloklangan yoki chat o'chgan — qayta bog'lash kerak (pastga tushadi).
  }

  const token = login.createLink(phone);
  const sms = req.app.locals.smsSender;
  res.json({ step: 'link', token, bot_url: bot.botUrl(token), bot_username: bot.username, sms_available: Boolean(sms && sms.enabled) });
}));

// SMS orqali kod (2026-11-01) — ZAXIRA usul, har bir SMS PULLIK. Shu sabab
// qattiq limitlar: IP bo'yicha 10 daqiqada 3 ta, raqam bo'yicha 60 s oraliq
// va sutkada SMS_PER_PHONE_DAILY (standart 5) ta, butun sayt bo'yicha
// sutkada SMS_DAILY_LIMIT (standart 300) ta — bot yoki hujum hisobni
// "yeb qo'ymasligi" uchun. Limitga yetilsa Telegram usuli taklif qilinadi.
const smsLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 3, message: "Juda ko'p SMS so'raldi. Birozdan so'ng urinib ko'ring yoki Telegram orqali kiring" });
const SMS_PER_PHONE_DAILY = Number(process.env.SMS_PER_PHONE_DAILY) || 5;
const SMS_DAILY_LIMIT = Number(process.env.SMS_DAILY_LIMIT) || 300;

router.post('/start-sms', smsLimiter, asyncRoute(async (req, res) => {
  const sms = req.app.locals.smsSender;
  if (!sms || !sms.enabled) {
    return res.status(503).json({ error: "SMS orqali kirish hozircha ishlamayapti. Telegram orqali kiring" });
  }
  const phone = login.normalizePhone(req.body && req.body.phone);
  if (!phone) return res.status(400).json({ error: "Raqamni to'liq kiriting: 9 ta raqam", field: 'phone' });

  const wait = login.secondsUntilResend(phone);
  if (wait > 0) {
    return res.status(429).json({ error: `Kod yuborilgan. Qayta so'rash uchun ${wait} soniya kuting`, retry_after: wait, step: 'code', via: 'sms' });
  }
  if (login.smsCountLast24h(phone) >= SMS_PER_PHONE_DAILY) {
    return res.status(429).json({ error: "Bu raqamga bugun juda ko'p SMS yuborildi. Telegram orqali kiring yoki ertaga urinib ko'ring" });
  }
  if (login.smsCountLast24h(null) >= SMS_DAILY_LIMIT) {
    console.error(`SMS kunlik limiti (${SMS_DAILY_LIMIT}) tugadi — SMS yuborish to'xtatildi`);
    return res.status(503).json({ error: "SMS xizmati vaqtincha band. Telegram orqali kiring" });
  }

  const code = login.issueCode(phone, 'sms');
  try {
    await sms.sendCode(phone, code);
  } catch (err) {
    console.error('SMS yuborishda xato:', err.message);
    return res.status(502).json({ error: "SMS yuborib bo'lmadi. Birozdan so'ng urinib ko'ring yoki Telegram orqali kiring" });
  }
  res.json({ step: 'code', via: 'sms', phone_masked: login.maskPhone(phone) });
}));

router.get('/link-status', asyncRoute((req, res) => {
  const link = login.getLink(String(req.query.token || ''));
  if (!link) return res.status(404).json({ status: 'expired' });
  if (link.linked_at) return res.json({ status: 'linked', phone_masked: login.maskPhone(link.phone) });
  if (link.expires_at <= nowIso()) return res.json({ status: 'expired' });
  if (link.error) return res.json({ status: link.error });
  res.json({ status: link.chat_id ? 'opened' : 'pending' });
}));

router.post('/verify', verifyLimiter, asyncRoute((req, res) => {
  const phone = login.normalizePhone(req.body && req.body.phone);
  const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ error: "Raqam noto'g'ri", field: 'phone' });
  if (code.length !== 6) return res.status(400).json({ error: 'Kod 6 ta raqamdan iborat', field: 'code' });

  const result = login.verifyCode(phone, code);
  if (!result.ok) return res.status(400).json({ error: result.error, field: 'code' });

  const ts = nowIso();
  let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  let isNew = false;
  if (!customer) {
    const info = db.prepare('INSERT INTO customers (phone, created_at, last_login_at) VALUES (?, ?, ?)').run(phone, ts, ts);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
    isNew = true;
  } else {
    if (!customer.is_active) return res.status(403).json({ error: "Bu hisob bloklangan. Restoran bilan bog'laning" });
    db.prepare('UPDATE customers SET last_login_at = ? WHERE id = ?').run(ts, customer.id);
  }
  req.app.locals.customerAuth.login(req, res, customer);
  res.json({ ok: true, is_new: isNew || !customer.full_name, customer: publicCustomer(customer) });
}));

// Header/checkout uchun yengil tekshiruv — login qilmagan bo'lsa ham 200
// qaytaradi (brauzer konsolida 401 xatosi chiqmasin).
router.get('/session', asyncRoute((req, res) => {
  const customer = req.app.locals.customerAuth.currentCustomer(req);
  if (!customer) return res.json({ customer: null });
  const addresses = db.prepare(
    `SELECT id, label, address, location_lat, location_lng, is_default
     FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC`
  ).all(customer.id);
  res.json({ customer: publicCustomer(customer), addresses });
}));

router.post('/logout', (req, res) => {
  req.app.locals.customerAuth.logout(req, res);
  res.json({ ok: true });
});

module.exports = router;
module.exports.publicCustomer = publicCustomer;
