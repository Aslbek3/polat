// Dastavkachi (courier) ekrani uchun o'qish-og'irlikli API. Faqat 'courier' va
// 'admin' roliga ochiq (server/index.js'da requireRole(['admin','courier'])
// bilan ulanadi). Faqat "yetkazib berish" (fulfillment='delivery') turidagi
// mijoz buyurtmalari bilan ishlaydi — dine-in `orders` jadvaliga umuman
// tegmaydi (afitsiant/oshpaz hududi).
//
// MUHIM: `customer_orders.status` maydoni allaqachon oshpaz tomonidan
// "tayyor" ma'nosida ishlatiladi (server/routes/chefKitchen.js, 'completed' =
// taom tayyor). Shu sabab dastavkachining "yetkazdim" belgisi ATAYLAB alohida
// `delivered_at` ustunida saqlanadi (status'ga tegilmaydi) — ikkalasi bir xil
// qiymatni ikki xil ma'noda band qilib qolmasin uchun.
const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

// 2026-09-09'da tuzatildi: ilgari har bir buyurtma uchun alohida items
// so'rovi yuborilardi (N+1) — bu ekran har 15 soniyada poll qilingani uchun
// buyurtmalar soni ortgan sari DB'ga ketma-ket so'rovlar soni ham
// proporsional o'sib borardi. Endi items bitta IN(...) so'rov bilan olinib,
// JS tomonida guruhlanadi — buyurtmalar soni qancha bo'lmasin doim 2 ta so'rov.
router.get('/orders', asyncRoute((req, res) => {
  // ⚠️ 2026-09-10: bu so'rov ILGARI CHEKLANMAGAN edi — `status != 'cancelled'`
  // bo'lgan BARCHA yetkazib berish buyurtmalari, jumladan allaqachon
  // yetkazilgan ARXIV ham (faqat oxiriga saralanardi) qaytarilardi. Ekran
  // esa har 15 soniyada poll qiladi. Ikkita oqibati bor edi:
  //   1. O'lchangan qat'iy chegara: pastdagi `IN (...)` SQLite'ning
  //      SQLITE_MAX_VARIABLE_NUMBER (32766) chegarasiga uriladi —
  //      32767-buyurtmadan boshlab kuryer ekrani BUTUNLAY 500 bilan o'ladi.
  //   2. Undan ancha oldin: kuniga 10 ta yetkazish -> 1 yildan keyin har
  //      15 soniyada ~3650 buyurtma va ~10 000 qator JSON uzatiladi.
  // Kuryerga faqat yetkazilmaganlar va so'nggi sutkadagilar kerak.
  const MAX_ROWS = 300;
  const rows = db
    .prepare(
      `SELECT * FROM customer_orders
       WHERE fulfillment = 'delivery' AND status != 'cancelled'
         AND (delivered_at IS NULL OR delivered_at >= datetime('now', '-1 day'))
       ORDER BY (delivered_at IS NOT NULL), id DESC
       LIMIT ?`
    )
    .all(MAX_ROWS);
  if (rows.length === 0) return res.json([]);
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
  res.json(rows.map((o) => ({ ...o, items: itemsByOrder.get(o.id) || [] })));
}));

router.put('/orders/:id/deliver', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Buyurtma topilmadi' });
  if (existing.fulfillment !== 'delivery') {
    return res.status(400).json({ error: "Bu buyurtma yetkazib berish turida emas" });
  }
  if (existing.status !== 'completed') {
    return res.status(400).json({ error: "Buyurtma hali tayyor emas (oshxona tomonidan tasdiqlanmagan)" });
  }
  if (existing.delivered_at) {
    return res.status(400).json({ error: 'Bu buyurtma allaqachon yetkazilgan deb belgilangan' });
  }
  db.prepare('UPDATE customer_orders SET delivered_at = ? WHERE id = ?').run(nowIso(), req.params.id);
  res.json(db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(req.params.id));
}));

module.exports = router;
