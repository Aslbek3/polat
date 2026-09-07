const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

// Faqat faol kategoriya + faol va mavjud (tugamagan) taomlar, kategoriya bo'yicha guruhlangan.
router.get('/menu', asyncRoute((req, res) => {
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, id')
    .all();
  const itemsStmt = db.prepare(
    'SELECT * FROM menu_items WHERE category_id = ? AND is_active = 1 AND is_available = 1 ORDER BY sort_order, id'
  );
  const result = categories
    .map((cat) => ({ ...cat, items: itemsStmt.all(cat.id) }))
    .filter((cat) => cat.items.length > 0);
  res.json(result);
}));

module.exports = router;
