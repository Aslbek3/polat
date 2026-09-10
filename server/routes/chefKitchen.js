// Oshxona (oshpaz) ekrani uchun o'qish-og'irlikli API.
//
// 2026-09-10: barcha SQL `server/services/kitchen.js`ga ko'chirildi (loyiha
// qoidasi: route fayllari bazaga bevosita murojaat qilmaydi). Bu yerda faqat
// HTTP qatlami qoldi. Ruxsat `server/index.js`da imkoniyat orqali —
// `KITCHEN_VIEW` (chef va admin).
//
// Dine-in (stol) buyurtmalari uchun oshpaz har bir taomni alohida "tayyor"
// deb belgilashi mumkin (order_items.ready_at) — bu faqat oshxona ichki
// nazorati, stolning o'zi hamon afitsiant/kassir tomonidan yopiladi
// (hisob-kitob shunga bog'liq emas). Onlayn buyurtmalar uchun esa oshpaz
// "tasdiqlash"/"tayyor" holatiga butun buyurtmani o'tkaza oladi.
//
// MUHIM: afitsiant taom qo'shganda u DARHOL bu yerda ko'rinmaydi — faqat
// afitsiant "🍽️ Oshxonaga yuborish" tugmasini bosgach (order_items.sent_at
// to'ldirilgach, server/services/orders.js'dagi sendPendingItems()) paydo
// bo'ladi. Taom TAYYOR bo'lib, afitsiant "Qabul qildim" bossa
// (order_items.picked_up_at) — taom shu ro'yxatdan ham YO'QOLADI.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const kitchen = require('../services/kitchen');
const customerOrders = require('../services/customerOrders');

const router = express.Router();

router.get('/tables', asyncRoute((req, res) => {
  res.json(kitchen.listKitchenTables());
}));

router.get('/orders', asyncRoute((req, res) => {
  res.json(kitchen.listOnlineOrders());
}));

router.put('/items/:id/ready', asyncRoute((req, res) => {
  res.json(kitchen.setItemReady(req.params.id, !!req.body?.ready));
}));

// Mijoz buyurtmasining holati ATAYLAB bu yerda emas, yagona holat
// mashinasida o'zgartiriladi — holat o'zgarishi ombor qoldig'iga ta'sir
// qiladi va bu qoida bitta joyda turishi shart. Ilgari bu handler
// to'g'ridan-to'g'ri `UPDATE customer_orders SET status = ?` qilardi va
// ombor mantig'ini BUTUNLAY chetlab o'tardi (2026-09-10 auditi).
router.put('/orders/:id/status', asyncRoute((req, res) => {
  const updated = customerOrders.transition(req.params.id, req.body?.status, {
    // Oshpaz faqat "tasdiqlash"/"tayyor" qila oladi — bekor qilish/o'chirish
    // admin ixtiyorida.
    allowed: ['confirmed', 'completed'],
    notAllowedMessage: "Faqat 'tasdiqlash' yoki 'tayyor' holatiga o'tkazish mumkin",
  });
  res.json(updated);
}));

module.exports = router;
