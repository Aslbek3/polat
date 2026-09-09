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
router.get('/menu', asyncRoute((req, res) => {
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, id')
    .all();
  // cost_price (tan narxi, 2026-09-08) ATAYLAB tashlab ketiladi — bu admin-only
  // biznes ma'lumot, afitsiant ekraniga chiqmasligi kerak (publicMenu.js'dagi
  // bilan bir xil ehtiyotkorlik).
  const itemsStmt = db.prepare(
    `SELECT id, category_id, name, price, is_available, is_active, sort_order,
            description, image_url, volume, inventory_item_id, created_at, updated_at
     FROM menu_items WHERE category_id = ? AND is_active = 1 ORDER BY sort_order, id`
  );
  const result = categories
    .map((cat) => {
      let items = itemsStmt.all(cat.id);
      if (cat.require_inventory_link) items = items.filter((it) => it.inventory_item_id !== null);
      return { ...cat, items };
    })
    .filter((cat) => cat.items.length > 0);
  res.json(result);
}));

module.exports = router;
