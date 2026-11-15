// Mijoz (landing sayti) sessiyasi — 2026-11-01, "Mijoz hisobi".
//
// Xodimlar sessiyasidan (server/auth.js, `polat_session`) ATAYLAB butunlay
// alohida: boshqa cookie nomi, boshqa HMAC kaliti (SESSION_SECRET'dan
// hosil qilingan), boshqa jadval (`customers`). Shu sabab mijoz cookie'si
// hech qachon xodim sahifasiga (/admin, /waiter ...) kirish huquqini bermaydi
// va aksincha.
//
// Cookie qiymati: "c.<customerId>.<sessionVersion>.<hmac>". Har so'rovda
// bazadan `is_active=1` va `session_version` tekshiriladi — "Barcha
// qurilmalardan chiqish" versiyani oshiradi va eski cookie'lar darhol
// ishdan chiqadi (xodim sessiyasidagi 🟡 ochiq muammo mijozda takrorlanmasin).
const crypto = require('crypto');
const { db } = require('./db');

const COOKIE_NAME = 'polat_customer';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 kun

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    try {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch (e) { /* buzilgan cookie — e'tiborsiz */ }
  });
  return out;
}

function createCustomerAuth({ sessionSecret }) {
  // Xodim cookie'si bilan bir xil kalit ishlatilmasin — biri ikkinchisining
  // imzosi sifatida qabul qilinib qolmasligi uchun alohida kalit hosil qilamiz.
  const key = crypto.createHmac('sha256', sessionSecret).update('polat-customer-session-v1').digest();

  const mac = (value) => crypto.createHmac('sha256', key).update(value).digest('hex');

  const getCustomer = db.prepare('SELECT * FROM customers WHERE id = ? AND is_active = 1');

  function currentCustomer(req) {
    if (req._customerResolved) return req._customer;
    req._customerResolved = true;
    req._customer = null;
    const raw = parseCookies(req)[COOKIE_NAME];
    if (!raw) return null;
    const idx = raw.lastIndexOf('.');
    if (idx < 0) return null;
    const value = raw.slice(0, idx);
    const sig = Buffer.from(raw.slice(idx + 1));
    const expected = Buffer.from(mac(value));
    if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
    const [prefix, idStr, verStr] = value.split('.');
    if (prefix !== 'c') return null;
    const customer = getCustomer.get(Number(idStr));
    if (!customer || customer.session_version !== Number(verStr)) return null;
    req._customer = customer;
    return customer;
  }

  function writeCookie(req, res, token, maxAge) {
    const secure = req.secure ? '; Secure' : '';
    res.append(
      'Set-Cookie',
      `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
    );
  }

  function login(req, res, customer) {
    const value = `c.${customer.id}.${customer.session_version}`;
    writeCookie(req, res, `${value}.${mac(value)}`, MAX_AGE_SECONDS);
  }

  function logout(req, res) {
    writeCookie(req, res, '', 0);
  }

  // Login qilmagan bo'lsa 401 — faqat /api/customer/* (hisob) yo'llari uchun.
  function requireCustomer(req, res, next) {
    const customer = currentCustomer(req);
    if (!customer) return res.status(401).json({ error: 'Hisobingizga kiring' });
    req.customer = customer;
    next();
  }

  return { currentCustomer, login, logout, requireCustomer };
}

module.exports = { createCustomerAuth, COOKIE_NAME };
