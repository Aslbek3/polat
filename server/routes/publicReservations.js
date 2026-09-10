// Ochiq (login shart emas) endpoint — landing sahifadagi "Stol bron qilish"
// oynasidan yuboriladi. server/index.js'da bu router auth.requireAuth'dan
// OLDIN ulanadi, shu sabab mehmon hech qanday sessiyasiz murojaat qila oladi.
//
// 2026-09-10: validatsiya va INSERT `server/services/reservations.js`
// `createFromPublic()` ga ko'chirildi (loyiha qoidasi: route bazaga bevosita
// murojaat qilmaydi). Xato xabarlari va 400 kodi avvalgidek.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const reservations = require('../services/reservations');

const router = express.Router();

router.post('/', asyncRoute((req, res) => {
  res.json(reservations.createFromPublic(req.body));
}));

module.exports = router;
