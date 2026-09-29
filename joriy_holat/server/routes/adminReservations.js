const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  res.json(db.prepare('SELECT * FROM reservations ORDER BY res_date DESC, res_time DESC, id DESC').all());
}));

router.put('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Bron topilmadi' });
  const status = req.body?.status;
  if (!['new', 'confirmed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: "Holatni to'g'ri tanlang" });
  }
  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id));
}));

router.delete('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Bron topilmadi' });
  db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
