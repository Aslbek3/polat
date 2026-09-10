const express = require('express');
const {
  getOpenOrderForTable,
  addItemToTable,
  updateOrderItemQuantity,
  sendPendingItems,
  cancelOrderItem,
  closeTable,
  cancelEmptyOrder,
  getReceipt,
  getLatestReceiptForTable,
} = require('../services/orders');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/tables/:id/order', asyncRoute((req, res) => {
  const view = getOpenOrderForTable(req.params.id);
  res.json(view); // null bo'lishi mumkin — frontend "ochiq buyurtma yo'q" holatini shunday biladi
}));

router.post('/tables/:id/items', asyncRoute((req, res) => {
  const { menu_item_id, quantity } = req.body || {};
  const view = addItemToTable(req.params.id, menu_item_id, quantity || 1, req.user.id);
  res.json(view);
}));

// Shu stolning ochiq buyurtmasidagi hali yuborilmagan taomlarning hammasini
// bitta paytda oshpazga (kitchen ekraniga) yuboradi.
router.post('/tables/:id/send', asyncRoute((req, res) => {
  const view = sendPendingItems(req.params.id);
  res.json(view);
}));

router.patch('/items/:id', asyncRoute((req, res) => {
  const view = updateOrderItemQuantity(req.params.id, req.body?.quantity, req.user.id);
  res.json(view);
}));

router.delete('/items/:id', asyncRoute((req, res) => {
  const view = cancelOrderItem(req.params.id, req.user.id);
  res.json(view);
}));

router.post('/tables/:id/close', asyncRoute((req, res) => {
  const receipt = closeTable(req.params.id, req.user.id);
  res.json(receipt);
}));

// Faol taomi qolmagan (hammasi bekor qilingan) ochiq buyurtmani hisob-kitobsiz
// yopib, stolni bo'shatadi — closeTable() dan farqli, chek/print_requests yozuvi
// yaratmaydi (services/orders.js'dagi cancelEmptyOrder() izohiga qarang).
router.post('/tables/:id/cancel-order', asyncRoute((req, res) => {
  const view = cancelEmptyOrder(req.params.id, req.user.id);
  res.json(view);
}));

// 2026-09-10: SQL services/orders.js getLatestReceiptForTable()ga ko'chirildi
// (route'da db.prepare bo'lmasin; kassirTables.js bilan umumiy). Bekor
// qilingan buyurtma chiqarilmaydi, topilmasa 404 — avvalgidek.
router.get('/tables/:id/receipt/latest', asyncRoute((req, res) => {
  res.json(getLatestReceiptForTable(req.params.id));
}));

// Har qanday login (afitsiant yoki admin) o'zi yopgan (yoki boshqa) buyurtma chekini
// ID bo'yicha ko'ra oladi — stol yopilgach darhol chekka o'tish shu orqali ishlaydi.
router.get('/orders/:id/receipt', asyncRoute((req, res) => {
  res.json(getReceipt(req.params.id));
}));

module.exports = router;
