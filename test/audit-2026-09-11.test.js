// 2026-09-11 chuqur tahlilida topilgan mantiqiy xatolar — har biri avval
// alohida skript bilan TASDIQLANGAN, keyin tuzatilgan:
//   1. Oshxonaga yuborilgan qatorga miqdor qo'shilsa, oshpaz buni ko'rmasdi
//      (olib ketilgan qator oshxona ekranidan umuman yo'qolardi).
//   2. Oshxona FIFO tartibi tayyor, lekin olib ketilmagan taomni ham
//      "kutayotgan" deb hisoblardi.
//   3. Yuborilmagan taomli stolni kassir (va API) yopa olardi — X-14 qoidasi
//      faqat afitsiant ekranida edi.
//   4. Yetkazib berish sozlamalari (o'chirilgan / minimal summa) faqat
//      landing brauzerida tekshirilardi; yetkazish narxi saqlanmasdi.
//   5. O'tgan kungi tasdiqlanmagan bron bosh sahifada abadiy sanalardi.
const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const express = require('express');

const h = require('./helpers');
const orders = require('../server/services/orders');
const kitchen = require('../server/services/kitchen');
const customerOrders = require('../server/services/customerOrders');
const reservations = require('../server/services/reservations');
const settings = require('../server/services/settings');
const dashboard = require('../server/services/dashboard');

// ─────────────────────────────── yordamchilar ───────────────────────────────

async function withRouter(router, user, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = user; next(); });
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function post(base, path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json() };
}

function rowsOf(tableId) {
  return orders.getOpenOrderForTable(tableId).items;
}

// ─────────────── 1. Yuborilgan qatorga miqdor qo'shish ───────────────

test('1: yuborilgan qatorga miqdor qo\'shilsa — qo\'shimcha alohida YUBORILMAGAN qator', () => {
  const w = h.createUser();
  const t = h.createTable();
  const osh = h.createMenuItem({ name: 'Osh', price: 30000, costPrice: 12000 });

  const v = orders.addItemToTable(t.id, osh.id, 2, w.id);
  const sentRow = v.items[0].id;
  orders.sendPendingItems(t.id);

  const after = orders.updateOrderItemQuantity(sentRow, 5, w.id);
  const original = after.items.find((it) => it.id === sentRow);
  const extra = after.items.find((it) => it.id !== sentRow);

  assert.strictEqual(original.quantity, 2, 'yuborilgan qator o\'zgarmaydi');
  assert.ok(original.sent_at);
  assert.strictEqual(extra.quantity, 3);
  assert.strictEqual(extra.sent_at, null, 'qo\'shimcha oshxonaga alohida yuboriladi');
  assert.strictEqual(extra.unit_price, 30000);
  assert.strictEqual(extra.cost_price_snapshot, 12000);
  assert.strictEqual(after.total, 5 * 30000, 'hisob umumiy miqdor bo\'yicha');
});

test("1: olib ketilgan (picked_up) qatorga qo'shilgan miqdor yuborilgach oshpazga KO'RINADI", () => {
  const w = h.createUser();
  const t = h.createTable();
  const osh = h.createMenuItem({ price: 30000 });

  const v = orders.addItemToTable(t.id, osh.id, 2, w.id);
  const row = v.items[0].id;
  orders.sendPendingItems(t.id);
  kitchen.setItemReady(row, true);
  h.db.prepare('UPDATE order_items SET picked_up_at = ? WHERE id = ?').run(h.nowIso(), row);

  orders.updateOrderItemQuantity(row, 5, w.id);
  orders.sendPendingItems(t.id);

  const k = kitchen.listKitchenTables().find((x) => x.id === t.id);
  assert.deepStrictEqual(k.items.map((it) => it.quantity), [3], 'oshpaz qo\'shilgan 3 tasini ko\'radi');
  assert.strictEqual(k.items[0].ready_at, null, '"tayyor" belgisi yangi porsiyaga o\'tmaydi');
});

test('1: qo\'shimcha shu taomning mavjud yuborilmagan qatoriga birlashadi', () => {
  const w = h.createUser();
  const t = h.createTable();
  const osh = h.createMenuItem({ price: 30000 });

  const v = orders.addItemToTable(t.id, osh.id, 2, w.id);
  const sentRow = v.items[0].id;
  orders.sendPendingItems(t.id);
  orders.addItemToTable(t.id, osh.id, 1, w.id); // yuborilmagan qator ×1

  orders.updateOrderItemQuantity(sentRow, 4, w.id); // +2
  const rows = rowsOf(t.id);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows.find((r) => !r.sent_at).quantity, 3, '1 + 2');
});

test('1: ombor — qo\'shimcha yangi qatorga bog\'lanadi, uni bekor qilish to\'g\'ri qaytaradi', () => {
  const w = h.createUser();
  const t = h.createTable();
  const inv = h.createInventoryItem({ quantity: 10 });
  const suv = h.createMenuItem({ price: 5000, inventoryItemId: inv.id });

  const v = orders.addItemToTable(t.id, suv.id, 2, w.id);
  const sentRow = v.items[0].id;
  orders.sendPendingItems(t.id);
  orders.updateOrderItemQuantity(sentRow, 5, w.id);
  assert.strictEqual(h.stockOf(inv.id), 5);

  const extra = rowsOf(t.id).find((r) => r.id !== sentRow);
  orders.cancelOrderItem(extra.id, w.id);
  assert.strictEqual(h.stockOf(inv.id), 8, 'faqat qo\'shimcha 3 tasi qaytdi');
});

