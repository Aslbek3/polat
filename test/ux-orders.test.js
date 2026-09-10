// UI/UX tahlilidagi (docs/UI-UX-TAHLIL.md, 5-bo'lim) SERVER tomonini talab
// qilgan topilmalar — 2026-09-10:
//   X-10  katta-kichik harfga befarq login (+ harf registri bilan farqli
//         dublikat loginni yaratishni rad etish)
//   X-06  bir xil, hali oshxonaga YUBORILMAGAN taomni birlashtirish
//   X-12  bekor qilingan taomning "tayyor" bildirishnomasi o'chishi
//   X-01  oshpaz ekranida FIFO tartib + `oldest_sent_at`
//   X-31  "tayyor" bildirishnomasida miqdor
// Hamda: `/tables/:id/receipt/latest` SQL'i route'lardan servisga ko'chirildi
// (getLatestReceiptForTable).
const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');

const h = require('./helpers');
const express = require('express');
const { createAuth } = require('../server/auth');
const users = require('../server/services/users');
const orders = require('../server/services/orders');
const kitchen = require('../server/services/kitchen');

// ─────────────────────────────── yordamchilar ───────────────────────────────

// auth.test.js'dagi naqsh: kichik Express ilova, bo'sh port (listen(0)).
async function startLoginServer(t) {
  const auth = createAuth({ sessionSecret: 'ux-test-secret' });
  const app = express();
  app.use(express.json());
  app.post('/api/login', auth.loginRoute);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function login(base, username, password = 'parol123') {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return { status: res.status, body: await res.json() };
}

function setupLinkedItem({ stock = 10, price = 12000 } = {}) {
  const inv = h.createInventoryItem({ quantity: stock });
  const item = h.createMenuItem({ price, inventoryItemId: inv.id });
  return { inv, item };
}

function notificationsFor(orderItemId) {
  return h.db.prepare('SELECT * FROM notifications WHERE order_item_id = ? ORDER BY id').all(orderItemId);
}

// ─────────────────────────────── X-10: login ───────────────────────────────

test('X-10: katta harf bilan yozilgan login 200 qaytaradi', async (t) => {
  const base = await startLoginServer(t);
  h.createUser({ username: 'afitsiant_ux', role: 'waiter' });

  // Telefon klaviaturasi birinchi harfni avtomatik kattalashtiradi.
  const res = await login(base, 'Afitsiant_ux');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.role, 'waiter');

  assert.strictEqual((await login(base, 'AFITSIANT_UX')).status, 200);
  assert.strictEqual((await login(base, '  afitsiant_ux  ')).status, 200, 'trim avvalgidek ishlaydi');
});

test('X-10: bazada aralash harfli login har qanday registrda kira oladi', async (t) => {
  const base = await startLoginServer(t);
  h.createUser({ username: 'KassirBek', role: 'kassir' });

  for (const variant of ['KassirBek', 'kassirbek', 'KASSIRBEK', 'kASSIRbEK']) {
    const res = await login(base, variant);
    assert.strictEqual(res.status, 200, `variant: ${variant}`);
    assert.strictEqual(res.body.role, 'kassir');
  }
});

test('X-10: parol hamon katta-kichik harfga SEZGIR', async (t) => {
  const base = await startLoginServer(t);
  h.createUser({ username: 'parol_registr', password: 'Maxfiy123' });

  assert.strictEqual((await login(base, 'Parol_Registr', 'Maxfiy123')).status, 200);
  assert.strictEqual((await login(base, 'Parol_Registr', 'maxfiy123')).status, 401);
  assert.strictEqual((await login(base, 'parol_registr', 'MAXFIY123')).status, 401);
});

test('X-10: bloklangan hisob registrdan qat\'i nazar kira olmaydi', async (t) => {
  const base = await startLoginServer(t);
  h.createUser({ username: 'bloklangan_ux', isActive: 0 });
  assert.strictEqual((await login(base, 'Bloklangan_UX')).status, 401);
});

