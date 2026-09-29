const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

// Faqat faol kategoriya + faol taomlar (kategoriya bo'yicha guruhlangan). Tugagan
// (is_available=0) taomlar ENDI olib tashlanmaydi — afitsiant ularni "Tugadi"
// belgisi bilan ko'rishi va qo'shishga urinmasligi kerak (public/waiter/order.js).
//
// require_inventory_link=1 kategoriyalarda (masalan "Ichimliklar") ombor bilan
// bog'lanmagan taomlar afitsiant menyusida ham ko'rinmaydi — publicMenu.js'dagi
// bilan bir xil qoida (2026-09-07).
//
// "Turi" (variant, 2026-09-09, menu_items.parent_item_id) — publicMenu.js'dagi
// bilan bir xil mantiq: faqat ASOSIY (parent_item_id IS NULL) taomlar shu asosiy
// ro'yxatda chiqadi, turlari `variants` massivida ichma-ich qaytariladi
// (public/waiter/order.js "Turlari (N)" tugmasi bilan ko'rsatadi/yashiradi).
router.get('/menu', asyncRoute((req, res) => {
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, id')
    .all();
  // cost_price (tan narxi, 2026-09-08) ATAYLAB tashlab ketiladi — bu admin-only
  // biznes ma'lumot, afitsiant ekraniga chiqmasligi kerak (publicMenu.js'dagi
  // bilan bir xil ehtiyotkorlik).
  const FIELDS = `id, category_id, name, price, is_available, is_active, sort_order,
            description, image_url, volume, inventory_item_id, created_at, updated_at`;
  const topItemsStmt = db.prepare(
    `SELECT ${FIELDS} FROM menu_items WHERE category_id = ? AND is_active = 1 AND parent_item_id IS NULL ORDER BY sort_order, id`
  );
  const variantsStmt = db.prepare(
    `SELECT ${FIELDS} FROM menu_items WHERE parent_item_id = ? AND is_active = 1 ORDER BY sort_order, id`
  );
  const result = categories
    .map((cat) => {
      let items = topItemsStmt.all(cat.id);
      if (cat.require_inventory_link) items = items.filter((it) => it.inventory_item_id !== null);
      items = items.map((it) => {
        let variants = variantsStmt.all(it.id);
        if (cat.require_inventory_link) variants = variants.filter((v) => v.inventory_item_id !== null);
        return { ...it, variants };
      });
      return { ...cat, items };
    })
    .filter((cat) => cat.items.length > 0);
  res.json(result);
}));

module.exports = router;
