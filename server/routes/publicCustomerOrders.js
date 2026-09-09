// Ochiq (login shart emas) endpoint — landing sahifadagi savat/buyurtma
// oynasidan yuboriladi. Narx HECH QACHON mijoz brauzeridan ishonib olinmaydi —
// har bir band server tomonida menu_items jadvalidan qayta qidiriladi.
const express = require('express');
const { db, nowIso } = require('../db');
const { asyncRoute } = require('../routeUtils');
const inventory = require('../services/inventory');

const router = express.Router();

const getActiveMenuItem = db.prepare(
  'SELECT * FROM menu_items WHERE id = ? AND is_active = 1 AND is_available = 1'
);

// Intl/Node-locale'ga bog'liq bo'lmagan oddiy "1 234" ko'rinishidagi guruhlash —
// bu faqat bildirishnoma matni uchun, mijozga qaytariladigan javobga ta'sir
// qilmaydi (total_amount xom son sifatida qaytadi, formatlash frontend ishi).
function fmtSomPlain(n) {
  return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
}

router.post('/', asyncRoute((req, res) => {
  const { full_name, phone, fulfillment, address, note, items, location_lat, location_lng } = req.body || {};

  const name = String(full_name || '').trim();
  const phoneNum = String(phone || '').trim();
  const fulfillmentType = fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const addressText = String(address || '').trim();
  const noteText = String(note || '').trim();

  // Ixtiyoriy GPS lokatsiya (mijoz brauzer Geolocation API orqali ulashgan
  // bo'lsa) — mijozdan kelgan qiymatga ishonib emas, diapazon tekshiruvi bilan.
  // Noto'g'ri/noto'liq bo'lsa jimgina e'tiborsiz qoldiramiz (butun buyurtmani
  // rad etishga arzimaydi, manzil matni asosiy manba).
  const lat = Number(location_lat);
  const lng = Number(location_lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

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
        `INSERT INTO customer_orders (full_name, phone, fulfillment, address, location_lat, location_lng, note, total_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
      )
      .run(name, phoneNum, fulfillmentType, addressText || null, hasLocation ? lat : null, hasLocation ? lng : null, noteText || null, totalAmount, ts);

    // cost_price_snapshot — sotilgan paytdagi tan narx (2026-09-10, sabab
    // server/schema.sql'dagi izohda: hisobot o'tmishga qarab o'zgarmasligi uchun).
    const insertItem = db.prepare(
      `INSERT INTO customer_order_items (customer_order_id, menu_item_id, name_snapshot, unit_price, cost_price_snapshot, quantity, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of resolved) {
      const itemInfo = insertItem.run(
        info.lastInsertRowid, r.item.id, r.item.name, r.item.price, r.item.cost_price,
        r.quantity, r.item.price * r.quantity
      );
      // Ichimlik (yoki boshqa) taom omborga bog'langan bo'lsa — shu miqdorni
      // ombordan ayiramiz. Yetarli qoldiq bo'lmasa inventory.consume() xato
      // otadi, butun buyurtma (customer_orders yozuvi bilan birga) bekor bo'ladi.
      if (r.item.inventory_item_id) {
        inventory.consume(r.item.inventory_item_id, r.quantity, {
          customerOrderItemId: itemInfo.lastInsertRowid,
          productName: r.item.name,
        });
      }
    }
    // Yetkazib berish buyurtmasi kelganda admin+oshpaz+dastavkachi ekranlariga
    // baravar ko'rinadigan bildirishnoma (server/routes/deliveryAlerts.js
    // o'qiydi) — olib ketish (pickup) uchun yozilmaydi, faqat delivery.
    if (fulfillmentType === 'delivery') {
      db.prepare(
        `INSERT INTO notifications (message, is_read, customer_order_id, created_at)
         VALUES (?, 0, ?, ?)`
      ).run(`🚚 Yangi yetkazib berish buyurtmasi: ${name} — ${fmtSomPlain(totalAmount)}`, info.lastInsertRowid, ts);
    }

    return info.lastInsertRowid;
  });

  const id = run();
  res.json({ ok: true, id, total_amount: totalAmount });
}));

module.exports = router;
