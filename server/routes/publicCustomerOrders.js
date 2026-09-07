// Ochiq (login shart emas) endpoint — landing sahifadagi savat/buyurtma
// oynasidan yuboriladi. Narx HECH QACHON mijoz brauzeridan ishonib olinmaydi —
// har bir band server tomonida menu_items jadvalidan qayta qidiriladi.
const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

const getActiveMenuItem = db.prepare(
  'SELECT * FROM menu_items WHERE id = ? AND is_active = 1 AND is_available = 1'
);

router.post('/', asyncRoute((req, res) => {
  const { full_name, phone, fulfillment, address, note, items } = req.body || {};

  const name = String(full_name || '').trim();
  const phoneNum = String(phone || '').trim();
  const fulfillmentType = fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const addressText = String(address || '').trim();
  const noteText = String(note || '').trim();

  if (!name) return res.status(400).json({ error: 'Ismingizni kiriting' });
  if (name.length > 120) return res.status(400).json({ error: 'Ism juda uzun' });
  if (!phoneNum || phoneNum.replace(/\D/g, '').length < 7) {
    return res.status(400).json({ error: "Telefon raqamini to'g'ri kiriting" });
  }
  if (fulfillmentType === 'delivery' && !addressText) {
    return res.status(400).json({ error: 'Yetkazish manzilini kiriting' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Savat bo'sh" });
  }
  if (items.length > 50) return res.status(400).json({ error: "Savatda juda ko'p band bor" });

  // Har bir band uchun narxni serverda (client'ga ishonmasdan) qayta hisoblaymiz.
  const resolved = [];
  for (const raw of items) {
    const menuItemId = Number(raw?.menu_item_id);
    const quantity = Number(raw?.quantity);
    if (!Number.isFinite(menuItemId)) return res.status(400).json({ error: "Savat bandi noto'g'ri" });
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity) || quantity > 50) {
      return res.status(400).json({ error: "Miqdorni to'g'ri kiriting" });
    }
    const item = getActiveMenuItem.get(menuItemId);
    if (!item) return res.status(400).json({ error: `Menyudagi bir band endi mavjud emas, sahifani yangilang` });
    resolved.push({ item, quantity });
  }

  const totalAmount = resolved.reduce((sum, r) => sum + r.item.price * r.quantity, 0);
  const ts = nowIso();

  const run = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO customer_orders (full_name, phone, fulfillment, address, note, total_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`
      )
      .run(name, phoneNum, fulfillmentType, addressText || null, noteText || null, totalAmount, ts);

    const insertItem = db.prepare(
      `INSERT INTO customer_order_items (customer_order_id, menu_item_id, name_snapshot, unit_price, quantity, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const r of resolved) {
      insertItem.run(info.lastInsertRowid, r.item.id, r.item.name, r.item.price, r.quantity, r.item.price * r.quantity);
    }
    return info.lastInsertRowid;
  });

  const id = run();
  res.json({ ok: true, id, total_amount: totalAmount });
}));

module.exports = router;
