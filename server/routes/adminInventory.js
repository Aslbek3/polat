// Admin "Ombor" bo'limi — suv/salfetka va shunga o'xshash sarflanadigan
// mahsulotlar qoldig'ini boshqarish (server/services/inventory.js'ga qarang).
const express = require('express');
const inventory = require('../services/inventory');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/items', asyncRoute((req, res) => {
  res.json(inventory.listItems({ includeInactive: req.query.all === '1' }));
}));

router.post('/items', asyncRoute((req, res) => {
  const { name, unit, quantity, low_stock_threshold, cost_price, sale_price, volume, menu_category_id } = req.body || {};
  res.json(inventory.createItem({ name, unit, quantity, low_stock_threshold, cost_price, sale_price, volume, menu_category_id }));
}));

router.put('/items/:id', asyncRoute((req, res) => {
  const { name, unit, low_stock_threshold, is_active, cost_price, sale_price, volume, menu_category_id } = req.body || {};
  res.json(inventory.updateItem(req.params.id, { name, unit, low_stock_threshold, is_active, cost_price, sale_price, volume, menu_category_id }));
}));

router.delete('/items/:id', asyncRoute((req, res) => {
  res.json(inventory.deleteItem(req.params.id));
}));

// Qo'lda kirim/chiqim: { delta: +10 } (kirim) yoki { delta: -3 } (chiqim/chiqindi).
router.post('/items/:id/adjust', asyncRoute((req, res) => {
  const { delta, note } = req.body || {};
  const reason = Number(delta) > 0 ? 'restock' : 'adjustment';
  res.json(inventory.adjustStock(req.params.id, delta, { reason, note, userId: req.user.id }));
}));

router.get('/items/:id/movements', asyncRoute((req, res) => {
  res.json(inventory.listMovements(req.params.id, req.query.limit));
}));

module.exports = router;
