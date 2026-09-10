// Admin bosh sahifasi "ertalabki brifing" (2026-09-10, A-03/A-04/A-05/A-09).
// server/index.js da `need(cap.ADMIN_MANAGE)` bilan ulanadi. Hisob-kitob —
// services/dashboard.js da (u o'z navbatida reports.getSummary()ni qayta
// ishlatadi, nusxalamaydi).
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const dashboard = require('../services/dashboard');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  res.json(dashboard.getDashboard());
}));

module.exports = router;
