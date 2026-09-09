// `server/services/inventory.js` — ombor mahsuloti hayot sikli (yaratish,
// tahrirlash, qoldiqni o'zgartirish, sarflash/qaytarish, o'chirish) va uning
// bog'langan menyu taomiga ta'siri. 2026-09-10 auditida topilgan xatolar ham
// shu yerda qamrab olingan (`AUDIT TOPILMASI` izohli testlar).
const test = require('node:test');
const assert = require('node:assert');

const h = require('./helpers');
const inventory = require('../server/services/inventory');

// Bitta ombor mahsuloti + unga bog'langan menyu taomi — eng ko'p kerak
// bo'ladigan tayyorgarlik.
function setupLinked({ quantity = 10, salePrice = 5000, costPrice = 3000 } = {}) {
  const inv = h.createInventoryItem({ quantity, salePrice, costPrice });
  const item = h.createMenuItem({ inventoryItemId: inv.id, price: salePrice });
  return { inv, item };
}

const menuItemById = (id) => h.db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
const menuItemsOf = (invId) => h.db.prepare('SELECT * FROM menu_items WHERE inventory_item_id = ?').all(invId);
const movementsOf = (invId) =>
  h.db.prepare('SELECT * FROM inventory_movements WHERE inventory_item_id = ? ORDER BY id').all(invId);

// ─────────────────────────────── createItem ───────────────────────────────

test("createItem: nom bo'sh bo'lsa xato otadi", () => {
  for (const bad of ['', '   ', null, undefined]) {
    assert.throws(() => inventory.createItem({ name: bad }), /Nom kiritilishi shart/i, `qiymat: ${bad}`);
  }
});

test("createItem: boshlang'ich qoldiq > 0 bo'lsa 'restock' harakati yoziladi", () => {
  const item = inventory.createItem({ name: 'Suv 1L', quantity: 24, unit: 'dona' });

  assert.strictEqual(item.quantity, 24);
  const movements = movementsOf(item.id);
  assert.strictEqual(movements.length, 1);
  assert.strictEqual(movements[0].reason, 'restock');
  assert.strictEqual(movements[0].delta, 24);
});

test("createItem: qoldiq 0 bo'lsa hech qanday harakat yozilmaydi", () => {
  const item = inventory.createItem({ name: 'Salfetka', quantity: 0 });

  assert.strictEqual(item.quantity, 0);
  assert.strictEqual(movementsOf(item.id).length, 0);
});

test("createItem: manfiy va noto'g'ri qiymatlar 0 ga tushadi", () => {
  const item = inventory.createItem({
    name: 'Choy',
    quantity: -5,
    low_stock_threshold: -3,
    cost_price: -1000,
    sale_price: 'abc',
  });

  assert.strictEqual(item.quantity, 0);
  assert.strictEqual(item.low_stock_threshold, 0);
  assert.strictEqual(item.cost_price, 0);
  assert.strictEqual(item.sale_price, 0);
  assert.strictEqual(movementsOf(item.id).length, 0, 'qoldiq 0 ga tushgani uchun restock yozilmaydi');
});

test("createItem: birlik berilmasa 'dona' bo'ladi, mahsulot faol yaratiladi", () => {
  const item = inventory.createItem({ name: 'Non', unit: '   ' });

  assert.strictEqual(item.unit, 'dona');
  assert.strictEqual(item.is_active, 1);
});

