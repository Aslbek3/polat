const express = require('express');
const { asyncRoute } = require('../routeUtils');
const tables = require('../services/tables');

const router = express.Router();

// Route qatlami faqat kirishni oladi va servis natijasini qaytaradi —
// barcha DB amallari va tekshiruvlar `services/tables.js` da.

router.get('/', asyncRoute((req, res) => {
  res.json(tables.list());
}));

router.post('/', asyncRoute((req, res) => {
  res.json(tables.create(req.body || {}));
}));

router.put('/:id', asyncRoute((req, res) => {
  res.json(tables.update(req.params.id, req.body));
}));

router.delete('/:id', asyncRoute((req, res) => {
  res.json(tables.deactivate(req.params.id));
}));

module.exports = router;
