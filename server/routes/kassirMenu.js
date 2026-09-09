// Kassir "Hisoblash" ekranidagi "📋 Menyu" tugmasi uchun — 2026-09-09'da
// qo'shildi (foydalanuvchi so'rovi: qo'lda hisoblashda taom nomi/narxini
// qayta-qayta yozmasdan, menyudan tanlab qo'ya olsin). server/routes/
// waiterMenu.js bilan BAYT-BAYTIGA bir xil so'rov (xuddi shu ma'lumot kerak:
// kategoriya + taom + narx + mavjudlik) — lekin ATAYLAB alohida fayl/nusxa,
// chunki kassir hududi (requireRole(['admin','kassir'])) va afitsiant
// hududi (requireAuth'dan boshqa cheklov yo'q) turli ruxsat darajasida;
// umumiy bitta router ikkalasiga ulansa, kelajakda birini o'zgartirganda
// ikkinchisiga bilmasdan ta'sir qilish xavfi bor edi.
//
// MUHIM: bu ENDI kassirning "taom qo'sha olmaydi/menyuni ko'rmaydi" degan
// asl qoidasini (2026-09-09 (2)dagi kassir roli qo'shilishi) BUZMAYDI —
// o'sha qoida STOL/BUYURTMA oqimiga oid edi (server/routes/kassirTables.js,
// hamon o'zgarishsiz, taom qo'shish endpointi yo'q). Bu yerdagi menyu FAQAT
// qo'lda hisoblash (manual_bills, stol/buyurtmaga bog'liq emas) uchun
// ma'lumot manbai — faqat o'qish, hech narsaga yozmaydi.
//
// "Turi" (variant, 2026-09-09, menu_items.parent_item_id) — waiterMenu.js'dagi
// bilan bir xil mantiq: faqat ASOSIY (parent_item_id IS NULL) taomlar shu
// asosiy ro'yxatda chiqadi, turlari `variants` massivida ichma-ich qaytariladi.
const express = require('express');
const { db } = require('../db');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

router.get('/menu', asyncRoute((req, res) => {
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, id')
    .all();
  // cost_price ATAYLAB tashlab ketiladi — admin-only biznes ma'lumot.
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
