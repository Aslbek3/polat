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

  // NEGA (2026-09-10): ilgari ikkala manba JS'da birlashtirilib `slice(0, 300)`
  // bilan qisqartirilar, jami summa va son esa SHU QISQARTIRILGAN ro'yxatdan
  // hisoblanardi. Natijada oraliqda 300 dan ko'p hisob bo'lsa kassir ekranidagi
  // "Jami summa" va "Yopilgan hisoblar" jimgina KAM ko'rsatardi (hech qanday
  // ogohlantirishsiz). Endi ikkala manba bitta UNION ALL so'roviga birlashtirildi
  // va u ikki marta ishlatiladi: biri — ko'rsatiladigan ro'yxat (avvalgidek eng
  // yangi 300 tasi), ikkinchisi — oraliqdagi BARCHA hisoblar bo'yicha SUM/COUNT.
  const unionSql = `${tableSql} UNION ALL ${manualSql}`;
  const unionParams = [...tableParams, ...manualParams];

  const bills = db
    .prepare(`SELECT * FROM (${unionSql}) b ORDER BY b.at DESC LIMIT 300`)
    .all(...unionParams);
  const totals = db
    .prepare(`SELECT COALESCE(SUM(b.total_amount), 0) AS total_amount, COUNT(*) AS cnt FROM (${unionSql}) b`)
    .get(...unionParams);

  res.json({ bills, total_amount: totals.total_amount, count: totals.cnt });
}));

module.exports = router;