test("createItem: noto'g'ri menyu bo'limi mahsulotni yo'qqa chiqarmaydi, faqat ogohlantiradi", () => {
  const item = inventory.createItem({ name: 'Kola', quantity: 5, sale_price: 9000, menu_category_id: 999999 });

  assert.ok(item.id, "mahsulotning o'zi baribir saqlanishi kerak");
  assert.match(item._link_warning || '', /Menyu bo'limi topilmadi/i);
  assert.strictEqual(inventory.getItemRow(item.id).quantity, 5);
});

// ─────────────────────────────── updateItem ───────────────────────────────

test("updateItem: faqat berilgan maydonlar o'zgaradi (qisman yangilash)", () => {
  const created = inventory.createItem({
    name: 'Fanta', unit: 'quti', quantity: 7, low_stock_threshold: 2,
    cost_price: 4000, sale_price: 8000, volume: '0.5L',
  });

  const updated = inventory.updateItem(created.id, { sale_price: 12000 });

  assert.strictEqual(updated.sale_price, 12000, 'berilgan maydon yangilanadi');
  assert.strictEqual(updated.name, 'Fanta');
  assert.strictEqual(updated.unit, 'quti');
  assert.strictEqual(updated.low_stock_threshold, 2);
  assert.strictEqual(updated.cost_price, 4000);
  assert.strictEqual(updated.volume, '0.5L');
  assert.strictEqual(updated.quantity, 7, 'updateItem qoldiqqa umuman tegmaydi');
});

test("updateItem: bo'sh nom rad etiladi", () => {
  const inv = h.createInventoryItem();
  assert.throws(() => inventory.updateItem(inv.id, { name: '   ' }), /Nom kiritilishi shart/i);
});

test("updateItem: mahsulot o'chirilsa (is_active=0) bog'langan taom ham 'tugadi' bo'ladi", () => {
  const { inv, item } = setupLinked({ quantity: 10 });
  assert.strictEqual(menuItemById(item.id).is_available, 1);

  inventory.updateItem(inv.id, { is_active: 0 });

  assert.strictEqual(menuItemById(item.id).is_available, 0);
});

test("updateItem: mavjud bo'lmagan mahsulot uchun 404", () => {
  assert.throws(() => inventory.updateItem(999999, { name: 'Yangi' }), /topilmadi/i);
});

// ─────────────────────────────── adjustStock ──────────────────────────────

test('adjustStock: musbat delta qoldiqni oshiradi va harakat yozadi', () => {
  const user = h.createUser({ role: 'admin' });
  const inv = h.createInventoryItem({ quantity: 10 });

  const result = inventory.adjustStock(inv.id, 5, { reason: 'restock', note: 'Yangi partiya', userId: user.id });

  assert.strictEqual(result.quantity, 15);
  assert.strictEqual(h.stockOf(inv.id), 15);
  const movements = movementsOf(inv.id);
  assert.strictEqual(movements.length, 1);
  assert.strictEqual(movements[0].delta, 5);
  assert.strictEqual(movements[0].reason, 'restock');
  assert.strictEqual(movements[0].note, 'Yangi partiya');
  assert.strictEqual(movements[0].created_by, user.id);
});

test('adjustStock: manfiy delta qoldiqni kamaytiradi', () => {
  const inv = h.createInventoryItem({ quantity: 10 });

  const result = inventory.adjustStock(inv.id, -4);

  assert.strictEqual(result.quantity, 6);
  assert.strictEqual(movementsOf(inv.id)[0].reason, 'adjustment', 'sabab berilmasa "adjustment"');
});

test('adjustStock: qoldiq manfiyga tushmaydi', () => {
  const inv = h.createInventoryItem({ quantity: 3 });

  assert.throws(() => inventory.adjustStock(inv.id, -5), /Yetarli qoldiq yo'q/i);
  assert.strictEqual(h.stockOf(inv.id), 3, 'rad etilgan urinish qoldiqqa tegmaydi');
  assert.strictEqual(movementsOf(inv.id).length, 0, 'rad etilganda harakat ham yozilmaydi');
});

test('adjustStock: 0, kasr va matn qiymatlar rad etiladi', () => {
  const inv = h.createInventoryItem({ quantity: 10 });

  for (const bad of [0, 1.5, 'abc', null, undefined, NaN]) {
    assert.throws(() => inventory.adjustStock(inv.id, bad), /Miqdorni to'g'ri kiriting/i, `qiymat: ${bad}`);
  }
  assert.strictEqual(h.stockOf(inv.id), 10);
});

test("adjustStock: qoldiq 0 ga tushsa bog'langan taom 'tugadi', qaytsa yana mavjud", () => {
  const { inv, item } = setupLinked({ quantity: 4 });

  inventory.adjustStock(inv.id, -4);
  assert.strictEqual(h.stockOf(inv.id), 0);
  assert.strictEqual(menuItemById(item.id).is_available, 0, 'qoldiq 0 => taom mavjud emas');

  inventory.adjustStock(inv.id, 6);
  assert.strictEqual(menuItemById(item.id).is_available, 1, 'qoldiq qaytdi => taom yana mavjud');
});

// ─────────────────────────── consume / release ────────────────────────────

test("consume: qoldiqni kamaytiradi va 'order' harakatini yozadi", () => {
  const user = h.createUser({ role: 'waiter' });
  const inv = h.createInventoryItem({ quantity: 10 });

  inventory.consume(inv.id, 3, { userId: user.id });

  assert.strictEqual(h.stockOf(inv.id), 7);
  const movements = movementsOf(inv.id);
  assert.strictEqual(movements.length, 1);
  assert.strictEqual(movements[0].delta, -3);
  assert.strictEqual(movements[0].reason, 'order');
  assert.strictEqual(movements[0].created_by, user.id);
});

test("consume: qoldiq yetarli bo'lmasa xato otadi va hech narsa o'zgarmaydi", () => {
  const inv = h.createInventoryItem({ quantity: 2, name: 'Suv 0.5L' });

  assert.throws(() => inventory.consume(inv.id, 5), /omborda faqat 2/i);
  assert.strictEqual(h.stockOf(inv.id), 2);
  assert.strictEqual(movementsOf(inv.id).length, 0);
});

test("consume: aynan qolgan miqdorcha sarflash mumkin va taom 'tugadi' bo'ladi", () => {
  const { inv, item } = setupLinked({ quantity: 5 });

  inventory.consume(inv.id, 5);

  assert.strictEqual(h.stockOf(inv.id), 0);
  assert.strictEqual(menuItemById(item.id).is_available, 0);
});

test('consume: 0 yoki manfiy miqdor hech narsa qilmaydi', () => {
  const inv = h.createInventoryItem({ quantity: 10 });

  for (const noop of [0, -3, 'abc', null, undefined]) {
    inventory.consume(inv.id, noop);
  }

  assert.strictEqual(h.stockOf(inv.id), 10);
  assert.strictEqual(movementsOf(inv.id).length, 0);
});

test("release: qoldiqni qaytaradi va 'return' harakatini yozadi", () => {
  const { inv, item } = setupLinked({ quantity: 3 });

  inventory.consume(inv.id, 3);
  assert.strictEqual(menuItemById(item.id).is_available, 0);

  inventory.release(inv.id, 2);

  assert.strictEqual(h.stockOf(inv.id), 2);
  assert.strictEqual(menuItemById(item.id).is_available, 1, "qoldiq qaytgach taom yana mavjud");
  const movements = movementsOf(inv.id);
  assert.strictEqual(movements.length, 2);
  assert.strictEqual(movements[1].reason, 'return');
  assert.strictEqual(movements[1].delta, 2);
});

test('release: 0 yoki manfiy miqdor hech narsa qilmaydi', () => {
  const inv = h.createInventoryItem({ quantity: 10 });

  for (const noop of [0, -3, 'abc']) {
    inventory.release(inv.id, noop);
  }

  assert.strictEqual(h.stockOf(inv.id), 10);
  assert.strictEqual(movementsOf(inv.id).length, 0);
});

// ───────────────── computeAvailability / syncMenuAvailability ─────────────

test('computeAvailability: faqat faol VA qoldigi musbat mahsulot "mavjud"', () => {
  assert.strictEqual(inventory.computeAvailability({ is_active: 1, quantity: 5 }), 1);
  assert.strictEqual(inventory.computeAvailability({ is_active: 1, quantity: 0 }), 0);
  assert.strictEqual(inventory.computeAvailability({ is_active: 0, quantity: 5 }), 0);
  assert.strictEqual(inventory.computeAvailability({ is_active: 0, quantity: 0 }), 0);
});

test("syncMenuAvailability: bog'langan barcha taomlarni qoldiqqa moslaydi", () => {
  const inv = h.createInventoryItem({ quantity: 0 });
  const a = h.createMenuItem({ inventoryItemId: inv.id, isAvailable: 1 });
  const b = h.createMenuItem({ inventoryItemId: inv.id, isAvailable: 1 });
  const bogliqEmas = h.createMenuItem({ isAvailable: 1 });

  inventory.syncMenuAvailability(inv.id);

  assert.strictEqual(menuItemById(a.id).is_available, 0);
  assert.strictEqual(menuItemById(b.id).is_available, 0);
  assert.strictEqual(menuItemById(bogliqEmas.id).is_available, 1, "bog'lanmagan taomga tegilmaydi");
});

test("syncMenuPricing: bog'langan taomning narxi va tan narxi mahsulotdan olinadi", () => {
  const { inv, item } = setupLinked({ quantity: 10, salePrice: 8000, costPrice: 5000 });

  inventory.updateItem(inv.id, { sale_price: 15000, cost_price: 9000 });

  const menu = menuItemById(item.id);
  assert.strictEqual(menu.price, 15000);
  assert.strictEqual(menu.cost_price, 9000);
});

// ─────────────────────────────── deleteItem ───────────────────────────────

test("deleteItem: harakatlar tarixi bo'lmasa bazadan butunlay o'chiriladi", () => {
  const inv = h.createInventoryItem({ quantity: 0 });
  const item = h.createMenuItem({ inventoryItemId: inv.id });

  const result = inventory.deleteItem(inv.id);

  assert.strictEqual(result.ok, true);
  const row = h.db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(inv.id);
  assert.strictEqual(row, undefined, "qattiq o'chirish kutilgan edi");
  assert.strictEqual(menuItemById(item.id).inventory_item_id, null, 'taom ombordan uziladi');
});

test("deleteItem: harakatlar tarixi bo'lsa faqat is_active=0 (yumshoq o'chirish)", () => {
  const created = inventory.createItem({ name: 'Suv 5L', quantity: 12 }); // restock harakati yoziladi
  const item = h.createMenuItem({ inventoryItemId: created.id });

  inventory.deleteItem(created.id);

  const row = h.db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(created.id);
  assert.ok(row, 'yozuv saqlanib qolishi kerak');
  assert.strictEqual(row.is_active, 0);
  assert.strictEqual(movementsOf(created.id).length, 1, 'tarix saqlanadi');
  assert.strictEqual(menuItemById(item.id).inventory_item_id, null, 'taom ombordan uziladi');
});

test("deleteItem: mavjud bo'lmagan mahsulot uchun 404", () => {
  assert.throws(() => inventory.deleteItem(999999), /topilmadi/i);
});

// ────────────────────────────── listMovements ─────────────────────────────

test('listMovements: eng yangi harakat birinchi qaytadi', () => {
  const inv = h.createInventoryItem({ quantity: 10 });
  inventory.adjustStock(inv.id, 5, { note: 'birinchi' });
  inventory.adjustStock(inv.id, -2, { note: 'ikkinchi' });

  const list = inventory.listMovements(inv.id);

  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].note, 'ikkinchi');
  assert.strictEqual(list[1].note, 'birinchi');
});

