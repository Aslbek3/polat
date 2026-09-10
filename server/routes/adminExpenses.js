// Admin "Xarajatlar" bo'limi uchun API.
//
// 2026-09-10: SQL va validatsiya butunlay `server/services/expenses.js`ga
// ko'chirildi (loyiha qoidasi: route fayllari bazaga bevosita
// murojaat qilmaydi). Bu yerda faqat HTTP qatlami qoldi: kirishni olish,
// servisni chaqirish, javob qaytarish.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const expenses = require('../services/expenses');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  res.json(expenses.listExpenses(req.query));
}));

router.post('/', asyncRoute((req, res) => {
  res.json(expenses.createExpense(req.body, req.user.id));
}));

router.put('/:id', asyncRoute((req, res) => {
  res.json(expenses.updateExpense(req.params.id, req.body));
}));

router.delete('/:id', asyncRoute((req, res) => {
  res.json(expenses.deleteExpense(req.params.id));
}));

module.exports = router;
