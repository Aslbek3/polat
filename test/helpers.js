// Testlar uchun umumiy yordamchi (2026-09-10).
//
// Har bir test FAYLI `node --test` tomonidan alohida jarayonda ishga
// tushiriladi, shuning uchun `require('../server/db')` har faylda YANGI
// xotiradagi baza beradi — testlar bir-birining ma'lumotiga tegmaydi.
//
// MUHIM: bu faylni har qanday `server/*` modulidan OLDIN require qilish shart,
// chunki `server/db.js` yuklanish paytining o'zida bazani ochadi va
// migratsiyalarni bajaradi — env o'zgaruvchilari shundan oldin qo'yilishi kerak.
process.env.POLAT_DB_PATH = ':memory:';
process.env.POLAT_SQLITE_DRIVER = 'node';
process.env.SESSION_SECRET = 'test-secret-not-used-in-production';

// Migratsiya loglari test chiqishini ko'mib yubormasligi uchun jim qilamiz.
const origLog = console.log;
console.log = () => {};
const { db, nowIso } = require('../server/db');
console.log = origLog;

const { hashPassword } = require('../server/passwords');

let seq = 0;
const uniq = (prefix) => `${prefix}_${++seq}`;

function createUser({ username, role = 'waiter', fullName = null, isActive = 1, password = 'parol123' } = {}) {
  const uname = username || uniq(role);
  const { salt, hash } = hashPassword(password);
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, password_salt, role, full_name, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(uname, hash, salt, role, fullName, isActive, nowIso());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

function createTable({ name, isActive = 1 } = {}) {
  const info = db
    .prepare('INSERT INTO tables (name, sort_order, is_active, created_at) VALUES (?, 0, ?, ?)')
    .run(name || uniq('Stol'), isActive, nowIso());
  return db.prepare('SELECT * FROM tables WHERE id = ?').get(info.lastInsertRowid);
}

function createCategory({ name, requireInventoryLink = 0, isActive = 1 } = {}) {
  const info = db
    .prepare(
      'INSERT INTO menu_categories (name, sort_order, is_active, require_inventory_link, created_at) VALUES (?, 0, ?, ?, ?)'
    )
    .run(name || uniq("Bo'lim"), isActive, requireInventoryLink, nowIso());
  return db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(info.lastInsertRowid);
}

function createMenuItem({
  categoryId, name, price = 10000, costPrice = null, isAvailable = 1,
  isActive = 1, inventoryItemId = null, parentItemId = null,
} = {}) {
  const catId = categoryId || createCategory().id;
  const ts = nowIso();
  const info = db
    .prepare(
      `INSERT INTO menu_items (category_id, name, price, cost_price, is_available, is_active, sort_order,
                               inventory_item_id, parent_item_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    )
    .run(catId, name || uniq('Taom'), price, costPrice, isAvailable, isActive, inventoryItemId, parentItemId, ts, ts);
  return db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid);
}

function createInventoryItem({ name, quantity = 100, salePrice = 5000, costPrice = 3000, unit = 'dona', isActive = 1 } = {}) {
  const ts = nowIso();
  const info = db
    .prepare(
      `INSERT INTO inventory_items (name, unit, quantity, low_stock_threshold, cost_price, sale_price, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`
    )
    .run(name || uniq('Mahsulot'), unit, quantity, costPrice, salePrice, isActive, ts, ts);
  return db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(info.lastInsertRowid);
}

function createCustomerOrder({ status = 'new', fulfillment = 'pickup', items = [], fullName = 'Mijoz', phone = '998901234567' } = {}) {
  const ts = nowIso();
  const total = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const info = db
    .prepare(
      `INSERT INTO customer_orders (full_name, phone, fulfillment, total_amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(fullName, phone, fulfillment, total, status, ts);
  const orderId = info.lastInsertRowid;
  const insertItem = db.prepare(
    `INSERT INTO customer_order_items (customer_order_id, menu_item_id, name_snapshot, unit_price, quantity, subtotal)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const it of items) {
    insertItem.run(orderId, it.menuItemId, it.name || 'Taom', it.unitPrice, it.quantity, it.unitPrice * it.quantity);
  }
  return db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(orderId);
}

// Ombor qoldig'ini tez o'qish — testlarda eng ko'p tekshiriladigan qiymat.
function stockOf(inventoryItemId) {
  return db.prepare('SELECT quantity FROM inventory_items WHERE id = ?').get(inventoryItemId).quantity;
}

module.exports = {
  db,
  nowIso,
  createUser,
  createTable,
  createCategory,
  createMenuItem,
  createInventoryItem,
  createCustomerOrder,
  stockOf,
};