test("listMovements: limit 1..200 oralig'iga qisiladi", () => {
  const inv = h.createInventoryItem({ quantity: 1000 });
  const insert = h.db.prepare(
    "INSERT INTO inventory_movements (inventory_item_id, delta, reason, created_at) VALUES (?, 1, 'restock', ?)"
  );
  for (let i = 0; i < 205; i += 1) insert.run(inv.id, h.nowIso());

  assert.strictEqual(inventory.listMovements(inv.id, 500).length, 200, 'yuqori chegara 200');
  assert.strictEqual(inventory.listMovements(inv.id, 0).length, 1, 'quyi chegara 1');
  assert.strictEqual(inventory.listMovements(inv.id, -10).length, 1, 'manfiy limit ham 1 ga qisiladi');
  assert.strictEqual(inventory.listMovements(inv.id, 'abc').length, 50, "noto'g'ri limit => 50");
  assert.strictEqual(inventory.listMovements(inv.id).length, 50, 'standart limit 50');
});

test("listMovements: mavjud bo'lmagan mahsulot uchun 404", () => {
  assert.throws(() => inventory.listMovements(999999), /topilmadi/i);
});

// ────────────────────────────── ensureMenuLink ────────────────────────────

test("ensureMenuLink: bog'lanmagan mahsulot uchun yangi menyu taomi yaratiladi", () => {
  const category = h.createCategory();
  const inv = h.createInventoryItem({ quantity: 6, salePrice: 9000, costPrice: 4000 });

  inventory.ensureMenuLink(inv.id, category.id);

  const menu = menuItemsOf(inv.id);
  assert.strictEqual(menu.length, 1);
  assert.strictEqual(menu[0].price, 9000);
  assert.strictEqual(menu[0].cost_price, 4000);
  assert.strictEqual(menu[0].is_available, 1);
});

