// Afitsiant ekranlarining "🏁 Tayyor" bildirishnomalarini o'qish/tasdiqlash uchun
// API — oshpaz dine-in taomni tayyor deb belgilaganda chefKitchen.js shu jadvalga
// (notifications) yozadi, afitsiant esa bu yerda poll qilib ko'radi va "Qabul
// qildim" tugmasi bilan tasdiqlaydi (server/schema.sql'dagi izohga qarang).
// Tasdiqlanganda tegishli taom (notifications.order_item_id) order_items.picked_up_at
// bilan belgilanadi — shu bilan taom oshpazning kitchen ekranidan yo'qoladi
// (server/routes/chefKitchen.js GET /tables filtrlaydi).
// Admin roli emas — faqat afitsiant (va u yerga ham kira oladigan admin) uchun,
// requireAuth'dagi /api/waiter/* hudud qoidasi orqali cheklangan (server/index.js).
const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

// Hali tasdiqlanmagan (acknowledged_at IS NULL) + yaqinda tasdiqlangan
// (30 soniya ichida) yozuvlar — shu grace-oyna tufayli "<Ism> qabul qildi"
// holati boshqa afitsiantlarning ekranida ham qisqa vaqt ko'rinib turadi,
// so'ng ro'yxatdan avtomatik tushib qoladi.
router.get('/unread', asyncRoute((req, res) => {
  const graceCutoff = new Date(Date.now() - 30000).toISOString();
  const rows = db
    .prepare('SELECT * FROM notifications WHERE acknowledged_at IS NULL OR acknowledged_at >= ? ORDER BY id ASC')
    .all(graceCutoff);
  res.json(rows);
}));

router.post('/:id/acknowledge', asyncRoute((req, res) => {
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Bildirishnoma topilmadi' });
  if (row.acknowledged_at) return res.json(row); // allaqachon tasdiqlangan — idempotent

  const run = db.transaction(() => {
    const ts = nowIso();
    const ackName = req.user.full_name || req.user.username;
    db.prepare('UPDATE notifications SET is_read = 1, acknowledged_at = ?, acknowledged_by_name = ? WHERE id = ?')
      .run(ts, ackName, req.params.id);
    // Shu bildirishnoma qaysi taomga tegishli bo'lsa (dine-in "tayyor" xabari),
    // o'sha taom endi "qabul qilingan" — oshpaz ekranidan yo'qoladi.
    if (row.order_item_id) {
      db.prepare('UPDATE order_items SET picked_up_at = ? WHERE id = ?').run(ts, row.order_item_id);
    }
  });
  run();

  res.json(db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id));
}));

module.exports = router;
