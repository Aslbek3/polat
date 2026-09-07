const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  const orders = db.prepare('SELECT * FROM customer_orders ORDER BY id DESC').all();
  const itemsStmt = db.prepare('SELECT * FROM customer_order_items WHERE customer_order_id = ?');
  res.json(orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) })));
}));

router.put('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Buyurtma topilmadi' });
  const status = req.body?.status;
  if (!['new', 'confirmed', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: "Holatni to'g'ri tanlang" });
  }
  db.prepare('UPDATE customer_orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(req.params.id));
}));

router.delete('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Buyurtma topilmadi' });
  const run = db.transaction(() => {
    db.prepare('DELETE FROM customer_order_items WHERE customer_order_id = ?').run(req.params.id);
    db.prepare('DELETE FROM customer_orders WHERE id = ?').run(req.params.id);
  });
  run();
  res.json({ ok: true });
}));

module.exports = router;
