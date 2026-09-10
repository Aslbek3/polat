// UI/UX tahlilidagi (docs/UI-UX-TAHLIL.md, 4- va 6-bo'limlar) server
// tomonini talab qiladigan tuzatishlar uchun testlar — 2026-09-10.
//
// Naqsh test/reports.test.js bilan bir xil: kichik Express ilova + soxta
// `req.user` + `app.listen(0)` + Node'ning o'rnatilgan `fetch`i. Faqat ikki
// joyda HAQIQIY `server/index.js` ilovasi ishlatiladi — u yerda aynan
// mount tartibi tekshiriladi (ochiq sozlamalar `requireAuth`dan OLDIN,
// bron/buyurtma rate-limit'lari alohida).
//
// MUHIM: butun fayl bitta xotiradagi bazada ishlaydi — testlar bir-birining
// yozuvlarini ko'radi. Shu sabab har test o'z yozuvlarini id bo'yicha
// ajratib tekshiradi yoki "oldin/keyin" farqini o'lchaydi.
const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const express = require('express');

const h = require('./helpers');
const { requireCapability, CAPABILITIES } = require('../server/permissions');
const reports = require('../server/services/reports');
const inventory = require('../server/services/inventory');
const manualBills = require('../server/services/manualBills');
const settingsService = require('../server/services/settings');

const ADMIN = { id: 1, username: 'admin', role: 'admin' };
const WAITER = { id: 2, username: 'afitsiant', role: 'waiter' };

// ──────────────────────────────────────────────────────────────────────────
// Yordamchilar
// ──────────────────────────────────────────────────────────────────────────

// `mounts` — [[yo'l, router], ...]. Har bir admin router'i haqiqiy ilovadagi
// kabi `need(cap.ADMIN_MANAGE)` ortida ulanadi — shu tufayli 403 ni ham shu
// yerda tekshirish mumkin.
async function startApp(t, user, mounts) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = user; next(); });
  for (const [path, router, guarded = true] of mounts) {
    if (guarded) app.use(path, requireCapability(CAPABILITIES.ADMIN_MANAGE), router);
    else app.use(path, router);
  }
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

