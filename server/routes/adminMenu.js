const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

// ---------------- Kategoriyalar ----------------

router.get('/categories', asyncRoute((req, res) => {
  const rows = db.prepare('SELECT * FROM menu_categories ORDER BY sort_order, id').all();
  res.json(rows);
}));

router.post('/categories', asyncRoute((req, res) => {
  const { name, sort_order } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nom kiritilishi shart' });
  const ts = nowIso();
  const info = db
    .prepare('INSERT INTO menu_categories (name, sort_order, is_active, created_at) VALUES (?, ?, 1, ?)')
    .run(String(name).trim(), Number(sort_order) || 0, ts);
  res.json(db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(info.lastInsertRowid));
}));

router.put('/categories/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
  const sortOrder = req.body?.sort_order !== undefined ? Number(req.body.sort_order) : existing.sort_order;
  const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;
  db.prepare('UPDATE menu_categories SET name = ?, sort_order = ?, is_active = ? WHERE id = ?').run(
    name, sortOrder, isActive, req.params.id
  );
  res.json(db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(req.params.id));
}));

router.delete('/categories/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM menu_categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  db.prepare('UPDATE menu_categories SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------------- Taomlar ----------------

router.get('/items', asyncRoute((req, res) => {
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const rows = categoryId
    ? db.prepare('SELECT * FROM menu_items WHERE category_id = ? ORDER BY sort_order, id').all(categoryId)
    : db.prepare('SELECT * FROM menu_items ORDER BY category_id, sort_order, id').all();
  res.json(rows);
}));

router.post('/items', asyncRoute((req, res) => {
  const { category_id, name, price, sort_order } = req.body || {};
  const categoryId = Number(category_id);
  const priceNum = Number(price);
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nom kiritilishi shart' });
  if (!Number.isFinite(categoryId)) return res.status(400).json({ error: 'Kategoriya tanlanmagan' });
  if (!Number.isFinite(priceNum) || priceNum < 0) return res.status(400).json({ error: "Narx noto'g'ri" });
  const category = db.prepare('SELECT id FROM menu_categories WHERE id = ?').get(categoryId);
  if (!category) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  const ts = nowIso();
  const info = db
    .prepare(
      `INSERT INTO menu_items (category_id, name, price, is_available, is_active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 1, 1, ?, ?, ?)`
    )
    .run(categoryId, String(name).trim(), Math.round(priceNum), Number(sort_order) || 0, ts, ts);
  res.json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid));
}));

router.put('/items/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Taom topilmadi' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
  const price = req.body?.price !== undefined ? Math.round(Number(req.body.price)) : existing.price;
  const categoryId = req.body?.category_id !== undefined ? Number(req.body.category_id) : existing.category_id;
  const sortOrder = req.body?.sort_order !== undefined ? Number(req.body.sort_order) : existing.sort_order;
  const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Narx noto'g'ri" });
  db.prepare(
    'UPDATE menu_items SET name = ?, price = ?, category_id = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ?'
  ).run(name, price, categoryId, sortOrder, isActive, nowIso(), req.params.id);
  res.json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id));
}));

router.patch('/items/:id/availability', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Taom topilmadi' });
  const isAvailable = req.body?.is_available ? 1 : 0;
  db.prepare('UPDATE menu_items SET is_available = ?, updated_at = ? WHERE id = ?').run(
    isAvailable, nowIso(), req.params.id
  );
  res.json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id));
}));

router.delete('/items/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Taom topilmadi' });
  db.prepare('UPDATE menu_items SET is_active = 0, updated_at = ? WHERE id = ?').run(nowIso(), req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
