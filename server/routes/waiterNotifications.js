// Afitsiant ekranlarining "🏁 Tayyor" bildirishnomalarini o'qish/tasdiqlash uchun
// API — oshpaz dine-in taomni tayyor deb belgilaganda chefKitchen.js shu jadvalga
// (notifications) yozadi, afitsiant esa bu yerda poll qilib ko'radi va "Qabul
// qildim" tugmasi bilan tasdiqlaydi (server/schema.sql'dagi izohga qarang).
// Tasdiqlanganda tegishli taom (notifications.order_item_id) order_items.picked_up_at
// bilan belgilanadi — shu bilan taom oshpazning kitchen ekranidan yo'qoladi
// (server/routes/chefKitchen.js GET /tables filtrlaydi).
// Admin roli emas — faqat afitsiant (va u yerga ham kira oladigan admin) uchun,
// requireAuth'dagi /api/waiter/* hudud qoidasi orqali cheklangan (server/index.js).
//
// Poll/tasdiqlash mantig'ining o'zi (grace-oyna, idempotentlik) server/services/
// notifications.js'da umumiy — server/routes/deliveryAlerts.js bilan bir xil.
// Bu yerga xos bo'lgan yagona narsa: FAQAT order_item_id to'ldirilgan (dine-in
// "tayyor") qatorlar ko'rsatiladi/tasdiqlanadi — customer_order_id bilan
// yozilgan (yetkazib berish) bildirishnomalar ATAYLAB bu yerda chiqmaydi va
// bu yerdan tasdiqlanmaydi (ilgari filtr yo'q edi — afitsiant kuryer/oshpazga
// tegishli "🚚 Yangi yetkazib berish buyurtmasi" xabarini ham ko'rib, uni
// noto'g'ri "tasdiqlab" qo'yishi mumkin edi, 2026-09-09'da tuzatildi).
const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');
const notifications = require('../services/notifications');

const router = express.Router();

router.get('/unread', asyncRoute((req, res) => {
  res.json(notifications.listUnread('order_item_id IS NOT NULL'));
}));

router.post('/:id/acknowledge', asyncRoute((req, res) => {
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!row || row.order_item_id == null) return res.status(404).json({ error: 'Bildirishnoma topilmadi' });

  const ackName = req.user.full_name || req.user.username;
  const result = notifications.acknowledge(row, ackName, (ts) => {
    // Shu bildirishnoma qaysi taomga tegishli bo'lsa (dine-in "tayyor" xabari),
    // o'sha taom endi "qabul qilingan" — oshpaz ekranidan yo'qoladi.
    db.prepare('UPDATE order_items SET picked_up_at = ? WHERE id = ?').run(ts, row.order_item_id);
  });
  res.json(result);
}));

module.exports = router;