// Haqiqiy `server/index.js` ilovasi. helpers.js allaqachon xotiradagi bazani
// ochgan (db moduli keshda), shuning uchun index.js dagi dotenv uni
// o'zgartira olmaydi.
let realApp = null;
async function startRealApp(t) {
  if (!realApp) {
    const origWarn = console.warn;
    console.warn = () => {};
    realApp = require('../server/index');
    console.warn = origWarn;
  }
  const server = realApp.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function api(base, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* bo'sh javob */ }
  return { status: res.status, body: json, headers: res.headers };
}

const routers = {
  settings: () => require('../server/routes/adminSettings'),
  publicSettings: () => require('../server/routes/publicSettings'),
  dashboard: () => require('../server/routes/adminDashboard'),
  reports: () => require('../server/routes/adminReports'),
  reservations: () => require('../server/routes/adminReservations'),
  customerOrders: () => require('../server/routes/adminCustomerOrders'),
  expenses: () => require('../server/routes/adminExpenses'),
  inventory: () => require('../server/routes/adminInventory'),
  publicOrders: () => require('../server/routes/publicCustomerOrders'),
};

// Server lokal sanasi — servislar ham aynan shu funksiyani ishlatadi.
const today = () => reports.localDateStr();
function shiftDays(days) {
  const d = new Date();
  return reports.localDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

function makeClosedOrder({ closedAt, total, status = 'closed', tableName }) {
  const user = h.createUser({ role: 'waiter', fullName: 'Afitsiant Ali' });
  const table = h.createTable({ name: tableName });
  const info = h.db
    .prepare(
      `INSERT INTO orders (table_id, status, opened_by, opened_at, closed_by, closed_at, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(table.id, status, user.id, closedAt, status === 'closed' ? user.id : null,
      status === 'closed' ? closedAt : null, status === 'closed' ? total : null);
  return { id: info.lastInsertRowid, table };
}

function makeCustomerOrderAt({ createdAt, status, total, fullName = 'Ali' }) {
  const item = h.createMenuItem({ price: total });
  const order = h.createCustomerOrder({
    status, fullName, items: [{ menuItemId: item.id, unitPrice: total, quantity: 1, name: 'Osh' }],
  });
  h.db.prepare('UPDATE customer_orders SET created_at = ? WHERE id = ?').run(createdAt, order.id);
  return order;
}

function makeManualBillAt({ createdAt, amount }) {
  const kassir = h.createUser({ role: 'kassir', fullName: 'Kassir Bek' });
  manualBills.createManualBill([{ name: 'Choy', unit_price: amount, quantity: 1 }], kassir.id);
  const row = h.db.prepare('SELECT id FROM manual_bills ORDER BY id DESC LIMIT 1').get();
  h.db.prepare('UPDATE manual_bills SET created_at = ? WHERE id = ?').run(createdAt, row.id);
  return { id: row.id };
}

function makeReservation({ date, time = '19:00', status = 'new', name = 'Mehmon' }) {
  const info = h.db
    .prepare(
      `INSERT INTO reservations (full_name, phone, party_size, res_date, res_time, note, status, created_at)
       VALUES (?, '998901234567', 2, ?, ?, NULL, ?, ?)`
    )
    .run(name, date, time, status, h.nowIso());
  return info.lastInsertRowid;
}

// ──────────────────────────────────────────────────────────────────────────
// A) GET /api/public/settings — login'siz, faqat xavfsiz maydonlar (L-29)
// ──────────────────────────────────────────────────────────────────────────

test("public settings: login'siz 200, faqat oq ro'yxatdagi maydonlar, maxfiy kalit chiqmaydi", async (t) => {
  // Jadvalga ichki (maxfiy) kalit yozilgan bo'lsa ham ochiq javobga tushmasligi kerak.
  h.db.prepare("INSERT INTO settings (key, value) VALUES ('internal_api_token', 'SIR-123') ON CONFLICT(key) DO NOTHING").run();
  // migrate.js urug'i — bazadagi qiymat o'zgartirilmasdan qaytishi kerak.
  h.db.prepare("INSERT INTO settings (key, value) VALUES ('restaurant_name', 'Po''lat') ON CONFLICT(key) DO NOTHING").run();

  const base = await startRealApp(t);
  const res = await api(base, 'GET', '/api/public/settings'); // cookie YO'Q

  assert.strictEqual(res.status, 200, 'ochiq endpoint requireAuth dan OLDIN ulangan bo\'lishi kerak');
  assert.deepStrictEqual(Object.keys(res.body).sort(), [
    'delivery_enabled', 'delivery_fee', 'delivery_min_order', 'delivery_time_text',
    'payment_methods_text', 'restaurant_address', 'restaurant_name', 'restaurant_phone',
  ]);
  assert.ok(!JSON.stringify(res.body).includes('SIR-123'), 'maxfiy qiymat chiqib ketmasligi kerak');
  assert.strictEqual(res.body.restaurant_name, "Po'lat", "bazadagi nom o'zgarishsiz qaytadi");
  assert.strictEqual(typeof res.body.delivery_enabled, 'boolean');
  assert.strictEqual(typeof res.body.delivery_fee, 'number');
  assert.strictEqual(typeof res.body.delivery_min_order, 'number');
});

test("admin settings va dashboard: haqiqiy ilovada sessiyasiz 401", async (t) => {
  const base = await startRealApp(t);
  for (const [method, path] of [['GET', '/api/admin/settings'], ['PUT', '/api/admin/settings'], ['GET', '/api/admin/dashboard']]) {
    const res = await api(base, method, path, method === 'PUT' ? { delivery_fee: 1 } : undefined);
    assert.strictEqual(res.status, 401, `${method} ${path}`);
  }
});

// ──────────────────────────────────────────────────────────────────────────
// B) GET/PUT /api/admin/settings
// ──────────────────────────────────────────────────────────────────────────

test('admin settings: ADMIN_MANAGE imkoniyati yo\'q rol — 403', async (t) => {
  const base = await startApp(t, WAITER, [
    ['/settings', routers.settings()],
    ['/dashboard', routers.dashboard()],
  ]);
  assert.strictEqual((await api(base, 'GET', '/settings')).status, 403);
  assert.strictEqual((await api(base, 'PUT', '/settings', { delivery_fee: 5000 })).status, 403);
  assert.strictEqual((await api(base, 'GET', '/dashboard')).status, 403);
});

test('admin settings: PUT qisman yangilaydi, GET va ochiq javob yangi qiymatni ko\'rsatadi', async (t) => {
  const base = await startApp(t, ADMIN, [
    ['/settings', routers.settings()],
    ['/public-settings', routers.publicSettings(), false],
  ]);

  const before = (await api(base, 'GET', '/settings')).body;
  const put = await api(base, 'PUT', '/settings', {
    delivery_fee: 15000,
    delivery_time_text: '  40–60 daqiqa  ',
    delivery_enabled: false,
    payment_methods_text: 'Naqd, Click, Payme',
  });
  assert.strictEqual(put.status, 200);
  assert.strictEqual(put.body.delivery_fee, 15000);
  assert.strictEqual(put.body.delivery_time_text, '40–60 daqiqa', 'matn trim qilinadi');
  assert.strictEqual(put.body.delivery_enabled, false);
  assert.strictEqual(put.body.restaurant_name, before.restaurant_name, "yuborilmagan maydon o'zgarmaydi");
  assert.strictEqual(put.body.delivery_min_order, before.delivery_min_order);

  const got = (await api(base, 'GET', '/settings')).body;
  assert.deepStrictEqual(got, put.body);
  const pub = (await api(base, 'GET', '/public-settings')).body;
  assert.strictEqual(pub.delivery_fee, 15000);
  assert.strictEqual(pub.payment_methods_text, 'Naqd, Click, Payme');

  // Bo'sh qiymat — "yashirish" (0 / ""), xato emas.
  const cleared = await api(base, 'PUT', '/settings', { delivery_fee: 0, delivery_time_text: '' });
  assert.strictEqual(cleared.status, 200);
  assert.strictEqual(cleared.body.delivery_fee, 0);
  assert.strictEqual(cleared.body.delivery_time_text, '');
});

test('admin settings: validatsiya — noto\'g\'ri qiymat 400 va HECH NARSA saqlanmaydi', async (t) => {
  const base = await startApp(t, ADMIN, [['/settings', routers.settings()]]);
  await api(base, 'PUT', '/settings', { delivery_fee: 7000 });

  const bad = [
    [{ delivery_fee: -1 }, /narxi/i],
    [{ delivery_fee: 'abc' }, /narxi/i],
    [{ delivery_fee: 5_000_000 }, /juda katta/i],
    [{ delivery_min_order: 99_000_000 }, /juda katta/i],
    [{ delivery_enabled: 'balki' }, /true yoki false/i],
    [{ restaurant_phone: '9'.repeat(31) }, /juda uzun/i],
    [{ delivery_time_text: 'x'.repeat(61) }, /juda uzun/i],
    [{ restaurant_name: '   ' }, /kiritilishi shart/i],
    [{}, /hech qanday sozlama/i],
    [{ nomalum_kalit: 'x' }, /hech qanday sozlama/i],
  ];
  for (const [body, re] of bad) {
    const res = await api(base, 'PUT', '/settings', body);
    assert.strictEqual(res.status, 400, JSON.stringify(body));
    assert.match(res.body.error, re, JSON.stringify(body));
  }

  // Bitta to'g'ri + bitta xato maydon — to'g'risi ham saqlanmasligi kerak.
  const mixed = await api(base, 'PUT', '/settings', { delivery_fee: 9000, delivery_min_order: -5 });
  assert.strictEqual(mixed.status, 400);
  assert.strictEqual((await api(base, 'GET', '/settings')).body.delivery_fee, 7000, 'atomik: yarim saqlanmaydi');

  // Noma'lum kalit jadvalga yozilmaydi.
  await api(base, 'PUT', '/settings', { delivery_fee: 7000, hack_key: 'x' });
  const row = h.db.prepare("SELECT 1 FROM settings WHERE key = 'hack_key'").get();
  assert.strictEqual(row, undefined);
});

test("settings servisi: bazadagi buzilgan qiymat standartga qaytadi, 500 emas", () => {
  h.db.prepare("INSERT INTO settings (key, value) VALUES ('delivery_min_order', 'buzuq') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  h.db.prepare("INSERT INTO settings (key, value) VALUES ('delivery_enabled', 'ha') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  const s = settingsService.getPublicSettings();
  assert.strictEqual(s.delivery_min_order, 0);
  assert.strictEqual(s.delivery_enabled, true);
  h.db.prepare("DELETE FROM settings WHERE key IN ('delivery_min_order', 'delivery_enabled')").run();
});

// ──────────────────────────────────────────────────────────────────────────
// C) GET /api/admin/dashboard (A-03, A-04, A-05, A-09)
// ──────────────────────────────────────────────────────────────────────────

test('dashboard: shakl va pul raqamlari /reports/summary bilan AYNAN bir xil', async (t) => {
  const TODAY = today();
  const YESTERDAY = shiftDays(-1);
  const monthStart = `${TODAY.slice(0, 7)}-01`;

  makeClosedOrder({ closedAt: `${TODAY}T10:00:00.000Z`, total: 40000 });
  makeCustomerOrderAt({ createdAt: `${TODAY}T11:00:00.000Z`, status: 'completed', total: 25000 });
  makeManualBillAt({ createdAt: `${TODAY}T12:00:00.000Z`, amount: 6000 });
  makeClosedOrder({ closedAt: `${YESTERDAY}T10:00:00.000Z`, total: 17000 });
  h.db.prepare('INSERT INTO expenses (amount, expense_date, note, category, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(3000, TODAY, 'test', 'boshqa', null, h.nowIso());

  const base = await startApp(t, ADMIN, [
    ['/dashboard', routers.dashboard()],
    ['/reports', routers.reports()],
  ]);
  const { status, body } = await api(base, 'GET', '/dashboard');
  assert.strictEqual(status, 200);

  assert.deepStrictEqual(Object.keys(body).sort(), [
    'low_stock', 'month', 'new_customer_orders', 'new_reservations', 'today', 'today_reservations', 'yesterday',
  ]);
  const PERIOD_KEYS = ['cost_of_goods', 'expenses', 'net', 'orders_count', 'revenue'];
  for (const p of ['today', 'yesterday', 'month']) {
    assert.deepStrictEqual(Object.keys(body[p]).sort(), PERIOD_KEYS, p);
  }

  const summaryOf = async (from, to) => (await api(base, 'GET', `/reports/summary?from=${from}&to=${to}`)).body;
  const same = (dash, s, label) => {
    assert.strictEqual(dash.revenue, s.revenue, `${label}.revenue`);
    assert.strictEqual(dash.expenses, s.expenses_total, `${label}.expenses`);
    assert.strictEqual(dash.cost_of_goods, s.cost_of_goods, `${label}.cost_of_goods`);
    assert.strictEqual(dash.net, s.net, `${label}.net`);
    assert.strictEqual(dash.orders_count, s.orders_count, `${label}.orders_count`);
  };
  same(body.today, await summaryOf(TODAY, TODAY), 'today');
  same(body.yesterday, await summaryOf(YESTERDAY, YESTERDAY), 'yesterday');
  same(body.month, await summaryOf(monthStart, TODAY), 'month');

  // Bugungi 3 manba ham kirgan (boshqa testlar ham bugunga yozishi mumkin — >=).
  assert.ok(body.today.revenue >= 40000 + 25000 + 6000);
  assert.ok(body.today.expenses >= 3000);
  assert.ok(body.yesterday.revenue >= 17000);
});

test("dashboard: kam qoldiq, yangi buyurtma va bron hisoblagichlari", async (t) => {
  const base = await startApp(t, ADMIN, [['/dashboard', routers.dashboard()]]);
  const before = (await api(base, 'GET', '/dashboard')).body;

  const out = h.createInventoryItem({ name: 'Zz Tugagan suv', quantity: 0 });
  const low = h.createInventoryItem({ name: 'Aa Kam kola', quantity: 2 });
  h.db.prepare('UPDATE inventory_items SET low_stock_threshold = 5 WHERE id = ?').run(low.id);
  const ok = h.createInventoryItem({ name: 'Yetarli choy', quantity: 50 });
  h.db.prepare('UPDATE inventory_items SET low_stock_threshold = 5 WHERE id = ?').run(ok.id);
  const inactive = h.createInventoryItem({ name: "O'chirilgan", quantity: 0, isActive: 0 });

  h.createCustomerOrder({ status: 'new' });
  h.createCustomerOrder({ status: 'new' });
  h.createCustomerOrder({ status: 'confirmed' });

  makeReservation({ date: today(), status: 'new' });
  makeReservation({ date: today(), status: 'confirmed' });
  makeReservation({ date: today(), status: 'cancelled' });
  makeReservation({ date: shiftDays(1), status: 'new' });

  const after = (await api(base, 'GET', '/dashboard')).body;

  const ids = after.low_stock.map((i) => i.id);
  assert.ok(ids.includes(out.id), 'tugagan mahsulot ogohlantirishda');
  assert.ok(ids.includes(low.id), 'kam qolgan mahsulot ogohlantirishda');
  assert.ok(!ids.includes(ok.id), 'yetarli mahsulot yo\'q');
  assert.ok(!ids.includes(inactive.id), "o'chirilgan mahsulot yo'q");
  assert.ok(ids.indexOf(out.id) < ids.indexOf(low.id), 'tugagan (Zz...) kam qolgandan (Aa...) OLDIN — alifbodan qat\'i nazar');
  assert.deepStrictEqual(Object.keys(after.low_stock[0]).sort(), ['id', 'low_stock_threshold', 'name', 'quantity', 'unit']);

  assert.strictEqual(after.new_customer_orders - before.new_customer_orders, 2, "faqat status='new'");
  assert.strictEqual(after.today_reservations - before.today_reservations, 2, 'bugungi, bekor qilinmaganlar');
  assert.strictEqual(after.new_reservations - before.new_reservations, 2, "status='new' (bugungi + ertangi)");
});

// ──────────────────────────────────────────────────────────────────────────
// D) GET /api/admin/reports/orders — 3 manba + X-Total-Count (A-02, A-22)
// ──────────────────────────────────────────────────────────────────────────

test("reports orders: status=closed summary'dagi 3 manbani o'z ichiga oladi va jami mos keladi", async (t) => {
  const DAY = '2033-03-03';
  const table = makeClosedOrder({ closedAt: `${DAY}T09:00:00.000Z`, total: 30000, tableName: 'Stol 3' });
  const openTable = makeClosedOrder({ closedAt: `${DAY}T09:30:00.000Z`, total: 0, status: 'open' });
  const online = makeCustomerOrderAt({ createdAt: `${DAY}T10:00:00.000Z`, status: 'completed', total: 25000, fullName: 'Ali' });
  makeCustomerOrderAt({ createdAt: `${DAY}T10:30:00.000Z`, status: 'new', total: 99000 }); // kirmaydi
  const manual = makeManualBillAt({ createdAt: `${DAY}T11:00:00.000Z`, amount: 6000 });

  const base = await startApp(t, ADMIN, [['/reports', routers.reports()]]);
  const closed = await api(base, 'GET', `/reports/orders?from=${DAY}&to=${DAY}&status=closed`);
  const summary = (await api(base, 'GET', `/reports/summary?from=${DAY}&to=${DAY}`)).body;

  assert.strictEqual(closed.status, 200);
  assert.ok(Array.isArray(closed.body), 'javob hamon massiv');
  assert.deepStrictEqual(
    closed.body.map((o) => [o.kind, o.id]),
    [['manual', manual.id], ['online', online.id], ['table', table.id]],
    'eng yangisi birinchi, uchala manba'
  );
  assert.strictEqual(closed.body.length, summary.orders_count, "ro'yxat soni = summary soni");
  assert.strictEqual(
    closed.body.reduce((s, o) => s + o.total_amount, 0),
    summary.revenue,
    "ro'yxat yig'indisi = summary tushumi"
  );
  assert.strictEqual(closed.headers.get('x-total-count'), '3');

  const byKind = Object.fromEntries(closed.body.map((o) => [o.kind, o]));
  assert.strictEqual(byKind.table.label, 'Stol 3');
  assert.strictEqual(byKind.table.status, 'closed');
  assert.strictEqual(byKind.table.opened_by_name, 'Afitsiant Ali');
  assert.strictEqual(byKind.online.label, 'Onlayn: Ali');
  assert.strictEqual(byKind.online.status, 'completed');
  assert.strictEqual(byKind.manual.label, "Qo'lda chek");
  assert.strictEqual(byKind.manual.closed_by_name, 'Kassir Bek');
  for (const o of closed.body) {
    for (const key of ['id', 'kind', 'label', 'status', 'total_amount', 'opened_at', 'closed_at', 'opened_by_name', 'closed_by_name']) {
      assert.ok(key in o, `${o.kind}: '${key}' maydoni bor`);
    }
    assert.ok(!('sort_at' in o), 'ichki saralash ustuni chiqmaydi');
  }

  // Status berilmasa — stolning barcha holatlari + qolgan manbalar.
  const all = await api(base, 'GET', `/reports/orders?from=${DAY}&to=${DAY}`);
  assert.strictEqual(all.body.length, 4);
  assert.ok(all.body.some((o) => o.kind === 'table' && o.id === openTable.id));
  assert.strictEqual(all.headers.get('x-total-count'), '4');

  // status=open — faqat stol (landing/qo'lda chekda bunday holat yo'q).
  const open = await api(base, 'GET', `/reports/orders?from=${DAY}&to=${DAY}&status=open`);
  assert.deepStrictEqual(open.body.map((o) => [o.kind, o.id]), [['table', openTable.id]]);

  // Qo'lda chek cheki — alohida yo'l (id'lar jadvallar orasida takrorlanadi).
  const receipt = await api(base, 'GET', `/reports/manual-bills/${manual.id}/receipt`);
  assert.strictEqual(receipt.status, 200);
  assert.strictEqual(receipt.body.kind, 'manual');
  assert.strictEqual(receipt.body.total, 6000);
});

test("reports orders: 200 tada kesiladi, X-Total-Count cheklovsiz jami sonni beradi", async (t) => {
  const DAY = '2033-04-04';
  const user = h.createUser({ role: 'kassir' });
  const insert = h.db.prepare('INSERT INTO manual_bills (created_by, total_amount, created_at) VALUES (?, ?, ?)');
  h.db.transaction(() => {
    for (let i = 0; i < 203; i += 1) insert.run(user.id, 1000, `${DAY}T10:00:00.000Z`);
  })();
  makeClosedOrder({ closedAt: `${DAY}T11:00:00.000Z`, total: 5000 });

  const base = await startApp(t, ADMIN, [['/reports', routers.reports()]]);
  const res = await api(base, 'GET', `/reports/orders?from=${DAY}&to=${DAY}`);
  assert.strictEqual(res.body.length, 200);
  assert.strictEqual(res.headers.get('x-total-count'), '204');
  assert.strictEqual(res.body[0].kind, 'table', 'eng yangi (11:00) birinchi');
});

// ──────────────────────────────────────────────────────────────────────────
// A-06 — bronlar tartibi va filtrlari
// ──────────────────────────────────────────────────────────────────────────

test('bronlar: kelajakdagilar eng yaqinidan, keyin o\'tganlari kamayib; status/scope filtrlari', async (t) => {
  const ids = {
    past2: makeReservation({ date: shiftDays(-2), time: '12:00' }),
    far: makeReservation({ date: shiftDays(30), time: '12:00', status: 'confirmed' }),
    todayLate: makeReservation({ date: today(), time: '21:00' }),
    past1: makeReservation({ date: shiftDays(-1), time: '12:00', status: 'cancelled' }),
    tomorrow: makeReservation({ date: shiftDays(1), time: '09:00' }),
    todayEarly: makeReservation({ date: today(), time: '10:00', status: 'confirmed' }),
  };
  const mine = new Set(Object.values(ids));
  const base = await startApp(t, ADMIN, [['/reservations', routers.reservations()]]);
  const pick = async (qs = '') => (await api(base, 'GET', `/reservations${qs}`)).body.filter((r) => mine.has(r.id)).map((r) => r.id);

  assert.deepStrictEqual(await pick(), [
    ids.todayEarly, ids.todayLate, ids.tomorrow, ids.far, // kelajak: o'sib boruvchi
    ids.past1, ids.past2,                                // o'tgan: kamayib boruvchi
  ], 'standart (scope=all) — yangi tartib, hamma bron');
  assert.deepStrictEqual(await pick('?scope=upcoming'), [ids.todayEarly, ids.todayLate, ids.tomorrow, ids.far]);
  assert.deepStrictEqual(await pick('?scope=past'), [ids.past1, ids.past2]);
  assert.deepStrictEqual(await pick('?status=confirmed'), [ids.todayEarly, ids.far]);
  assert.deepStrictEqual(await pick('?status=new&scope=upcoming'), [ids.todayLate, ids.tomorrow]);
  assert.strictEqual((await pick('?status=hack&scope=hack')).length, 6, "noma'lum filtr e'tiborga olinmaydi");
});

// ──────────────────────────────────────────────────────────────────────────
// A-07 — mijoz buyurtmalari filtri
// ──────────────────────────────────────────────────────────────────────────

test('mijoz buyurtmalari: ?status=new|active|all filtri, standart all', async (t) => {
  const item = h.createMenuItem({ price: 1000 });
  const mk = (status) => h.createCustomerOrder({ status, items: [{ menuItemId: item.id, unitPrice: 1000, quantity: 1 }] }).id;
  const ids = { new: mk('new'), confirmed: mk('confirmed'), completed: mk('completed'), cancelled: mk('cancelled') };
  const mine = new Set(Object.values(ids));

  const base = await startApp(t, ADMIN, [['/customer-orders', routers.customerOrders()]]);
  const get = async (qs = '') => (await api(base, 'GET', `/customer-orders${qs}`)).body;
  const mineOf = (rows) => rows.filter((o) => mine.has(o.id)).map((o) => o.id).sort((a, b) => a - b);
  const sorted = (arr) => [...arr].sort((a, b) => a - b);

  const newRows = await get('?status=new');
  assert.ok(newRows.every((o) => o.status === 'new'));
  assert.deepStrictEqual(mineOf(newRows), [ids.new]);

  const activeRows = await get('?status=active');
  assert.ok(activeRows.every((o) => ['new', 'confirmed'].includes(o.status)));
  assert.deepStrictEqual(mineOf(activeRows), sorted([ids.new, ids.confirmed]));

  assert.deepStrictEqual(mineOf(await get()), sorted(Object.values(ids)), 'standart — hammasi');
  assert.deepStrictEqual(mineOf(await get('?status=all')), sorted(Object.values(ids)));
  assert.deepStrictEqual(mineOf(await get('?status=hack')), sorted(Object.values(ids)));
  assert.strictEqual(newRows.find((o) => o.id === ids.new).items.length, 1, 'items hamon biriktiriladi');

  // Bitta buyurtma (hisobotdagi kind='online' chekini ochish uchun).
  const one = await api(base, 'GET', `/customer-orders/${ids.completed}`);
  assert.strictEqual(one.status, 200);
  assert.strictEqual(one.body.id, ids.completed);
  assert.strictEqual(one.body.items.length, 1);
  assert.strictEqual((await api(base, 'GET', '/customer-orders/999999')).status, 404);
});

// ──────────────────────────────────────────────────────────────────────────
// A-09 — ombor tartibi
// ──────────────────────────────────────────────────────────────────────────

test("ombor: avval tugaganlar, keyin kam qolganlar, keyin alifbo; o'chirilganlar oxirida", async (t) => {
  const mk = (name, quantity, threshold = 0, isActive = 1) => {
    const it = h.createInventoryItem({ name, quantity, isActive });
    h.db.prepare('UPDATE inventory_items SET low_stock_threshold = ? WHERE id = ?').run(threshold, it.id);
    return it.id;
  };
  const ids = {
    okA: mk('A-ombor yetarli', 100, 5),
    lowB: mk('B-ombor kam', 3, 5),
    outZ: mk('Z-ombor tugagan', 0),
    okC: mk('C-ombor chegarasiz', 1, 0), // chegara 0 => ogohlantirish o'chiq
    lowA: mk('A-ombor kam', 5, 5),       // chegaraning o'zi ham "kam"
    inactive: mk('0-ombor ochirilgan', 0, 0, 0),
  };
  const mine = new Set(Object.values(ids));
  const base = await startApp(t, ADMIN, [['/inventory', routers.inventory()]]);
  const pick = async (qs = '') => (await api(base, 'GET', `/inventory/items${qs}`)).body.filter((i) => mine.has(i.id)).map((i) => i.id);

  assert.deepStrictEqual(await pick(), [ids.outZ, ids.lowA, ids.lowB, ids.okA, ids.okC]);
  assert.deepStrictEqual(await pick('?all=1'), [ids.outZ, ids.lowA, ids.lowB, ids.okA, ids.okC, ids.inactive]);
});

// ──────────────────────────────────────────────────────────────────────────
// A-12 — xarajatlar LIMIT 500 + sarlavhalar
// ──────────────────────────────────────────────────────────────────────────

test('xarajatlar: 500 tada kesiladi, X-Total-Count va X-Total-Amount cheklovsiz', async (t) => {
  const FROM = '2034-01-01';
  const TO = '2034-01-31';
  const insert = h.db.prepare('INSERT INTO expenses (amount, expense_date, note, category, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  let sum = 0;
  h.db.transaction(() => {
    for (let i = 0; i < 505; i += 1) {
      const amount = 1000 + i;
      sum += amount;
      insert.run(amount, `2034-01-${String((i % 28) + 1).padStart(2, '0')}`, 'test', null, null, h.nowIso());
    }
  })();
  insert.run(777, '2034-02-01', 'davrdan tashqari', null, null, h.nowIso());

  const base = await startApp(t, ADMIN, [['/expenses', routers.expenses()]]);
  const res = await api(base, 'GET', `/expenses?from=${FROM}&to=${TO}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.strictEqual(res.body.length, 500, 'LIMIT 500');
  assert.strictEqual(res.headers.get('x-total-count'), '505');
  assert.strictEqual(res.headers.get('x-total-amount'), String(sum), 'jami 500 lik kesishdan OLDIN hisoblanadi');
  assert.strictEqual(res.body[0].expense_date, '2034-01-28', 'eng yangisi birinchi');

  const all = await api(base, 'GET', '/expenses');
  assert.strictEqual(all.body.length, 500, 'from/to siz ham cheklangan');
  assert.ok(Number(all.headers.get('x-total-count')) >= 506);
});

// ──────────────────────────────────────────────────────────────────────────
// L-13 — mijozga do'stona ombor xabari (xodim xabari o'zgarmagan)
// ──────────────────────────────────────────────────────────────────────────

test("landing buyurtmasi: qoldiq yetmasa mijoz taom nomini va nima qilishni ko'radi", async (t) => {
  const base = await startApp(t, ADMIN, [['/public/orders', routers.publicOrders(), false]]);
  const order = (items) => api(base, 'POST', '/public/orders', {
    full_name: 'Aziz', phone: '998901234567', fulfillment: 'pickup', items,
  });

  const inv = h.createInventoryItem({ name: 'Kola ombor', quantity: 2 });
  const kola = h.createMenuItem({ name: 'Kola 0.5L', price: 8000, inventoryItemId: inv.id });
  const res = await order([{ menu_item_id: kola.id, quantity: 5 }]);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(
    res.body.error,
    '«Kola 0.5L» tugab qoldi (omborda 2 ta). Miqdorini kamaytiring yoki savatdan olib tashlang.'
  );
  assert.strictEqual(h.stockOf(inv.id), 2, "qoldiq tegilmagan");

  // Birlik "dona" bo'lmasa — o'sha birlik ko'rsatiladi.
  const invL = h.createInventoryItem({ name: 'Ayron ombor', quantity: 3, unit: 'litr' });
  const ayron = h.createMenuItem({ name: 'Ayron', price: 5000, inventoryItemId: invL.id });
  const resL = await order([{ menu_item_id: ayron.id, quantity: 4 }]);
  assert.match(resL.body.error, /^«Ayron» tugab qoldi \(omborda 3 litr\)/);

  // Qoldiq 0 — taom "mavjud emas" bo'lib qolgan: nomi baribir aytiladi.
  const soldOut = h.createMenuItem({ name: 'Somsa', price: 5000, isAvailable: 0 });
  const resOut = await order([{ menu_item_id: soldOut.id, quantity: 1 }]);
  assert.strictEqual(resOut.status, 400);
  assert.match(resOut.body.error, /«Somsa».*mavjud emas/);
});

test("xodim yo'li: inventory.consume() xabari O'ZGARMAGAN (ichki til saqlanadi)", () => {
  const inv = h.createInventoryItem({ name: 'Suv ombor', quantity: 2 });
  assert.throws(
    () => inventory.consume(inv.id, 5, { productName: 'Suv 1L' }),
    (err) => err.message === '"Suv 1L" omborda faqat 2 dona qoldi' && err.status === 400
  );
});

// ──────────────────────────────────────────────────────────────────────────
// L-16 — bron va buyurtma ALOHIDA rate-limit, har biri 15/daqiqa/IP
// ──────────────────────────────────────────────────────────────────────────

test('rate-limit: bron chelagi to\'lsa ham buyurtma ishlaydi; har biri 15/daqiqa', async (t) => {
  const base = await startRealApp(t);
  // Bo'sh tana — 400 (validatsiya), lekin limiter baribir sanaydi.
  for (let i = 0; i < 15; i += 1) {
    const r = await api(base, 'POST', '/api/public/reservations', {});
    assert.strictEqual(r.status, 400, `bron #${i + 1} limitga urilmasligi kerak`);
  }
  assert.strictEqual((await api(base, 'POST', '/api/public/reservations', {})).status, 429, '16-bron — 429');

  // Buyurtma chelagi alohida: bron to'lgani unga ta'sir qilmaydi.
  for (let i = 0; i < 15; i += 1) {
    const r = await api(base, 'POST', '/api/public/orders', {});
    assert.strictEqual(r.status, 400, `buyurtma #${i + 1} limitga urilmasligi kerak`);
  }
  assert.strictEqual((await api(base, 'POST', '/api/public/orders', {})).status, 429, '16-buyurtma — 429');
});
