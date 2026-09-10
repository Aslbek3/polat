const express = require('express');
const { asyncRoute } = require('../routeUtils');
const reservations = require('../services/reservations');

const router = express.Router();

// Route qatlami faqat kirishni oladi va servis natijasini qaytaradi —
// barcha DB amallari va tekshiruvlar `services/reservations.js` da.

// 2026-09-10 (A-06): `?status=new|confirmed|cancelled`, `?scope=upcoming|past|all`
// (standart `all`). Tartib: kelajakdagilar eng yaqinidan, keyin o'tganlari —
// services/reservations.js list() izohiga qarang.
router.get('/', asyncRoute((req, res) => {
  res.json(reservations.list({ status: req.query.status, scope: req.query.scope }));
}));

router.put('/:id', asyncRoute((req, res) => {
  res.json(reservations.updateStatus(req.params.id, req.body?.status));
}));

router.delete('/:id', asyncRoute((req, res) => {
  res.json(reservations.remove(req.params.id));
}));

module.exports = router;