test("X-10: eski bazadagi registr to'qnashuvi — aniq mos birinchi, aks holda eng kichik id", async (t) => {
  const base = await startLoginServer(t);
  // Service'ni chetlab o'tib to'g'ridan-to'g'ri yozamiz — bunday juftlik
  // endi yaratilmaydi, lekin tuzatishdan OLDINGI bazada bo'lishi mumkin.
  const older = h.createUser({ username: 'Toqnash', role: 'chef', password: 'birinchi1' });
  const newer = h.createUser({ username: 'toqnash', role: 'kassir', password: 'ikkinchi2' });
  assert.ok(older.id < newer.id);

  // Aynan mos login — o'sha hisob (tuzatishdan oldin ishlagan hisob buzilmaydi).
  const exactNewer = await login(base, 'toqnash', 'ikkinchi2');
  assert.strictEqual(exactNewer.status, 200);
  assert.strictEqual(exactNewer.body.role, 'kassir');

  const exactOlder = await login(base, 'Toqnash', 'birinchi1');
  assert.strictEqual(exactOlder.status, 200);
  assert.strictEqual(exactOlder.body.role, 'chef');

  // Aniq mos yo'q — eng kichik id (eng birinchi yaratilgan) olinadi.
  const fuzzy = await login(base, 'TOQNASH', 'birinchi1');
  assert.strictEqual(fuzzy.status, 200);
  assert.strictEqual(fuzzy.body.role, 'chef');
  // ...va ikkinchi hisobning paroli bu yo'l bilan tekshirilmaydi (noaniqlik yo'q).
  assert.strictEqual((await login(base, 'TOQNASH', 'ikkinchi2')).status, 401);
});

test('X-10: faqat harf registri bilan farqli dublikat login yaratilmaydi', () => {
  const created = users.createUser({ username: 'Oshpaz_UX', password: 'parol123', role: 'chef' });
  assert.strictEqual(created.username, 'Oshpaz_UX');

  for (const dup of ['oshpaz_ux', 'OSHPAZ_UX', 'Oshpaz_UX', '  oshpaz_Ux  ']) {
    assert.throws(
      () => users.createUser({ username: dup, password: 'parol123', role: 'waiter' }),
      (err) => err instanceof users.UserError && /band/i.test(err.message),
      `dublikat: "${dup}"`
    );
  }
  const cnt = h.db.prepare("SELECT COUNT(*) AS c FROM users WHERE username = 'oshpaz_ux' COLLATE NOCASE").get().c;
  assert.strictEqual(cnt, 1);
});

test('X-10: bloklangan hisobning logini ham band (registrdan qat\'i nazar)', () => {
  h.createUser({ username: 'Ketgan_Xodim', isActive: 0 });
  assert.throws(
    () => users.createUser({ username: 'ketgan_xodim', password: 'parol123', role: 'waiter' }),
    /band/i
  );
});

// ─────────────────────────── X-06: birlashtirish ───────────────────────────

test('X-06: bir xil yuborilmagan taom 3 marta qo\'shilsa — bitta qator ×3', () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const item = h.createMenuItem({ price: 25000 });

  orders.addItemToTable(table.id, item.id, 1, waiter.id);
  orders.addItemToTable(table.id, item.id, 1, waiter.id);
  const view = orders.addItemToTable(table.id, item.id, 1, waiter.id);

  assert.strictEqual(view.items.length, 1);
  assert.strictEqual(view.items[0].quantity, 3);
  assert.strictEqual(view.items[0].subtotal, 75000);
  assert.strictEqual(view.items[0].sent_at, null);
  assert.strictEqual(view.total, 75000);
});

test('X-06: har xil taomlar birlashtirilmaydi', () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const a = h.createMenuItem({ price: 1000 });
  const b = h.createMenuItem({ price: 2000 });

  orders.addItemToTable(table.id, a.id, 1, waiter.id);
  orders.addItemToTable(table.id, b.id, 1, waiter.id);
  const view = orders.addItemToTable(table.id, a.id, 2, waiter.id);

  assert.strictEqual(view.items.length, 2);
  assert.deepStrictEqual(view.items.map((it) => it.quantity), [3, 1]);
  assert.strictEqual(view.total, 3000 + 2000);
});

test("X-06: oshxonaga YUBORILGAN qatorga qo'shilmaydi — yangi qator ochiladi", () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const item = h.createMenuItem({ price: 10000 });

  const first = orders.addItemToTable(table.id, item.id, 2, waiter.id);
  const sentRowId = first.items[0].id;
  orders.sendPendingItems(table.id);
  kitchen.setItemReady(sentRowId, true); // oshpaz "tayyor" deb belgiladi

  const afterSend = orders.addItemToTable(table.id, item.id, 1, waiter.id);
  assert.strictEqual(afterSend.items.length, 2, 'yuborilgandan keyingi taom alohida qator');

  const sentRow = afterSend.items.find((it) => it.id === sentRowId);
  assert.strictEqual(sentRow.quantity, 2, 'yuborilgan qator miqdori O\'ZGARMAGAN');
  assert.ok(sentRow.sent_at);
  assert.ok(sentRow.ready_at, '"tayyor" belgisi buzilmagan');

  const newRow = afterSend.items.find((it) => it.id !== sentRowId);
  assert.strictEqual(newRow.quantity, 1);
  assert.strictEqual(newRow.sent_at, null);

  // Yangi (yuborilmagan) qatorga keyingi bosishlar yana birlashadi.
  const again = orders.addItemToTable(table.id, item.id, 1, waiter.id);
  assert.strictEqual(again.items.length, 2);
  assert.strictEqual(again.items.find((it) => it.id === newRow.id).quantity, 2);
  assert.strictEqual(again.total, 10000 * 4);
});

