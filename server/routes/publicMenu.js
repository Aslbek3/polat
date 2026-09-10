// Ochiq (login shart emas) endpoint — landing sahifadagi menyu bo'limi shu
// yerdan haqiqiy (admin/menu.html orqali kiritilgan) taomlar ro'yxatini oladi.
//
// Yig'ish mantig'i server/services/menuQuery.js'da, xodim menyulari
// (waiterMenu.js / kassirMenu.js) bilan umumiy. Bu yerdagi farq faqat
// SHAKLDA: kam maydon qaytariladi, ichki `inventory_item_id` olib
// tashlanadi (mijozga ichki ma'lumot ketmasin) va kategoriyadan faqat
// {id, name, items} beriladi — public/landing/script.js shunga tayanadi.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const menuQuery = require('../services/menuQuery');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  res.json(menuQuery.publicMenu());
}));

module.exports = router;
