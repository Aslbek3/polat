// Admin menyu boshqaruvi (`server/routes/adminMenu.js`) — kategoriyalar,
// taomlar, "turi" (variant, parent_item_id) ierarxiyasi, ombor bilan bog'lanish
// va o'chirish (soft/hard) mantig'i uchun testlar. 2026-09-10 auditi doirasida
// yozildi.
//
// Naqsh `test/reports.test.js` bilan bir xil: router kichik Express ilovaga
// ulanadi, `req.user` soxta middleware bilan qo'yiladi, `app.listen(0)` ustidan
// Node'ning o'rnatilgan `fetch`i bilan so'rov yuboriladi — tashqi kutubxona
// (supertest) ishlatilmaydi.
//
// MUHIM: butun fayl bitta xotiradagi bazada ishlaydi (test/helpers.js), ya'ni
// testlar bir-birining yozuvlarini ko'radi. Shu sabab hech qayerda "ro'yxatning
// uzunligi = N" deb tekshirilmaydi — har doim aynan shu testda yaratilgan
// yozuvning ID'si bo'yicha qidiriladi.
const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const express = require('express');

const h = require('./helpers');
const adminMenuRouter = require('../server/routes/adminMenu');
const inventory = require('../server/services/inventory');

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

// Admin menyu router'i uchun qisqartma — har testda o'z serveri ochiladi va yopiladi.
const menuApi = (fn) => withRouter(adminMenuRouter, { id: 1, role: 'admin' }, fn);

