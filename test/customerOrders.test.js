// Mijoz buyurtmasi (customer_orders) oqimi — ochiq landing endpointi, admin
// panelidagi holat o'zgartirish/o'chirish va oshpaz ekrani (2026-09-10
// auditida topilgan xatolar shu yerda qamrab olingan).
//
// Bu uchta route Express router'lari, shuning uchun `server/index.js`dagi
// `app` o'rniga (u auth talab qiladi va portni band qiladi) har testda
// kichkina app yasab, router'larni mount qilamiz va `req.user`ni soxta
// middleware bilan qo'yamiz. So'rovlar Node'ning o'rnatilgan `fetch`i bilan
// tasodifiy portga (app.listen(0)) yuboriladi — tashqi kutubxona yo'q.
const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const express = require('express');

const h = require('./helpers');

const ADMIN = { id: 1, username: 'admin', role: 'admin' };
const CHEF = { id: 2, username: 'oshpaz', role: 'chef' };

// Uchta router ham bitta appga mount qilinadi — bitta test ichida buyurtmani
// ochiq endpoint orqali yaratib (ombor haqiqatan sarflanadi), keyin admin yoki
// oshpaz sifatida holatini o'zgartirish uchun shu qulay.
async function startServer(t, user = ADMIN) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/api/public/orders', require('../server/routes/publicCustomerOrders'));
  app.use('/api/admin/customer-orders', require('../server/routes/adminCustomerOrders'));
  app.use('/api/chef', require('../server/routes/chefKitchen'));

  const server = app.listen(0);
  await once(server, 'listening');
  // Har testdan keyin serverni albatta yopamiz (test yiqilsa ham).
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
  return { status: res.status, body: json };
}

// Omborga bog'langan menyu taomi — mijoz buyurtmasi shu taomni olganda
// qoldiq kamayishi kerak.
function setupLinkedItem({ stock = 10, price = 12000 } = {}) {
  const inv = h.createInventoryItem({ quantity: stock });
  const item = h.createMenuItem({ price, inventoryItemId: inv.id });
  return { inv, item };
}

// To'g'ri (validatsiyadan o'tadigan) buyurtma tanasi — testda faqat kerakli
// maydonini almashtirib ishlatiladi.
function orderBody(overrides = {}) {
  return {
    full_name: 'Aziz',
    phone: '998901234567',
    fulfillment: 'pickup',
    items: [],
    ...overrides,
  };
}

const countOrders = () => h.db.prepare('SELECT COUNT(*) AS c FROM customer_orders').get().c;
const countNotifications = (orderId) =>
  h.db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE customer_order_id = ?').get(orderId).c;

// ─────────────────────────── Buyurtma yaratish ───────────────────────────

test("buyurtma yaratilganda bog'langan ombor qoldig'i kamayadi", async (t) => {
  const base = await startServer(t);
  const { inv, item } = setupLinkedItem({ stock: 10, price: 12000 });

  const res = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 3 }],
  }));

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.total_amount, 36000);
  assert.strictEqual(h.stockOf(inv.id), 7);
});

test("ombor qoldig'i yetmasa butun buyurtma rad etiladi", async (t) => {
  const base = await startServer(t);
  const before = countOrders();
  const ok = setupLinkedItem({ stock: 10 });      // bu bandga qoldiq yetadi
  const short = setupLinkedItem({ stock: 1 });    // bu bandda yetmaydi

  const res = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [
      { menu_item_id: ok.item.id, quantity: 1 },
      { menu_item_id: short.item.id, quantity: 5 },
    ],
  }));

  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /omborda/i);
  // Tranzaksiya to'liq qaytarilgani: birinchi bandning qoldig'i ham tegilmagan
  // va customer_orders qatori ham yaratilmagan bo'lishi kerak.
  assert.strictEqual(h.stockOf(ok.inv.id), 10, "birinchi bandning qoldig'i tegilmasligi kerak");
  assert.strictEqual(h.stockOf(short.inv.id), 1);
  assert.strictEqual(countOrders(), before, 'buyurtma qatori yaratilmasligi kerak');
});

test('narx serverda hisoblanadi — mijoz yuborgan narxga ishonilmaydi', async (t) => {
  const base = await startServer(t);
  const item = h.createMenuItem({ price: 20000 });

  const res = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 2, price: 1, unit_price: 1, subtotal: 2 }],
  }));

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total_amount, 40000, 'server narxi (20000) ishlatilishi kerak');
  const row = h.db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(res.body.id);
  assert.strictEqual(row.total_amount, 40000);
  const saved = h.db.prepare('SELECT * FROM customer_order_items WHERE customer_order_id = ?').all(res.body.id);
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].unit_price, 20000);
  assert.strictEqual(saved[0].subtotal, 40000);
});

