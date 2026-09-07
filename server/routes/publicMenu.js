// Ochiq (login shart emas) endpoint — landing sahifadagi menyu bo'limi shu
// yerdan haqiqiy (admin/menu.html orqali kiritilgan) taomlar ro'yxatini oladi.
// server/routes/waiterMenu.js'dagi bilan bir xil so'rov mantig'i.
const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, id')
    .all();
  const itemsStmt = db.prepare(
    'SELECT id, name, price FROM menu_items WHERE category_id = ? AND is_active = 1 AND is_available = 1 ORDER BY sort_order, id'
  );
  const result = categories
    .map((cat) => ({ id: cat.id, name: cat.name, items: itemsStmt.all(cat.id) }))
    .filter((cat) => cat.items.length > 0);
  res.json(result);
}));

module.exports = router;
