const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  res.json(db.prepare('SELECT * FROM tables ORDER BY sort_order, id').all());
}));

router.post('/', asyncRoute((req, res) => {
  const { name, sort_order } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nom kiritilishi shart' });
  const info = db
    .prepare('INSERT INTO tables (name, sort_order, is_active, created_at) VALUES (?, ?, 1, ?)')
    .run(String(name).trim(), Number(sort_order) || 0, nowIso());
  res.json(db.prepare('SELECT * FROM tables WHERE id = ?').get(info.lastInsertRowid));
}));

router.put('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Stol topilmadi' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
  const sortOrder = req.body?.sort_order !== undefined ? Number(req.body.sort_order) : existing.sort_order;
  db.prepare('UPDATE tables SET name = ?, sort_order = ? WHERE id = ?').run(name, sortOrder, req.params.id);
  res.json(db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id));
}));

router.delete('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Stol topilmadi' });
  const openOrder = db.prepare("SELECT id FROM orders WHERE table_id = ? AND status = 'open'").get(req.params.id);
  if (openOrder) return res.status(400).json({ error: "Bu stolda ochiq buyurtma bor, avval hisob-kitob qiling" });
  db.prepare('UPDATE tables SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
