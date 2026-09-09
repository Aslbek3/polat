// `server/auth.js` + `server/passwords.js` + `server/roles.js` — kirish
// (autentifikatsiya), imzolangan cookie va rol hududlari (2026-09-10 auditi).
//
// Middleware'larni "haqiqiy" sharoitda sinash uchun har testda kichik Express
// ilova ko'tariladi (`app.listen(0)` — bo'sh port) va Node'ning o'rnatilgan
// `fetch`i bilan HTTP so'rov yuboriladi. Cookie qo'lda boshqariladi
// (`res.headers.getSetCookie()` -> keyingi so'rovda `Cookie:` sarlavhasi),
// chunki `fetch` cookie jar'ini saqlamaydi. Tashqi kutubxona ishlatilmaydi.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { once } = require('node:events');

const h = require('./helpers');
const express = require('express');
const { createAuth, COOKIE_NAME } = require('../server/auth');
const { hashPassword, verifyPassword } = require('../server/passwords');
const { homeForRole } = require('../server/roles');

const SECRET = 'auth-test-secret';

// Cookie qiymatini qo'lda imzolash — buzilgan imzo testlarida "to'g'ri" imzo
// qanday ko'rinishini bilish uchun kerak (auth.js'dagi sign() bilan bir xil).
function signValue(value) {
  const mac = crypto.createHmac('sha256', SECRET).update(value).digest('hex');
  return `${value}.${mac}`;
}

// Sinov ilovasi: index.js'dagi ulanish tartibini takrorlaydi —
// login/logout requireAuth'dan OLDIN, qolgan hamma narsa keyin.
function buildApp() {
  const auth = createAuth({ sessionSecret: SECRET });
  const app = express();
  app.use(express.json());

  app.post('/api/login', auth.loginRoute);
  app.post('/api/logout', auth.logoutRoute);

  app.use(auth.requireAuth);

  app.get('/api/me', auth.meRoute);

  // requireRole ikkala shakli: bitta satr va massiv.
  app.get('/api/faqat-admin', auth.requireRole('admin'), (req, res) => res.json({ ok: true }));
  app.get('/api/admin-yoki-kassir', auth.requireRole(['admin', 'kassir']), (req, res) => res.json({ ok: true }));

  // Qolgan HAMMA yo'l uchun umumiy javob — requireAuth o'tkazgan bo'lsa 200.
  // Shu tufayli rol hududlarini (/api/admin/..., /waiter/... va h.k.) alohida
  // handler yozmasdan sinash mumkin.
  app.use((req, res) => {
    res.json({ ok: true, path: req.path, role: req.user ? req.user.role : null });
  });

  return app;
}

// Har testda yangi server; `t.after` bilan albatta yopiladi.
async function startServer(t) {
  const server = buildApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

// Set-Cookie'dan polat_session qiymatini ajratib olish (`name=value` shaklida
// qaytaradi — to'g'ridan-to'g'ri `Cookie:` sarlavhasiga qo'yish uchun).
function cookieFrom(res) {
  const all = res.headers.getSetCookie();
  const found = all.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!found) return null;
  return found.split(';')[0];
}

