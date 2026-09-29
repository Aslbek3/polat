// Yetkazib berish (delivery) mijoz buyurtmasi kelganda oshpaz+admin+dastavkachi
// ekranlariga BARAVAR ko'rinadigan umumiy bildirishnoma. server/routes/
// publicCustomerOrders.js POST /'da (fulfillment='delivery' bo'lsa) shu
// `notifications` jadvaliga customer_order_id bilan yozadi.
//
// Poll/tasdiqlash mantig'ining o'zi (grace-oyna, idempotentlik) server/services/
// notifications.js'da umumiy — server/routes/waiterNotifications.js'dagi
// "tayyor" bildirishnomasi bilan bir xil (ilgari ikkalasi mustaqil, deyarli
// bir xil kodni takrorlagan edi, 2026-09-09'da birlashtirildi). Bu yerga xos
// bo'lgan yagona narsa: FAQAT customer_order_id to'ldirilgan qatorlar
// ko'rsatiladi/tasdiqlanadi (order_item_id emas) va uch xil rolga
// (server/index.js'da requireRole(['admin','chef','courier'])) baravar ochiq.
const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');
const notifications = require('../services/notifications');

const router = express.Router();

router.get('/unread', asyncRoute((req, res) => {
  res.json(notifications.listUnread('customer_order_id IS NOT NULL'));
}));

router.post('/:id/acknowledge', asyncRoute((req, res) => {
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!row || row.customer_order_id == null) return res.status(404).json({ error: 'Bildirishnoma topilmadi' });

  const ackName = req.user.full_name || req.user.username;
  const result = notifications.acknowledge(row, ackName);
  res.json(result);
}));

module.exports = router;
