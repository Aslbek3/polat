// Kassir (kassa/hisob-kitob) ekrani uchun API — 2026-09-09'da qo'shildi.
// Faqat 'kassir' va 'admin' roliga ochiq (server/index.js'da
// requireRole(['admin','kassir']) bilan ulanadi). Afitsiantdan farqli —
// kassir taom QO'SHA OLMAYDI (menyuni ko'rmaydi), faqat: stollar ro'yxatini
// ko'radi, joriy buyurtmani (o'qish uchun) ko'radi, hisob-kitob qilib
// (stolni yopish) chek chiqaradi. Bularning barchasi allaqachon mavjud
// server/services/orders.js xizmat qatlamidan foydalanadi — afitsiant bilan
// bir xil ma'lumot/mantiq, faqat "taom qo'shish" yo'q.
const express = require('express');
const { db } = require('../db');
const {
  listTablesOverview,
  getOpenOrderForTable,
  closeTable,
  cancelEmptyOrder,
  getReceipt,
} = require('../services/orders');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/tables', asyncRoute((req, res) => {
  res.json(listTablesOverview());
}));

router.get('/tables/:id/order', asyncRoute((req, res) => {
  const view = getOpenOrderForTable(req.params.id);
  res.json(view); // null bo'lishi mumkin — frontend "ochiq buyurtma yo'q" holatini shunday biladi
}));

router.post('/tables/:id/close', asyncRoute((req, res) => {
  const receipt = closeTable(req.params.id, req.user.id);
  res.json(receipt);
}));

// Faol taomi qolmagan (afitsiant hammasini bekor qilgan) ochiq buyurtmani
// hisob-kitobsiz yopib, stolni bo'shatadi — closeTable() bo'sh chekni rad
// etgani uchun, aks holda stol abadiy "band" bo'lib qolar edi va kassir buni
// hech qanday tuzata olmasdi (services/orders.js'dagi cancelEmptyOrder()
// izohiga qarang).
router.post('/tables/:id/cancel-order', asyncRoute((req, res) => {
  const view = cancelEmptyOrder(req.params.id, req.user.id);
  res.json(view);
}));

router.get('/tables/:id/receipt/latest', asyncRoute((req, res) => {
  const order = db
    // 2026-09-10: bekor qilingan buyurtma chiqarilmaydi — u chek EMAS
    .prepare("SELECT id FROM orders WHERE table_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 1")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "Bu stol uchun hali buyurtma bo'lmagan" });
  res.json(getReceipt(order.id));
}));

router.get('/orders/:id/receipt', asyncRoute((req, res) => {
  res.json(getReceipt(req.params.id));
}));

module.exports = router;
