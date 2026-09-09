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

router.get('/', asyncRoute((req, res) => {
  const orders = db.prepare('SELECT * FROM customer_orders ORDER BY id DESC').all();
  const itemsStmt = db.prepare('SELECT * FROM customer_order_items WHERE customer_order_id = ?');
  res.json(orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) })));
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
