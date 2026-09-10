// Admin "Hisobot" bo'limi uchun API.
//
// 2026-09-10: barcha SQL `server/services/reports.js`ga ko'chirildi (loyiha
// qoidasi: route fayllari bazaga bevosita murojaat qilmaydi). Daromad
// manbalari va tan narx (COGS) qoidalari — ya'ni pul hisobining butun
// mantig'i — endi servisda, izohlari bilan birga. Bu yerda faqat HTTP
// qatlami: query'ni servisga uzatish va javob qaytarish.
const express = require('express');
const { getReceipt } = require('../services/orders');
const { getManualBillReceipt } = require('../services/manualBills');
const { asyncRoute } = require('../routeUtils');
const reports = require('../services/reports');

const router = express.Router();

router.get('/summary', asyncRoute((req, res) => {
  res.json(reports.getSummary(req.query));
}));

// 2026-09-10 (A-02, A-22): javob hamon MASSIV (frontend buzilmasin), lekin
// endi uch manbani o'z ichiga oladi va har elementda `kind` bor
// (services/reports.js listOrders() izohiga qarang). Ro'yxat 200 tada
// kesiladi — cheklovsiz jami son `X-Total-Count` sarlavhasida, frontend
// "oxirgi 200 tasi ko'rsatilmoqda (jami N)" deb yozishi uchun.
router.get('/orders', asyncRoute((req, res) => {
  const { orders, total_count: totalCount } = reports.listOrders(req.query);
  res.setHeader('X-Total-Count', String(totalCount));
  res.json(orders);
}));

// kind='table' cheki.
router.get('/orders/:id/receipt', asyncRoute((req, res) => {
  res.json(getReceipt(req.params.id));
}));

// kind='manual' cheki (2026-09-10, A-02). NEGA: ro'yxatga kassirning qo'lda
// cheklari qo'shildi, lekin `/orders/:id/receipt` faqat stol buyurtmasini
// ochadi — id'lar turli jadvallardan, ya'ni qo'lda chek #5 uchun u BOSHQA
// (stol #5) chekni ko'rsatib yuborardi. kind='online' uchun esa
// `GET /api/admin/customer-orders/:id` (items bilan) olinadi va chek
// frontendda `openCustomerReceiptModal(order)` bilan quriladi (public/app.js).
router.get('/manual-bills/:id/receipt', asyncRoute((req, res) => {
  res.json(getManualBillReceipt(req.params.id));
}));

module.exports = router;
