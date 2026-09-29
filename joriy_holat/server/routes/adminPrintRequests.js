// Afitsiant stolni yopganda (server/services/orders.js closeTable()) yozadigan
// "chop etish kutilmoqda" navbati (print_requests) uchun API. Admin panelida
// (public/app.js, initAdminPrintRequests) poll qilinadi — hali chop etilmagan
// (printed_at IS NULL) yozuvlar stol nomi/summasi bilan ko'rsatiladi, "Chekni
// chop etish" tugmasi bosilganda receipt.html (QZ Tray orqali) yangi tabda
// ochiladi va shu bilan bir vaqtda shu yozuv "chop etildi" deb belgilanadi.
const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/unread', asyncRoute((req, res) => {
  const rows = db.prepare(`
    SELECT pr.id, pr.order_id, pr.created_at, o.total_amount, t.name AS table_name
    FROM print_requests pr
    JOIN orders o ON o.id = pr.order_id
    JOIN tables t ON t.id = o.table_id
    WHERE pr.printed_at IS NULL
    ORDER BY pr.id ASC
  `).all();
  res.json(rows);
}));

router.post('/:id/printed', asyncRoute((req, res) => {
  const row = db.prepare('SELECT * FROM print_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: "So'rov topilmadi" });
  if (row.printed_at) return res.json(row); // allaqachon belgilangan — idempotent

  const ts = nowIso();
  const name = req.user.full_name || req.user.username;
  db.prepare('UPDATE print_requests SET printed_at = ?, printed_by = ? WHERE id = ?').run(ts, name, req.params.id);
  res.json(db.prepare('SELECT * FROM print_requests WHERE id = ?').get(req.params.id));
}));

module.exports = router;
