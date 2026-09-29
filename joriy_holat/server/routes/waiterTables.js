const express = require('express');
const { listTablesOverview } = require('../services/orders');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/tables', asyncRoute((req, res) => {
  res.json(listTablesOverview());
}));

module.exports = router;