test("o'chirilgan/mavjud bo'lmagan taomni buyurtma qilib bo'lmaydi", async (t) => {
  const base = await startServer(t);
  const before = countOrders();
  const item = h.createMenuItem({ price: 5000, isAvailable: 0 });

  const res = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 1 }],
  }));

  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /mavjud emas/i);
  assert.strictEqual(countOrders(), before);
});

// ───────────────────────────── Validatsiya ─────────────────────────────

test("ism bo'sh bo'lsa buyurtma qabul qilinmaydi", async (t) => {
  const base = await startServer(t);
  const item = h.createMenuItem();

  for (const bad of ['', '   ', null, undefined]) {
    const res = await api(base, 'POST', '/api/public/orders', orderBody({
      full_name: bad,
      items: [{ menu_item_id: item.id, quantity: 1 }],
    }));
    assert.strictEqual(res.status, 400, `qiymat: ${bad}`);
    assert.match(res.body.error, /Ismingizni kiriting/i);
  }
});

test("telefon raqami qisqa/noto'g'ri bo'lsa rad etiladi", async (t) => {
  const base = await startServer(t);
  const item = h.createMenuItem();

  for (const bad of ['', '12345', 'abcdefgh', null]) {
    const res = await api(base, 'POST', '/api/public/orders', orderBody({
      phone: bad,
      items: [{ menu_item_id: item.id, quantity: 1 }],
    }));
    assert.strictEqual(res.status, 400, `qiymat: ${bad}`);
    assert.match(res.body.error, /Telefon/i);
  }
});

test("savat bo'sh bo'lsa buyurtma qabul qilinmaydi", async (t) => {
  const base = await startServer(t);

  for (const bad of [[], null, undefined, 'salom']) {
    const res = await api(base, 'POST', '/api/public/orders', orderBody({ items: bad }));
    assert.strictEqual(res.status, 400, `qiymat: ${JSON.stringify(bad)}`);
    assert.match(res.body.error, /Savat bo'sh/i);
  }
});

test("miqdor butun, musbat va 50 dan katta bo'lmasligi shart", async (t) => {
  const base = await startServer(t);
  const item = h.createMenuItem();

  for (const bad of [0, -1, 1.5, 51, 1000, 'abc', null]) {
    const res = await api(base, 'POST', '/api/public/orders', orderBody({
      items: [{ menu_item_id: item.id, quantity: bad }],
    }));
    assert.strictEqual(res.status, 400, `qiymat: ${bad}`);
    assert.match(res.body.error, /Miqdorni to'g'ri kiriting/i);
  }
});

test('yetkazib berish (delivery) uchun manzil majburiy', async (t) => {
  const base = await startServer(t);
  const item = h.createMenuItem();
  const before = countOrders();

  const res = await api(base, 'POST', '/api/public/orders', orderBody({
    fulfillment: 'delivery',
    address: '   ',
    items: [{ menu_item_id: item.id, quantity: 1 }],
  }));

  assert.strictEqual(res.status, 400);
  assert.match(res.body.error, /manzil/i);
  assert.strictEqual(countOrders(), before);

  // Olib ketish (pickup) uchun esa manzil talab qilinmaydi.
  const ok = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 1 }],
  }));
  assert.strictEqual(ok.status, 200);
});

// ─────────────────────────── Bildirishnomalar ───────────────────────────

test("'delivery' buyurtmada bildirishnoma yaratiladi, 'pickup' da yaratilmaydi", async (t) => {
  const base = await startServer(t);
  const item = h.createMenuItem({ price: 15000 });

  const delivery = await api(base, 'POST', '/api/public/orders', orderBody({
    fulfillment: 'delivery',
    address: 'Toshkent, Chilonzor 5',
    items: [{ menu_item_id: item.id, quantity: 1 }],
  }));
  assert.strictEqual(delivery.status, 200);
  assert.strictEqual(countNotifications(delivery.body.id), 1);

  const pickup = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 1 }],
  }));
  assert.strictEqual(pickup.status, 200);
  assert.strictEqual(countNotifications(pickup.body.id), 0);
});

// ───────────────────── Admin: holat o'zgartirish/o'chirish ─────────────────────

