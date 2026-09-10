// Admin "Xodimlar" bo'limi uchun API.
//
// 2026-09-10: barcha SQL va qoidalar `server/services/users.js`ga ko'chirildi
// (loyiha qoidasi: route fayllari bazaga bevosita murojaat qilmaydi).
// Bu yerda faqat HTTP qatlami qoldi: kirishni olish, servisni chaqirish,
// javob qaytarish. Xatolar servisdagi `UserError` (o'z `status` maydoni
// bilan) orqali `asyncRoute`da HTTP kodga aylanadi — status kodlar va
// xabarlar avvalgidek.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const users = require('../services/users');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  res.json(users.listUsers());
}));

router.post('/', asyncRoute((req, res) => {
  res.json(users.createUser(req.body));
}));

router.put('/:id', asyncRoute((req, res) => {
  res.json(users.updateUser(req.params.id, req.body));
}));

router.post('/:id/reset-password', asyncRoute((req, res) => {
  res.json(users.resetPassword(req.params.id, req.body?.password));
}));

router.delete('/:id', asyncRoute((req, res) => {
  // `req.user.id` — sof HTTP qatlamidagi ma'lumot (kim so'rov yubordi),
  // shu sabab servisga `actorId` sifatida uzatiladi: "o'zingizni o'chira
  // olmaysiz" tekshiruvi u yerdagi boshqa himoyalar bilan bir zanjirda
  // turishi kerak.
  res.json(users.deleteUser(req.params.id, req.user.id));
}));

module.exports = router;
