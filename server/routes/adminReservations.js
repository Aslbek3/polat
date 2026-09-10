const express = require('express');
const { asyncRoute } = require('../routeUtils');
const reservations = require('../services/reservations');

const router = express.Router();

// Route qatlami faqat kirishni oladi va servis natijasini qaytaradi —
// barcha DB amallari va tekshiruvlar `services/reservations.js` da.

router.get('/', asyncRoute((req, res) => {
  res.json(reservations.list());
}));

router.put('/:id', asyncRoute((req, res) => {
  res.json(reservations.updateStatus(req.params.id, req.body?.status));
}));

router.delete('/:id', asyncRoute((req, res) => {
  res.json(reservations.remove(req.params.id));
}));

module.exports = router;
