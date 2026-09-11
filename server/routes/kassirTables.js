// Kassir (kassa/hisob-kitob) ekrani uchun API — 2026-09-09'da qo'shildi.
// Faqat 'kassir' va 'admin' roliga ochiq (server/index.js'da
// requireRole(['admin','kassir']) bilan ulanadi). Afitsiantdan farqli —
// kassir taom QO'SHA OLMAYDI (menyuni ko'rmaydi), faqat: stollar ro'yxatini
// ko'radi, joriy buyurtmani (o'qish uchun) ko'radi, hisob-kitob qilib
// (stolni yopish) chek chiqaradi. Bularning barchasi allaqachon mavjud
// server/services/orders.js xizmat qatlamidan foydalanadi — afitsiant bilan
// bir xil ma'lumot/mantiq, faqat "taom qo'shish" yo'q.
const express = require('express');
const {
  listTablesOverview,
  getOpenOrderForTable,
  closeTable,
  cancelEmptyOrder,
  getReceipt,
  getLatestReceiptForTable,
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

// `allow_unsent_ids` (2026-09-11) — kassir oshxonaga yuborilmagan taomlar
// ro'yxatini ko'rib ANIQ tasdiqlagan qatorlar (public/kassir/order.js).
// Faqat shu qatorlarga ruxsat — ro'yxatda yo'q yuborilmagan taom (masalan
// tasdiqlash paytida afitsiant qo'shgan) bo'lsa server baribir rad etadi.
// Afitsiant route'ida bu parametr ATAYLAB yo'q — uning ekrani yuborilmagan
// taom bor paytda yopish tugmasini ko'rsatmaydi (X-14), u avval yuboradi.
router.post('/tables/:id/close', asyncRoute((req, res) => {
  const raw = req.body && req.body.allow_unsent_ids;
  const allowUnsentIds = Array.isArray(raw) ? raw.map(Number).filter(Number.isSafeInteger) : [];
  const receipt = closeTable(req.params.id, req.user.id, { allowUnsentIds });
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

// 2026-09-10: SQL services/orders.js getLatestReceiptForTable()ga ko'chirildi
// (route'da db.prepare bo'lmasin; waiterOrders.js bilan umumiy). Bekor
// qilingan buyurtma chiqarilmaydi, topilmasa 404 — avvalgidek.
router.get('/tables/:id/receipt/latest', asyncRoute((req, res) => {
  res.json(getLatestReceiptForTable(req.params.id));
}));

router.get('/orders/:id/receipt', asyncRoute((req, res) => {
  res.json(getReceipt(req.params.id));
}));

module.exports = router;