test("admin 'new' -> 'cancelled' qilsa ombor qaytariladi", async (t) => {
  const base = await startServer(t);
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const created = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 2 }],
  }));
  assert.strictEqual(h.stockOf(inv.id), 8);

  const res = await api(base, 'PUT', `/api/admin/customer-orders/${created.body.id}`, { status: 'cancelled' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'cancelled');
  assert.strictEqual(h.stockOf(inv.id), 10);
});

test("admin 'cancelled' -> 'new' qilsa ombor qayta sarflanadi", async (t) => {
  const base = await startServer(t);
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const created = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 2 }],
  }));
  await api(base, 'PUT', `/api/admin/customer-orders/${created.body.id}`, { status: 'cancelled' });
  assert.strictEqual(h.stockOf(inv.id), 10);

  const res = await api(base, 'PUT', `/api/admin/customer-orders/${created.body.id}`, { status: 'new' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'new');
  assert.strictEqual(h.stockOf(inv.id), 8, 'qayta faollashtirilganda qoldiq yana yechilishi kerak');
});

test("noto'g'ri holat nomi rad etiladi va mavjud bo'lmagan buyurtma 404 beradi", async (t) => {
  const base = await startServer(t);
  const order = h.createCustomerOrder({ status: 'new' });

  const bad = await api(base, 'PUT', `/api/admin/customer-orders/${order.id}`, { status: 'tayyorlanmoqda' });
  assert.strictEqual(bad.status, 400);
  assert.match(bad.body.error, /Holatni/i);

  const missing = await api(base, 'PUT', '/api/admin/customer-orders/999999', { status: 'cancelled' });
  assert.strictEqual(missing.status, 404);
  assert.match(missing.body.error, /topilmadi/i);
});

