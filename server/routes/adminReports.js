const express = require('express');
const { db } = require('../db');
const { getReceipt } = require('../services/orders');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

function dateRange(query) {
  const from = query.from ? String(query.from).trim() : null;
  const to = query.to ? String(query.to).trim() : null;
  return { from, to };
}

router.get('/summary', asyncRoute((req, res) => {
  const { from, to } = dateRange(req.query);

  let revenueSql = "SELECT COALESCE(SUM(total_amount),0) AS revenue, COUNT(*) AS orders_count FROM orders WHERE status = 'closed'";
  const revenueParams = [];
  if (from) { revenueSql += ' AND date(closed_at) >= date(?)'; revenueParams.push(from); }
  if (to) { revenueSql += ' AND date(closed_at) <= date(?)'; revenueParams.push(to); }
  const revenueRow = db.prepare(revenueSql).get(...revenueParams);

  let expenseSql = 'SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE 1=1';
  const expenseParams = [];
  if (from) { expenseSql += ' AND expense_date >= ?'; expenseParams.push(from); }
  if (to) { expenseSql += ' AND expense_date <= ?'; expenseParams.push(to); }
  const expenseRow = db.prepare(expenseSql).get(...expenseParams);

  res.json({
    revenue: revenueRow.revenue,
    orders_count: revenueRow.orders_count,
    expenses_total: expenseRow.total,
    net: revenueRow.revenue - expenseRow.total,
  });
}));

router.get('/orders', asyncRoute((req, res) => {
  const { from, to } = dateRange(req.query);
  const status = req.query.status && ['open', 'closed'].includes(req.query.status) ? req.query.status : null;
  let sql = `
    SELECT o.id, o.status, o.total_amount, o.opened_at, o.closed_at, t.name AS table_name,
           COALESCE(ou.full_name, ou.username) AS opened_by_name,
           COALESCE(cu.full_name, cu.username) AS closed_by_name
    FROM orders o
    JOIN tables t ON t.id = o.table_id
    JOIN users ou ON ou.id = o.opened_by
    LEFT JOIN users cu ON cu.id = o.closed_by
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  if (from) { sql += ' AND date(COALESCE(o.closed_at, o.opened_at)) >= date(?)'; params.push(from); }
  if (to) { sql += ' AND date(COALESCE(o.closed_at, o.opened_at)) <= date(?)'; params.push(to); }
  sql += ' ORDER BY o.id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
}));

router.get('/orders/:id/receipt', asyncRoute((req, res) => {
  res.json(getReceipt(req.params.id));
}));

module.exports = router;
