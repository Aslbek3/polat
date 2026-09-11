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
//
// X-01 (2026-09-10): FIFO TARTIB. Ilgari stollar `sort_order, id` bo'yicha
// (listTablesOverview) qaytardi — "Stol 4" 25 daqiqa kutayotgan bo'lsa ham
// raqami katta bo'lgani uchun ro'yxat pastida qolardi va oshpaz buni
// bilmasdi. Endi tartib:
//   1) band + oshpaz hali TAYYORLAMAGAN taomi bor stollar — eng eski shunday
//      taomining `sent_at` qiymati bo'yicha O'SIB boruvchi (eng uzoq
//      kutayotgani birinchi);
//   2) band, lekin oshpazdan hech narsa kutilmayotgan stollar: hali hech narsa
//      yuborilmagan, hammasi tayyor (afitsiant olib ketishini kutmoqda) yoki
//      hammasi olib ketilgan;
//   3) bo'sh stollar — eng oxirida. Ular ATAYLAB chiqarib tashlanmadi:
//      public/chef/kitchen.js o'zi `.filter((t) => t.occupied)` qiladi,
//      javob shaklini torroq qilish boshqa iste'molchini buzishi mumkin edi.
// 2- va 3-guruh ichida (va teng `oldest_sent_at`da) avvalgi `sort_order, id`
// tartibi saqlanadi (Array#sort barqaror — stable).
//
// Har bir stolga `oldest_sent_at` (ISO satr yoki null) qo'shildi — frontend
// undan kutish vaqtini ("⏱ 12 daq") hisoblaydi. `sent_at` ISO-8601 (nowIso)
// bo'lgani uchun satr sifatida solishtirish xronologik tartibga teng.
//
// ⚠️ 2026-09-11 tuzatish: `oldest_sent_at` endi faqat HALI TAYYOR BO'LMAGAN
// (`ready_at` bo'sh) taomlar bo'yicha. Ilgari tayyor, lekin afitsiant hali
// olib ketmagan taom ham hisoblanardi — oshpaz hammasini tayyorlab bo'lgan
// stol ro'yxat TEPASIDA qolib, haqiqatan kutayotgan stolni pastga surardi
// (public/chef/kitchen.js faqat rangni to'g'rilagan edi, tartib esa shu yerda).
function listKitchenTables() {
  const rows = listTablesOverview().map((t) => {
    if (!t.occupied) return { ...t, oldest_sent_at: null };
    const view = buildOrderView(t.order_id);
    const items = view.items.filter((it) => it.sent_at && !it.picked_up_at);
    const oldestSentAt = items.reduce(
      (min, it) => (!it.ready_at && (min === null || it.sent_at < min) ? it.sent_at : min),
      null
    );
    return { ...t, items, oldest_sent_at: oldestSentAt };
  });

  const group = (t) => (!t.occupied ? 2 : t.oldest_sent_at ? 0 : 1);
  return rows.sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    if (group(a) !== 0 || a.oldest_sent_at === b.oldest_sent_at) return 0;
    return a.oldest_sent_at < b.oldest_sent_at ? -1 : 1;
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
        // X-31 (2026-09-10): miqdor 1 dan katta bo'lsa xabarga " ×N" qo'shiladi.
        // NEGA: "Stol 3 taomi tayyor: Osh" — 3 ta osh bo'lsa ham afitsiant
        // bittasini olib ketib, qolganini "hali tayyor emas" deb o'ylardi.
        // X-06 (bir xil yuborilmagan taom birlashtirilishi) bilan bu yanada
        // muhim: endi bitta qator ko'pincha bir nechta porsiya.
        // 1 ta bo'lsa avvalgidek — ortiqcha "×1" shovqin qilmaydi.
        const qtyLabel = item.quantity > 1 ? ` ×${item.quantity}` : '';
        db.prepare('INSERT INTO notifications (message, is_read, order_item_id, created_at) VALUES (?, 0, ?, ?)')
          .run(`${table.name} taomi tayyor: ${item.name_snapshot}${qtyLabel}`, item.id, nowIso());
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
