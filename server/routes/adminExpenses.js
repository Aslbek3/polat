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

// 2026-09-10 (A-12): javob hamon MASSIV (frontend buzilmasin), lekin eng
// yangi 500 tasi bilan cheklangan. Cheklovsiz son va summa sarlavhalarda —
// frontend "Jami"ni ro'yxatdan emas, `X-Total-Amount`dan olishi kerak
// (services/expenses.js listExpenses() izohiga qarang).
router.get('/', asyncRoute((req, res) => {
  const { expenses: rows, total_count: totalCount, total_amount: totalAmount } = expenses.listExpenses(req.query);
  res.setHeader('X-Total-Count', String(totalCount));
  res.setHeader('X-Total-Amount', String(totalAmount));
  res.json(rows);
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