test('1: yuborilgan qatorni KAMAYTIRISH va yuborilmagan qatorni oshirish — avvalgidek joyida', () => {
  const w = h.createUser();
  const t = h.createTable();
  const osh = h.createMenuItem({ price: 1000 });

  const v = orders.addItemToTable(t.id, osh.id, 5, w.id);
  const row = v.items[0].id;
  assert.strictEqual(orders.updateOrderItemQuantity(row, 7, w.id).items.length, 1, 'yuborilmagan — joyida');
  orders.sendPendingItems(t.id);
  const after = orders.updateOrderItemQuantity(row, 3, w.id);
  assert.strictEqual(after.items.length, 1);
  assert.strictEqual(after.items[0].quantity, 3);
});

// ─────────────────────── 2. Oshxona FIFO tartibi ───────────────────────

test('2: hamma taomi tayyor stol haqiqatan kutayotgan stoldan KEYIN turadi', () => {
  const w = h.createUser();
  const m = h.createMenuItem({ price: 1000 });
  const A = h.createTable({ name: 'K-tayyor' });
  const B = h.createTable({ name: 'K-kutmoqda' });

  const a = orders.addItemToTable(A.id, m.id, 1, w.id).items[0].id;
  orders.sendPendingItems(A.id);
  h.db.prepare("UPDATE order_items SET sent_at = '2020-01-01T10:00:00.000Z' WHERE id = ?").run(a);
  kitchen.setItemReady(a, true);

  const b = orders.addItemToTable(B.id, m.id, 1, w.id).items[0].id;
  orders.sendPendingItems(B.id);
  h.db.prepare("UPDATE order_items SET sent_at = '2020-01-01T10:05:00.000Z' WHERE id = ?").run(b);

  const list = kitchen.listKitchenTables().filter((t) => [A.id, B.id].includes(t.id));
  assert.deepStrictEqual(list.map((t) => t.name), ['K-kutmoqda', 'K-tayyor']);
  const byName = Object.fromEntries(list.map((t) => [t.name, t]));
  assert.strictEqual(byName['K-tayyor'].oldest_sent_at, null, 'oshpazdan hech narsa kutilmayapti');
  assert.strictEqual(byName['K-tayyor'].items.length, 1, 'tayyor taom afitsiant olguncha ko\'rinib turadi');
  assert.strictEqual(byName['K-kutmoqda'].oldest_sent_at, '2020-01-01T10:05:00.000Z');
});

// ─────────────── 3. Yuborilmagan taomli stolni yopish ───────────────

test('3: yuborilmagan taom bor stol standart holatda yopilmaydi (409, taom nomlari bilan)', () => {
  const w = h.createUser();
  const t = h.createTable();
  const choy = h.createMenuItem({ name: 'Choy', price: 3000 });
  orders.addItemToTable(t.id, choy.id, 2, w.id);

  assert.throws(
    () => orders.closeTable(t.id, w.id),
    (err) => err.status === 409 && /Choy ×2/.test(err.message)
  );
  assert.ok(orders.getOpenOrderForTable(t.id), 'buyurtma ochiq qoladi');
});

test("3: kassir tasdiqlagan qatorlar bilan yopiladi, tasdiqlanmagan yangisi bilan — yo'q", () => {
  const w = h.createUser();
  const t = h.createTable();
  const choy = h.createMenuItem({ name: 'Choy', price: 3000 });
  const non = h.createMenuItem({ name: 'Non', price: 2000 });
  const choyRow = orders.addItemToTable(t.id, choy.id, 1, w.id).items[0].id;
  orders.addItemToTable(t.id, non.id, 1, w.id); // kassir ko'rmagan

  assert.throws(() => orders.closeTable(t.id, w.id, { allowUnsentIds: [choyRow] }), /Non ×1/);
  const nonRow = rowsOf(t.id).find((r) => r.id !== choyRow).id;
  const closed = orders.closeTable(t.id, w.id, { allowUnsentIds: [choyRow, nonRow] });
  assert.strictEqual(closed.order.status, 'closed');
  assert.strictEqual(closed.total, 5000);
});

