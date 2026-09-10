// Dastavkachi (courier) ekrani uchun o'qish-og'irlikli API.
//
// 2026-09-10: barcha SQL `server/services/delivery.js`ga ko'chirildi (loyiha
// qoidasi: route fayllari bazaga bevosita murojaat qilmaydi). Bu yerda faqat
// HTTP qatlami qoldi. Ruxsat `server/index.js`da imkoniyat (capability)
// orqali beriladi — `DELIVERY_VIEW` (courier va admin).
//
// Faqat "yetkazib berish" (fulfillment='delivery') turidagi mijoz
// buyurtmalari bilan ishlaydi — dine-in `orders` jadvaliga umuman tegmaydi
// (afitsiant/oshpaz hududi).
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const delivery = require('../services/delivery');

const router = express.Router();

router.get('/orders', asyncRoute((req, res) => {
  res.json(delivery.listDeliveryOrders());
}));

router.put('/orders/:id/deliver', asyncRoute((req, res) => {
  res.json(delivery.markDelivered(req.params.id));
}));

module.exports = router;
