// Stolga buyurtma qo'shish / stolni yopish (hisob-kitob) ning tranzaksion mantig'i.
// Bitta stolda bir vaqtning o'zida faqat bitta 'open' buyurtma bo'ladi (schema.sql'dagi
// qisman unikal indeks bilan DB darajasida ham kafolatlangan) — mehmon ovqat davomida
// qo'shimcha buyursa (hatto boshqa afitsiant xizmat qilsa ham) xuddi shu ochiq
// buyurtmaga yangi qator qo'shiladi. Har bir amal (qo'shish/yopish) bitta atomik
// tranzaksiyada bajariladi.
const { db, nowIso } = require('../db');
const inventory = require('./inventory');
const { parseQuantity } = require('../validation');

class OrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const userNameExpr = "COALESCE(u.full_name, u.username)";

function getTable(tableId) {
  const table = db.prepare('SELECT * FROM tables WHERE id = ? AND is_active = 1').get(tableId);
  if (!table) throw new OrderError('Stol topilmadi', 404);
  return table;
}

function getMenuItem(menuItemId) {
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ? AND is_active = 1').get(menuItemId);
  if (!item) throw new OrderError('Taom topilmadi', 404);
  if (!item.is_available) throw new OrderError(`"${item.name}" hozircha mavjud emas (tugagan)`, 400);
  return item;
}

function findOpenOrderRow(tableId) {
  return db.prepare("SELECT * FROM orders WHERE table_id = ? AND status = 'open'").get(tableId);
}

// order + faol (yoki barcha, includeCancelled=true bo'lsa) qatorlar + jami summa.
function buildOrderView(orderId, { includeCancelled = false } = {}) {
  const order = db
    .prepare(
      `SELECT o.*, t.name AS table_name,
              COALESCE(ou.full_name, ou.username) AS opened_by_name,
              cu.id AS closed_by_id, COALESCE(cu.full_name, cu.username) AS closed_by_name
       FROM orders o
       JOIN tables t ON t.id = o.table_id
       JOIN users ou ON ou.id = o.opened_by
       LEFT JOIN users cu ON cu.id = o.closed_by
       WHERE o.id = ?`
    )
    .get(orderId);
  if (!order) throw new OrderError('Buyurtma topilmadi', 404);

  const itemsSql = `
    SELECT oi.*, ${userNameExpr} AS added_by_name
    FROM order_items oi
    JOIN users u ON u.id = oi.added_by
    WHERE oi.order_id = ? ${includeCancelled ? '' : "AND oi.status = 'active'"}
    ORDER BY oi.id ASC
  `;
  const items = db.prepare(itemsSql).all(orderId);
  const total = items.reduce((sum, it) => sum + (it.status === 'active' ? it.subtotal : 0), 0);

  return { order, items, total };
}

function getOpenOrderForTable(tableId) {
  getTable(tableId);
  const row = findOpenOrderRow(tableId);
  if (!row) return null;
  return buildOrderView(row.id);
}