async function login(base, username, password = 'parol123') {
  return fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

// HTML yo'llarda 302 tekshirilgani uchun avtomatik ergashish o'chirilgan.
function get(base, path, cookie) {
  return fetch(`${base}${path}`, {
    redirect: 'manual',
    headers: cookie ? { Cookie: cookie } : {},
  });
}

// --------------------------------- passwords.js ---------------------------------

test("hashPassword har safar boshqa tuz (salt) va xesh beradi", () => {
  const a = hashPassword('parol123');
  const b = hashPassword('parol123');

  assert.notStrictEqual(a.salt, b.salt, "tuz har safar tasodifiy bo'lishi kerak");
  assert.notStrictEqual(a.hash, b.hash, 'bir xil parol ham boshqa xesh berishi kerak');
  // Ikkalasi ham baribir bir xil parolni tasdiqlaydi.
  assert.strictEqual(verifyPassword('parol123', a.salt, a.hash), true);
  assert.strictEqual(verifyPassword('parol123', b.salt, b.hash), true);
});

test("verifyPassword to'g'ri parolda true, noto'g'risida false qaytaradi", () => {
  const { salt, hash } = hashPassword('parol123');

  assert.strictEqual(verifyPassword('parol123', salt, hash), true);
  assert.strictEqual(verifyPassword('parol124', salt, hash), false);
  assert.strictEqual(verifyPassword('PAROL123', salt, hash), false, 'katta-kichik harf farqlanadi');
  assert.strictEqual(
    verifyPassword('parol123', hashPassword('parol123').salt, hash),
    false,
    'boshqa tuz bilan mos kelmaydi'
  );
});

test("verifyPassword bo'sh/null qiymatlarda false qaytaradi (istisno tashlamaydi)", () => {
  const { salt, hash } = hashPassword('parol123');

  for (const bad of ['', null, undefined, 0, false]) {
    assert.strictEqual(verifyPassword(bad, salt, hash), false, `parol: ${String(bad)}`);
    assert.strictEqual(verifyPassword('parol123', bad, hash), false, `tuz: ${String(bad)}`);
    assert.strictEqual(verifyPassword('parol123', salt, bad), false, `xesh: ${String(bad)}`);
  }
});

// ---------------------------------- loginRoute ----------------------------------

test("to'g'ri login va parol 200, rol va cookie qaytaradi", async (t) => {
  const base = await startServer(t);
  const user = h.createUser({ role: 'kassir', username: 'kassir_ok', fullName: 'Kassir Aka' });

  const res = await login(base, 'kassir_ok');
  const body = await res.json();

  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.role, 'kassir');
  assert.strictEqual(body.full_name, 'Kassir Aka');

  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_NAME}=`));
  assert.ok(raw, "polat_session cookie o'rnatilishi kerak");
  assert.match(raw, /HttpOnly/, "cookie HttpOnly bo'lishi shart (JS o'qiy olmasin)");
  assert.match(raw, /SameSite=Lax/);
  assert.match(raw, /Path=\//);
  // Cookie ichida foydalanuvchi id'si imzolangan holda turadi.
  assert.strictEqual(decodeURIComponent(raw.split(';')[0].split('=')[1]), signValue(String(user.id)));
});

test("noto'g'ri parol 401 qaytaradi va cookie o'rnatmaydi", async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'waiter', username: 'afitsiant_1' });

  const res = await login(base, 'afitsiant_1', 'boshqa-parol');

  assert.strictEqual(res.status, 401);
  assert.strictEqual(cookieFrom(res), null, 'muvaffaqiyatsiz kirishda cookie berilmasligi kerak');
});

test("mavjud bo'lmagan login 401 qaytaradi", async (t) => {
  const base = await startServer(t);

  const res = await login(base, 'umuman-yoq-foydalanuvchi');

  assert.strictEqual(res.status, 401);
  assert.strictEqual(cookieFrom(res), null);
});

test('is_active = 0 foydalanuvchi kira olmaydi (401)', async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'waiter', username: 'bloklangan', isActive: 0 });

  const res = await login(base, 'bloklangan');

  assert.strictEqual(res.status, 401);
  assert.strictEqual(cookieFrom(res), null);
});

test("login yoki parol satr bo'lmasa 400 qaytariladi", async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'waiter', username: 'satr_test' });

  const yomonTanalar = [
    {},
    { username: 'satr_test' },
    { password: 'parol123' },
    { username: 123, password: 'parol123' },
    { username: 'satr_test', password: null },
    { username: ['satr_test'], password: 'parol123' },
  ];

  for (const body of yomonTanalar) {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.strictEqual(res.status, 400, `tana: ${JSON.stringify(body)}`);
  }
});

test('xato xabari login mavjudligini oshkor qilmaydi', async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'waiter', username: 'mavjud_user' });
  h.createUser({ role: 'waiter', username: 'faolsiz_user', isActive: 0 });

  // Uchala holat ham bir xil 401 va BIR XIL xabar qaytarishi kerak.
  const notogriParol = await login(base, 'mavjud_user', 'notogri-parol');
  const yoqLogin = await login(base, 'bunday-login-yoq', 'notogri-parol');
  const bloklangan = await login(base, 'faolsiz_user');

  const a = await notogriParol.json();
  const b = await yoqLogin.json();
  const c = await bloklangan.json();

  assert.strictEqual(notogriParol.status, 401);
  assert.strictEqual(yoqLogin.status, 401);
  assert.strictEqual(bloklangan.status, 401);
  assert.strictEqual(
    a.error,
    b.error,
    "noto'g'ri parol va mavjud bo'lmagan login uchun xabar BIR XIL bo'lishi kerak"
  );
  assert.strictEqual(c.error, a.error, "bloklangan hisob ham o'zini oshkor qilmasligi kerak");
});

// ----------------------------- imzolangan cookie -------------------------------

test('buzilgan cookie qabul qilinmaydi (qiymat, imzo, imzosiz qiymat)', async (t) => {
  const base = await startServer(t);
  const user = h.createUser({ role: 'admin', username: 'admin_imzo' });
  const boshqa = h.createUser({ role: 'waiter', username: 'waiter_imzo' });

  const loginRes = await login(base, 'admin_imzo');
  const cookie = cookieFrom(loginRes);
  assert.ok(cookie);

  // Nazorat: haqiqiy cookie ishlaydi.
  assert.strictEqual((await get(base, '/api/me', cookie)).status, 200);

  const token = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  const qiymat = token.slice(0, token.lastIndexOf('.'));
  const imzo = token.slice(token.lastIndexOf('.') + 1);
  assert.strictEqual(qiymat, String(user.id));

  const buzilganlar = {
    "qiymat almashtirilgan (boshqa foydalanuvchi id'si)": `${boshqa.id}.${imzo}`,
    "imzo o'zgartirilgan": `${qiymat}.${imzo.slice(0, -1)}${imzo.slice(-1) === 'a' ? 'b' : 'a'}`,
    'imzo qisqartirilgan': `${qiymat}.${imzo.slice(0, 32)}`,
    'imzosiz qiymat': qiymat,
    "bo'sh imzo": `${qiymat}.`,
    'butunlay soxta': 'aldash.aldash',
  };

  for (const [tavsif, buzilgan] of Object.entries(buzilganlar)) {
    const res = await get(base, '/api/me', `${COOKIE_NAME}=${encodeURIComponent(buzilgan)}`);
    assert.strictEqual(res.status, 401, `qabul qilinmasligi kerak: ${tavsif}`);
  }
});

test("logout cookie'ni bekor qiladi", async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'waiter', username: 'chiqish_test' });

  const cookie = cookieFrom(await login(base, 'chiqish_test'));
  assert.strictEqual((await get(base, '/api/me', cookie)).status, 200);

  const out = await fetch(`${base}/api/logout`, { method: 'POST', headers: { Cookie: cookie } });
  const bekor = out.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_NAME}=`));
  assert.match(bekor, /Max-Age=0/, "brauzerga cookie'ni o'chirish buyurilishi kerak");
});

