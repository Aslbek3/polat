// Yetkazib berish (delivery) mijoz buyurtmasi kelganda oshpaz+admin+dastavkachi
// ekranlariga BARAVAR ko'rinadigan umumiy bildirishnoma. server/services/
// customerOrders.js createFromPublic() (fulfillment='delivery' bo'lsa) shu
// `notifications` jadvaliga customer_order_id bilan yozadi.
//
// Poll/tasdiqlash mantig'ining o'zi (grace-oyna, tur bo'yicha ajratish,
// idempotentlik) server/services/notifications.js'da umumiy —
// server/routes/waiterNotifications.js'dagi "tayyor" bildirishnomasi bilan bir
// xil (ilgari ikkalasi mustaqil, deyarli bir xil kodni takrorlagan edi,
// 2026-09-09'da birlashtirildi). Bu yerga xos yagona narsa: 'customer_order'
// turi (order_item_id emas) va uch xil rolga (server/index.js'da
// requireRole(['admin','chef','courier'])) baravar ochiqligi.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const notifications = require('../services/notifications');

const router = express.Router();

router.get('/unread', asyncRoute((req, res) => {
  res.json(notifications.listUnreadOfKind('customer_order'));
}));

router.post('/:id/acknowledge', asyncRoute((req, res) => {
  const row = notifications.findOfKind(req.params.id, 'customer_order');
  if (!row) return res.status(404).json({ error: 'Bildirishnoma topilmadi' });

  const ackName = req.user.full_name || req.user.username;
  res.json(notifications.acknowledge(row, ackName));
}));

module.exports = router;
