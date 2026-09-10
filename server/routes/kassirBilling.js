// Kassir "Hisoblash" (qo'lda chek) + "Statistika" (yopilgan hisoblar ro'yxati)
// bo'limlari uchun API — 2026-09-09'da qo'shildi. server/index.js'da
// kassirTables.js bilan BIR XIL '/api/kassir' prefiksiga (alohida
// requireRole(['admin','kassir'])) ulanadi — ikkala router ham shu yo'l
// ostida, marshrutlari kesishmaydi (bu yerda /manual-bills* va /bills,
// kassirTables.js'da /tables*).
//
// 2026-09-10: `/bills` SQL'i `services/manualBills.js` `listBills()` ga
// ko'chirildi — route endi bazaga bevosita murojaat qilmaydi.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const manualBills = require('../services/manualBills');

const router = express.Router();

router.post('/manual-bills', asyncRoute((req, res) => {
  const receipt = manualBills.createManualBill(req.body.items, req.user.id);
  res.status(201).json(receipt);
}));

router.get('/manual-bills/:id/receipt', asyncRoute((req, res) => {
  res.json(manualBills.getManualBillReceipt(req.params.id));
}));

router.get('/bills', asyncRoute((req, res) => {
  res.json(manualBills.listBills(req.query));
}));

module.exports = router;
