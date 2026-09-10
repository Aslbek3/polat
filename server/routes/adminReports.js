// Admin "Hisobot" bo'limi uchun API.
//
// 2026-09-10: barcha SQL `server/services/reports.js`ga ko'chirildi (loyiha
// qoidasi: route fayllari bazaga bevosita murojaat qilmaydi). Daromad
// manbalari va tan narx (COGS) qoidalari — ya'ni pul hisobining butun
// mantig'i — endi servisda, izohlari bilan birga. Bu yerda faqat HTTP
// qatlami: query'ni servisga uzatish va javob qaytarish.
const express = require('express');
const { getReceipt } = require('../services/orders');
const { asyncRoute } = require('../routeUtils');
const reports = require('../services/reports');

const router = express.Router();

router.get('/summary', asyncRoute((req, res) => {
  res.json(reports.getSummary(req.query));
}));

router.get('/orders', asyncRoute((req, res) => {
  res.json(reports.listOrders(req.query));
}));

router.get('/orders/:id/receipt', asyncRoute((req, res) => {
  res.json(getReceipt(req.params.id));
}));

module.exports = router;