test("X-06: bekor qilingan qatorga qo'shilmaydi", () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const item = h.createMenuItem({ price: 3000 });

  const v1 = orders.addItemToTable(table.id, item.id, 1, waiter.id);
  orders.cancelOrderItem(v1.items[0].id, waiter.id);
  const v2 = orders.addItemToTable(table.id, item.id, 1, waiter.id);

  assert.strictEqual(v2.items.length, 1);
  assert.notStrictEqual(v2.items[0].id, v1.items[0].id);
  assert.strictEqual(v2.items[0].quantity, 1);
});

test('X-06: birlashtirishda ombordan faqat qo\'shilgan miqdor sarflanadi', () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const { inv, item } = setupLinkedItem({ stock: 10 });

  orders.addItemToTable(table.id, item.id, 2, waiter.id);
  assert.strictEqual(h.stockOf(inv.id), 8);
  const view = orders.addItemToTable(table.id, item.id, 3, waiter.id);
  assert.strictEqual(h.stockOf(inv.id), 5, '10 - 2 - 3 (umumiy 5 ni qayta sarflamaydi)');

  const rowId = view.items[0].id;
  assert.strictEqual(view.items.length, 1);
  assert.strictEqual(view.items[0].quantity, 5);

  // Ikkala harakat ham birlashgan qatorga bog'langan.
  const moves = h.db
    .prepare("SELECT delta, order_item_id FROM inventory_movements WHERE inventory_item_id = ? AND reason = 'order' ORDER BY id")
    .all(inv.id);
  assert.deepStrictEqual(moves.map((m) => m.delta), [-2, -3]);
  assert.ok(moves.every((m) => m.order_item_id === rowId));

  // Bekor qilinsa umumiy miqdor to'liq qaytadi.
  orders.cancelOrderItem(rowId, waiter.id);
  assert.strictEqual(h.stockOf(inv.id), 10);
});

test('X-06: birlashtirishda qoldiq yetmasa — qator va ombor o\'zgarmaydi', () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const { inv, item } = setupLinkedItem({ stock: 3 });

  const v1 = orders.addItemToTable(table.id, item.id, 2, waiter.id);
  assert.throws(() => orders.addItemToTable(table.id, item.id, 2, waiter.id), /omborda/i);

  const view = orders.getOpenOrderForTable(table.id);
  assert.strictEqual(view.items.length, 1);
  assert.strictEqual(view.items[0].id, v1.items[0].id);
  assert.strictEqual(view.items[0].quantity, 2, 'tranzaksiya qaytarilgan — miqdor oshmagan');
  assert.strictEqual(h.stockOf(inv.id), 1);
});

test('X-06: birlashgan miqdor ham yuqori chegaradan oshmaydi', () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const item = h.createMenuItem({ price: 100 });

  orders.addItemToTable(table.id, item.id, 1000, waiter.id);
  assert.throws(() => orders.addItemToTable(table.id, item.id, 1, waiter.id), /juda katta/i);
  assert.strictEqual(orders.getOpenOrderForTable(table.id).items[0].quantity, 1000);
});

test("X-06: bosishlar orasida narx o'zgarsa — eski narxdagi qatorga qo'shilmaydi", () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const item = h.createMenuItem({ price: 10000 });

  orders.addItemToTable(table.id, item.id, 1, waiter.id);
  h.db.prepare('UPDATE menu_items SET price = 12000 WHERE id = ?').run(item.id);
  const view = orders.addItemToTable(table.id, item.id, 1, waiter.id);

  assert.strictEqual(view.items.length, 2);
  assert.deepStrictEqual(view.items.map((it) => it.unit_price), [10000, 12000]);
  assert.strictEqual(view.total, 22000);
});

// ───────────────────── X-12: bekor qilinganda bildirishnoma ─────────────────────

