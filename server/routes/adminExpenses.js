const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');
const { parseAmount, parseDate, parseText } = require('../validation');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT e.*, COALESCE(u.full_name, u.username) AS created_by_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND e.expense_date >= ?'; params.push(from); }
  if (to) { sql += ' AND e.expense_date <= ?'; params.push(to); }
  sql += ' ORDER BY e.expense_date DESC, e.id DESC';
  res.json(db.prepare(sql).all(...params));
}));

router.post('/', asyncRoute((req, res) => {
  const { amount, expense_date, note, category } = req.body || {};
  // 2026-09-10: summaga YUQORI CHEGARA va sanaga FORMAT tekshiruvi qo'shildi.
  // Sana ilgari umuman tekshirilmasdi va bu jimgina buzilishga olib kelardi:
  // xarajat sanasi SATR sifatida solishtiriladi (`expense_date >= ?`), daromad
  // esa `date()` bilan normallashtiriladi. Format boshqacha bo'lsa (masalan
  // "10.09.2026") xarajat HECH QANDAY sanali filtrga tushmaydi, lekin
  // filtrsiz jamiga kiradi — "Hisobot" sahifasi filtr bilan va filtrsiz
  // TURLI sof foyda ko'rsatardi va sabab hech qayerda ko'rinmasdi.
  const amountNum = parseAmount(amount, { field: 'Summa' });
  const date = expense_date && String(expense_date).trim()
    ? parseDate(expense_date, { field: 'Sana' })
    : nowIso().slice(0, 10);
  const noteText = parseText(note, { field: 'Izoh', max: 1000 });
  const categoryText = parseText(category, { field: 'Turkum', max: 100 });
  const info = db
    .prepare(
      `INSERT INTO expenses (amount, expense_date, note, category, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(amountNum, date, noteText, categoryText, req.user.id, nowIso());
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid));
}));

router.put('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Xarajat topilmadi' });
  // POST bilan bir xil tekshiruvlar (2026-09-10) — ilgari PUT'da summaga
  // chegara ham, sanaga format tekshiruvi ham yo'q edi.
  const amount = req.body?.amount !== undefined ? parseAmount(req.body.amount, { field: 'Summa' }) : existing.amount;
  const date = req.body?.expense_date !== undefined
    ? parseDate(req.body.expense_date, { field: 'Sana' })
    : existing.expense_date;
  const note = req.body?.note !== undefined ? parseText(req.body.note, { field: 'Izoh', max: 1000 }) : existing.note;
  const category = req.body?.category !== undefined
    ? parseText(req.body.category, { field: 'Turkum', max: 100 })
    : existing.category;
  db.prepare('UPDATE expenses SET amount = ?, expense_date = ?, note = ?, category = ? WHERE id = ?').run(
    amount, date, note, category, req.params.id
  );
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id));
}));

router.delete('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Xarajat topilmadi' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
