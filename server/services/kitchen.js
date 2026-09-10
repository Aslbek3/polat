// Oshxona (oshpaz) xizmat qatlami — 2026-09-10.
//
// NEGA BU FAYL BOR: loyiha qoidasi bo'yicha route fayllari bazaga bevosita
// murojaat qilmaydi. `routes/chefKitchen.js` bu qoidani buzib `db.prepare()`
// ni to'g'ridan-to'g'ri chaqirardi; endi u faqat HTTP qatlami.
//
// Mijoz buyurtmasining HOLATINI o'zgartirish bu yerda EMAS —
// u `services/customerOrders.js` dagi yagona `transition()` da, chunki
// holat o'zgarishi ombor qoldig'iga ta'sir qiladi va bu qoida bitta joyda
// turishi shart (2026-09-10 auditidagi uchta xato aynan shundan chiqqan edi).

const { db, nowIso } = require('../db');
const { listTablesOverview, buildOrderView } = require('./orders');

class KitchenError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ⚠️ 2026-09-10: ilgari bu yerda `SELECT *` edi va oshpaz ekraniga mijozning
// TELEFON RAQAMI, UY MANZILI va aniq GPS koordinatasi ham kelardi — garchi
// `public/chef/kitchen.js` ularni chizmasa ham. Oshxona planshetidagi hisob
// (yoki o'sha planshetni qo'lga kiritgan har kim) DevTools -> Network orqali
// har 15 soniyada yangilanadigan shu javobdan barcha yetkazib berish
// mijozlarining shaxsiy ma'lumotini yig'ib olishi mumkin edi.
// Oshpazga bularning hech biri kerak emas — kuryer va adminda qoladi.
const CHEF_ORDER_FIELDS = 'id, full_name, fulfillment, status, note, total_amount, created_at';

// Band stollar va ularning oshpazga TEGISHLI taomlari.
// Faqat afitsiant "yuborgan" (sent_at to'ldirilgan) VA afitsiant hali
// "Qabul qildim" bosmagan (picked_up_at bo'sh) qatorlar ko'rinadi —
// afitsiant tasdiqlashi bilan taom ro'yxatdan yo'qoladi.
function listKitchenTables() {
  return listTablesOverview().map((t) => {
    if (!t.occupied) return t;
    const view = buildOrderView(t.order_id);
    return { ...t, items: view.items.filter((it) => it.sent_at && !it.picked_up_at) };
  });
}

// Oshpazga ko'rsatiladigan onlayn buyurtmalar (hali tayyorlanmaganlar).
function listOnlineOrders() {
  const rows = db
    .prepare(
      `SELECT ${CHEF_ORDER_FIELDS} FROM customer_orders
       WHERE status IN ('new', 'confirmed') ORDER BY id ASC`
    )
    .all();
  if (rows.length === 0) return [];

  // N+1 emas: bitta IN(...) so'rovi (adminCustomerOrders/courierOrders
  // bilan bir xil naqsh).
  const ids = rows.map((o) => o.id);
  const placeholders = ids.map(() => '?').join(',');
  const allItems = db
    .prepare(`SELECT * FROM customer_order_items WHERE customer_order_id IN (${placeholders})`)
    .all(...ids);

  const byOrder = new Map();
  for (const it of allItems) {
    if (!byOrder.has(it.customer_order_id)) byOrder.set(it.customer_order_id, []);
    byOrder.get(it.customer_order_id).push(it);
  }
  return rows.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }));
}

// Dine-in taomni "tayyor"/"tayyor emas" deb belgilash.
//
// 2026-09-10: IDEMPOTENT qilindi va bitta tranzaksiyaga o'raldi. Ilgari
// `{ready:true}` ikki marta yuborilsa (oshpaz ikki marta bosdi yoki tarmoq
// qayta urindi) IKKITA bildirishnoma qatori yaratilardi va afitsiant bir
// xil taomni ikki marta ko'rardi. Ikkita yozuv alohida bajarilardi, ya'ni
// ular orasida xato bo'lsa holat nomuvofiq qolardi.
function setItemReady(orderItemId, ready) {
  const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(orderItemId);
  if (!item) throw new KitchenError('Taom topilmadi', 404);
  if (item.status !== 'active') {
    throw new KitchenError("Bekor qilingan taom uchun holatni o'zgartirib bo'lmaydi");
  }
  if (!item.sent_at) {
    throw new KitchenError('Bu taom hali afitsiant tomonidan oshxonaga yuborilmagan');
  }

  if (ready && item.ready_at) {
    return { ok: true, ready: true }; // allaqachon tayyor — hech narsa qilinmaydi
  }

  const run = db.transaction(() => {
    db.prepare('UPDATE order_items SET ready_at = ? WHERE id = ?')
      .run(ready ? nowIso() : null, orderItemId);

    if (ready) {
      // Afitsiantga bildirishnoma — stol nomi
      // order_id -> orders.table_id -> tables orqali.
      const table = db
        .prepare('SELECT t.name AS name FROM orders o JOIN tables t ON t.id = o.table_id WHERE o.id = ?')
        .get(item.order_id);
      if (table) {
        db.prepare('INSERT INTO notifications (message, is_read, order_item_id, created_at) VALUES (?, 0, ?, ?)')
          .run(`${table.name} taomi tayyor: ${item.name_snapshot}`, item.id, nowIso());
      }
    } else {
      // "Tayyor emas"ga qaytarilsa, tasdiqlanmagan bildirishnomani ham
      // olib tashlaymiz — aks holda afitsiant ekranida allaqachon bekor
      // qilingan "tayyor" xabari osilib qolardi.
      db.prepare('DELETE FROM notifications WHERE order_item_id = ? AND acknowledged_at IS NULL')
        .run(orderItemId);
    }
  });
  run();

  return { ok: true, ready };
}

module.exports = { KitchenError, listKitchenTables, listOnlineOrders, setItemReady };
