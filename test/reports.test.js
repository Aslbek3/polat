// Admin hisobotlari (`server/routes/adminReports.js`) va kassir hisob-kitob
// bo'limi (`server/routes/kassirBilling.js` + `server/services/manualBills.js`)
// uchun testlar — 2026-09-10 auditi doirasida yozildi.
//
// Route'lar Express router bo'lgani uchun har bir test kichik Express ilova
// yasab, router'ni unga ulaydi, `req.user`ni soxta middleware bilan qo'yadi va
// `app.listen(0)` (bo'sh port) ustidan Node'ning o'rnatilgan `fetch`i bilan
// so'rov yuboradi — tashqi kutubxona (supertest) ishlatilmaydi.
//
// MUHIM: butun fayl bitta xotiradagi bazada ishlaydi (test/helpers.js), ya'ni
// testlar bir-birining yozuvlarini ko'radi. Shu sabab hisobot so'rovlari HAR
// DOIM o'ziga xos `from`/`to` sanasi bilan chaqiriladi va yozuvlar ham aynan
// shu sanaga qo'yiladi — testlar bir-biriga xalaqit bermaydi.
const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const express = require('express');

const h = require('./helpers');
const manualBills = require('../server/services/manualBills');
const adminReportsRouter = require('../server/routes/adminReports');
const kassirBillingRouter = require('../server/routes/kassirBilling');

// ──────────────────────────────────────────────────────────────────────────
// Route'ni ishga tushirish yordamchilari
// ──────────────────────────────────────────────────────────────────────────