// ---------------------------------- requireAuth ---------------------------------

test("cookie'siz /api/... so'rovi 401 qaytaradi", async (t) => {
  const base = await startServer(t);

  const res = await get(base, '/api/me');
  const body = await res.json();

  assert.strictEqual(res.status, 401);
  assert.strictEqual(body.error, 'unauthorized');
});

test("cookie'siz HTML yo'l /login.html ga 302 qiladi", async (t) => {
  const base = await startServer(t);

  for (const yol of ['/admin/index.html', '/waiter/tables.html', '/chef/kitchen.html']) {
    const res = await get(base, yol);
    assert.strictEqual(res.status, 302, `yo'l: ${yol}`);
    assert.strictEqual(res.headers.get('location'), '/login.html', `yo'l: ${yol}`);
  }
});

test("OPEN_PATHS va landing/uploads cookie'siz ham ochiq", async (t) => {
  const base = await startServer(t);

  const ochiqYollar = [
    '/login.html',
    '/api/ping',
    '/app.js',
    '/style.css',
    '/manifest.json',
    '/landing',
    '/landing/index.html',
    '/uploads/taom-1.png',
  ];

  for (const yol of ochiqYollar) {
    const res = await get(base, yol);
    assert.strictEqual(res.status, 200, `ochiq bo'lishi kerak: ${yol}`);
  }
});

