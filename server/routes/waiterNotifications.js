// Afitsiant ekranlarining "🏁 Tayyor" bildirishnomalarini o'qish/tasdiqlash uchun
// API — oshpaz dine-in taomni tayyor deb belgilaganda chefKitchen.js shu jadvalga
// (notifications) yozadi, afitsiant esa bu yerda poll qilib ko'radi va "Qabul
// qildim" tugmasi bilan tasdiqlaydi (server/schema.sql'dagi izohga qarang).
// Admin roli emas — faqat afitsiant (va u yerga ham kira oladigan admin) uchun,
// requireAuth'dagi /api/waiter/* hudud qoidasi orqali cheklangan (server/index.js).
//
// Mantiqning o'zi (grace-oyna, tur bo'yicha ajratish, idempotent tasdiqlash va
// order_items.picked_up_at belgilanishi) server/services/notifications.js'da
// umumiy — server/routes/deliveryAlerts.js bilan bir xil. Bu yerga xos yagona
// narsa: 'order_item' turi, ya'ni FAQAT order_item_id to'ldirilgan (dine-in
// "tayyor") qatorlar ko'rsatiladi/tasdiqlanadi. Yetkazib berish bildirishnomasi
// bu yerda ATAYLAB chiqmaydi — ilgari filtr yo'q edi va afitsiant kuryerga
// tegishli xabarni noto'g'ri "tasdiqlab" qo'yishi mumkin edi (2026-09-09).
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const notifications = require('../services/notifications');

const router = express.Router();

router.get('/unread', asyncRoute((req, res) => {
  res.json(notifications.listUnreadOfKind('order_item'));
}));

router.post('/:id/acknowledge', asyncRoute((req, res) => {
  const row = notifications.findOfKind(req.params.id, 'order_item');
  if (!row) return res.status(404).json({ error: 'Bildirishnoma topilmadi' });

  const ackName = req.user.full_name || req.user.username;
  res.json(notifications.acknowledgeOrderItem(row, ackName));
}));

module.exports = router;