test("3: HTTP — kassir allow_unsent_ids yubora oladi, afitsiant route'i uni e'tiborsiz qoldiradi", async () => {
  const kassir = h.createUser({ role: 'kassir' });
  const waiter = h.createUser({ role: 'waiter' });
  const m = h.createMenuItem({ price: 4000 });

  const t1 = h.createTable();
  const r1 = orders.addItemToTable(t1.id, m.id, 1, waiter.id).items[0].id;
  const waiterRes = await withRouter(require('../server/routes/waiterOrders'), waiter, (base) =>
    post(base, `/tables/${t1.id}/close`, { allow_unsent_ids: [r1] }));
  assert.strictEqual(waiterRes.status, 409);

  const kassirRouter = require('../server/routes/kassirTables');
  const noIds = await withRouter(kassirRouter, kassir, (base) => post(base, `/tables/${t1.id}/close`, {}));
  assert.strictEqual(noIds.status, 409);
  assert.match(noIds.body.error, /yuborilmagan/);

  const ok = await withRouter(kassirRouter, kassir, (base) =>
    post(base, `/tables/${t1.id}/close`, { allow_unsent_ids: [r1] }));
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.order.status, 'closed');
});

test('3: hamma taom yuborilgan bo\'lsa yopish avvalgidek', () => {
  const w = h.createUser();
  const t = h.createTable();
  const m = h.createMenuItem({ price: 4000 });
  orders.addItemToTable(t.id, m.id, 2, w.id);
  orders.sendPendingItems(t.id);
  assert.strictEqual(orders.closeTable(t.id, w.id).total, 8000);
});

// ─────────────────── 4. Yetkazib berish sozlamalari ───────────────────

function orderPayload(menuItemId, quantity, fulfillment = 'delivery') {
  return {
    full_name: 'Mijoz', phone: '998901234567', fulfillment,
    address: fulfillment === 'delivery' ? 'Manzil 1' : '',
    items: [{ menu_item_id: menuItemId, quantity }],
  };
}

test("4: yetkazib berish o'chirilgan bo'lsa server rad etadi, olib ketish ishlaydi", (t) => {
  t.after(() => settings.updateSettings({ delivery_enabled: true }));
  settings.updateSettings({ delivery_enabled: false });
  const m = h.createMenuItem({ price: 20000 });

  assert.throws(() => customerOrders.createFromPublic(orderPayload(m.id, 1)), /yetkazib berish xizmati ishlamayapti/i);
  const pickup = customerOrders.createFromPublic(orderPayload(m.id, 1, 'pickup'));
  assert.ok(pickup.ok);
  assert.strictEqual(pickup.delivery_fee, 0);
});

test('4: minimal buyurtma summasi serverda tekshiriladi', (t) => {
  t.after(() => settings.updateSettings({ delivery_min_order: 0 }));
  settings.updateSettings({ delivery_min_order: 100000 });
  const m = h.createMenuItem({ price: 30000 });

  assert.throws(
    () => customerOrders.createFromPublic(orderPayload(m.id, 3)),
    (err) => err.status === 400 && /100 000 so'm/.test(err.message) && /10 000 so'm/.test(err.message)
  );
  assert.ok(customerOrders.createFromPublic(orderPayload(m.id, 4)).ok, '120 000 — yetadi');
  assert.ok(customerOrders.createFromPublic(orderPayload(m.id, 1, 'pickup')).ok, 'olib ketishga cheklov yo\'q');
});

test("4: yetkazish narxi buyurtma paytidagi qiymat bilan saqlanadi, tushumga qo'shilmaydi", (t) => {
  t.after(() => settings.updateSettings({ delivery_fee: 0 }));
  settings.updateSettings({ delivery_fee: 15000 });
  const m = h.createMenuItem({ price: 50000 });

  const r = customerOrders.createFromPublic(orderPayload(m.id, 1));
  assert.strictEqual(r.delivery_fee, 15000);
  assert.strictEqual(r.total_amount, 50000, 'total_amount — faqat taomlar');

  settings.updateSettings({ delivery_fee: 20000 }); // keyin o'zgardi
  const saved = customerOrders.getOrderWithItems(r.id);
  assert.strictEqual(saved.delivery_fee, 15000, 'mijozga aytilgan summa o\'zgarmaydi');
});

// ─────────────────────────── 5. Bronlar hisoblagichi ───────────────────────────

test("5: bosh sahifa faqat bugungi va kelgusi tasdiqlanmagan bronlarni sanaydi", () => {
  const today = '2031-06-15';
  const base = reservations.countNew(today);
  const mk = (res_date) => reservations.createFromPublic({
    full_name: 'Bron', phone: '998901234567', party_size: 2, res_date, res_time: '19:00',
  });
  mk('2031-06-14'); // kecha — sanalmaydi
  mk('2031-06-15'); // bugun
  mk('2031-06-20'); // kelgusi
  assert.strictEqual(reservations.countNew(today), base + 2);
});

test('5: dashboard new_reservations o\'tgan kungi bronni sanamaydi (o\'z "bugun"i bo\'yicha)', () => {
  const now = new Date('2032-07-10T08:00:00.000Z'); // Toshkent: 10-iyul
  const before = dashboard.getDashboard(now).new_reservations;
  const mk = (res_date) => reservations.createFromPublic({
    full_name: 'Bron', phone: '998901234567', party_size: 2, res_date, res_time: '19:00',
  });
  mk('2032-07-01'); // o'tgan — sanalmaydi
  mk('2032-07-10'); // bugun — sanaladi
  assert.strictEqual(dashboard.getDashboard(now).new_reservations, before + 1);
});
