// Ochiq (login shart emas) endpoint — landing sahifadagi menyu bo'limi shu
// yerdan haqiqiy (admin/menu.html orqali kiritilgan) taomlar ro'yxatini oladi.
// server/routes/waiterMenu.js'dagi bilan bir xil so'rov mantig'i.
const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

// Tugagan (is_available=0 — masalan omborga bog'langan ichimlik qoldig'i
// tugagan) taomlar endi ro'yxatdan butunlay olib tashlanmaydi, balki
// is_available maydoni bilan birga qaytariladi — mehmon "Tugadi" deb
// ko'rsin (public/landing/script.js). Kategoriya faqat hech qanday (mavjud
// yoki tugagan) taomi bo'lmasa yashiriladi.
//
// require_inventory_link=1 bo'lgan kategoriyalarda (masalan "Ichimliklar")
// ombor bilan BOG'LANMAGAN taomlar (inventory_item_id NULL) butunlay
// chiqarilmaydi — bu kategoriya faqat haqiqiy ombor zaxirasi bor mahsulotlarni
// ko'rsatishi kerak (2026-09-07, menu_categories.require_inventory_link).
router.get('/', asyncRoute((req, res) => {
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, id')
    .all();
  const itemsStmt = db.prepare(
    'SELECT id, name, price, description, image_url, volume, is_available, inventory_item_id FROM menu_items WHERE category_id = ? AND is_active = 1 ORDER BY sort_order, id'
  );
  const result = categories
    .map((cat) => {
      let items = itemsStmt.all(cat.id);
      if (cat.require_inventory_link) items = items.filter((it) => it.inventory_item_id !== null);
      items = items.map(({ inventory_item_id, ...rest }) => rest); // ichki maydon — mijozga yubormaymiz
      return { id: cat.id, name: cat.name, items };
    })
    .filter((cat) => cat.items.length > 0);
  res.json(result);
}));

module.exports = router;
