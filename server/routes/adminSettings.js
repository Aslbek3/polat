// Admin "Sozlamalar" — restoran nomi, aloqa, yetkazib berish shartlari
// (2026-09-10, L-29). server/index.js da `need(cap.ADMIN_MANAGE)` bilan
// ulanadi. Barcha qoidalar va validatsiya — services/settings.js da.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const settings = require('../services/settings');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  res.json(settings.getAdminSettings());
}));

// Qisman yangilash — faqat yuborilgan maydonlar o'zgaradi.
router.put('/', asyncRoute((req, res) => {
  res.json(settings.updateSettings(req.body));
}));

module.exports = router;
