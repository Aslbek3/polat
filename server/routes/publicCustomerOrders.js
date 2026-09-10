// Ochiq (login shart emas) endpoint — landing sahifadagi savat/buyurtma
// oynasidan yuboriladi.
//
// Butun mantiq (validatsiya, narxni serverda qayta hisoblash, ombordan
// sarflash, yetkazib berish bildirishnomasi) server/services/customerOrders.js
// createFromPublic()'da — mijoz buyurtmasining qolgan hayot sikli (holat
// o'zgarishi, o'chirish) allaqachon o'sha yerda edi, 2026-09-10'da yaratish
// ham shu yerga qo'shildi.
//
// Xato xabarlari CustomerOrderError orqali otiladi va routeUtils.js
// asyncRoute() ularni avvalgidek 400 + {error: xabar} qilib qaytaradi.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const customerOrders = require('../services/customerOrders');

const router = express.Router();

router.post('/', asyncRoute((req, res) => {
  res.json(customerOrders.createFromPublic(req.body || {}));
}));

module.exports = router;
