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
//
// "Turi" (variant, 2026-09-09, menu_items.parent_item_id) — faqat ASOSIY
// (parent_item_id IS NULL) taomlar shu asosiy ro'yxatda chiqadi, har birining
// turlari `variants` massivida ichma-ich qaytariladi. Frontend (public/landing/
// script.js) asosiy taomni har doim ko'rsatadi, "Turlari (N)" tugmasi bosilsagina
// variants'ni ko'rsatadi — har bir variant ham o'z narxi/rasmi bilan alohida
// buyurtma qilinadigan to'liq taom obyekti.
router.get('/', asyncRoute((req, res) => {
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, id')
    .all();
  const FIELDS = 'id, name, price, description, image_url, volume, is_available, inventory_item_id';
  const topItemsStmt = db.prepare(
    `SELECT ${FIELDS} FROM menu_items WHERE category_id = ? AND is_active = 1 AND parent_item_id IS NULL ORDER BY sort_order, id`
  );
  const variantsStmt = db.prepare(
    `SELECT ${FIELDS} FROM menu_items WHERE parent_item_id = ? AND is_active = 1 ORDER BY sort_order, id`
  );
  const strip = ({ inventory_item_id, ...rest }) => rest; // ichki maydon — mijozga yubormaymiz
  const result = categories
    .map((cat) => {
      let items = topItemsStmt.all(cat.id);
      if (cat.require_inventory_link) items = items.filter((it) => it.inventory_item_id !== null);
      items = items.map((it) => {
        let variants = variantsStmt.all(it.id);
        if (cat.require_inventory_link) variants = variants.filter((v) => v.inventory_item_id !== null);
        return { ...strip(it), variants: variants.map(strip) };
      });
      return { id: cat.id, name: cat.name, items };
    })
    .filter((cat) => cat.items.length > 0);
  res.json(result);
}));

module.exports = router;