test("X-12: tayyor taom bekor qilinsa tasdiqlanmagan bildirishnoma o'chadi", () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const item = h.createMenuItem({ price: 5000 });

  const view = orders.addItemToTable(table.id, item.id, 1, waiter.id);
  const rowId = view.items[0].id;
  orders.sendPendingItems(table.id);
  kitchen.setItemReady(rowId, true);
  assert.strictEqual(notificationsFor(rowId).length, 1);

  // Frontend "−" bilan miqdorni 0 ga tushirganda ham aynan shu chaqiriladi.
  orders.cancelOrderItem(rowId, waiter.id);
  assert.strictEqual(notificationsFor(rowId).length, 0, 'osilib qolgan "tayyor" xabari yo\'q');
});

test("X-12: TASDIQLANGAN bildirishnoma (tarix) va boshqa taomlarniki o'chirilmaydi", () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const a = h.createMenuItem({ price: 5000 });
  const b = h.createMenuItem({ price: 6000 });

  orders.addItemToTable(table.id, a.id, 1, waiter.id);
  const view = orders.addItemToTable(table.id, b.id, 1, waiter.id);
  const [rowA, rowB] = view.items.map((it) => it.id);
  orders.sendPendingItems(table.id);
  kitchen.setItemReady(rowA, true);
  kitchen.setItemReady(rowB, true);

  // A xabari allaqachon tasdiqlangan (afitsiant "Qabul qildim" bosgan).
  h.db.prepare("UPDATE notifications SET acknowledged_at = ?, acknowledged_by_name = 'x' WHERE order_item_id = ?")
    .run(h.nowIso(), rowA);

  orders.cancelOrderItem(rowA, waiter.id);
  assert.strictEqual(notificationsFor(rowA).length, 1, 'tasdiqlangan xabar tarix sifatida qoladi');
  assert.strictEqual(notificationsFor(rowB).length, 1, 'boshqa taomning xabari tegilmaydi');
});

test("X-12: bekor qilish muvaffaqiyatsiz bo'lsa bildirishnoma joyida qoladi", () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const item = h.createMenuItem({ price: 5000 });

  const view = orders.addItemToTable(table.id, item.id, 1, waiter.id);
  const rowId = view.items[0].id;
  orders.sendPendingItems(table.id);
  kitchen.setItemReady(rowId, true);
  orders.closeTable(table.id, waiter.id);

  assert.throws(() => orders.cancelOrderItem(rowId, waiter.id), /yopilgan/i);
  assert.strictEqual(notificationsFor(rowId).length, 1);
});

// ──────────────────────────── X-01: oshxona FIFO ────────────────────────────

