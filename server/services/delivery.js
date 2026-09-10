// Yetkazib berish (dastavkachi) xizmat qatlami — 2026-09-10.
//
// NEGA BU FAYL BOR: loyiha qoidasi bo'yicha route fayllari bazaga bevosita
// murojaat qilmaydi. `routes/courierOrders.js` bu qoidani buzib
// `db.prepare()` ni to'g'ridan-to'g'ri chaqirardi; endi u faqat HTTP qatlami.
//
// MUHIM (o'zgarmagan qoida): `customer_orders.status` allaqachon oshpaz
// tomonidan "tayyor" ma'nosida ishlatiladi ('completed' = taom tayyor).
// Shu sabab dastavkachining "yetkazdim" belgisi ATAYLAB alohida
// `delivered_at` ustunida saqlanadi — status'ga tegilmaydi, aks holda
// bitta maydon ikki xil ma'noni band qilib qolardi.

const { db, nowIso } = require('../db');

class DeliveryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Kuryer ekraniga qancha buyurtma yuboriladi. Ekran har 15 soniyada poll
// qiladi, shuning uchun chegara ham hajm, ham javob o'lchami uchun muhim.
const MAX_ROWS = 300;

// ⚠️ 2026-09-10: bu so'rov ILGARI CHEKLANMAGAN edi — `status != 'cancelled'`
// bo'lgan BARCHA yetkazib berish buyurtmalari, jumladan allaqachon
// yetkazilgan ARXIV ham qaytarilardi. Ikkita oqibati bor edi:
//   1. O'lchangan qat'iy chegara: pastdagi `IN (...)` SQLite'ning
//      SQLITE_MAX_VARIABLE_NUMBER (32766) chegarasiga uriladi —
//      32767-buyurtmadan boshlab kuryer ekrani BUTUNLAY 500 bilan o'lardi.
//   2. Undan ancha oldin: kuniga 10 ta yetkazish -> 1 yildan keyin har
//      15 soniyada ~3650 buyurtma va ~10 000 qator JSON uzatilardi.
// Kuryerga faqat yetkazilmaganlar va so'nggi sutkadagilar kerak.
//
// Items ATAYLAB bitta `IN (...)` so'rovi bilan olinadi (N+1 emas,
// 2026-09-09 tuzatishi): buyurtmalar soni qancha bo'lmasin doim 2 ta so'rov.
function listDeliveryOrders() {
  const rows = db
    .prepare(
      `SELECT * FROM customer_orders
       WHERE fulfillment = 'delivery' AND status != 'cancelled'
         AND (delivered_at IS NULL OR delivered_at >= datetime('now', '-1 day'))
       ORDER BY (delivered_at IS NOT NULL), id DESC
       LIMIT ?`
    )
    .all(MAX_ROWS);
  if (rows.length === 0) return [];

  const ids = rows.map((o) => o.id);
  const placeholders = ids.map(() => '?').join(',');
  const allItems = db
    .prepare(`SELECT * FROM customer_order_items WHERE customer_order_id IN (${placeholders})`)
    .all(...ids);

  const itemsByOrder = new Map();
  for (const it of allItems) {
    if (!itemsByOrder.has(it.customer_order_id)) itemsByOrder.set(it.customer_order_id, []);
    itemsByOrder.get(it.customer_order_id).push(it);
  }
  return rows.map((o) => ({ ...o, items: itemsByOrder.get(o.id) || [] }));
}

// "🚚 Yetkazildi" belgisi. Bekor qilib bo'lmaydi va idempotent himoyalangan —
// ikkinchi marta bosilsa aniq xabar qaytadi (xulq o'zgarmagan).
function markDelivered(orderId) {
  const existing = db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(orderId);
  if (!existing) throw new DeliveryError('Buyurtma topilmadi', 404);
  if (existing.fulfillment !== 'delivery') {
    throw new DeliveryError('Bu buyurtma yetkazib berish turida emas');
  }
  if (existing.status !== 'completed') {
    throw new DeliveryError('Buyurtma hali tayyor emas (oshxona tomonidan tasdiqlanmagan)');
  }
  if (existing.delivered_at) {
    throw new DeliveryError('Bu buyurtma allaqachon yetkazilgan deb belgilangan');
  }
  db.prepare('UPDATE customer_orders SET delivered_at = ? WHERE id = ?').run(nowIso(), orderId);
  return db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(orderId);
}

module.exports = { DeliveryError, listDeliveryOrders, markDelivered };
