// Admin "Buyurtmalar" (landing sahifadan kelgan mijoz buyurtmalari) bo'limi.
//
// 2026-09-10: holat o'zgartirish va o'chirish mantig'i BUTUNLAY
// `server/services/customerOrders.js`ga ko'chirildi. Ilgari ombor qoldig'iga
// ta'sir qiladigan qoidalar shu faylda, chefKitchen.js'da va
// publicCustomerOrders.js'da mustaqil ravishda qo'lda yozilgan edi — auditda
// topilgan uchta xato ham aynan shundan kelib chiqqan (servis faylidagi
// izohga qarang). Endi bu route faqat HTTP qatlami: kirishni oladi va
// servisni chaqiradi.
const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');
const customerOrders = require('../services/customerOrders');

const router = express.Router();

// ⚠️ 2026-09-10: ilgari bu yerda CHEKLOV YO'Q edi va ustiga N+1 so'rov
// bor edi (har bir buyurtma uchun alohida items so'rovi). Sahifa har 15
// soniyada poll qiladi: kuniga 30 ta buyurtma -> 1 yildan keyin ~11 000
// buyurtma -> HAR 15 SONIYADA 11 001 ta sinxron SQLite so'rovi.
// better-sqlite3 sinxron bo'lgani uchun bu vaqtda butun server (oshxona
// ekrani, chek chop etish — hammasi) bloklanadi.
// Endi: LIMIT + items uchun BITTA `IN (...)` so'rov (aynan
// courierOrders.js da qilingan tuzatish, bu yerga qo'llanmagan edi).
const ORDERS_PAGE_SIZE = 200;

router.get('/', asyncRoute((req, res) => {
  const orders = db
    .prepare('SELECT * FROM customer_orders ORDER BY id DESC LIMIT ?')
    .all(ORDERS_PAGE_SIZE);
  if (orders.length === 0) return res.json([]);

  const ids = orders.map((o) => o.id);
  const placeholders = ids.map(() => '?').join(',');
  const allItems = db
    .prepare(`SELECT * FROM customer_order_items WHERE customer_order_id IN (${placeholders})`)
    .all(...ids);

  const itemsByOrder = new Map();
  for (const it of allItems) {
    if (!itemsByOrder.has(it.customer_order_id)) itemsByOrder.set(it.customer_order_id, []);
    itemsByOrder.get(it.customer_order_id).push(it);
  }
  res.json(orders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) || [] })));
}));

router.put('/:id', asyncRoute((req, res) => {
  // Admin har qanday holatga o'tkaza oladi (oshpaz ekranidan farqli —
  // u faqat 'confirmed'/'completed' bilan cheklangan).
  res.json(customerOrders.transition(req.params.id, req.body?.status));
}));

router.delete('/:id', asyncRoute((req, res) => {
  res.json(customerOrders.deleteOrder(req.params.id));
}));

module.exports = router;