test('X-01: band stollar eng eski yuborilgan taom bo\'yicha tartiblanadi', () => {
  const waiter = h.createUser();
  const item = h.createMenuItem({ price: 1000 });
  const item2 = h.createMenuItem({ price: 2000 });
  // Yaratilish (id / sort_order) tartibi: A, B, C, D, E — FIFO bundan farq qiladi.
  const A = h.createTable({ name: 'FIFO-A' });
  const B = h.createTable({ name: 'FIFO-B' });
  const C = h.createTable({ name: 'FIFO-C' });
  const D = h.createTable({ name: 'FIFO-D' }); // bo'sh
  const E = h.createTable({ name: 'FIFO-E' }); // band, lekin hech narsa yuborilmagan

  const setSent = (tableId, iso) => {
    const v = orders.getOpenOrderForTable(tableId);
    for (const it of v.items) {
      if (!it.sent_at) h.db.prepare('UPDATE order_items SET sent_at = ? WHERE id = ?').run(iso, it.id);
    }
  };

  // C eng uzoq kutyapti (10:00), A 10:05, B 10:10.
  orders.addItemToTable(C.id, item.id, 1, waiter.id);
  setSent(C.id, '2020-01-01T10:00:00.000Z');
  orders.addItemToTable(A.id, item.id, 1, waiter.id);
  setSent(A.id, '2020-01-01T10:05:00.000Z');
  orders.addItemToTable(B.id, item.id, 1, waiter.id);
  setSent(B.id, '2020-01-01T10:10:00.000Z');
  orders.addItemToTable(E.id, item.id, 1, waiter.id); // yuborilmagan

  // A: eng eski taomi olib ketilgan (picked_up) — u endi hisobga kirmaydi.
  // A'ga keyinroq (10:20) yana taom yuborildi -> A'ning oldest_sent_at = 10:20.
  const aFirst = orders.getOpenOrderForTable(A.id).items[0].id;
  h.db.prepare('UPDATE order_items SET picked_up_at = ? WHERE id = ?').run('2020-01-01T10:15:00.000Z', aFirst);
  orders.addItemToTable(A.id, item2.id, 1, waiter.id);
  setSent(A.id, '2020-01-01T10:20:00.000Z');

  const all = kitchen.listKitchenTables();
  const mine = all.filter((t) => [A.id, B.id, C.id, D.id, E.id].includes(t.id));
  assert.deepStrictEqual(mine.map((t) => t.name), ['FIFO-C', 'FIFO-B', 'FIFO-A', 'FIFO-E', 'FIFO-D']);

  const byName = Object.fromEntries(mine.map((t) => [t.name, t]));
  assert.strictEqual(byName['FIFO-C'].oldest_sent_at, '2020-01-01T10:00:00.000Z');
  assert.strictEqual(byName['FIFO-B'].oldest_sent_at, '2020-01-01T10:10:00.000Z');
  assert.strictEqual(byName['FIFO-A'].oldest_sent_at, '2020-01-01T10:20:00.000Z', "olib ketilgan taom hisobga kirmaydi");
  assert.strictEqual(byName['FIFO-E'].oldest_sent_at, null);
  assert.deepStrictEqual(byName['FIFO-E'].items, []);
  assert.strictEqual(byName['FIFO-D'].oldest_sent_at, null);
  assert.strictEqual(byName['FIFO-D'].occupied, false);

  // Har bir ko'rinadigan taomda sent_at saqlangan; A'da faqat olib ketilmagani.
  assert.strictEqual(byName['FIFO-A'].items.length, 1);
  assert.ok(byName['FIFO-A'].items.every((it) => it.sent_at && !it.picked_up_at));

  // Guruhlar tartibi butun javobda ham: ko'rinadigan taomli -> band, bo'sh navbat -> bo'sh stollar.
  const groups = all.map((t) => (!t.occupied ? 2 : t.oldest_sent_at ? 0 : 1));
  assert.deepStrictEqual(groups, [...groups].sort((x, y) => x - y));
});

// ──────────────────────── X-31: bildirishnomada miqdor ────────────────────────

test("X-31: miqdor 1 dan katta bo'lsa bildirishnomada ×N bor, 1 bo'lsa yo'q", () => {
  const waiter = h.createUser();
  const table = h.createTable({ name: 'Stol X31' });
  const osh = h.createMenuItem({ name: 'Osh', price: 30000 });
  const choy = h.createMenuItem({ name: 'Choy', price: 3000 });

  orders.addItemToTable(table.id, osh.id, 1, waiter.id);
  orders.addItemToTable(table.id, osh.id, 2, waiter.id); // birlashadi -> ×3
  const view = orders.addItemToTable(table.id, choy.id, 1, waiter.id);
  orders.sendPendingItems(table.id);

  const oshRow = view.items.find((it) => it.menu_item_id === osh.id);
  const choyRow = view.items.find((it) => it.menu_item_id === choy.id);
  kitchen.setItemReady(oshRow.id, true);
  kitchen.setItemReady(choyRow.id, true);

  assert.strictEqual(notificationsFor(oshRow.id)[0].message, 'Stol X31 taomi tayyor: Osh ×3');
  assert.strictEqual(notificationsFor(choyRow.id)[0].message, 'Stol X31 taomi tayyor: Choy');
});

// ──────────────── receipt/latest SQL'i servisga ko'chirildi ────────────────

test("getLatestReceiptForTable: buyurtma yo'q bo'lsa 404, bekor qilingan chiqarilmaydi", () => {
  const waiter = h.createUser();
  const table = h.createTable();
  const item = h.createMenuItem({ price: 4000 });

  assert.throws(
    () => orders.getLatestReceiptForTable(table.id),
    (err) => err.status === 404 && /hali buyurtma/i.test(err.message)
  );

  orders.addItemToTable(table.id, item.id, 2, waiter.id);
  const closed = orders.closeTable(table.id, waiter.id);

  // Keyingi buyurtma bekor qilindi — "oxirgi chek" hamon yopilgani.
  const v = orders.addItemToTable(table.id, item.id, 1, waiter.id);
  orders.cancelOrderItem(v.items[0].id, waiter.id);
  orders.cancelEmptyOrder(table.id, waiter.id);

  const latest = orders.getLatestReceiptForTable(table.id);
  assert.strictEqual(latest.order.id, closed.order.id);
  assert.strictEqual(latest.total, 8000);
});