// ------------------------------- rol hududlari ----------------------------------

test('waiter /api/admin/... hududiga kira olmaydi (403)', async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'waiter', username: 'w_hudud' });
  const cookie = cookieFrom(await login(base, 'w_hudud'));

  const res = await get(base, '/api/admin/users', cookie);
  const body = await res.json();

  assert.strictEqual(res.status, 403);
  assert.strictEqual(body.error, 'forbidden');
});

test('kassir /api/waiter/... hududiga kira olmaydi (403)', async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'kassir', username: 'k_hudud' });
  const cookie = cookieFrom(await login(base, 'k_hudud'));

  assert.strictEqual((await get(base, '/api/waiter/tables', cookie)).status, 403);
});

test('chef /api/kassir/... hududiga kira olmaydi (403)', async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'chef', username: 'c_hudud' });
  const cookie = cookieFrom(await login(base, 'c_hudud'));

  assert.strictEqual((await get(base, '/api/kassir/tables', cookie)).status, 403);
});

test("har bir rol o'z hududiga kira oladi, begonasiga yo'q", async (t) => {
  const base = await startServer(t);
  const hududlar = ['waiter', 'chef', 'courier', 'kassir'];

  for (const rol of hududlar) {
    h.createUser({ role: rol, username: `matritsa_${rol}` });
    const cookie = cookieFrom(await login(base, `matritsa_${rol}`));

    for (const hudud of [...hududlar, 'admin']) {
      const res = await get(base, `/api/${hudud}/nimadir`, cookie);
      const kutilgan = hudud === rol ? 200 : 403;
      assert.strictEqual(res.status, kutilgan, `${rol} -> /api/${hudud}/nimadir`);
    }
  }
});

test('admin HAMMA hududga kira oladi', async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'admin', username: 'admin_hamma' });
  const cookie = cookieFrom(await login(base, 'admin_hamma'));

  for (const hudud of ['admin', 'waiter', 'chef', 'courier', 'kassir']) {
    assert.strictEqual((await get(base, `/api/${hudud}/nimadir`, cookie)).status, 200, `hudud: ${hudud}`);
    // HTML yo'lda ham redirect bo'lmasligi kerak.
    assert.strictEqual((await get(base, `/${hudud}/sahifa.html`, cookie)).status, 200, `hudud: /${hudud}/`);
  }
});

test("HTML yo'lda begona hududga kirsa o'z uy sahifasiga 302 qiladi", async (t) => {
  const base = await startServer(t);

  for (const rol of ['waiter', 'chef', 'courier', 'kassir']) {
    h.createUser({ role: rol, username: `uy_${rol}` });
    const cookie = cookieFrom(await login(base, `uy_${rol}`));

    // O'z roliga TEGISHLI BO'LMAGAN hududga (admin sahifasiga) urinish.
    const res = await get(base, '/admin/index.html', cookie);
    assert.strictEqual(res.status, 302, `rol: ${rol}`);
    assert.strictEqual(res.headers.get('location'), homeForRole(rol), `rol: ${rol}`);
  }
});

// ---------------------------------- requireRole ---------------------------------