// Router'ni vaqtinchalik serverga ulaydi, `fn(base)` ni chaqiradi va har qanday
// holatda (xato bo'lsa ham) serverni yopadi.
async function withRouter(router, user, fn) {
  const app = express();
  app.use(express.json());
  // Soxta autentifikatsiya: haqiqiy ilovada buni server/auth.js qo'yadi.
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use(router);

  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

// GET so'rov + JSON javob. `query` obyekti query-string'ga aylantiriladi.
async function getJson(base, path, query = {}) {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

const adminUser = () => ({ id: 1, role: 'admin' });

// ──────────────────────────────────────────────────────────────────────────
// Ma'lumot yaratish yordamchilari (sanani boshqarish uchun to'g'ridan-to'g'ri SQL)
// ──────────────────────────────────────────────────────────────────────────

// `services/orders.js` `closeTable()` har doim HOZIRGI vaqtni yozadi, hisobot
// testlariga esa aniq sana kerak — shu sabab yopilgan buyurtma shu yerda
// bevosita yoziladi.
function makeClosedOrder({ closedAt, items = [], userId, tableId, status = 'closed' }) {
  const uid = userId || h.createUser({ role: 'waiter' }).id;
  const tid = tableId || h.createTable().id;
  const openedAt = closedAt;
  const total = items
    .filter((it) => (it.status || 'active') === 'active')
    .reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

  const info = h.db
    .prepare(
      `INSERT INTO orders (table_id, status, opened_by, opened_at, closed_by, closed_at, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(tid, status, uid, openedAt, status === 'closed' ? uid : null, status === 'closed' ? closedAt : null, status === 'closed' ? total : null);
  const orderId = info.lastInsertRowid;

  // cost_price_snapshot — haqiqiy kod yo'li (services/orders.js
  // addItemToTable) sotuv paytidagi tan narxni shu ustunga yozadi, shuning
  // uchun test yordamchisi ham xuddi shunday qiladi: berilmasa taomning
  // O'SHA PAYTDAGI menu_items.cost_price qiymati olinadi (2026-09-10).
  const insertItem = h.db.prepare(
    `INSERT INTO order_items (order_id, menu_item_id, name_snapshot, unit_price, cost_price_snapshot, quantity, subtotal, added_by, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const menuCost = h.db.prepare('SELECT cost_price FROM menu_items WHERE id = ?');
  for (const it of items) {
    const costSnapshot = it.costPrice !== undefined
      ? it.costPrice
      : (menuCost.get(it.menuItemId)?.cost_price ?? null);
    insertItem.run(
      orderId, it.menuItemId, it.name || 'Taom', it.unitPrice, costSnapshot, it.quantity,
      it.unitPrice * it.quantity, uid, it.status || 'active', openedAt
    );
  }
  return { id: orderId, total };
}

// Mijoz (landing) buyurtmasi — `created_at` hisobot sanasi sifatida ishlatiladi.
function makeCustomerOrderAt({ createdAt, status = 'completed', items = [] }) {
  const order = h.createCustomerOrder({ status, items });
  h.db.prepare('UPDATE customer_orders SET created_at = ? WHERE id = ?').run(createdAt, order.id);
  return order;
}

function addExpense({ amount, date, userId }) {
  h.db
    .prepare('INSERT INTO expenses (amount, expense_date, note, category, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(amount, date, 'test', 'boshqa', userId || null, h.nowIso());
}

// Qo'lda hisob (kassir cheki) — haqiqiy xizmat qatlami orqali yaratiladi, keyin
// sanasi kerakli kunga ko'chiriladi.
function makeManualBillAt({ createdAt, items, userId }) {
  const receipt = manualBills.createManualBill(items, userId);
  const row = h.db.prepare('SELECT id FROM manual_bills ORDER BY id DESC LIMIT 1').get();
  h.db.prepare('UPDATE manual_bills SET created_at = ? WHERE id = ?').run(createdAt, row.id);
  return { id: row.id, total: receipt.total };
}

// ──────────────────────────────────────────────────────────────────────────
// GET /summary — daromad, xarajat, tan narx, sof foyda
// ──────────────────────────────────────────────────────────────────────────

test("summary: daromad yopilgan dine-in va bajarilgan mijoz buyurtmalaridan yig'iladi", async () => {
  const DAY = '2031-01-05';
  const item = h.createMenuItem({ price: 25000 });

  makeClosedOrder({ closedAt: `${DAY}T12:00:00.000Z`, items: [{ menuItemId: item.id, unitPrice: 25000, quantity: 2 }] });
  makeCustomerOrderAt({
    createdAt: `${DAY}T13:00:00.000Z`,
    status: 'completed',
    items: [{ menuItemId: item.id, unitPrice: 25000, quantity: 1 }],
  });
  // Quyidagi ikkitasi hisobga KIRMASLIGI kerak: hali yopilmagan stol va
  // bajarilmagan (yangi) mijoz buyurtmasi.
  makeClosedOrder({ closedAt: `${DAY}T14:00:00.000Z`, status: 'open', items: [{ menuItemId: item.id, unitPrice: 25000, quantity: 5 }] });
  makeCustomerOrderAt({
    createdAt: `${DAY}T15:00:00.000Z`,
    status: 'new',
    items: [{ menuItemId: item.id, unitPrice: 25000, quantity: 4 }],
  });

  const { body } = await withRouter(adminReportsRouter, adminUser(), (base) =>
    getJson(base, '/summary', { from: DAY, to: DAY })
  );

  assert.strictEqual(body.revenue, 75000, '50000 (dine-in) + 25000 (mijoz buyurtmasi)');
  assert.strictEqual(body.orders_count, 2, 'faqat yopilgan/bajarilgan buyurtmalar sanaladi');
});

test("summary: sof foyda = daromad − tan narx − xarajat", async () => {
  const DAY = '2031-02-10';
  const item = h.createMenuItem({ price: 10000, costPrice: 4000 });

  makeClosedOrder({ closedAt: `${DAY}T10:00:00.000Z`, items: [{ menuItemId: item.id, unitPrice: 10000, quantity: 2 }] });
  addExpense({ amount: 5000, date: DAY });

  const { body } = await withRouter(adminReportsRouter, adminUser(), (base) =>
    getJson(base, '/summary', { from: DAY, to: DAY })
  );

  assert.strictEqual(body.revenue, 20000);
  assert.strictEqual(body.cost_of_goods, 8000, '2 dona × 4000 tan narx');
  assert.strictEqual(body.expenses_total, 5000);
  assert.strictEqual(body.net, 20000 - 8000 - 5000);
});

test('summary: sana filtri oraliqdan tashqaridagi yozuvlarni hisobga olmaydi', async () => {
  const item = h.createMenuItem({ price: 10000, costPrice: 2000 });

  // Oraliq ichida
  makeClosedOrder({ closedAt: '2031-03-10T09:00:00.000Z', items: [{ menuItemId: item.id, unitPrice: 10000, quantity: 1 }] });
  addExpense({ amount: 1000, date: '2031-03-10' });
  // Oraliqdan oldin va keyin — kirmasligi kerak. Kun chegaralari BIZNES vaqti
  // (Toshkent, UTC+5, server/businessTime.js) bo'yicha: 18:59Z = 23:59
  // Toshkent, 19:01Z = ertasi kuni 00:01 Toshkent. (Ilgari bu yerda 23:59Z /
  // 00:01Z turardi — ya'ni test UTC kunini "to'g'ri" deb qotirgan edi.)
  makeClosedOrder({ closedAt: '2031-03-09T18:59:00.000Z', items: [{ menuItemId: item.id, unitPrice: 10000, quantity: 7 }] });
  makeClosedOrder({ closedAt: '2031-03-11T19:01:00.000Z', items: [{ menuItemId: item.id, unitPrice: 10000, quantity: 9 }] });
  addExpense({ amount: 99000, date: '2031-03-09' });
  addExpense({ amount: 88000, date: '2031-03-12' });

  const { body } = await withRouter(adminReportsRouter, adminUser(), (base) =>
    getJson(base, '/summary', { from: '2031-03-10', to: '2031-03-11' })
  );

  assert.strictEqual(body.revenue, 10000, 'faqat 10-mart buyurtmasi');
  assert.strictEqual(body.orders_count, 1);
  assert.strictEqual(body.expenses_total, 1000, 'faqat 10-mart xarajati');
  assert.strictEqual(body.cost_of_goods, 2000);
});

test('summary: chegara kunlari (from/to) hisobga kiradi', async () => {
  const item = h.createMenuItem({ price: 5000 });
  // Chegaralar Toshkent vaqtida: 1-aprel 00:00 = 31-mart 19:00Z,
  // 3-aprel 23:59:59 = 3-aprel 18:59:59Z (server/businessTime.js).
  makeClosedOrder({ closedAt: '2031-03-31T19:00:00.000Z', items: [{ menuItemId: item.id, unitPrice: 5000, quantity: 1 }] });
  makeClosedOrder({ closedAt: '2031-04-03T18:59:59.000Z', items: [{ menuItemId: item.id, unitPrice: 5000, quantity: 1 }] });

  const { body } = await withRouter(adminReportsRouter, adminUser(), (base) =>
    getJson(base, '/summary', { from: '2031-04-01', to: '2031-04-03' })
  );

  assert.strictEqual(body.orders_count, 2, "from va to kunlarining o'zi ham oraliqqa kiradi");
  assert.strictEqual(body.revenue, 10000);
});

test('summary: bekor qilingan buyurtma qatorlari tan narxga kirmaydi', async () => {
  const DAY = '2031-05-20';
  const item = h.createMenuItem({ price: 10000, costPrice: 3000 });

  makeClosedOrder({
    closedAt: `${DAY}T10:00:00.000Z`,
    items: [
      { menuItemId: item.id, unitPrice: 10000, quantity: 2, status: 'active' },
      { menuItemId: item.id, unitPrice: 10000, quantity: 5, status: 'cancelled' },
    ],
  });

  const { body } = await withRouter(adminReportsRouter, adminUser(), (base) =>
    getJson(base, '/summary', { from: DAY, to: DAY })
  );

  assert.strictEqual(body.revenue, 20000, 'bekor qilingan qator jamiga kirmaydi');
  assert.strictEqual(body.cost_of_goods, 6000, 'faqat 2 dona faol qator × 3000');
});

// ──────────────────────────────────────────────────────────────────────────
// GET /orders — buyurtmalar ro'yxati
// ──────────────────────────────────────────────────────────────────────────

test('orders: status filtri faqat mos holatdagi buyurtmalarni qaytaradi', async () => {
  const DAY = '2031-06-15';
  const item = h.createMenuItem({ price: 8000 });
  const closed = makeClosedOrder({ closedAt: `${DAY}T10:00:00.000Z`, items: [{ menuItemId: item.id, unitPrice: 8000, quantity: 1 }] });
  const open = makeClosedOrder({ closedAt: `${DAY}T11:00:00.000Z`, status: 'open', items: [{ menuItemId: item.id, unitPrice: 8000, quantity: 1 }] });

  const res = await withRouter(adminReportsRouter, adminUser(), async (base) => ({
    closed: await getJson(base, '/orders', { from: DAY, to: DAY, status: 'closed' }),
    open: await getJson(base, '/orders', { from: DAY, to: DAY, status: 'open' }),
    all: await getJson(base, '/orders', { from: DAY, to: DAY }),
  }));

  assert.deepStrictEqual(res.closed.body.map((o) => o.id), [closed.id]);
  assert.deepStrictEqual(res.open.body.map((o) => o.id), [open.id]);
  assert.strictEqual(res.all.body.length, 2, 'statussiz so\'rovda ikkalasi ham qaytadi');
  assert.strictEqual(res.closed.body[0].total_amount, 8000);
  assert.ok(res.closed.body[0].table_name, 'stol nomi qo\'shilib qaytadi');
});

test("orders: ro'yxat 200 tadan oshmaydi va eng yangisidan boshlanadi", async () => {
  const DAY = '2031-07-07';
  const item = h.createMenuItem({ price: 1000 });
  const user = h.createUser({ role: 'waiter' });
  const table = h.createTable();

  const ids = [];
  const insertMany = h.db.transaction(() => {
    for (let i = 0; i < 205; i += 1) {
      const created = makeClosedOrder({
        closedAt: `${DAY}T10:00:00.000Z`,
        items: [{ menuItemId: item.id, unitPrice: 1000, quantity: 1 }],
        userId: user.id,
        tableId: table.id,
      });
      ids.push(created.id);
    }
  });
  insertMany();

  const { body } = await withRouter(adminReportsRouter, adminUser(), (base) =>
    getJson(base, '/orders', { from: DAY, to: DAY })
  );

  assert.strictEqual(body.length, 200, 'LIMIT 200');
  assert.strictEqual(body[0].id, ids[ids.length - 1], 'ORDER BY id DESC — eng oxirgi buyurtma birinchi');
});

// ──────────────────────────────────────────────────────────────────────────
// manualBills.createManualBill — validatsiya va jami summa
// ──────────────────────────────────────────────────────────────────────────

test("qo'lda hisob: bo'sh ro'yxat rad etiladi", () => {
  const kassir = h.createUser({ role: 'kassir' });
  for (const bad of [[], null, undefined, 'salom', {}]) {
    assert.throws(() => manualBills.createManualBill(bad, kassir.id), /Kamida bitta/i, `qiymat: ${JSON.stringify(bad)}`);
  }
});

test("qo'lda hisob: 100 dan ko'p qator rad etiladi", () => {
  const kassir = h.createUser({ role: 'kassir' });
  const row = { name: 'Osh', unit_price: 1000, quantity: 1 };

  // 100 ta — ruxsat etiladi (chegaraning o'zi)
  const ok = manualBills.createManualBill(Array.from({ length: 100 }, () => ({ ...row })), kassir.id);
  assert.strictEqual(ok.items.length, 100);

  assert.throws(
    () => manualBills.createManualBill(Array.from({ length: 101 }, () => ({ ...row })), kassir.id),
    /100 qator/i
  );
});

test("qo'lda hisob: nomi bo'sh qator rad etiladi", () => {
  const kassir = h.createUser({ role: 'kassir' });
  for (const badName of ['', '   ', null, undefined]) {
    assert.throws(
      () => manualBills.createManualBill([{ name: badName, unit_price: 1000, quantity: 1 }], kassir.id),
      /nomi kiritilmagan/i,
      `nom: ${JSON.stringify(badName)}`
    );
  }
  assert.throws(
    () => manualBills.createManualBill([{ name: 'a'.repeat(201), unit_price: 1000, quantity: 1 }], kassir.id),
    /juda uzun/i
  );
});

test("qo'lda hisob: narx musbat son bo'lishi shart", () => {
  const kassir = h.createUser({ role: 'kassir' });
  for (const bad of [0, -100, 'abc', null, undefined, NaN, Infinity]) {
    assert.throws(
      () => manualBills.createManualBill([{ name: 'Osh', unit_price: bad, quantity: 1 }], kassir.id),
      /narx noto'g'ri/i,
      `narx: ${bad}`
    );
  }
});

test("qo'lda hisob: miqdor butun va musbat bo'lishi shart", () => {
  const kassir = h.createUser({ role: 'kassir' });
  for (const bad of [0, -1, 1.5, 'abc', null, undefined, NaN, Infinity]) {
    assert.throws(
      () => manualBills.createManualBill([{ name: 'Osh', unit_price: 1000, quantity: bad }], kassir.id),
      /miqdor noto'g'ri/i,
      `miqdor: ${bad}`
    );
  }
});

test("qo'lda hisob: jami summa serverda qayta hisoblanadi", () => {
  const kassir = h.createUser({ role: 'kassir', fullName: 'Kassir Aka' });
  const receipt = manualBills.createManualBill(
    [
      { name: 'Osh', unit_price: 25000, quantity: 3, subtotal: 1 /* mijoz yuborgan soxta qiymat — e'tiborga olinmaydi */ },
      { name: 'Non', unit_price: 2000, quantity: 4 },
    ],
    kassir.id
  );

  assert.strictEqual(receipt.kind, 'manual');
  assert.strictEqual(receipt.total, 25000 * 3 + 2000 * 4);
  assert.strictEqual(receipt.items[0].subtotal, 75000, "mijoz yuborgan subtotal'ga ishonilmaydi");
  assert.strictEqual(receipt.order.created_by_name, 'Kassir Aka');

  // Bazadagi yozuv ham xuddi shu jamini saqlagan bo'lishi kerak.
  const row = h.db.prepare('SELECT total_amount FROM manual_bills ORDER BY id DESC LIMIT 1').get();
  assert.strictEqual(row.total_amount, receipt.total);
});

test("qo'lda hisob: rad etilgan chek bazaga umuman yozilmaydi", () => {
  const kassir = h.createUser({ role: 'kassir' });
  const before = h.db.prepare('SELECT COUNT(*) AS c FROM manual_bills').get().c;
  assert.throws(() =>
    manualBills.createManualBill(
      [{ name: 'Osh', unit_price: 1000, quantity: 1 }, { name: '', unit_price: 1000, quantity: 1 }],
      kassir.id
    )
  );
  const after = h.db.prepare('SELECT COUNT(*) AS c FROM manual_bills').get().c;
  assert.strictEqual(after, before, 'validatsiya xatosidan keyin yangi chek qolmasligi kerak');
});

// ──────────────────────────────────────────────────────────────────────────
// GET /bills — kassir "Statistika" ro'yxati
// ──────────────────────────────────────────────────────────────────────────

test("bills: dine-in va qo'lda hisoblar birlashadi, sana bo'yicha kamayish tartibida", async () => {
  const DAY = '2031-08-08';
  const kassir = h.createUser({ role: 'kassir', fullName: 'Kassir Bek' });
  const item = h.createMenuItem({ price: 12000 });

  const dine = makeClosedOrder({ closedAt: `${DAY}T09:00:00.000Z`, items: [{ menuItemId: item.id, unitPrice: 12000, quantity: 1 }] });
  const manualEarly = makeManualBillAt({
    createdAt: `${DAY}T10:00:00.000Z`,
    items: [{ name: 'Choy', unit_price: 3000, quantity: 2 }],
    userId: kassir.id,
  });
  const manualLate = makeManualBillAt({
    createdAt: `${DAY}T11:00:00.000Z`,
    items: [{ name: 'Somsa', unit_price: 7000, quantity: 1 }],
    userId: kassir.id,
  });

  const { body } = await withRouter(kassirBillingRouter, { id: kassir.id, role: 'kassir' }, (base) =>
    getJson(base, '/bills', { from: DAY, to: DAY })
  );

  assert.strictEqual(body.count, 3, 'ikkala manba ham qo\'shiladi');
  assert.deepStrictEqual(
    body.bills.map((b) => [b.kind, b.id]),
    [['manual', manualLate.id], ['manual', manualEarly.id], ['table', dine.id]],
    "eng yangisi birinchi bo'lib chiqadi"
  );
  assert.strictEqual(body.bills[2].total_amount, 12000);
  assert.strictEqual(body.bills[0].by_name, 'Kassir Bek');
  assert.strictEqual(body.bills[0].label, "Qo'lda hisoblash");
  assert.strictEqual(body.total_amount, 12000 + 6000 + 7000);
});

test('bills: sana filtri oraliqdan tashqaridagi hisoblarni chiqarmaydi', async () => {
  const kassir = h.createUser({ role: 'kassir' });
  const item = h.createMenuItem({ price: 4000 });

  makeClosedOrder({ closedAt: '2031-09-02T10:00:00.000Z', items: [{ menuItemId: item.id, unitPrice: 4000, quantity: 1 }] });
  makeClosedOrder({ closedAt: '2031-09-05T10:00:00.000Z', items: [{ menuItemId: item.id, unitPrice: 4000, quantity: 1 }] });
  makeManualBillAt({ createdAt: '2031-09-02T11:00:00.000Z', items: [{ name: 'Choy', unit_price: 1000, quantity: 1 }], userId: kassir.id });
  makeManualBillAt({ createdAt: '2031-09-05T11:00:00.000Z', items: [{ name: 'Choy', unit_price: 1000, quantity: 1 }], userId: kassir.id });

  const { body } = await withRouter(kassirBillingRouter, { id: kassir.id, role: 'kassir' }, (base) =>
    getJson(base, '/bills', { from: '2031-09-02', to: '2031-09-02' })
  );

  assert.strictEqual(body.count, 2, 'faqat 2-sentabr hisoblari');
  assert.strictEqual(body.total_amount, 5000);
});

test("bills: ochiq (yopilmagan) buyurtma ro'yxatga tushmaydi", async () => {
  const DAY = '2031-10-01';
  const kassir = h.createUser({ role: 'kassir' });
  const item = h.createMenuItem({ price: 6000 });
  makeClosedOrder({ closedAt: `${DAY}T10:00:00.000Z`, status: 'open', items: [{ menuItemId: item.id, unitPrice: 6000, quantity: 1 }] });

  const { body } = await withRouter(kassirBillingRouter, { id: kassir.id, role: 'kassir' }, (base) =>
    getJson(base, '/bills', { from: DAY, to: DAY })
  );

  assert.strictEqual(body.count, 0);
  assert.strictEqual(body.total_amount, 0);
});

// ──────────────────────────────────────────────────────────────────────────
// AUDIT TOPILMALARI (2026-09-10) — quyidagi 3 ta test HOZIRCHA YIQILADI.
// Ular kodda haqiqatan mavjud xatolarni qayd etadi; tuzatilgach o'tishi kerak.
// ──────────────────────────────────────────────────────────────────────────

// ── AUDIT TOPILMASI: `kassirBilling.js` `/bills` — `total_amount` ro'yxat
// `slice(0, 300)` bilan QISQARTIRILGANDAN KEYIN hisoblanadi. Natijada kassir
// ko'rayotgan "jami tushum" ro'yxatning faqat eng yangi 300 qatorini qamraydi:
// oraliqda 300 dan ko'p hisob bo'lsa summa jimgina kam ko'rsatiladi. Jami
// summa qisqartirishdan OLDIN (yoki SQL'ning o'zida) hisoblanishi kerak.
test("bills: jami summa 300 qatorlik kesishdan oldin hisoblanishi kerak", async () => {
  const DAY = '2031-11-11';
  const kassir = h.createUser({ role: 'kassir' });

  // 305 ta qo'lda hisob — har biri turli summa va turli vaqt bilan
  // (tartib deterministik bo'lishi uchun).
  const COUNT = 305;
  let expectedTotal = 0;
  const insertBill = h.db.prepare('INSERT INTO manual_bills (created_by, total_amount, created_at) VALUES (?, ?, ?)');
  const insertItem = h.db.prepare(
    'INSERT INTO manual_bill_items (manual_bill_id, name, unit_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?)'
  );
  const seed = h.db.transaction(() => {
    for (let i = 0; i < COUNT; i += 1) {
      const amount = 1000 + i * 100;
      expectedTotal += amount;
      const minute = String(i % 60).padStart(2, '0');
      const hour = String(Math.floor(i / 60)).padStart(2, '0');
      const info = insertBill.run(kassir.id, amount, `${DAY}T${hour}:${minute}:00.000Z`);
      insertItem.run(info.lastInsertRowid, 'Osh', amount, 1, amount);
    }
  });
  seed();

  const { body } = await withRouter(kassirBillingRouter, { id: kassir.id, role: 'kassir' }, (base) =>
    getJson(base, '/bills', { from: DAY, to: DAY })
  );

  assert.strictEqual(body.bills.length, 300, "ro'yxatning o'zi 300 tagacha qisqaradi (bu to'g'ri)");
  assert.strictEqual(
    body.total_amount,
    expectedTotal,
    `jami summa oraliqdagi BARCHA ${COUNT} ta hisobni qamrashi kerak, faqat ko'rsatilgan 300 tasini emas`
  );
});

// ── AUDIT TOPILMASI: `adminReports.js` `/summary` — kassirning `manual_bills`
// cheklari daromadga UMUMAN qo'shilmaydi. Kassir "Hisoblash" bo'limi orqali
// chiqargan har bir chek admin hisobotida yo'qoladi, ya'ni real tushum
// kamaytirilib ko'rsatiladi (dine-in `orders` va `customer_orders` qo'shilgan,
// uchinchi manba esa unutilgan).
test("summary: qo'lda chiqarilgan kassir cheklari ham daromadga kirishi kerak", async () => {
  const DAY = '2031-12-12';
  const kassir = h.createUser({ role: 'kassir' });
  const item = h.createMenuItem({ price: 30000 });

  makeClosedOrder({ closedAt: `${DAY}T10:00:00.000Z`, items: [{ menuItemId: item.id, unitPrice: 30000, quantity: 1 }] });
  const manual = makeManualBillAt({
    createdAt: `${DAY}T11:00:00.000Z`,
    items: [{ name: 'Shashlik', unit_price: 15000, quantity: 3 }],
    userId: kassir.id,
  });
  assert.strictEqual(manual.total, 45000);

  const { body } = await withRouter(adminReportsRouter, adminUser(), (base) =>
    getJson(base, '/summary', { from: DAY, to: DAY })
  );

  assert.strictEqual(
    body.revenue,
    30000 + 45000,
    "daromad dine-in (30000) va qo'lda chek (45000) yig'indisi bo'lishi kerak"
  );
});

// ── AUDIT TOPILMASI: `adminReports.js` `/summary` COGS — tan narx
// `menu_items.cost_price` dan JONLI o'qiladi, sotuv paytidagi snapshot emas
// (`order_items`da `unit_price` bor, lekin `cost_price` yo'q). Shu sabab admin
// bugun menyudagi tan narxni yangilasa, O'TGAN OYLARNING allaqachon yopilgan
// hisobotlari ham qayta hisoblanib o'zgarib ketadi — tarixiy foyda
// ko'rsatkichlari beqaror bo'lib qoladi.
test("summary: o'tgan hisobotning tan narxi keyingi narx o'zgarishidan keyin ham o'zgarmasligi kerak", async () => {
  const DAY = '2032-01-15';
  const item = h.createMenuItem({ price: 20000, costPrice: 5000 });

  makeClosedOrder({ closedAt: `${DAY}T10:00:00.000Z`, items: [{ menuItemId: item.id, unitPrice: 20000, quantity: 2 }] });

  const before = await withRouter(adminReportsRouter, adminUser(), (base) =>
    getJson(base, '/summary', { from: DAY, to: DAY })
  );
  // Daromad = 2 dona × 20 000 = 40 000; tan narx = 2 × 5 000 = 10 000.
  const REVENUE = 40000;
  const COGS = 10000;
  assert.strictEqual(before.body.revenue, REVENUE);
  assert.strictEqual(before.body.cost_of_goods, COGS, '2 dona × 5000 — sotuv paytidagi tan narx');
  assert.strictEqual(before.body.net, REVENUE - COGS);

  // Buyurtma YOPILGANIDAN KEYIN taomning tan narxi o'zgardi (yetkazib beruvchi
  // narxni ko'tardi). Bu faqat KELAJAKDAGI sotuvlarga ta'sir qilishi kerak.
  h.db.prepare('UPDATE menu_items SET cost_price = ? WHERE id = ?').run(15000, item.id);

  const after = await withRouter(adminReportsRouter, adminUser(), (base) =>
    getJson(base, '/summary', { from: DAY, to: DAY })
  );

  assert.strictEqual(
    after.body.cost_of_goods,
    COGS,
    "o'tgan hisobotdagi tan narx (snapshot) menyu narxi o'zgargach ham o'zgarmasligi kerak"
  );
  assert.strictEqual(after.body.net, REVENUE - COGS, 'sof foyda ham o\'zgarmasligi kerak');
});
