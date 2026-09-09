// `server/services/orders.js` — dine-in buyurtma oqimi va uning ombor
// qoldig'iga ta'siri (2026-09-10 auditida topilgan xatolar shu yerda
// qamrab olingan).
const test = require('node:test');
const assert = require('node:assert');

const h = require('./helpers');
const orders = require('../server/services/orders');

function setupLinkedItem({ stock = 10, price = 12000 } = {}) {
  const inv = h.createInventoryItem({ quantity: stock });
  const item = h.createMenuItem({ price, inventoryItemId: inv.id });
  return { inv, item };
}

test('taom qo\'shilganda bog\'langan ombor qoldig\'i kamayadi', () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const view = orders.addItemToTable(table.id, item.id, 3, waiter.id);

  assert.strictEqual(h.stockOf(inv.id), 7);
  assert.strictEqual(view.items.length, 1);
  assert.strictEqual(view.total, item.price * 3);
});

test('qator bekor qilinsa ombor qoldig\'i qaytariladi', () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const view = orders.addItemToTable(table.id, item.id, 3, waiter.id);
  assert.strictEqual(h.stockOf(inv.id), 7);

  orders.cancelOrderItem(view.items[0].id, waiter.id);
  assert.strictEqual(h.stockOf(inv.id), 10);
});

// ── AUDIT TOPILMASI: bekor qilingan qatorning miqdorini oshirish ombordan
// qoldiqni "yeydi" — qator hamon 'cancelled' bo'lgani uchun hisobga kirmaydi,
// va uni qayta bekor qilib qoldiqni qaytarib ham bo'lmaydi.
test("bekor qilingan qatorning miqdorini o'zgartirib bo'lmaydi", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const view = orders.addItemToTable(table.id, item.id, 2, waiter.id);
  const orderItemId = view.items[0].id;
  orders.cancelOrderItem(orderItemId, waiter.id);
  assert.strictEqual(h.stockOf(inv.id), 10, 'bekor qilingandan keyin qoldiq to\'liq');

  assert.throws(
    () => orders.updateOrderItemQuantity(orderItemId, 5, waiter.id),
    /bekor qilingan/i,
    'bekor qilingan qatorga miqdor o\'zgartirish rad etilishi kerak'
  );

  assert.strictEqual(h.stockOf(inv.id), 10, 'rad etilgandan keyin ham qoldiq o\'zgarmasligi kerak');
});

test("miqdorni kamaytirish ombor qoldig'ini qisman qaytaradi", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const { inv, item } = setupLinkedItem({ stock: 10 });

  const view = orders.addItemToTable(table.id, item.id, 5, waiter.id);
  assert.strictEqual(h.stockOf(inv.id), 5);

  const updated = orders.updateOrderItemQuantity(view.items[0].id, 2, waiter.id);
  assert.strictEqual(h.stockOf(inv.id), 8);
  assert.strictEqual(updated.total, item.price * 2);
});

test("ombor qoldig'idan ko'p taom qo'shib bo'lmaydi", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const { inv, item } = setupLinkedItem({ stock: 2 });

  assert.throws(() => orders.addItemToTable(table.id, item.id, 5, waiter.id), /omborda/i);
  assert.strictEqual(h.stockOf(inv.id), 2, 'muvaffaqiyatsiz urinish qoldiqqa tegmasligi kerak');
  // Tranzaksiya to'liq qaytarilgani: buyurtma qatori ham yaratilmagan bo'lishi kerak.
  assert.strictEqual(orders.getOpenOrderForTable(table.id), null);
});

test("hisob-kitob qilingan stol yopiladi va chek so'rovi yaratiladi", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const item = h.createMenuItem({ price: 7000 });

  orders.addItemToTable(table.id, item.id, 2, waiter.id);
  const receipt = orders.closeTable(table.id, waiter.id);

  assert.strictEqual(receipt.order.status, 'closed');
  assert.strictEqual(receipt.total, 14000);
  const printReq = h.db.prepare('SELECT COUNT(*) AS c FROM print_requests WHERE order_id = ?').get(receipt.order.id);
  assert.strictEqual(printReq.c, 1);
});

test("yopilgan buyurtmani o'zgartirib bo'lmaydi", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const item = h.createMenuItem({ price: 7000 });

  const view = orders.addItemToTable(table.id, item.id, 1, waiter.id);
  orders.closeTable(table.id, waiter.id);

  assert.throws(() => orders.updateOrderItemQuantity(view.items[0].id, 3, waiter.id), /yopilgan/i);
  assert.throws(() => orders.cancelOrderItem(view.items[0].id, waiter.id), /yopilgan/i);
});

// ── AUDIT TOPILMASI: bo'sh buyurtmani bekor qilish uni 'closed' qilib
// qo'yardi — natijada hisobotda "buyurtma" bo'lib sanalar, kassir hisoblar
// ro'yxatida 0 so'mlik soxta chek bo'lib chiqardi.
test("bo'sh buyurtmani bekor qilish uni 'cancelled' holatiga o'tkazadi", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const item = h.createMenuItem({ price: 7000 });

  const view = orders.addItemToTable(table.id, item.id, 1, waiter.id);
  orders.cancelOrderItem(view.items[0].id, waiter.id);
  const result = orders.cancelEmptyOrder(table.id, waiter.id);

  assert.strictEqual(result.order.status, 'cancelled', "'closed' emas, 'cancelled' bo'lishi kerak");
  const printReq = h.db.prepare('SELECT COUNT(*) AS c FROM print_requests WHERE order_id = ?').get(result.order.id);
  assert.strictEqual(printReq.c, 0, 'bekor qilingan buyurtmaga chek so\'rovi yaratilmasligi kerak');
});

test("faol taomi bor buyurtmani 'bekor qilish' bilan yopib bo'lmaydi", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const item = h.createMenuItem({ price: 7000 });

  orders.addItemToTable(table.id, item.id, 1, waiter.id);
  assert.throws(() => orders.cancelEmptyOrder(table.id, waiter.id), /faol taomlar/i);
});

test("bitta stolda bir vaqtda faqat bitta ochiq buyurtma bo'ladi", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const item = h.createMenuItem({ price: 5000 });

  const first = orders.addItemToTable(table.id, item.id, 1, waiter.id);
  const second = orders.addItemToTable(table.id, item.id, 1, waiter.id);

  assert.strictEqual(first.order.id, second.order.id);
  assert.strictEqual(second.items.length, 2);
});

test("mavjud bo'lmagan taomni qo'shib bo'lmaydi", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const item = h.createMenuItem({ price: 5000, isAvailable: 0 });

  assert.throws(() => orders.addItemToTable(table.id, item.id, 1, waiter.id), /mavjud emas/i);
});

test("miqdor butun va musbat bo'lishi shart", () => {
  const waiter = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const item = h.createMenuItem({ price: 5000 });

  for (const bad of [0, -1, 1.5, 'abc', null]) {
    assert.throws(() => orders.addItemToTable(table.id, item.id, bad, waiter.id), /Miqdor/i, `qiymat: ${bad}`);
  }
});
