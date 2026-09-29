// Umumiy bildirishnoma (notifications jadvali) o'qish/tasdiqlash mantiqi —
// ilgari server/routes/waiterNotifications.js va server/routes/deliveryAlerts.js
// bir xil "30s grace-oyna bilan tasdiqlanmaganlarni o'qish" + "tasdiqlash
// (idempotent)" naqshini mustaqil, deyarli bayt-baytiga bir xil holda qayta
// yozgan edi. Endi ikkalasi ham shu yagona xizmatdan foydalanadi — grace
// oynasi yoki tasdiqlash mantig'i o'zgarishi kerak bo'lsa, endi FAQAT shu
// yerda o'zgartiriladi.
const { db, nowIso } = require('../db');

// Hali tasdiqlanmagan (acknowledged_at IS NULL) + yaqinda tasdiqlangan
// (shu oyna ichida) yozuvlar — shu grace-oyna tufayli "<Ism> qabul qildi"/
// "ko'rdi" holati boshqa ekranlarda ham qisqa vaqt ko'rinib turadi, so'ng
// ro'yxatdan avtomatik tushib qoladi.
const GRACE_MS = 30000;

// whereExtra — qaysi bildirishnoma turini o'qiyotganini ajratadigan qo'shimcha
// SQL shart (masalan "order_item_id IS NOT NULL" yoki "customer_order_id IS
// NOT NULL"). Parametr qabul qilmaydi (hozircha ikkala chaqiruvchida ham
// literal ustun tekshiruvi, foydalanuvchi kiritgan qiymat emas).
function listUnread(whereExtra) {
  const graceCutoff = new Date(Date.now() - GRACE_MS).toISOString();
  const where = whereExtra
    ? `${whereExtra} AND (acknowledged_at IS NULL OR acknowledged_at >= ?)`
    : '(acknowledged_at IS NULL OR acknowledged_at >= ?)';
  return db.prepare(`SELECT * FROM notifications WHERE ${where} ORDER BY id ASC`).all(graceCutoff);
}

// row — chaqiruvchi tomonidan OLDINDAN topilgan (va o'ziga xos turga tegishli
// ekani tekshirilgan) notifications qatori. Idempotent: allaqachon tasdiqlangan
// bo'lsa hech narsa qilmay o'sha qatorni qaytaradi. onAcknowledge — ixtiyoriy
// yon-ta'sir (masalan waiterNotifications.js'dagi order_items.picked_up_at
// yangilanishi) — shu bir xil tranzaksiya ichida bajariladi.
function acknowledge(row, ackName, onAcknowledge) {
  if (row.acknowledged_at) return row; // allaqachon tasdiqlangan — idempotent
  const run = db.transaction(() => {
    const ts = nowIso();
    db.prepare('UPDATE notifications SET is_read = 1, acknowledged_at = ?, acknowledged_by_name = ? WHERE id = ?')
      .run(ts, ackName, row.id);
    if (onAcknowledge) onAcknowledge(ts);
  });
  run();
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(row.id);
}

module.exports = { GRACE_MS, listUnread, acknowledge };
