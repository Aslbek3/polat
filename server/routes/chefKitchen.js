// Oshxona (oshpaz) ekrani uchun o'qish-og'irlikli API. Faqat 'chef' va 'admin'
// roliga ochiq (server/index.js'da requireRole(['admin','chef']) bilan ulanadi).
// Dine-in (stol) buyurtmalari uchun oshpaz har bir taomni alohida "tayyor" deb
// belgilashi mumkin (order_items.ready_at) — bu faqat oshxona ichki nazorati,
// stolning o'zi hamon afitsiant/admin tomonidan yopiladi (hisob-kitob shunga
// bog'liq emas). Onlayn buyurtmalar uchun esa oshpaz "tasdiqlash"/"tayyor"
// holatiga butun buyurtmani o'tkaza oladi.
//
// MUHIM: afitsiant taom qo'shganda u DARHOL bu yerda ko'rinmaydi — faqat
// afitsiant "🍽️ Oshxonaga yuborish" tugmasini bosgach (order_items.sent_at
// to'ldirilgach, server/services/orders.js'dagi sendPendingItems()) paydo
// bo'ladi. Shu sabab GET /tables pastda sent_at bo'yicha filtrlaydi. Taom
// TAYYOR bo'lib, afitsiant "Qabul qildim" bossa (order_items.picked_up_at,
// server/routes/waiterNotifications.js) — taom shu ro'yxatdan ham YO'QOLADI
// (afitsiant qabul qilgach oshpazga endi kerak emas).
const express = require('express');
const { db, nowIso } = require('../db');
const { listTablesOverview, buildOrderView } = require('../services/orders');
const { asyncRoute } = require('../routeUtils');
const customerOrders = require('../services/customerOrders');

const router = express.Router();

router.get('/tables', asyncRoute((req, res) => {
  const overview = listTablesOverview();
  const withItems = overview.map((t) => {
    if (!t.occupied) return t;
    const view = buildOrderView(t.order_id);
    // Faqat afitsiant "yuborgan" (sent_at to'ldirilgan) VA afitsiant hali "Qabul
    // qildim" bosmagan (picked_up_at bo'sh) qatorlar oshpazga ko'rinadi — afitsiant
    // tasdiqlashi bilan taom shu ro'yxatdan yo'qoladi (server/routes/waiterNotifications.js).
    return { ...t, items: view.items.filter((it) => it.sent_at && !it.picked_up_at) };
  });
  res.json(withItems);
}));

router.get('/orders', asyncRoute((req, res) => {
  const rows = db
    .prepare("SELECT * FROM customer_orders WHERE status IN ('new', 'confirmed') ORDER BY id ASC")
    .all();
  const itemsStmt = db.prepare('SELECT * FROM customer_order_items WHERE customer_order_id = ?');
  res.json(rows.map((o) => ({ ...o, items: itemsStmt.all(o.id) })));
}));

router.put('/items/:id/ready', asyncRoute((req, res) => {
  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Taom topilmadi' });
  if (item.status !== 'active') {
    return res.status(400).json({ error: "Bekor qilingan taom uchun holatni o'zgartirib bo'lmaydi" });
  }
  if (!item.sent_at) {
    return res.status(400).json({ error: "Bu taom hali afitsiant tomonidan oshxonaga yuborilmagan" });
  }
  const ready = !!req.body?.ready;
  db.prepare('UPDATE order_items SET ready_at = ? WHERE id = ?').run(ready ? new Date().toISOString() : null, req.params.id);

  // Faqat "tayyor" deb belgilanganda (tayyor emasga qaytarilganda emas) afitsiantga
  // bildirishnoma yuboriladi — stol nomi order_id -> orders.table_id -> tables orqali.
  if (ready) {
    const table = db
      .prepare(`SELECT t.name AS name FROM orders o JOIN tables t ON t.id = o.table_id WHERE o.id = ?`)
      .get(item.order_id);
    if (table) {
      db.prepare('INSERT INTO notifications (message, is_read, order_item_id, created_at) VALUES (?, 0, ?, ?)')
        .run(`${table.name} taomi tayyor: ${item.name_snapshot}`, item.id, nowIso());
    }
  }

  res.json({ ok: true, ready });
}));

// 2026-09-10: ilgari bu handler to'g'ridan-to'g'ri
// `UPDATE customer_orders SET status = ?` qilardi va ombor mantig'ini
// BUTUNLAY chetlab o'tardi — bekor qilingan (qoldig'i qaytarilgan)
// buyurtmani oshpaz qayta faollashtirsa, mahsulot ombordan qayta
// ayirilmasdi. Endi admin route'i bilan bir xil holat mashinasidan
// o'tadi; oshpaz uchun ruxsat etilgan holatlar `allowed` bilan cheklanadi.
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