test("requireRole('admin') — bitta satr shakli", async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'admin', username: 'rr_admin' });
  h.createUser({ role: 'kassir', username: 'rr_kassir' });

  const adminCookie = cookieFrom(await login(base, 'rr_admin'));
  const kassirCookie = cookieFrom(await login(base, 'rr_kassir'));

  assert.strictEqual((await get(base, '/api/faqat-admin', adminCookie)).status, 200);
  const rad = await get(base, '/api/faqat-admin', kassirCookie);
  assert.strictEqual(rad.status, 403);
  assert.strictEqual((await rad.json()).error, 'forbidden');
});

test("requireRole(['admin', 'kassir']) — massiv shakli", async (t) => {
  const base = await startServer(t);
  h.createUser({ role: 'admin', username: 'rrm_admin' });
  h.createUser({ role: 'kassir', username: 'rrm_kassir' });
  h.createUser({ role: 'chef', username: 'rrm_chef' });

  const adminCookie = cookieFrom(await login(base, 'rrm_admin'));
  const kassirCookie = cookieFrom(await login(base, 'rrm_kassir'));
  const chefCookie = cookieFrom(await login(base, 'rrm_chef'));

  assert.strictEqual((await get(base, '/api/admin-yoki-kassir', adminCookie)).status, 200);
  assert.strictEqual((await get(base, '/api/admin-yoki-kassir', kassirCookie)).status, 200);
  assert.strictEqual((await get(base, '/api/admin-yoki-kassir', chefCookie)).status, 403);
});

// ----------------- sessiyaning bazadagi holatga bog'liqligi ---------------------

test("foydalanuvchi bloklansa (is_active = 0) eski cookie darhol ishlamay qoladi", async (t) => {
  const base = await startServer(t);
  const user = h.createUser({ role: 'waiter', username: 'bloklanadigan' });

  const cookie = cookieFrom(await login(base, 'bloklanadigan'));
  assert.strictEqual((await get(base, '/api/me', cookie)).status, 200, 'avval ishlashi kerak');

  h.db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(user.id);

  const res = await get(base, '/api/me', cookie);
  assert.strictEqual(res.status, 401, 'bloklashdan keyin eski cookie darhol rad etilishi kerak');
});

// ── AUDIT TOPILMASI: SESSIYA HECH QACHON ESKIRMAYDI — cookie faqat
// foydalanuvchi id'sini imzolaydi (`sign(String(user.id))`), ichida na vaqt
// belgisi, na sessiya versiyasi bor. Shu sabab parol o'g'irlangani aniqlanib
// almashtirilgandan keyin ham o'g'rining ESKI cookie'si ishlayveradi —
// hisobni "qutqarish"ning yagona yo'li uni butunlay bloklash (is_active = 0).
// To'g'ri xulq: parol xeshi o'zgarsa, eski cookie'lar kuchini yo'qotishi kerak
// (masalan imzolanadigan qiymatga password_hash'dan olingan versiya yoki
// `session_version` ustuni qo'shilishi bilan).
test("parol o'zgartirilgandan keyin eski cookie ishlamasligi kerak", async (t) => {
  const base = await startServer(t);
  const user = h.createUser({ role: 'waiter', username: 'parol_almashadi', password: 'eski-parol' });

  const cookie = cookieFrom(await login(base, 'parol_almashadi', 'eski-parol'));
  assert.ok(cookie, 'eski parol bilan kirish ishlashi kerak');
  assert.strictEqual((await get(base, '/api/me', cookie)).status, 200);

  // Parol almashtiriladi (admin panelidagi "parolni tiklash" bilan bir xil).
  const { salt, hash } = hashPassword('yangi-parol');
  h.db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, user.id);

  // Eski parol endi ishlamaydi — buni tekshirib olamiz (bu qism o'tadi).
  assert.strictEqual((await login(base, 'parol_almashadi', 'eski-parol')).status, 401);
  assert.strictEqual((await login(base, 'parol_almashadi', 'yangi-parol')).status, 200);

  // Asosiy da'vo: eski cookie ham kuchini yo'qotishi kerak edi.
  const res = await get(base, '/api/me', cookie);
  assert.strictEqual(res.status, 401, "parol almashtirilgandan keyin eski sessiya bekor bo'lishi kerak");
});
