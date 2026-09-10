// Chek chop etish navbati (print_requests) — 2026-09-10.
//
// Afitsiant stolni yopganda server/services/orders.js closeTable() shu
// jadvalga "chop etish kutilmoqda" yozuvini qo'yadi; admin paneli
// (public/app.js, initAdminPrintRequests) uni poll qilib ko'rsatadi va
// chekni chop etganda "chop etildi" deb belgilaydi.
//
// Ilgari bu ikki so'rov to'g'ridan-to'g'ri route faylida (routes/
// adminPrintRequests.js) yozilgan edi — loyiha qoidasiga ko'ra route
// fayllari `db.prepare()`ni bevosita chaqirmaydi, shuning uchun bu yerga
// ko'chirildi.
const { db, nowIso } = require('../db');

// Hali chop etilmagan so'rovlar — admin ekranida stol nomi va hisob summasi
// bilan ko'rsatiladi, shuning uchun orders/tables bilan JOIN qilinadi.
// Eng eskisi birinchi (ORDER BY pr.id ASC) — navbat tartibi.
function listUnprinted() {
  return db.prepare(`
    SELECT pr.id, pr.order_id, pr.created_at, o.total_amount, t.name AS table_name
    FROM print_requests pr
    JOIN orders o ON o.id = pr.order_id
    JOIN tables t ON t.id = o.table_id
    WHERE pr.printed_at IS NULL
    ORDER BY pr.id ASC
  `).all();
}

// So'rovni "chop etildi" deb belgilaydi va yangilangan qatorni qaytaradi.
// IDEMPOTENT: allaqachon belgilangan bo'lsa hech narsa o'zgartirmay o'sha
// qatorni qaytaradi (admin tugmani ikki marta bossa, "kim chop etdi"
// yozuvi birinchi marta bosgan odamniki bo'lib qoladi).
// Topilmasa null — chaqiruvchi route uni 404 bilan rad etadi.
function markPrinted(id, printedByName) {
  const row = db.prepare('SELECT * FROM print_requests WHERE id = ?').get(id);
  if (!row) return null;
  if (row.printed_at) return row;

  db.prepare('UPDATE print_requests SET printed_at = ?, printed_by = ? WHERE id = ?')
    .run(nowIso(), printedByName, id);
  return db.prepare('SELECT * FROM print_requests WHERE id = ?').get(id);
}

module.exports = { listUnprinted, markPrinted };
