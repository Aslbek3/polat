// Menyu daraxti (kategoriya -> asosiy taom -> turlari) — 2026-09-10.
//
// NEGA BU FAYL BOR: bir xil "faol kategoriya + faol taom + variant yig'ish"
// mantig'i UCH xil route faylida, bir-biridan mustaqil ravishda qayta
// yozilgan edi:
//   - routes/waiterMenu.js  — afitsiant ekrani  (GET /api/waiter/menu)
//   - routes/kassirMenu.js  — kassir "Menyu"    (GET /api/kassir/menu)
//   - routes/publicMenu.js  — landing sahifa    (GET /api/public/menu)
// Uchalasida ham bir xil `topItemsStmt` / `variantsStmt` so'rovi va bir xil
// `require_inventory_link` filtri bor edi. Ya'ni bitta qoidani (masalan
// "tugagan taom ham ko'rinadi") o'zgartirish uchun uch joyni tuzatish kerak
// edi va biri unutilsa ekranlar bir-biriga zid ma'lumot ko'rsatardi.
//
// FARQ FAQAT QAYTARILADIGAN MAYDONLARDA edi, mantiqda emas:
//   - public  — kam maydon, `inventory_item_id` (ichki) OLIB TASHLANADI va
//               kategoriyadan faqat {id, name, items} qaytariladi;
//   - waiter/kassir — ko'proq maydon, kategoriya obyekti to'liq qaytariladi.
// Shu sabab umumiy `buildMenuTree()` shu farqlarni parametr qilib oladi.
const { db } = require('../db');

// Xodim (afitsiant/kassir) ekranlari uchun maydonlar.
// cost_price (tan narxi, 2026-09-08) ATAYLAB yo'q — bu admin-only biznes
// ma'lumot, afitsiant/kassir ekraniga chiqmasligi kerak.
const STAFF_FIELDS = `id, category_id, name, price, is_available, is_active, sort_order,
            description, image_url, volume, inventory_item_id, created_at, updated_at`;

// Ochiq (mijoz) sahifasi uchun maydonlar — mumkin qadar kam.
// `inventory_item_id` bu yerda faqat require_inventory_link filtri uchun
// kerak, javobdan `stripInternal` bilan olib tashlanadi.
const PUBLIC_FIELDS = 'id, name, price, description, image_url, volume, is_available, inventory_item_id';

// Ichki maydonni javobdan olib tashlash (mijozga ketmasin).
const strip = ({ inventory_item_id, ...rest }) => rest;

// Menyu daraxtini yig'adi.
//
//   fields         — SELECT ro'yxati (yuqoridagi STAFF_FIELDS / PUBLIC_FIELDS)
//   stripInternal  — true bo'lsa taom obyektidan `inventory_item_id` olib
//                    tashlanadi (filtr ishlagandan KEYIN)
//   categoryShape  — 'full'   : kategoriya qatori to'liq qaytariladi ({...cat, items})
//                    'public' : faqat {id, name, items}
//
// Umumiy qoidalar (uch ekranda ham bir xil, o'zgartirilsa shu yerda):
//   - faqat is_active = 1 kategoriya va taomlar;
//   - tugagan (is_available = 0) taom ro'yxatdan OLIB TASHLANMAYDI — ekran uni
//     "Tugadi" belgisi bilan ko'rsatadi (public/landing/script.js,
//     public/waiter/order.js);
//   - require_inventory_link = 1 kategoriyalarda (masalan "Ichimliklar") ombor
//     bilan bog'lanmagan (inventory_item_id NULL) taomlar butunlay
//     chiqarilmaydi (2026-09-07);
//   - "Turi" (variant, 2026-09-09, menu_items.parent_item_id): asosiy ro'yxatda
//     faqat ASOSIY (parent_item_id IS NULL) taomlar, turlari esa `variants`
//     massivida ichma-ich qaytariladi;
//   - hech qanday taomi qolmagan kategoriya butunlay yashiriladi.
function buildMenuTree({ fields, stripInternal = false, categoryShape = 'full' }) {
  const categories = db
    .prepare('SELECT * FROM menu_categories WHERE is_active = 1 ORDER BY sort_order, id')
    .all();
  const topItemsStmt = db.prepare(
    `SELECT ${fields} FROM menu_items WHERE category_id = ? AND is_active = 1 AND parent_item_id IS NULL ORDER BY sort_order, id`
  );
  const variantsStmt = db.prepare(
    `SELECT ${fields} FROM menu_items WHERE parent_item_id = ? AND is_active = 1 ORDER BY sort_order, id`
  );
  const shape = stripInternal ? strip : (row) => row;

  return categories
    .map((cat) => {
      let items = topItemsStmt.all(cat.id);
      if (cat.require_inventory_link) items = items.filter((it) => it.inventory_item_id !== null);
      items = items.map((it) => {
        let variants = variantsStmt.all(it.id);
        if (cat.require_inventory_link) variants = variants.filter((v) => v.inventory_item_id !== null);
        return { ...shape(it), variants: variants.map(shape) };
      });
      return categoryShape === 'public' ? { id: cat.id, name: cat.name, items } : { ...cat, items };
    })
    .filter((cat) => cat.items.length > 0);
}

// Afitsiant va kassir ekranlari uchun — ikkalasi ham AYNAN bir xil ma'lumot
// oladi (ilgari ham bayt-baytiga bir xil ikki nusxa edi).
function staffMenu() {
  return buildMenuTree({ fields: STAFF_FIELDS });
}

// Landing (mijoz) sahifasi uchun.
function publicMenu() {
  return buildMenuTree({ fields: PUBLIC_FIELDS, stripInternal: true, categoryShape: 'public' });
}

module.exports = { STAFF_FIELDS, PUBLIC_FIELDS, buildMenuTree, staffMenu, publicMenu };
