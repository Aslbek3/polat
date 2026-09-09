// Kassir "Hisoblash" (qo'lda chek) + "Statistika" (yopilgan hisoblar ro'yxati)
// bo'limlari uchun API — 2026-09-09'da qo'shildi. server/index.js'da
// kassirTables.js bilan BIR XIL '/api/kassir' prefiksiga (alohida
// requireRole(['admin','kassir'])) ulanadi — ikkala router ham shu yo'l
// ostida, marshrutlari kesishmaydi (bu yerda /manual-bills* va /bills,
// kassirTables.js'da /tables*).
const express = require('express');
const { db } = require('../db');
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

function dateRange(query) {
  const from = query.from ? String(query.from).trim() : null;
  const to = query.to ? String(query.to).trim() : null;
  return { from, to };
}

// Kassirning "Statistika" ekrani uchun: ikkala yopilgan-hisob manbasi
// (dine-in `orders`, stol hisob-kitobi — afitsiant HAM yopgan bo'lishi
// mumkin — va shu yerdagi `manual_bills`, qo'lda chek) birlashtirilib,
// vaqt bo'yicha kamayish tartibida qaytariladi. Har biri o'z cheki uchun
// (kind='table' -> GET /kassir/orders/:id/receipt, kind='manual' ->
// GET /kassir/manual-bills/:id/receipt) qayta ochilishi mumkin.
router.get('/bills', asyncRoute((req, res) => {
  const { from, to } = dateRange(req.query);

  let tableSql = `
    SELECT o.id AS id, 'table' AS kind, t.name AS label, o.total_amount AS total_amount,
           o.closed_at AS at, COALESCE(cu.full_name, cu.username) AS by_name
    FROM orders o
    JOIN tables t ON t.id = o.table_id
    LEFT JOIN users cu ON cu.id = o.closed_by
    WHERE o.status = 'closed'
  `;
  const tableParams = [];
  if (from) { tableSql += ' AND date(o.closed_at) >= date(?)'; tableParams.push(from); }
  if (to) { tableSql += ' AND date(o.closed_at) <= date(?)'; tableParams.push(to); }

  let manualSql = `
    SELECT mb.id AS id, 'manual' AS kind, 'Qo''lda hisoblash' AS label, mb.total_amount AS total_amount,
           mb.created_at AS at, COALESCE(u.full_name, u.username) AS by_name
    FROM manual_bills mb
    JOIN users u ON u.id = mb.created_by
    WHERE 1=1
  `;
  const manualParams = [];
  if (from) { manualSql += ' AND date(mb.created_at) >= date(?)'; manualParams.push(from); }
  if (to) { manualSql += ' AND date(mb.created_at) <= date(?)'; manualParams.push(to); }

  const combined = [
    ...db.prepare(tableSql).all(...tableParams),
    ...db.prepare(manualSql).all(...manualParams),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 300);

  const totalAmount = combined.reduce((sum, r) => sum + (r.total_amount || 0), 0);
  res.json({ bills: combined, total_amount: totalAmount, count: combined.length });
}));

module.exports = router;
