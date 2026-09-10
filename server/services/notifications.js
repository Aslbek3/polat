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

// Bildirishnoma TURLARI — qaysi ustun to'ldirilgani bilan ajraladi:
//   order_item     — dine-in "🏁 Tayyor" (chefKitchen.js yozadi, afitsiant
//                    o'qiydi: routes/waiterNotifications.js)
//   customer_order — "🚚 Yangi yetkazib berish buyurtmasi" (publicCustomerOrders.js
//                    yozadi; admin+oshpaz+kuryer o'qiydi: routes/deliveryAlerts.js)
// Har bir ekran FAQAT o'z turini ko'radi va faqat o'z turini tasdiqlay oladi —
// ilgari afitsiant kuryerga tegishli xabarni ham "tasdiqlab" qo'yishi mumkin
// edi (2026-09-09'da tuzatilgan). Ustun nomlari shu jadvaldan olinadi, so'rovga
// foydalanuvchi kiritgan qiymat sifatida tushmaydi.
const KIND_COLUMNS = {
  order_item: 'order_item_id',
  customer_order: 'customer_order_id',
};

function kindColumn(kind) {
  const column = KIND_COLUMNS[kind];
  if (!column) throw new Error(`Noma'lum bildirishnoma turi: ${kind}`);
  return column;
}

// Berilgan turdagi o'qilmagan (+ grace-oyna ichidagi) bildirishnomalar.
function listUnreadOfKind(kind) {
  return listUnread(`${kindColumn(kind)} IS NOT NULL`);
}

// Bittasini id bo'yicha topadi, LEKIN faqat so'ralgan turga tegishli bo'lsa.
// Topilmasa (yoki boshqa turga tegishli bo'lsa) null — chaqiruvchi route uni
// 404 bilan rad etadi.
function findOfKind(id, kind) {
  const column = kindColumn(kind);
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  if (!row || row[column] == null) return null;
  return row;
}

// Dine-in "tayyor" bildirishnomasini tasdiqlash. Tasdiqlash bilan BIR
// tranzaksiyada tegishli taom (notifications.order_item_id) "qabul qilingan"
// deb belgilanadi — shu bilan taom oshpazning kitchen ekranidan yo'qoladi
// (server/routes/chefKitchen.js GET /tables filtrlaydi).
function acknowledgeOrderItem(row, ackName) {
  return acknowledge(row, ackName, (ts) => {
    db.prepare('UPDATE order_items SET picked_up_at = ? WHERE id = ?').run(ts, row.order_item_id);
  });
}

module.exports = {
  GRACE_MS,
  listUnread,
  acknowledge,
  listUnreadOfKind,
  findOfKind,
  acknowledgeOrderItem,
};
