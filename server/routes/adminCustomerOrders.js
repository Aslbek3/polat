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
const { asyncRoute } = require('../routeUtils');
const customerOrders = require('../services/customerOrders');

const router = express.Router();

// 2026-09-10 (A-07): `?status=new|active|all` filtri (standart `all` —
// mavjud frontend buzilmasin). SQL, LIMIT va items'ni bitta so'rovda
// biriktirish (N+1 tuzatishi) servisga ko'chirildi — route'da `db.prepare`
// bo'lmasligi kerak (services/customerOrders.js listOrders() izohiga qarang).
router.get('/', asyncRoute((req, res) => {
  res.json(customerOrders.listOrders({ status: req.query.status }));
}));

// Bitta buyurtma items bilan (2026-09-10, A-02) — hisobot ro'yxatidagi
// kind='online' qatorining chekini ochish uchun.
router.get('/:id', asyncRoute((req, res) => {
  res.json(customerOrders.getOrderWithItems(req.params.id));
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