// Ixtiyoriy metod + JSON tana. Tana berilmasa umuman yuborilmaydi (Express
// `req.body`ni bo'sh obyekt qiladi — "maydon berilmagan" holatini sinash uchun).
async function send(base, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function getJson(base, path, query = {}) {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

const itemById = (id) => h.db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
const categoryById = (id) => h.db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(id);

// Ichki (afitsiant) buyurtmasida ishlatilgan taom — DELETE'ning soft-delete
// yo'lini sinash uchun. `services/orders.js` ni chetlab o'tib bevosita yoziladi
// (bu yerda faqat "shu taom buyurtma tarixida bor" fakti muhim).
function useItemInDineInOrder(menuItemId) {
  const user = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const ts = h.nowIso();
  const info = h.db
    .prepare('INSERT INTO orders (table_id, status, opened_by, opened_at) VALUES (?, ?, ?, ?)')
    .run(table.id, 'open', user.id, ts);
  h.db
    .prepare(
      `INSERT INTO order_items (order_id, menu_item_id, name_snapshot, unit_price, quantity, subtotal, added_by, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`
    )
    .run(info.lastInsertRowid, menuItemId, 'Taom', 10000, 1, 10000, user.id, ts);
}

// ══════════════════════════════════════════════════════════════════════════
// KATEGORIYALAR
// ══════════════════════════════════════════════════════════════════════════

test('kategoriya yaratish: nom majburiy, bo\'sh/probel qiymat rad etiladi', async () => {
  const res = await menuApi(async (base) => ({
    empty: await send(base, 'POST', '/categories', { name: '' }),
    spaces: await send(base, 'POST', '/categories', { name: '   ' }),
    missing: await send(base, 'POST', '/categories', {}),
    noBody: await send(base, 'POST', '/categories'),
  }));

  for (const [label, r] of Object.entries(res)) {
    assert.strictEqual(r.status, 400, `holat: ${label}`);
    assert.match(r.body.error, /Nom kiritilishi shart/i, `holat: ${label}`);
  }
});

test('kategoriya yaratish: nom trim qilinadi, standart qiymatlar to\'g\'ri', async () => {
  const { body, status } = await menuApi((base) =>
    send(base, 'POST', '/categories', { name: '  Salatlar  ' })
  );

  assert.strictEqual(status, 200);
  assert.strictEqual(body.name, 'Salatlar', 'bosh/oxirgi probellar olib tashlanadi');
  assert.strictEqual(body.is_active, 1, 'yangi kategoriya faol yaratiladi');
  assert.strictEqual(body.sort_order, 0, 'sort_order berilmasa 0');
  assert.strictEqual(body.require_inventory_link, 0, 'standart holatda ombor majburiy emas');
});

test('kategoriya yaratish: sort_order va require_inventory_link saqlanadi', async () => {
  const { body } = await menuApi((base) =>
    send(base, 'POST', '/categories', { name: 'Ichimliklar', sort_order: 7, require_inventory_link: true })
  );

  assert.strictEqual(body.sort_order, 7);
  assert.strictEqual(body.require_inventory_link, 1);
});

test('kategoriya tahrirlash: faqat yuborilgan maydon o\'zgaradi (qisman yangilash)', async () => {
  const cat = h.createCategory({ name: 'Eski nom', requireInventoryLink: 1 });
  h.db.prepare('UPDATE menu_categories SET sort_order = 5 WHERE id = ?').run(cat.id);

  const { body } = await menuApi((base) => send(base, 'PUT', `/categories/${cat.id}`, { name: 'Yangi nom' }));

  assert.strictEqual(body.name, 'Yangi nom');
  assert.strictEqual(body.sort_order, 5, 'yuborilmagan sort_order eski qiymatida qoladi');
  assert.strictEqual(body.require_inventory_link, 1, 'yuborilmagan bayroq eski qiymatida qoladi');
  assert.strictEqual(body.is_active, 1);
});

test('kategoriya tahrirlash: o\'chirilgan kategoriyani qayta tiklash mumkin', async () => {
  const cat = h.createCategory({ isActive: 0 });

  const { body } = await menuApi((base) => send(base, 'PUT', `/categories/${cat.id}`, { is_active: true }));

  assert.strictEqual(body.is_active, 1, "♻️ Tiklash yo'li ishlashi kerak");
});

test('kategoriya tahrirlash/o\'chirish: mavjud bo\'lmagan ID uchun 404', async () => {
  const res = await menuApi(async (base) => ({
    put: await send(base, 'PUT', '/categories/999999', { name: 'X' }),
    del: await send(base, 'DELETE', '/categories/999999'),
  }));

  assert.strictEqual(res.put.status, 404);
  assert.strictEqual(res.del.status, 404);
  assert.match(res.del.body.error, /Kategoriya topilmadi/i);
});

test('kategoriya o\'chirish: taomi yo\'q bo\'lsa bazadan butunlay o\'chiriladi', async () => {
  const cat = h.createCategory();

  const { status, body } = await menuApi((base) => send(base, 'DELETE', `/categories/${cat.id}`));

  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body, { ok: true });
  assert.strictEqual(categoryById(cat.id), undefined, 'qator butunlay yo\'qolishi kerak (hard-delete)');
});

test('kategoriya o\'chirish: taomi bo\'lsa faqat is_active=0 qilinadi (soft-delete)', async () => {
  const cat = h.createCategory();
  h.createMenuItem({ categoryId: cat.id });

  await menuApi((base) => send(base, 'DELETE', `/categories/${cat.id}`));

  const row = categoryById(cat.id);
  assert.ok(row, 'buyurtma tarixi buzilmasligi uchun qator saqlanib qolishi kerak');
  assert.strictEqual(row.is_active, 0);
});

test('kategoriya o\'chirish: allaqachon o\'chirilgan taomi bo\'lsa ham soft-delete', async () => {
  const cat = h.createCategory();
  h.createMenuItem({ categoryId: cat.id, isActive: 0 });

  await menuApi((base) => send(base, 'DELETE', `/categories/${cat.id}`));

  const row = categoryById(cat.id);
  assert.ok(row, "is_active=0 taom ham buyurtma tarixiga bog'liq bo'lishi mumkin — hard-delete qilinmaydi");
  assert.strictEqual(row.is_active, 0);
});

test('kategoriyalar ro\'yxati: standart holatda faqat faollar, ?include_inactive=1 bilan hammasi', async () => {
  const active = h.createCategory();
  const removed = h.createCategory({ isActive: 0 });

  const res = await menuApi(async (base) => ({
    def: await getJson(base, '/categories'),
    all: await getJson(base, '/categories', { include_inactive: '1' }),
  }));

  const ids = (r) => r.body.map((c) => c.id);
  assert.ok(ids(res.def).includes(active.id), 'faol kategoriya standart ro\'yxatda bo\'ladi');
  assert.ok(!ids(res.def).includes(removed.id), 'o\'chirilgan kategoriya standart ro\'yxatda ko\'rinmaydi');
  assert.ok(ids(res.all).includes(removed.id), 'include_inactive=1 bilan o\'chirilgani ham qaytadi');
  assert.ok(ids(res.all).includes(active.id));
});

// ══════════════════════════════════════════════════════════════════════════
// TAOMLAR — validatsiya
// ══════════════════════════════════════════════════════════════════════════

test('taom yaratish: nom majburiy', async () => {
  const cat = h.createCategory();
  const res = await menuApi(async (base) => ({
    empty: await send(base, 'POST', '/items', { category_id: cat.id, name: '', price: 1000 }),
    spaces: await send(base, 'POST', '/items', { category_id: cat.id, name: '   ', price: 1000 }),
    missing: await send(base, 'POST', '/items', { category_id: cat.id, price: 1000 }),
  }));

  for (const [label, r] of Object.entries(res)) {
    assert.strictEqual(r.status, 400, `holat: ${label}`);
    assert.match(r.body.error, /Nom kiritilishi shart/i, `holat: ${label}`);
  }
});

test("taom yaratish: narx manfiy yoki son bo'lmasa rad etiladi", async () => {
  const cat = h.createCategory();
  const res = await menuApi(async (base) => {
    const out = {};
    for (const bad of [-1, -10000, 'abc', '12 000', undefined, {}]) {
      out[String(bad)] = await send(base, 'POST', '/items', { category_id: cat.id, name: 'Osh', price: bad });
    }
    return out;
  });

  for (const [label, r] of Object.entries(res)) {
    assert.strictEqual(r.status, 400, `narx: ${label}`);
    assert.match(r.body.error, /Narx noto'g'ri/i, `narx: ${label}`);
  }
});

test('taom yaratish: narx 0 ga ruxsat beriladi (masalan aksiya/qo\'shimcha)', async () => {
  const cat = h.createCategory();
  const { status, body } = await menuApi((base) =>
    send(base, 'POST', '/items', { category_id: cat.id, name: 'Non', price: 0 })
  );

  assert.strictEqual(status, 200);
  assert.strictEqual(body.price, 0);
});

// DIQQAT (xato emas, hozirgi xulqni qayd etish): `Number(null)` va `Number('')`
// — ikkalasi ham 0. Ya'ni narx maydonini bo'sh yuborish taomni jimgina 0 so'mlik
// qilib yaratadi. Manfiy narx rad etiladi, 0 esa ataylab ruxsat etilgan
// (aksiya/qo'shimcha uchun), shu sabab bu YIQILADIGAN test emas — lekin
// `services/inventory.js` MENU_PRICE_ERROR mantig'i (ombordan keladigan 0 narx
// mijozga tekin taom bo'lib tushadi) bu yo'lga qo'llanmagani nomuvofiqlik.
test("taom yaratish: bo'sh/null narx jimgina 0 ga aylanadi (hozirgi xulq)", async () => {
  const cat = h.createCategory();
  const res = await menuApi(async (base) => ({
    nullPrice: await send(base, 'POST', '/items', { category_id: cat.id, name: 'Non', price: null }),
    emptyPrice: await send(base, 'POST', '/items', { category_id: cat.id, name: 'Non', price: '' }),
  }));

  assert.strictEqual(res.nullPrice.status, 200);
  assert.strictEqual(res.nullPrice.body.price, 0);
  assert.strictEqual(res.emptyPrice.status, 200);
  assert.strictEqual(res.emptyPrice.body.price, 0);
});

test('taom yaratish: kategoriya tanlanmagan yoki mavjud emas', async () => {
  const res = await menuApi(async (base) => ({
    missing: await send(base, 'POST', '/items', { name: 'Osh', price: 1000 }),
    notFound: await send(base, 'POST', '/items', { category_id: 999999, name: 'Osh', price: 1000 }),
  }));

  assert.strictEqual(res.missing.status, 400);
  assert.match(res.missing.body.error, /Kategoriya tanlanmagan/i);
  assert.strictEqual(res.notFound.status, 404);
  assert.match(res.notFound.body.error, /Kategoriya topilmadi/i);
});

test('taom yaratish: matn maydonlari trim qilinadi, bo\'sh bo\'lsa NULL bo\'ladi', async () => {
  const cat = h.createCategory();
  const { body } = await menuApi((base) =>
    send(base, 'POST', '/items', {
      category_id: cat.id,
      name: '  Lag\'mon  ',
      price: 25400.6,
      description: '  Qo\'l lag\'moni  ',
      image_url: '',
      volume: '  0.5 l  ',
      sort_order: 3,
    })
  );

  assert.strictEqual(body.name, "Lag'mon");
  assert.strictEqual(body.price, 25401, 'narx butun songa yaxlitlanadi');
  assert.strictEqual(body.description, "Qo'l lag'moni");
  assert.strictEqual(body.image_url, null, 'rasm ixtiyoriy — bo\'sh qatorda NULL bo\'ladi');
  assert.strictEqual(body.volume, '0.5 l');
  assert.strictEqual(body.sort_order, 3);
  assert.strictEqual(body.is_available, 1, 'ombor bilan bog\'lanmagan taom darhol mavjud');
  assert.strictEqual(body.is_active, 1);
  assert.strictEqual(body.cost_price, null, 'tan narx ixtiyoriy');
});

test("taom yaratish: tan narx manfiy bo'lsa rad etiladi", async () => {
  const cat = h.createCategory();
  const { status, body } = await menuApi((base) =>
    send(base, 'POST', '/items', { category_id: cat.id, name: 'Osh', price: 1000, cost_price: -5 })
  );

  assert.strictEqual(status, 400);
  assert.match(body.error, /Tan narx noto'g'ri/i);
});

test('taom tahrirlash: qisman yangilash, yuborilmagan maydonlar saqlanadi', async () => {
  const cat = h.createCategory();
  const item = h.createMenuItem({ categoryId: cat.id, name: 'Eski', price: 12000, costPrice: 4000 });

  const { body } = await menuApi((base) => send(base, 'PUT', `/items/${item.id}`, { name: 'Yangi' }));

  assert.strictEqual(body.name, 'Yangi');
  assert.strictEqual(body.price, 12000, 'narx yuborilmagani uchun o\'zgarmaydi');
  assert.strictEqual(body.cost_price, 4000);
  assert.strictEqual(body.category_id, cat.id);
});

test("taom tahrirlash: manfiy narx rad etiladi, mavjud bo'lmagan taom 404", async () => {
  const item = h.createMenuItem({ price: 9000 });
  const res = await menuApi(async (base) => ({
    negative: await send(base, 'PUT', `/items/${item.id}`, { price: -1 }),
    nan: await send(base, 'PUT', `/items/${item.id}`, { price: 'abc' }),
    missing: await send(base, 'PUT', '/items/999999', { name: 'X' }),
  }));

  assert.strictEqual(res.negative.status, 400);
  assert.match(res.negative.body.error, /Narx noto'g'ri/i);
  assert.strictEqual(res.nan.status, 400);
  assert.strictEqual(res.missing.status, 404);
  assert.match(res.missing.body.error, /Taom topilmadi/i);
  assert.strictEqual(itemById(item.id).price, 9000, 'rad etilgan so\'rov bazani o\'zgartirmaydi');
});

test("taom tahrirlash: mavjud bo'lmagan kategoriyaga ko'chirib bo'lmaydi", async () => {
  const item = h.createMenuItem();
  const { status, body } = await menuApi((base) =>
    send(base, 'PUT', `/items/${item.id}`, { category_id: 999999 })
  );

  assert.strictEqual(status, 404);
  assert.match(body.error, /Kategoriya topilmadi/i);
});

test("taomlar ro'yxati: category_id filtri va ?include_inactive=1", async () => {
  const cat = h.createCategory();
  const other = h.createCategory();
  const active = h.createMenuItem({ categoryId: cat.id });
  const removed = h.createMenuItem({ categoryId: cat.id, isActive: 0 });
  const foreign = h.createMenuItem({ categoryId: other.id });

  const res = await menuApi(async (base) => ({
    def: await getJson(base, '/items', { category_id: cat.id }),
    all: await getJson(base, '/items', { category_id: cat.id, include_inactive: '1' }),
  }));

  const ids = (r) => r.body.map((i) => i.id);
  assert.deepStrictEqual(ids(res.def), [active.id], 'faqat shu bo\'limning faol taomi');
  assert.ok(!ids(res.def).includes(foreign.id), 'boshqa bo\'lim taomi filtrga tushmaydi');
  assert.deepStrictEqual(ids(res.all).sort(), [active.id, removed.id].sort());
});

// ══════════════════════════════════════════════════════════════════════════
// VARIANTLAR ("turi", parent_item_id) — ikki bosqichli ierarxiya taqiqlangan
// ══════════════════════════════════════════════════════════════════════════

test("variant yaratish: kategoriya ota taomdan olinadi, yuborilgani e'tiborga olinmaydi", async () => {
  const catA = h.createCategory();
  const catB = h.createCategory();
  const parent = h.createMenuItem({ categoryId: catA.id, name: 'Osh' });

  const { status, body } = await menuApi((base) =>
    send(base, 'POST', '/items', {
      category_id: catB.id, // ataylab boshqa bo'lim — server buni e'tiborsiz qoldirishi kerak
      name: "To'y oshi",
      price: 30000,
      parent_item_id: parent.id,
    })
  );

  assert.strictEqual(status, 200);
  assert.strictEqual(body.parent_item_id, parent.id);
  assert.strictEqual(body.category_id, catA.id, 'variant har doim ota taomning bo\'limida bo\'ladi');
});

test("variant yaratish: variantning varianti bo'lmaydi (ikki bosqich taqiqlangan)", async () => {
  const parent = h.createMenuItem({ name: 'Osh' });
  const variant = h.createMenuItem({ categoryId: parent.category_id, parentItemId: parent.id });

  const { status, body } = await menuApi((base) =>
    send(base, 'POST', '/items', { name: 'Nabira', price: 1000, parent_item_id: variant.id })
  );

  assert.strictEqual(status, 400);
  assert.match(body.error, /o'zi biror taomning turi/i);
});

test("variant yaratish: ota taom mavjud emas yoki o'chirilgan bo'lsa 404", async () => {
  const removed = h.createMenuItem({ isActive: 0 });
  const res = await menuApi(async (base) => ({
    missing: await send(base, 'POST', '/items', { name: 'X', price: 1000, parent_item_id: 999999 }),
    inactive: await send(base, 'POST', '/items', { name: 'X', price: 1000, parent_item_id: removed.id }),
    bad: await send(base, 'POST', '/items', { name: 'X', price: 1000, parent_item_id: 'abc' }),
  }));

  assert.strictEqual(res.missing.status, 404);
  assert.match(res.missing.body.error, /Ota taom topilmadi/i);
  assert.strictEqual(res.inactive.status, 404, "o'chirilgan taomga tur qo'shib bo'lmaydi");
  assert.strictEqual(res.bad.status, 400);
  assert.match(res.bad.body.error, /Ota taom noto'g'ri/i);
});

test("variant: taom o'zini o'ziga ota qilib bog'lay olmaydi", async () => {
  const item = h.createMenuItem();

  const { status, body } = await menuApi((base) =>
    send(base, 'PUT', `/items/${item.id}`, { parent_item_id: item.id })
  );

  assert.strictEqual(status, 400);
  assert.match(body.error, /o'zini o'ziga tur qilib/i);
  assert.strictEqual(itemById(item.id).parent_item_id, null);
});

test("variant: turlari bor taomni boshqa taomning turiga aylantirib bo'lmaydi", async () => {
  const parent = h.createMenuItem({ name: 'Osh' });
  h.createMenuItem({ categoryId: parent.category_id, parentItemId: parent.id });
  const other = h.createMenuItem({ name: 'Manti' });

  const { status, body } = await menuApi((base) =>
    send(base, 'PUT', `/items/${parent.id}`, { parent_item_id: other.id })
  );

  assert.strictEqual(status, 400);
  assert.match(body.error, /o'zi turlarga ega/i);
  assert.strictEqual(itemById(parent.id).parent_item_id, null);
});

test("variant: o'chirilgan turi bor taomni esa turga aylantirish mumkin (faqat faol turlar hisobga olinadi)", async () => {
  const parent = h.createMenuItem({ name: 'Osh' });
  h.createMenuItem({ categoryId: parent.category_id, parentItemId: parent.id, isActive: 0 });
  const other = h.createMenuItem({ name: 'Manti' });

  const { status, body } = await menuApi((base) =>
    send(base, 'PUT', `/items/${parent.id}`, { parent_item_id: other.id })
  );

  assert.strictEqual(status, 200, 'hasActiveChildren faqat is_active=1 turlarni sanaydi');
  assert.strictEqual(body.parent_item_id, other.id);
});

test('variant: oddiy taomni turga aylantirganda kategoriya ota taomnikiga o\'tadi', async () => {
  const catA = h.createCategory();
  const catB = h.createCategory();
  const parent = h.createMenuItem({ categoryId: catA.id });
  const item = h.createMenuItem({ categoryId: catB.id });

  const { body } = await menuApi((base) =>
    send(base, 'PUT', `/items/${item.id}`, { parent_item_id: parent.id })
  );

  assert.strictEqual(body.category_id, catA.id);
  assert.strictEqual(body.parent_item_id, parent.id);
});

test('variant: parent_item_id=null yuborilsa oddiy taomga aylanadi', async () => {
  const parent = h.createMenuItem();
  const variant = h.createMenuItem({ categoryId: parent.category_id, parentItemId: parent.id });

  const { body } = await menuApi((base) =>
    send(base, 'PUT', `/items/${variant.id}`, { parent_item_id: null })
  );

  assert.strictEqual(body.parent_item_id, null);
  assert.strictEqual(body.category_id, parent.category_id, 'bog\'lanish uzilganda kategoriya o\'z holicha qoladi');
});

test("variant: turlari bor taomni o'chirib bo'lmaydi", async () => {
  const parent = h.createMenuItem();
  const variant = h.createMenuItem({ categoryId: parent.category_id, parentItemId: parent.id });

  const { status, body } = await menuApi((base) => send(base, 'DELETE', `/items/${parent.id}`));

  assert.strictEqual(status, 400);
  assert.match(body.error, /Avval bu taomning turlarini o'chiring/i);
  assert.ok(itemById(parent.id), 'ota taom joyida qolishi kerak');
  assert.ok(itemById(variant.id));
});

test("variant: turi o'chirilgandan keyin ota taomni o'chirish mumkin", async () => {
  const parent = h.createMenuItem();
  const variant = h.createMenuItem({ categoryId: parent.category_id, parentItemId: parent.id });

  const res = await menuApi(async (base) => ({
    variant: await send(base, 'DELETE', `/items/${variant.id}`),
    parent: await send(base, 'DELETE', `/items/${parent.id}`),
  }));

  assert.strictEqual(res.variant.status, 200);
  assert.strictEqual(res.parent.status, 200);
  assert.strictEqual(itemById(parent.id), undefined);
  assert.strictEqual(itemById(variant.id), undefined);
});

// ══════════════════════════════════════════════════════════════════════════
// OMBOR BILAN BOG'LANISH
// ══════════════════════════════════════════════════════════════════════════

test("ombor: require_inventory_link bo'limi bog'lanmagan taomni qabul qilmaydi", async () => {
  const cat = h.createCategory({ requireInventoryLink: 1 });

  const { status, body } = await menuApi((base) =>
    send(base, 'POST', '/items', { category_id: cat.id, name: 'Kola', price: 9000 })
  );

  assert.strictEqual(status, 400);
  assert.match(body.error, /faqat ombor bilan bog'langan taomlarni qabul qiladi/i);
});

test("ombor: bog'langan taomning narxi, tan narxi va mavjudligi ombordan olinadi", async () => {
  const cat = h.createCategory();
  const inv = h.createInventoryItem({ quantity: 0, salePrice: 12000, costPrice: 7000 });

  const { body } = await menuApi((base) =>
    send(base, 'POST', '/items', {
      category_id: cat.id,
      name: 'Suv 1L',
      price: 1, // ataylab noto'g'ri — server ombordagi narxni olishi kerak
      cost_price: 2,
      inventory_item_id: inv.id,
    })
  );

  assert.strictEqual(body.price, 12000, "yuborilgan narxga ishonilmaydi — yagona manba ombor");
  assert.strictEqual(body.cost_price, 7000);
  assert.strictEqual(body.is_available, 0, 'qoldiq 0 — taom darhol "tugadi" holatida');
  assert.strictEqual(body.inventory_item_id, inv.id);
  assert.strictEqual(body.inventory_quantity, 0, 'LEFT JOIN orqali ombor ma\'lumoti ham qaytadi');
});

test("ombor: sotuv narxi 0 bo'lgan mahsulotga bog'lab bo'lmaydi", async () => {
  const cat = h.createCategory();
  const inv = h.createInventoryItem({ salePrice: 0 });

  const { status, body } = await menuApi((base) =>
    send(base, 'POST', '/items', { category_id: cat.id, name: 'Choy', price: 5000, inventory_item_id: inv.id })
  );

  assert.strictEqual(status, 400);
  assert.strictEqual(body.error, inventory.MENU_PRICE_ERROR, 'taom mijozga tekinga tushib qolmasligi kerak');
});

test("ombor: o'chirilgan (is_active=0) mahsulotga bog'lab bo'lmaydi", async () => {
  const cat = h.createCategory();
  const inv = h.createInventoryItem({ isActive: 0 });

  const res = await menuApi(async (base) => ({
    removed: await send(base, 'POST', '/items', { category_id: cat.id, name: 'X', price: 1000, inventory_item_id: inv.id }),
    missing: await send(base, 'POST', '/items', { category_id: cat.id, name: 'X', price: 1000, inventory_item_id: 999999 }),
    bad: await send(base, 'POST', '/items', { category_id: cat.id, name: 'X', price: 1000, inventory_item_id: 'abc' }),
  }));

  assert.strictEqual(res.removed.status, 404);
  assert.match(res.removed.body.error, /Ombor mahsuloti topilmadi/i);
  assert.strictEqual(res.missing.status, 404);
  assert.strictEqual(res.bad.status, 400);
  assert.match(res.bad.body.error, /Ombor mahsuloti noto'g'ri/i);
});

test("ombor: tahrirlashda narx har doim JORIY ombor qiymatidan yangilanadi", async () => {
  const inv = h.createInventoryItem({ quantity: 5, salePrice: 5000, costPrice: 3000 });
  const item = h.createMenuItem({ inventoryItemId: inv.id, price: 5000 });
  // Ombordagi narx boshqa yo'l bilan o'zgardi — taomni oddiy tahrirlash uni
  // ham yangilashi kerak.
  h.db.prepare('UPDATE inventory_items SET sale_price = 9000, cost_price = 6000 WHERE id = ?').run(inv.id);

  const { body } = await menuApi((base) => send(base, 'PUT', `/items/${item.id}`, { name: 'Suv', price: 111 }));

  assert.strictEqual(body.price, 9000, 'qo\'lda yuborilgan 111 e\'tiborga olinmaydi');
  assert.strictEqual(body.cost_price, 6000);
});

test("ombor: require_inventory_link bo'limida bog'lanishni uzib bo'lmaydi", async () => {
  const cat = h.createCategory({ requireInventoryLink: 1 });
  const inv = h.createInventoryItem({ salePrice: 4000 });
  const item = h.createMenuItem({ categoryId: cat.id, inventoryItemId: inv.id, price: 4000 });

  const { status, body } = await menuApi((base) =>
    send(base, 'PUT', `/items/${item.id}`, { inventory_item_id: null })
  );

  assert.strictEqual(status, 400);
  assert.match(body.error, /faqat ombor bilan bog'langan taomlarni qabul qiladi/i);
  assert.strictEqual(itemById(item.id).inventory_item_id, inv.id);
});

test("ombor: eski bog'lanmagan taomni require_inventory_link bo'limida tahrirlash bloklanmaydi", async () => {
  // Bunday holat qoida qo'shilishidan oldin yaratilgan yoki ombor mahsuloti
  // o'chirilib avtomatik "uzilgan" taomlarda uchraydi — nomini o'zgartirish
  // yoki tiklash imkoni yo'qolmasligi kerak.
  const cat = h.createCategory({ requireInventoryLink: 1 });
  const item = h.createMenuItem({ categoryId: cat.id, isActive: 0 });

  const { status, body } = await menuApi((base) =>
    send(base, 'PUT', `/items/${item.id}`, { name: 'Tiklandi', is_active: true })
  );

  assert.strictEqual(status, 200);
  assert.strictEqual(body.is_active, 1);
  assert.strictEqual(body.name, 'Tiklandi');
});

test("mavjudlik: bog'langan taom uchun qo'lda o'zgartirish rad etiladi", async () => {
  const inv = h.createInventoryItem({ quantity: 3, salePrice: 4000 });
  const item = h.createMenuItem({ inventoryItemId: inv.id, isAvailable: 1 });

  const { status, body } = await menuApi((base) =>
    send(base, 'PATCH', `/items/${item.id}/availability`, { is_available: false })
  );

  assert.strictEqual(status, 400);
  assert.match(body.error, /omborga bog'langan/i);
  assert.strictEqual(itemById(item.id).is_available, 1, 'qiymat o\'zgarmasligi kerak');
});

test("mavjudlik: bog'lanmagan taom uchun ishlaydi, mavjud bo'lmagan taom 404", async () => {
  const item = h.createMenuItem({ isAvailable: 1 });

  const res = await menuApi(async (base) => ({
    off: await send(base, 'PATCH', `/items/${item.id}/availability`, { is_available: false }),
    on: await send(base, 'PATCH', `/items/${item.id}/availability`, { is_available: true }),
    missing: await send(base, 'PATCH', '/items/999999/availability', { is_available: true }),
  }));

  assert.strictEqual(res.off.body.is_available, 0);
  assert.strictEqual(res.on.body.is_available, 1);
  assert.strictEqual(res.missing.status, 404);
});

// ══════════════════════════════════════════════════════════════════════════
// TAOMNI O'CHIRISH — soft/hard
// ══════════════════════════════════════════════════════════════════════════

test("taom o'chirish: hech qayerda ishlatilmagan bo'lsa bazadan butunlay o'chiriladi", async () => {
  const item = h.createMenuItem();

  const { status, body } = await menuApi((base) => send(base, 'DELETE', `/items/${item.id}`));

  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body, { ok: true });
  assert.strictEqual(itemById(item.id), undefined);
});

test("taom o'chirish: mijoz buyurtmasida ishlatilgan bo'lsa faqat is_active=0", async () => {
  const item = h.createMenuItem({ price: 15000 });
  h.createCustomerOrder({ items: [{ menuItemId: item.id, unitPrice: 15000, quantity: 2 }] });

  await menuApi((base) => send(base, 'DELETE', `/items/${item.id}`));

  const row = itemById(item.id);
  assert.ok(row, 'chek/hisobot FK bilan bog\'liq — qator saqlanadi');
  assert.strictEqual(row.is_active, 0);
});

test("taom o'chirish: afitsiant buyurtmasida ishlatilgan bo'lsa ham soft-delete", async () => {
  const item = h.createMenuItem({ price: 10000 });
  useItemInDineInOrder(item.id);

  await menuApi((base) => send(base, 'DELETE', `/items/${item.id}`));

  const row = itemById(item.id);
  assert.ok(row);
  assert.strictEqual(row.is_active, 0);
});

test("taom o'chirish: soft-delete'dan keyin ro'yxatda ko'rinmaydi, include_inactive bilan ko'rinadi", async () => {
  const cat = h.createCategory();
  const item = h.createMenuItem({ categoryId: cat.id, price: 10000 });
  h.createCustomerOrder({ items: [{ menuItemId: item.id, unitPrice: 10000, quantity: 1 }] });

  const res = await menuApi(async (base) => {
    await send(base, 'DELETE', `/items/${item.id}`);
    return {
      def: await getJson(base, '/items', { category_id: cat.id }),
      all: await getJson(base, '/items', { category_id: cat.id, include_inactive: '1' }),
    };
  });

  assert.deepStrictEqual(res.def.body.map((i) => i.id), []);
  assert.deepStrictEqual(res.all.body.map((i) => i.id), [item.id], "♻️ Tiklash uchun ko'rinishi shart");
});

test("taom o'chirish: mavjud bo'lmagan ID uchun 404", async () => {
  const { status, body } = await menuApi((base) => send(base, 'DELETE', '/items/999999'));

  assert.strictEqual(status, 404);
  assert.match(body.error, /Taom topilmadi/i);
});

// ══════════════════════════════════════════════════════════════════════════
// AUDIT TOPILMALARI (2026-09-10) — quyidagi testlar HOZIRCHA YIQILADI.
// Ular kodda haqiqatan mavjud xatolarni qayd etadi; tuzatilgach o'tishi kerak.
// ══════════════════════════════════════════════════════════════════════════

// ── AUDIT TOPILMASI: `PUT /items/:id` — ota taomning kategoriyasi
// o'zgartirilsa, uning VARIANTLARINING `category_id` si eski qiymatda qolib
// ketadi. Kod o'zi e'lon qilgan qoida ("Variant har doim ota taom bilan bir xil
// kategoriyada bo'ladi", resolveParentItemId izohi) shu yo'lda buziladi:
// yangilanish faqat AYNI so'rovda `parent_item_id` yuborilganda amalga oshadi,
// ota taomning kategoriyasi o'zgarganda esa hech kim variantlarni ko'chirmaydi.
//
// AMALDAGI OQIBATI (kodni o'qib tekshirildi):
//   1. Mijoz/afitsiant/kassir menyusi (publicMenu.js, waiterMenu.js,
//      kassirMenu.js) variantlarni FAQAT `parent_item_id` bo'yicha oladi
//      (`variantsStmt` kategoriya bo'yicha filtrlamaydi), shu sabab variant
//      baribir ota taomi ostida, YANGI kategoriyada ko'rinadi — ro'yxat
//      ko'rinishida buzilish sezilmaydi.
//   2. LEKIN o'sha renderlarda `require_inventory_link` filtri variantga endi
//      YANGI kategoriya qoidasi bilan qo'llanadi, taomning o'z `category_id`si
//      esa eskisini ko'rsatib turadi — ikki manba bir-biriga zid.
//   3. `GET /admin/menu/items?category_id=<yangi>` variantni qaytarmaydi
//      (u hamon eski bo'limda), `DELETE /categories/<eski>` esa "taomi bor" deb
//      hisoblab, ko'rinmas variant tufayli bo'limni hard-delete o'rniga
//      soft-delete qiladi.
// Ya'ni bu haqiqiy ma'lumot nomuvofiqligi (renderda darhol ko'rinmasa ham).
test("variant: ota taom bo'limga ko'chirilsa turlari ham o'sha bo'limga ko'chishi kerak", async () => {
  const catA = h.createCategory({ name: 'Issiq taomlar' });
  const catB = h.createCategory({ name: 'Milliy taomlar' });
  const parent = h.createMenuItem({ categoryId: catA.id, name: 'Osh' });
  const variant = h.createMenuItem({ categoryId: catA.id, parentItemId: parent.id, name: "To'y oshi" });

  const { status } = await menuApi((base) =>
    send(base, 'PUT', `/items/${parent.id}`, { category_id: catB.id })
  );
  assert.strictEqual(status, 200);
  assert.strictEqual(itemById(parent.id).category_id, catB.id, 'ota taom ko\'chdi');

  assert.strictEqual(
    itemById(variant.id).category_id,
    catB.id,
    "variant ota taom bilan bir xil bo'limda qolishi kerak (hozir eski bo'limda qolib ketadi)"
  );
});

// ── AUDIT TOPILMASI: `PUT /items/:id` — VARIANTNING o'ziga `category_id`
// yuborilsa (`parent_item_id` yuborilmasa), u ota taomidan boshqa bo'limga
// ko'chib ketadi. Yuqoridagi topilma bilan bir xil ildiz: kategoriya/ota
// muvofiqligi faqat `parent_item_id` shu so'rovda kelganda ta'minlanadi.
// Kutilgan xulq — variantning kategoriyasi hech qachon mustaqil o'zgarmasligi
// (yoki so'rov 400 bilan rad etilishi) kerak.
test("variant: variantning kategoriyasini mustaqil o'zgartirib bo'lmasligi kerak", async () => {
  const catA = h.createCategory();
  const catB = h.createCategory();
  const parent = h.createMenuItem({ categoryId: catA.id });
  const variant = h.createMenuItem({ categoryId: catA.id, parentItemId: parent.id });

  await menuApi((base) => send(base, 'PUT', `/items/${variant.id}`, { category_id: catB.id }));

  assert.strictEqual(
    itemById(variant.id).category_id,
    catA.id,
    "variant ota taomining bo'limida qolishi kerak edi"
  );
});

// ── AUDIT TOPILMASI: `PUT /categories/:id` va `PUT /items/:id` nomni UMUMAN
// tekshirmaydi — `POST` bo'sh nomni 400 bilan rad etadi, `PUT` esa xuddi shu
// qiymatni bemalol saqlaydi (`String(req.body.name).trim()` natijasi bo'sh
// qator bo'lsa ham). Natijada menyuda nomsiz bo'lim/taom paydo bo'ladi: mijoz
// menyusida bo'sh tugma, chekda esa bo'sh `name_snapshot`.
test("tahrirlash: bo'sh nom yaratishda ham, tahrirlashda ham rad etilishi kerak", async () => {
  const cat = h.createCategory({ name: 'Salatlar' });
  const item = h.createMenuItem({ categoryId: cat.id, name: 'Achichuk' });

  const res = await menuApi(async (base) => ({
    category: await send(base, 'PUT', `/categories/${cat.id}`, { name: '   ' }),
    item: await send(base, 'PUT', `/items/${item.id}`, { name: '' }),
  }));

  assert.strictEqual(res.category.status, 400, "bo'sh bo'lim nomi rad etilishi kerak");
  assert.strictEqual(res.item.status, 400, "bo'sh taom nomi rad etilishi kerak");
  assert.strictEqual(categoryById(cat.id).name, 'Salatlar');
  assert.strictEqual(itemById(item.id).name, 'Achichuk');
});

// ── AUDIT TOPILMASI: `DELETE /items/:id` — o'chirishni bloklaydigan tekshiruv
// (`hasActiveChildren`) faqat FAOL turlarni sanaydi. Agar taomning turlari
// avval soft-delete qilingan bo'lsa (is_active=0), ota taom bemalol HARD-delete
// qilinadi va o'sha turlar mavjud bo'lmagan `parent_item_id` ga ishora qilib
// qolib ketadi ("yetim" qator — `parent_item_id` FK emas, schema.sql'da
// aytilgan). Admin keyin o'sha turni "♻️ Tiklash" bilan qaytarsa, u hech
// qanday menyuda ko'rinmaydi: `publicMenu/waiterMenu/kassirMenu` asosiy
// ro'yxatga faqat `parent_item_id IS NULL` taomlarni oladi, `variants` esa
// endi mavjud bo'lmagan ota orqali hech qachon so'ralmaydi — bu aynan kod
// izohi oldini olmoqchi bo'lgan holat. Ota o'chirilganda turlarning
// `parent_item_id` si NULL ga tushirilishi (yoki ular ham o'chirilishi) kerak.
test("taom o'chirish: ota taom o'chganda o'chirilgan turlari yetim bo'lib qolmasligi kerak", async () => {
  const parent = h.createMenuItem({ name: 'Osh' });
  const variant = h.createMenuItem({
    categoryId: parent.category_id,
    parentItemId: parent.id,
    name: "Qovurma osh",
    isActive: 0,
  });

  const { status } = await menuApi((base) => send(base, 'DELETE', `/items/${parent.id}`));
  assert.strictEqual(status, 200);
  assert.strictEqual(itemById(parent.id), undefined, 'ota taom hard-delete qilindi');

  const row = itemById(variant.id);
  assert.ok(row, 'tur qatori bazada qoldi');
  assert.strictEqual(
    row.parent_item_id,
    null,
    "mavjud bo'lmagan ota taomga ishora qolmasligi kerak (tiklangan tur hech qayerda ko'rinmay qoladi)"
  );
});