test("ensureMenuLink: allaqachon bog'langan bo'lsa yangi taom yaratilmaydi", () => {
  const category = h.createCategory();
  const { inv } = setupLinked({ quantity: 5 });

  inventory.ensureMenuLink(inv.id, category.id);

  assert.strictEqual(menuItemsOf(inv.id).length, 1, 'dublikat taom yaratilmasligi kerak');
});

test("ensureMenuLink: bo'lim tanlanmagan yoki topilmasa xato otadi", () => {
  const inv = h.createInventoryItem();
  assert.throws(() => inventory.ensureMenuLink(inv.id, undefined), /Menyu bo'limi tanlanmagan/i);
  assert.throws(() => inventory.ensureMenuLink(inv.id, 999999), /Menyu bo'limi topilmadi/i);
});

// ── AUDIT TOPILMASI: sale_price = 0 bo'lgan ombor mahsuloti menyuga
// bog'langanda taomning narxi ham 0 bo'lib qoladi — mijoz landing sahifasidan
// shu taomni TEKINGA buyurtma bera oladi. Bog'lash rad etilishi (yoki hech
// bo'lmasa narx 0 bo'lib ketmasligi) kerak.
test("narxi 0 bo'lgan ombor mahsulotini menyuga bog'lash tekin taom yaratmasligi kerak", () => {
  const category = h.createCategory();
  const inv = h.createInventoryItem({ quantity: 10, salePrice: 0 });

  let threw = false;
  try {
    inventory.ensureMenuLink(inv.id, category.id);
  } catch (err) {
    threw = true; // rad etish — to'g'ri xulq
  }

  if (!threw) {
    const menu = menuItemsOf(inv.id)[0];
    assert.ok(menu, "bog'lanish yaratilgan bo'lsa taom ham bo'lishi kerak");
    assert.ok(
      menu.price > 0,
      "sotuv narxi 0 bo'lgan mahsulot menyuda 0 so'mlik taom bo'lib chiqmasligi kerak (tekin buyurtma)"
    );
  }
});

// ── AUDIT TOPILMASI: syncMenuPricing() ombor narxini menyuga ko'r-ko'rona
// ko'chiradi — sale_price 0 ga tushirilsa bog'langan taom narxi ham 0 bo'ladi.
test("ombor mahsuloti narxini 0 ga tushirish menyudagi taom narxini 0 qilmasligi kerak", () => {
  const { inv, item } = setupLinked({ quantity: 10, salePrice: 12000 });

  let threw = false;
  try {
    inventory.updateItem(inv.id, { sale_price: 0 });
  } catch (err) {
    threw = true; // rad etish — to'g'ri xulq
  }

  if (!threw) {
    assert.ok(
      menuItemById(item.id).price > 0,
      "menyu taomi 0 so'mga tushib qolmasligi kerak — mijoz uni tekinga buyurtma qiladi"
    );
  }
});

// ── AUDIT TOPILMASI: ensureMenuLink() mavjud bog'lanishni faqat
// `is_active = 1` bilan qidiradi — bog'langan menyu taomi soft-delete
// qilingan (is_active = 0, lekin inventory_item_id hamon o'sha mahsulotga
// ishora qiladi) bo'lsa, DUBLIKAT menyu taomi yaratiladi.
test("soft-delete qilingan taomi bor mahsulot uchun dublikat menyu taomi yaratilmasligi kerak", () => {
  const category = h.createCategory();
  const inv = h.createInventoryItem({ quantity: 10, salePrice: 9000 });

  inventory.ensureMenuLink(inv.id, category.id);
  const first = menuItemsOf(inv.id);
  assert.strictEqual(first.length, 1);

  // Admin taomni Menyu bo'limidan o'chirdi (soft-delete) — bog'lanish qoldi.
  h.db.prepare('UPDATE menu_items SET is_active = 0 WHERE id = ?').run(first[0].id);

  inventory.ensureMenuLink(inv.id, category.id);

  assert.strictEqual(
    menuItemsOf(inv.id).length,
    1,
    "bir xil ombor mahsuloti uchun ikkinchi menyu taomi yaratilmasligi kerak (dublikat)"
  );
});