function addItemToTable(tableId, menuItemId, quantity, waiterId) {
  // 2026-09-10: YUQORI CHEGARA qo'shildi. Ilgari faqat "butun va musbat"
  // tekshirilardi — ya'ni {"quantity": 9007199254740991} yuborish
  // orders.total_amount ga ~9.0e19 yozar va hisobotni ABADIY buzardi
  // (yopilgan buyurtmani tuzatish yoki o'chirish uchun ilovada yo'l yo'q).
  const qty = parseQuantity(quantity);

  const run = db.transaction(() => {
    const table = getTable(tableId);
    const item = getMenuItem(menuItemId);
    const ts = nowIso();

    let order = findOpenOrderRow(table.id);
    if (!order) {
      const info = db
        .prepare(
          `INSERT INTO orders (table_id, status, opened_by, opened_at) VALUES (?, 'open', ?, ?)`
        )
        .run(table.id, waiterId, ts);
      order = { id: info.lastInsertRowid };
    }

    const subtotal = item.price * qty;
    // cost_price_snapshot — sotilgan paytdagi tan narx (2026-09-10). Sotuv
    // narxi (unit_price) allaqachon shu yerda "muzlatilar" edi, tan narx esa
    // hisobotda menu_items'dan JONLI o'qilardi — natijada narx keyin
    // o'zgartirilsa o'tgan oylarning foydasi ham o'zgarib ketardi.
    const info = db.prepare(
      `INSERT INTO order_items (order_id, menu_item_id, name_snapshot, unit_price, cost_price_snapshot, quantity, subtotal, added_by, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
    ).run(order.id, item.id, item.name, item.price, item.cost_price, qty, subtotal, waiterId, ts);

    // Taom omborga (masalan suv/salfetka) bog'langan bo'lsa — shu miqdorni
    // ombordan ayiramiz. Yetarli qoldiq bo'lmasa inventory.consume() xato otadi,
    // shu tranzaksiya (order_item qo'shilishi bilan birga) butunlay bekor bo'ladi.
    if (item.inventory_item_id) {
      inventory.consume(item.inventory_item_id, qty, { orderItemId: info.lastInsertRowid, userId: waiterId, productName: item.name });
    }

    return order.id;
  });

  const orderId = run();
  return buildOrderView(orderId);
}

function updateOrderItemQuantity(orderItemId, quantity, userId) {
  // 2026-09-10: YUQORI CHEGARA qo'shildi. Ilgari faqat "butun va musbat"
  // tekshirilardi — ya'ni {"quantity": 9007199254740991} yuborish
  // orders.total_amount ga ~9.0e19 yozar va hisobotni ABADIY buzardi
  // (yopilgan buyurtmani tuzatish yoki o'chirish uchun ilovada yo'l yo'q).
  const qty = parseQuantity(quantity);

  const run = db.transaction(() => {
    const orderItem = db.prepare('SELECT * FROM order_items WHERE id = ?').get(orderItemId);
    if (!orderItem) throw new OrderError('Buyurtma qatori topilmadi', 404);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderItem.order_id);
    if (!order || order.status !== 'open') {
      throw new OrderError('Bu buyurtma allaqachon yopilgan, o\'zgartirib bo\'lmaydi');
    }
    // 2026-09-10: ilgari bu tekshiruv YO'Q edi — bekor qilingan qatorning
    // miqdorini oshirish ombordan qoldiqni qayta sarflar, lekin qator hamon
    // 'cancelled' bo'lgani uchun na hisobga kirar, na uni qayta bekor qilib
    // qoldiqni qaytarib bo'lardi (cancelOrderItem faqat 'active' qatorni
    // qaytaradi). Ya'ni qoldiq butunlay yo'qolardi.
    if (orderItem.status !== 'active') {
      throw new OrderError("Bu qator bekor qilingan, miqdorini o'zgartirib bo'lmaydi");
    }

    // Miqdor o'zgarsa (masalan afitsiant + / − tugmasi bilan) va taom omborga
    // bog'langan bo'lsa — faqat FARQNI (delta) ombordan ayiramiz/qaytaramiz,
    // butun miqdorni emas (aks holda qoldiq noto'g'ri hisoblanardi).
    const delta = qty - orderItem.quantity;
    if (delta !== 0) {
      const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(orderItem.menu_item_id);
      if (menuItem && menuItem.inventory_item_id) {
        if (delta > 0) {
          inventory.consume(menuItem.inventory_item_id, delta, { orderItemId, userId, productName: menuItem.name });
        } else {
          inventory.release(menuItem.inventory_item_id, -delta, { orderItemId, userId });
        }
      }
    }

    const subtotal = orderItem.unit_price * qty;
    db.prepare('UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ?').run(qty, subtotal, orderItemId);
    return order.id;
  });

  const orderId = run();
  return buildOrderView(orderId);
}

// Afitsiant "🍽️ Oshxonaga yuborish" tugmasini bosganda — shu stolning ochiq
// buyurtmasidagi HALI YUBORILMAGAN (sent_at IS NULL) faol qatorlarning hammasini
// bitta paytda "yuborilgan" deb belgilaydi (sent_at = hozir). Faqat shundan keyin
// bu qatorlar oshpazning kitchen ekranida ko'rinadi (server/routes/chefKitchen.js
// filtrlaydi). Taom qo'shilganda (addItemToTable) sent_at ataylab bo'sh qoldiriladi —
// afitsiant avval bir nechta taom yig'ib, keyin hammasini birdan yuboradi.
function sendPendingItems(tableId) {
  const run = db.transaction(() => {
    const table = getTable(tableId);
    const orderRow = findOpenOrderRow(table.id);
    if (!orderRow) throw new OrderError('Bu stolda ochiq buyurtma yo\'q', 404);

    const pending = db
      .prepare("SELECT id FROM order_items WHERE order_id = ? AND status = 'active' AND sent_at IS NULL")
      .all(orderRow.id);
    if (pending.length === 0) {
      throw new OrderError("Yuborilmagan taom yo'q");
    }
    const ts = nowIso();
    const markSent = db.prepare('UPDATE order_items SET sent_at = ? WHERE id = ?');
    pending.forEach((p) => markSent.run(ts, p.id));

    return orderRow.id;
  });

  const orderId = run();
  return buildOrderView(orderId);
}

function cancelOrderItem(orderItemId, userId) {
  const run = db.transaction(() => {
    const orderItem = db.prepare('SELECT * FROM order_items WHERE id = ?').get(orderItemId);
    if (!orderItem) throw new OrderError('Buyurtma qatori topilmadi', 404);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderItem.order_id);
    if (!order || order.status !== 'open') {
      throw new OrderError('Bu buyurtma allaqachon yopilgan, o\'zgartirib bo\'lmaydi');
    }
    // Allaqachon bekor qilingan qatorni qayta bekor qilish ombordan ikki marta
    // qaytarib yubormasin uchun himoya (hozircha frontend buni chaqirmaydi, lekin
    // xavfsizlik uchun).
    if (orderItem.status === 'active' && orderItem.quantity > 0) {
      const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(orderItem.menu_item_id);
      if (menuItem && menuItem.inventory_item_id) {
        inventory.release(menuItem.inventory_item_id, orderItem.quantity, { orderItemId, userId });
      }
    }
    db.prepare("UPDATE order_items SET status = 'cancelled' WHERE id = ?").run(orderItemId);
    return order.id;
  });

  const orderId = run();
  return buildOrderView(orderId);
}

function closeTable(tableId, waiterId) {
  const run = db.transaction(() => {
    const table = getTable(tableId);
    const orderRow = findOpenOrderRow(table.id);
    if (!orderRow) throw new OrderError('Bu stolda ochiq buyurtma yo\'q', 404);

    const activeItems = db
      .prepare("SELECT subtotal FROM order_items WHERE order_id = ? AND status = 'active'")
      .all(orderRow.id);
    if (activeItems.length === 0) {
      throw new OrderError("Buyurtmada hech qanday taom yo'q, hisob-kitob qilib bo'lmaydi");
    }
    const total = activeItems.reduce((sum, it) => sum + it.subtotal, 0);
    const ts = nowIso();
    db.prepare(
      `UPDATE orders SET status = 'closed', closed_by = ?, closed_at = ?, total_amount = ? WHERE id = ?`
    ).run(waiterId, ts, total, orderRow.id);

    // Chekni afitsiant o'zi chop etmaydi — printer administrator kompyuteriga
    // ulangan, shu sabab "chop etish kutilmoqda" navbatiga qo'shiladi
    // (adminPrintRequests.js orqali admin panelida ko'rinadi).
    db.prepare('INSERT INTO print_requests (order_id, created_at) VALUES (?, ?)').run(orderRow.id, ts);

    return orderRow.id;
  });

  const orderId = run();
  return buildOrderView(orderId, { includeCancelled: true });
}

// Barcha taomi bekor qilingan (faol taom qolmagan) ochiq buyurtmani hisob-kitobsiz
// yopib, stolni bo'shatadi. closeTable() dan ATAYLAB alohida: u kamida bitta faol
// taom talab qiladi (bo'sh chek chiqmasin degan qoida bilan), lekin shu tufayli
// afitsiant xato bilan qo'shgan taomlarni bekor qilib qo'ysa (yoki mijoz umuman
// buyurtma bermay ketsa), stolni yopishning hech qanday yo'li qolmasdi — u
// abadiy "band" bo'lib qolaverardi (idx_orders_one_open_per_table bitta stolda
// faqat bitta ochiq buyurtmaga ruxsat bergani uchun yangi buyurtma ham ochilmasdi).
// Shu funksiya aynan shu tuzoqdan chiqish yo'li: chek/print_requests yozuvi
// yaratilmaydi (hisoblanadigan hech narsa yo'q), total_amount = 0 bilan yopiladi.
function cancelEmptyOrder(tableId, waiterId) {
  const run = db.transaction(() => {
    const table = getTable(tableId);
    const orderRow = findOpenOrderRow(table.id);
    if (!orderRow) throw new OrderError('Bu stolda ochiq buyurtma yo\'q', 404);

    const activeItems = db
      .prepare("SELECT id FROM order_items WHERE order_id = ? AND status = 'active'")
      .all(orderRow.id);
    if (activeItems.length > 0) {
      throw new OrderError(
        "Buyurtmada faol taomlar bor — avval hammasini bekor qiling yoki \"Hisob-kitob\" orqali yoping"
      );
    }

    // 2026-09-10: ilgari bu yerda status 'closed' qo'yilardi — natijada bekor
    // qilingan buyurtma adminReports '/summary' dagi orders_count'ga haqiqiy
    // buyurtma bo'lib qo'shilar, kassirBilling '/bills' ro'yxatida esa
    // 0 so'mlik soxta chek bo'lib chiqardi. Endi alohida 'cancelled' holati
    // (schema.sql CHECK + server/db.js migrateSyncOrderStatus()).
    const ts = nowIso();
    db.prepare(
      `UPDATE orders SET status = 'cancelled', closed_by = ?, closed_at = ?, total_amount = 0,
       note = 'Bekor qilindi (barcha taomlar bekor qilingan edi)' WHERE id = ?`
    ).run(waiterId, ts, orderRow.id);

    return orderRow.id;
  });

  const orderId = run();
  return buildOrderView(orderId, { includeCancelled: true });
}

function getReceipt(orderId) {
  return buildOrderView(orderId, { includeCancelled: true });
}

// Afitsiant "stollar" ekrani uchun: har bir faol stol + band/bo'sh holati + joriy summa.
function listTablesOverview() {
  const tables = db.prepare('SELECT * FROM tables WHERE is_active = 1 ORDER BY sort_order, id').all();
  const openOrders = db.prepare("SELECT * FROM orders WHERE status = 'open'").all();
  const byTable = new Map(openOrders.map((o) => [o.table_id, o]));

  const itemCountStmt = db.prepare(
    "SELECT COALESCE(SUM(quantity),0) AS cnt, COALESCE(SUM(subtotal),0) AS total FROM order_items WHERE order_id = ? AND status = 'active'"
  );

  return tables.map((t) => {
    const order = byTable.get(t.id);
    if (!order) {
      return { id: t.id, name: t.name, occupied: false, item_count: 0, total: 0, order_id: null };
    }
    const agg = itemCountStmt.get(order.id);
    return {
      id: t.id,
      name: t.name,
      occupied: true,
      item_count: agg.cnt,
      total: agg.total,
      order_id: order.id,
    };
  });
}

module.exports = {
  OrderError,
  getOpenOrderForTable,
  addItemToTable,
  updateOrderItemQuantity,
  sendPendingItems,
  cancelOrderItem,
  closeTable,
  cancelEmptyOrder,
  getReceipt,
  listTablesOverview,
  buildOrderView,
};