// ── AUDIT TOPILMASI: OMBORGA BOG'LANGAN BUYURTMANI UMUMAN O'CHIRIB BO'LMAYDI —
// `inventory_movements.customer_order_item_id` `customer_order_items(id)` ga
// FOREIGN KEY bilan bog'langan (`server/schema.sql`, ON DELETE qoidasi yo'q),
// PRAGMA foreign_keys esa ON. Shu sabab DELETE handleri avval 'return' harakati
// yozadi, keyin `DELETE FROM customer_order_items` qiladi va SQLite "FOREIGN KEY
// constraint failed" otadi — admin 500 oladi, buyurtma o'chmaydi. Bu ombor
// mahsulotiga bog'langan HAR QANDAY mijoz buyurtmasiga tegishli.
test("admin bekor qilinmagan buyurtmani o'chirsa ombor qaytariladi", async (t) => {
  const base = await startServer(t);
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const created = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 4 }],
  }));
  assert.strictEqual(h.stockOf(inv.id), 6);

  const res = await api(base, 'DELETE', `/api/admin/customer-orders/${created.body.id}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(h.stockOf(inv.id), 10);
  const row = h.db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(created.body.id);
  assert.strictEqual(row, undefined, "buyurtma bazadan o'chirilishi kerak");
  const items = h.db.prepare('SELECT COUNT(*) AS c FROM customer_order_items WHERE customer_order_id = ?').get(created.body.id);
  assert.strictEqual(items.c, 0, "buyurtma bandlari ham o'chirilishi kerak");
});

test("allaqachon bekor qilingan buyurtmani o'chirish omborni ikki marta qaytarmaydi", async (t) => {
  const base = await startServer(t);
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const created = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 3 }],
  }));
  await api(base, 'PUT', `/api/admin/customer-orders/${created.body.id}`, { status: 'cancelled' });
  assert.strictEqual(h.stockOf(inv.id), 10);

  // DIQQAT: bu yerda javob kodi ataylab tekshirilmaydi — yuqoridagi audit
  // topilmasi (FOREIGN KEY) sababli DELETE hozir 500 qaytaradi. Bu test faqat
  // bitta narsani qo'riqlaydi: bekor qilingan buyurtma o'chirilganda ombor
  // IKKINCHI marta qaytarilib, qoldiq shishib ketmasligi kerak.
  await api(base, 'DELETE', `/api/admin/customer-orders/${created.body.id}`);
  assert.strictEqual(h.stockOf(inv.id), 10, 'qoldiq 10 dan oshib ketmasligi kerak');
});

// ── AUDIT TOPILMASI: HOLAT SIKLI OMBORNI YEYDI — 'cancelled' -> 'completed'
// ombordan QAYTA sarflaydi, lekin 'completed' -> 'cancelled' qaytarmaydi
// (tayyorlangan taom sarflangan hisoblanadi — bu ataylab qilingan qoida).
// Ikkovi BIRGA ishlaganda `cancelled -> completed -> cancelled -> completed`
// sikli har aylanishda qoldiqni yana bir marta yeydi.
test("cancelled/completed sikli ombor qoldig'ini faqat bir marta kamaytirishi kerak", async (t) => {
  const base = await startServer(t);
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const created = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 2 }],
  }));
  const id = created.body.id;
  assert.strictEqual(h.stockOf(inv.id), 8);

  const setStatus = (status) => api(base, 'PUT', `/api/admin/customer-orders/${id}`, { status });

  await setStatus('cancelled');
  assert.strictEqual(h.stockOf(inv.id), 10, 'bekor qilinganda qoldiq qaytadi');

  // Siklni ikki marta aylantiramiz: cancelled -> completed -> cancelled -> completed
  await setStatus('completed');
  await setStatus('cancelled');
  await setStatus('completed');

  assert.strictEqual(
    h.stockOf(inv.id),
    8,
    'sikl necha marta aylansa ham qoldiq faqat bir marta (2 dona) kamayishi kerak'
  );
});

// ───────────────────────────── Oshpaz ekrani ─────────────────────────────

test("oshpaz faqat 'confirmed'/'completed' holatiga o'tkaza oladi", async (t) => {
  const base = await startServer(t, CHEF);
  const order = h.createCustomerOrder({ status: 'new' });

  const bad = await api(base, 'PUT', `/api/chef/orders/${order.id}/status`, { status: 'cancelled' });
  assert.strictEqual(bad.status, 400);
  assert.match(bad.body.error, /tasdiqlash/i);

  const ok = await api(base, 'PUT', `/api/chef/orders/${order.id}/status`, { status: 'confirmed' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.status, 'confirmed');

  const missing = await api(base, 'PUT', '/api/chef/orders/999999/status', { status: 'confirmed' });
  assert.strictEqual(missing.status, 404);
});

test("oshpaz ro'yxatida faqat 'new'/'confirmed' buyurtmalar ko'rinadi", async (t) => {
  const base = await startServer(t, CHEF);
  const item = h.createMenuItem({ price: 9000 });
  const created = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 1 }],
  }));
  const done = h.createCustomerOrder({ status: 'completed' });
  const cancelled = h.createCustomerOrder({ status: 'cancelled' });

  const res = await api(base, 'GET', '/api/chef/orders');
  assert.strictEqual(res.status, 200);
  const ids = res.body.map((o) => o.id);
  assert.ok(ids.includes(created.body.id), "yangi buyurtma ro'yxatda bo'lishi kerak");
  assert.ok(!ids.includes(done.id), "'completed' ko'rinmasligi kerak");
  assert.ok(!ids.includes(cancelled.id), "'cancelled' ko'rinmasligi kerak");
});

// ── AUDIT TOPILMASI: OSHPAZ OMBOR MANTIG'INI CHETLAB O'TADI — chefKitchen.js
// dagi `PUT /orders/:id/status` to'g'ridan-to'g'ri `UPDATE customer_orders SET
// status` qiladi, hech qanday ombor amali yo'q. Natijada bekor qilingan (ombor
// qaytarilgan) buyurtmani oshpaz qayta faollashtirsa, qoldiq qayta yechilmaydi
// — ombor haqiqatdan ko'p ko'rsatiladi.
test('oshpaz bekor qilingan buyurtmani qayta faollashtirsa ombor qayta sarflanishi kerak', async (t) => {
  const base = await startServer(t, CHEF);
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const created = await api(base, 'POST', '/api/public/orders', orderBody({
    items: [{ menu_item_id: item.id, quantity: 3 }],
  }));
  const id = created.body.id;
  assert.strictEqual(h.stockOf(inv.id), 7);

  // Admin bekor qiladi — ombor qaytadi.
  await api(base, 'PUT', `/api/admin/customer-orders/${id}`, { status: 'cancelled' });
  assert.strictEqual(h.stockOf(inv.id), 10);

  // Oshpaz uni qaytadan 'confirmed' ga o'tkazadi — bu ham buyurtmani qayta
  // faollashtirish, demak ombor yana yechilishi kerak (admin route'i xuddi
  // shunday qiladi).
  const res = await api(base, 'PUT', `/api/chef/orders/${id}/status`, { status: 'confirmed' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'confirmed');
  assert.strictEqual(h.stockOf(inv.id), 7, 'qayta faollashtirilgach qoldiq yana kamayishi kerak');
});
