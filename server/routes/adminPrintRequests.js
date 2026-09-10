// Afitsiant stolni yopganda (server/services/orders.js closeTable()) yozadigan
// "chop etish kutilmoqda" navbati (print_requests) uchun API. Admin panelida
// (public/app.js, initAdminPrintRequests) poll qilinadi — hali chop etilmagan
// (printed_at IS NULL) yozuvlar stol nomi/summasi bilan ko'rsatiladi, "Chekni
// chop etish" tugmasi bosilganda receipt.html (QZ Tray orqali) yangi tabda
// ochiladi va shu bilan bir vaqtda shu yozuv "chop etildi" deb belgilanadi.
//
// So'rovlarning o'zi server/services/printRequests.js'da.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const printRequests = require('../services/printRequests');

const router = express.Router();

router.get('/unread', asyncRoute((req, res) => {
  res.json(printRequests.listUnprinted());
}));

router.post('/:id/printed', asyncRoute((req, res) => {
  const name = req.user.full_name || req.user.username;
  const row = printRequests.markPrinted(req.params.id, name);
  if (!row) return res.status(404).json({ error: "So'rov topilmadi" });
  res.json(row);
}));

module.exports = router;
