// Afitsiant ekrani uchun menyu (GET /api/waiter/menu).
//
// Yig'ish mantig'ining o'zi (faol kategoriya + faol taom + variantlar +
// require_inventory_link filtri) server/services/menuQuery.js'da umumiy —
// kassir (kassirMenu.js) va landing (publicMenu.js) menyulari bilan bir xil
// (ilgari uchalasi deyarli bayt-baytiga bir xil kodni takrorlagan edi,
// 2026-09-10'da birlashtirildi). Bu yerga xos narsa qolmadi: afitsiant va
// kassir AYNAN bir xil maydonlarni oladi, farq faqat ruxsat darajasida
// (server/index.js'dagi hudud qoidalari).
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const menuQuery = require('../services/menuQuery');

const router = express.Router();

router.get('/menu', asyncRoute((req, res) => {
  res.json(menuQuery.staffMenu());
}));

module.exports = router;
