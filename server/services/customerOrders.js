// Mijoz buyurtmasi (customer_orders) holat mashinasi — 2026-09-10.
//
// NEGA BU FAYL BOR: ilgari buyurtma holatini o'zgartirish UCH xil joyda,
// bir-biridan mustaqil ravishda qo'lda yozilgan edi:
//   - routes/publicCustomerOrders.js — yaratish (ombordan sarflaydi)
//   - routes/adminCustomerOrders.js  — admin status o'zgartirishi
//   - routes/chefKitchen.js          — oshpaz status o'zgartirishi
// Har biri ombor qoldig'iga o'z bilganicha (yoki umuman) ta'sir qilardi.
// Auditda topilgan uchta xato ham aynan shundan kelib chiqqan edi:
//   1. `cancelled -> completed -> cancelled -> completed` sikli har
//      aylanishda qoldiqni yana bir marta yeb ketardi;
//   2. oshpaz ekrani ombor mantig'ini BUTUNLAY chetlab o'tardi (u faqat
//      `UPDATE customer_orders SET status` qilardi);
//   3. buyurtmani o'chirish `inventory_movements` dagi FK tufayli 500
//      berardi (pastdagi deleteOrder() izohiga qarang).
//
// ASOSIY G'OYA: ombor holati endi O'TISHDAN CHAMALANMAYDI, u bazada
// saqlanadi (`customer_orders.stock_state`). Shu sabab har bir amal
// IDEMPOTENT: bir xil o'tishni necha marta bajarsangiz ham natija bir xil.

const { db, nowIso } = require('../db');
const inventory = require('./inventory');
const settings = require('./settings');

class CustomerOrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const STATUSES = ['new', 'confirmed', 'completed', 'cancelled'];

// Ombor holatlari (schema.sql'dagi izohga qarang):
//   held     — qoldiq shu buyurtma uchun ushlab turilibdi, qaytarilishi mumkin
//   released — qoldiq omborga qaytarilgan
//   spent    — qoldiq haqiqatda sarflangan (taom tayyorlangandan keyin bekor
//              qilingan) — na qaytariladi, na qayta sarflanadi
const HELD = 'held';
const RELEASED = 'released';
const SPENT = 'spent';

function getOrder(orderId) {
  const order = db.prepare('SELECT * FROM customer_orders WHERE id = ?').get(orderId);
  if (!order) throw new CustomerOrderError('Buyurtma topilmadi', 404);
  return order;
}

// ---------------------------------------------------------------------------
// Admin ro'yxati (2026-09-10, A-07).
//
// NEGA SERVISDA: ilgari bu SQL `routes/adminCustomerOrders.js` ichida edi —
// loyiha qoidasi (route'da `db.prepare` yo'q) buzilgan edi. Filtr qo'shilishi
// bilan mantiq kattalashdi, shuning uchun shu yerga ko'chirildi.
//
// Filtr: `new` — faqat yangi; `active` — hali bajarilmagan (new + confirmed),
// ya'ni "hozir kimdir shug'ullanishi kerak"; `all` (standart) — hammasi.
// Standart `all` ATAYLAB: mavjud frontend parametrsiz so'raydi va hamma
// buyurtmani kutadi. Noma'lum qiymat ham `all` deb olinadi (reports.js
// `status` filtri bilan bir xil yondashuv).
// ---------------------------------------------------------------------------
const LIST_FILTERS = {
  new: ['new'],
  active: ['new', 'confirmed'],
  all: null,
};

// ⚠️ LIMIT + items uchun BITTA `IN (...)` so'rov — sahifa har 15 soniyada
// poll qiladi; cheklovsiz ro'yxat va N+1 so'rov better-sqlite3 sinxron
// bo'lgani uchun butun serverni bloklardi (2026-09-10, ilgari route'da edi).
const LIST_LIMIT = 200;

function attachItems(orders) {
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id);
  const placeholders = ids.map(() => '?').join(',');
  const allItems = db
    .prepare(`SELECT * FROM customer_order_items WHERE customer_order_id IN (${placeholders}) ORDER BY id ASC`)
    .all(...ids);
  const itemsByOrder = new Map();
  for (const it of allItems) {
    if (!itemsByOrder.has(it.customer_order_id)) itemsByOrder.set(it.customer_order_id, []);
    itemsByOrder.get(it.customer_order_id).push(it);
  }
  return orders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) || [] }));
}

function listOrders({ status } = {}) {
  const statuses = Object.prototype.hasOwnProperty.call(LIST_FILTERS, status) ? LIST_FILTERS[status] : null;
  let sql = 'SELECT * FROM customer_orders';
  const params = [];
  if (statuses) {
    sql += ` WHERE status IN (${statuses.map(() => '?').join(',')})`;
    params.push(...statuses);
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(LIST_LIMIT);
  return attachItems(db.prepare(sql).all(...params));
}

// Bitta buyurtma items bilan — hisobot ro'yxatidagi kind='online' qatorining
// chekini ochish uchun (2026-09-10, A-02). Shakl ro'yxat elementi bilan
// AYNAN bir xil, frontend `openCustomerReceiptModal(order)`ga to'g'ridan
// to'g'ri uzatadi.
function getOrderWithItems(orderId) {
  return attachItems([getOrder(orderId)])[0];
}

// Holat bo'yicha son — admin bosh sahifasi (dashboard) uchun, A-03/A-07.
function countByStatus(status) {
  return db.prepare('SELECT COUNT(*) AS c FROM customer_orders WHERE status = ?').get(status).c;
}

// Buyurtmaning ombor bilan bog'langan qatorlari. `menu_item_id` NULL bo'lishi
// mumkin (taom o'chirilgan bo'lsa) — JOIN uni tabiiy ravishda chiqarib
// tashlaydi, ya'ni bog'lanmagan qatorlar ombor hisobiga ta'sir qilmaydi.
function linkedItems(orderId) {
  return db
    .prepare(
      `SELECT coi.id AS customer_order_item_id, coi.quantity,
              m.inventory_item_id, m.name AS product_name
       FROM customer_order_items coi
       JOIN menu_items m ON m.id = coi.menu_item_id
       WHERE coi.customer_order_id = ? AND m.inventory_item_id IS NOT NULL`
    )
    .all(orderId);
}

function consumeStock(orderId) {
  for (const it of linkedItems(orderId)) {
    inventory.consume(it.inventory_item_id, it.quantity, {
      customerOrderItemId: it.customer_order_item_id,
      productName: it.product_name,
    });
  }
}

function releaseStock(orderId) {
  for (const it of linkedItems(orderId)) {
    inventory.release(it.inventory_item_id, it.quantity, {
      customerOrderItemId: it.customer_order_item_id,
    });
  }
}

// Yangi ombor holatini aniqlaydi. Bu YAGONA joy — bu qoidalarni boshqa
// hech qayerda takrorlamang.
//
// | joriy stock_state | o'tish                          | amal        | yangi holat |
// |-------------------|----------------------------------|-------------|-------------|
// | held              | -> cancelled (tayyorlanmagandan) | qaytarish   | released    |
// | held              | -> cancelled ('completed'dan)    | AMAL YO'Q   | spent       |
// | released          | -> faol holat (new/confirmed/... | sarflash    | held        |
// | spent             | har qanday o'tish                | AMAL YO'Q   | spent       |
//
// 'spent' ATAYLAB terminal: taom allaqachon tayyorlangan va uning
// mahsuloti sarflangan. Uni qayta "completed" qilish yangi taom
// tayyorlash EMAS — bu odatda adminning xatoni tuzatishi, shuning uchun
// ombordan yana ayirish NOTO'G'RI bo'lardi. Bu 2026-09-09 auditidagi
// "tayyorlangandan keyin qaytarilmaydi" qoidasini saqlaydi va ayni paytda
// takrorlanuvchi siklni zararsiz qiladi.
function planStockChange(order, nextStatus) {
  const current = order.stock_state || HELD;

  // 'spent' TERMINAL: taom tayyorlangan, mahsulot ketgan. Bundan keyingi
  // hech qanday holat o'zgarishi ombor qoldig'iga tegmaydi.
  if (current === SPENT) return { action: null, nextStockState: SPENT };

  // ⚠️ 2026-09-10 (2-bosqich audit): 'spent' belgisi endi 'completed'ga
  // KIRISH paytida qo'yiladi, undan CHIQISH paytida emas.
  //
  // Ilgari qoida "bekor qilish paytidagi status 'completed' bo'lsa
  // qaytarma" edi — ya'ni bazadagi FAKTGA emas, o'tish yo'liga bog'liq edi.
  // Shu sabab uni chetlab o'tish mumkin edi (haqiqiy probe bilan tasdiqlangan):
  //     new -> completed  (taom tayyorlandi, mahsulot sarflandi)
  //     completed -> confirmed  (admin orqaga qaytardi)
  //     confirmed -> cancelled  -> ombor QAYTARILDI (+3 dona)
  // Natijada omborda mavjud bo'lmagan mahsulot "paydo bo'lardi".
  if (nextStatus === 'completed') {
    return current === RELEASED
      ? { action: 'consume', nextStockState: SPENT }
      : { action: null, nextStockState: SPENT };
  }

  const willBeActive = nextStatus !== 'cancelled';

  if (current === HELD && !willBeActive) {
    return { action: 'release', nextStockState: RELEASED };
  }

  if (current === RELEASED && willBeActive) {
    return { action: 'consume', nextStockState: HELD };
  }

  // Qolgan barcha holatlar (masalan new -> confirmed) ombor uchun betaraf.
  return { action: null, nextStockState: current };
}

// Buyurtmani yangi holatga o'tkazadi va ombor qoldig'ini shunga mos
// yangilaydi — ikkalasi BITTA tranzaksiyada. `allowed` berilsa, faqat shu
// holatlarga o'tishga ruxsat beriladi (oshpaz ekrani 'confirmed'/'completed'
// bilan cheklangan).
// `notAllowedMessage` — foydalanuvchiga ko'rinadigan xabar. Standart xabar
// ichki status kodlarini ('confirmed', 'completed') sanaydi, bu esa xodim
// uchun tushunarsiz; shu sabab chaqiruvchi o'z ekraniga mos, odamga
// tushunarli o'zbekcha xabar bera oladi (masalan oshpaz ekrani).
function transition(orderId, nextStatus, { allowed = STATUSES, notAllowedMessage } = {}) {
  if (!STATUSES.includes(nextStatus)) {
    throw new CustomerOrderError("Holatni to'g'ri tanlang");
  }
  if (!allowed.includes(nextStatus)) {
    throw new CustomerOrderError(
      notAllowedMessage || `Bu yerdan faqat quyidagi holatlarga o'tkazish mumkin: ${allowed.join(', ')}`
    );
  }

  const run = db.transaction(() => {
    const order = getOrder(orderId);
    if (order.status === nextStatus) return order.id; // idempotent — hech narsa qilinmaydi

    const plan = planStockChange(order, nextStatus);
    if (plan.action === 'consume') consumeStock(order.id);
    else if (plan.action === 'release') releaseStock(order.id);

    db.prepare('UPDATE customer_orders SET status = ?, stock_state = ? WHERE id = ?')
      .run(nextStatus, plan.nextStockState, order.id);
    return order.id;
  });

  return getOrder(run());
}

// Buyurtmani butunlay o'chirish (admin).
//
// FK XATOSI (2026-09-10 da topildi): `inventory_movements.customer_order_item_id`
// `customer_order_items(id)`ga ON DELETE qoidasisiz havola qiladi, va
// `PRAGMA foreign_keys = ON` yoqilgan. Ilgari bu funksiya avval omborni
// qaytarib (ya'ni YANGI movement qatori yozib), keyin `customer_order_items`ni
// o'chirardi — natijada FOREIGN KEY constraint failed va butun amal 500 bilan
// yiqilardi. Ya'ni omborga bog'langan taomi bor HAR QANDAY mijoz buyurtmasini
// admin panelidan o'chirib bo'lmasdi.
//
// Yechim: qatorlarni o'chirishdan oldin harakatlar tarixidagi havolani
// uzamiz (NULL). Tarix o'chirilmaydi — ombor harakatlari saqlanib qoladi,
// faqat endi o'chirilgan qatorga ko'rsatmaydi.
function deleteOrder(orderId) {
  const run = db.transaction(() => {
    const order = getOrder(orderId);

    // Qoldiqni qaytarish qoidasi transition() bilan bir xil bo'lishi uchun
    // xuddi shu rejalashtiruvchidan foydalanamiz.
    const plan = planStockChange(order, 'cancelled');
    if (plan.action === 'release') releaseStock(order.id);

    db.prepare(
      `UPDATE inventory_movements SET customer_order_item_id = NULL
       WHERE customer_order_item_id IN (SELECT id FROM customer_order_items WHERE customer_order_id = ?)`
    ).run(order.id);

    db.prepare('DELETE FROM customer_order_items WHERE customer_order_id = ?').run(order.id);
    db.prepare('DELETE FROM notifications WHERE customer_order_id = ?').run(order.id);
    db.prepare('DELETE FROM customer_orders WHERE id = ?').run(order.id);
  });

  run();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ochiq (login shart emas) landing sahifasidan buyurtma yaratish.
//
// Ilgari bu mantiq to'liq server/routes/publicCustomerOrders.js ichida edi
// (validatsiya + INSERT + ombordan sarflash + bildirishnoma). Route fayllari
// `db.prepare()`ni bevosita chaqirmasligi kerak, shuning uchun 2026-09-10'da
// shu xizmatga ko'chirildi — mijoz buyurtmasining butun hayot sikli
// (yaratish -> holat o'zgarishi -> o'chirish) endi bitta faylda.
//
// Xato xabarlari `CustomerOrderError` orqali otiladi (standart status 400) -
// routeUtils.js asyncRoute() ularni AYNAN o'sha status va {error: xabar}
// JSON ko'rinishida qaytaradi, ya'ni mijoz uchun hech narsa o'zgarmadi.
// ---------------------------------------------------------------------------

// Intl/Node-locale'ga bog'liq bo'lmagan oddiy "1 234" ko'rinishidagi guruhlash -
// bu faqat bildirishnoma matni uchun, mijozga qaytariladigan javobga ta'sir
// qilmaydi (total_amount xom son sifatida qaytadi, formatlash frontend ishi).
function fmtSomPlain(n) {
  return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
}

// Narx HECH QACHON mijoz brauzeridan ishonib olinmaydi — har bir band shu
// yerda menu_items jadvalidan qayta qidiriladi.
function getActiveMenuItem(menuItemId) {
  return db
    .prepare('SELECT * FROM menu_items WHERE id = ? AND is_active = 1 AND is_available = 1')
    .get(menuItemId);
}

// ---------------------------------------------------------------------------
// Mijozga ko'rinadigan ombor/mavjudlik xabarlari — 2026-09-10 (L-13).
//
// NEGA: mijoz landing savatida literal "Menyudagi bir band endi mavjud emas"
// yoki "Yetarli qoldiq yo'q (hozir: 2 dona)" ko'rardi — QAYSI taom ekani
// aytilmasdi, savatda 5 ta band bo'lsa mijoz qaysi birini olib tashlashni
// bilmasdi va buyurtma tashlab ketilardi. Endi taom nomi va nima qilish
// kerakligi aytiladi. Bu FAQAT mijoz yo'li: afitsiant/admin yo'lidagi
// `inventory.consume()` xabari o'zgarmagan (u yerda xodim ichki tilni tushunadi).
// ---------------------------------------------------------------------------
function stockUnitLabel(unit) {
  return !unit || unit === 'dona' ? 'ta' : unit;
}

function outOfStockMessage(name, available, unit) {
  if (Number(available) > 0) {
    return `«${name}» tugab qoldi (omborda ${available} ${stockUnitLabel(unit)}). ` +
      "Miqdorini kamaytiring yoki savatdan olib tashlang.";
  }
  return `«${name}» tugab qoldi. Uni savatdan olib tashlang.`;
}

// Savatdagi band menyudan topilmasa — sababini taom nomi bilan aytamiz.
// "mavjud emas" iborasi ATAYLAB saqlangan (mavjud testlar va frontend shu
// ma'noga tayanadi).
function unavailableItemMessage(menuItemId) {
  const row = db.prepare('SELECT name, is_active FROM menu_items WHERE id = ?').get(menuItemId);
  if (!row) return 'Menyudagi bir band endi mavjud emas, sahifani yangilang';
  if (!row.is_active) {
    return `«${row.name}» endi menyuda mavjud emas. Uni savatdan olib tashlang.`;
  }
  return `«${row.name}» hozir mavjud emas (tugab qoldi). Uni savatdan olib tashlang.`;
}

function createFromPublic(payload) {
  const { full_name, phone, fulfillment, address, note, items, location_lat, location_lng } = payload || {};

  const name = String(full_name || '').trim();
  const phoneNum = String(phone || '').trim();
  const fulfillmentType = fulfillment === 'delivery' ? 'delivery' : 'pickup';
  const addressText = String(address || '').trim();
  const noteText = String(note || '').trim();

  // Ixtiyoriy GPS lokatsiya (mijoz brauzer Geolocation API orqali ulashgan
  // bo'lsa) — mijozdan kelgan qiymatga ishonib emas, diapazon tekshiruvi bilan.
  // Noto'g'ri/noto'liq bo'lsa jimgina e'tiborsiz qoldiramiz (butun buyurtmani
  // rad etishga arzimaydi, manzil matni asosiy manba).
  const lat = Number(location_lat);
  const lng = Number(location_lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  // 2026-09-10: `note`/`address`/`phone` uchun UZUNLIK CHEGARASI qo'shildi.
  // Ilgari faqat `full_name` (120) cheklangan edi. Bu ochiq (login shart
  // emas) endpoint: bitta IP daqiqasiga 15 ta so'rov yubora oladi
  // (publicOrderLimiter; 2026-09-10 L-16 gacha umumiy 5 ta edi) va har
  // birida ~1 MB `note` bo'lsa — kuniga ~20 GB
  // SQLite o'sishi. Admin "Buyurtmalar" sahifasida pagination yo'q, ya'ni
  // u bu yozuvlarni butunlay yuklab brauzerni ham o'ldirardi.
  if (!name) throw new CustomerOrderError('Ismingizni kiriting');
  if (name.length > 120) throw new CustomerOrderError('Ism juda uzun');
  if (!phoneNum || phoneNum.replace(/\D/g, '').length < 7) {
    throw new CustomerOrderError("Telefon raqamini to'g'ri kiriting");
  }
  if (phoneNum.length > 30) throw new CustomerOrderError('Telefon raqami juda uzun');
  if (addressText.length > 500) throw new CustomerOrderError('Manzil juda uzun');
  if (noteText.length > 1000) throw new CustomerOrderError('Izoh juda uzun');

  // Yetkazib berish shartlari (2026-09-11) — admin "Sozlamalar"dagi qiymatlar
  // endi SERVERDA ham kuchga ega. NEGA: ilgari ular faqat landing
  // brauzerida tekshirilardi — admin yetkazib berishni o'chirsa ham, sahifani
  // oldinroq ochib qo'ygan mijoz (yoki to'g'ridan-to'g'ri API) yetkazib
  // berish buyurtmasini yuborib qo'ya olardi; minimal summa ham shunday.
  const deliverySettings = settings.getPublicSettings();
  if (fulfillmentType === 'delivery' && !deliverySettings.delivery_enabled) {
    throw new CustomerOrderError("Hozir yetkazib berish xizmati ishlamayapti. «Olib ketish»ni tanlang.");
  }
  if (fulfillmentType === 'delivery' && !addressText) {
    throw new CustomerOrderError('Yetkazish manzilini kiriting');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new CustomerOrderError("Savat bo'sh");
  }
  if (items.length > 50) throw new CustomerOrderError("Savatda juda ko'p band bor");

  // Har bir band uchun narxni serverda (client'ga ishonmasdan) qayta hisoblaymiz.
  const resolved = [];
  for (const raw of items) {
    const menuItemId = Number(raw?.menu_item_id);
    const quantity = Number(raw?.quantity);
    if (!Number.isFinite(menuItemId)) throw new CustomerOrderError("Savat bandi noto'g'ri");
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity) || quantity > 50) {
      throw new CustomerOrderError("Miqdorni to'g'ri kiriting");
    }
    const item = getActiveMenuItem(menuItemId);
    if (!item) throw new CustomerOrderError(unavailableItemMessage(menuItemId));
    resolved.push({ item, quantity });
  }

  const totalAmount = resolved.reduce((sum, r) => sum + r.item.price * r.quantity, 0);
  const minOrder = deliverySettings.delivery_min_order;
  if (fulfillmentType === 'delivery' && minOrder > 0 && totalAmount < minOrder) {
    throw new CustomerOrderError(
      `Yetkazib berish uchun minimal buyurtma — ${fmtSomPlain(minOrder)}. ` +
      `Yana ${fmtSomPlain(minOrder - totalAmount)}lik taom qo'shing yoki «Olib ketish»ni tanlang.`
    );
  }
  // Yetkazish narxi buyurtma PAYTIDAGI qiymat bilan saqlanadi (schema.sql
  // izohi): admin keyin narxni o'zgartirsa ham, mijozga aytilgan summa
  // kuryer va chekda o'zgarmaydi. `total_amount`ga qo'shilmaydi — tushum
  // hisobotida faqat taomlar.
  const deliveryFee = fulfillmentType === 'delivery' ? deliverySettings.delivery_fee : 0;
  const ts = nowIso();

  const run = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO customer_orders (full_name, phone, fulfillment, address, location_lat, location_lng, note, total_amount, delivery_fee, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
      )
      .run(name, phoneNum, fulfillmentType, addressText || null, hasLocation ? lat : null, hasLocation ? lng : null, noteText || null, totalAmount, deliveryFee, ts);

    // cost_price_snapshot — sotilgan paytdagi tan narx (2026-09-10, sabab
    // server/schema.sql'dagi izohda: hisobot o'tmishga qarab o'zgarmasligi uchun).
    const insertItem = db.prepare(
      `INSERT INTO customer_order_items (customer_order_id, menu_item_id, name_snapshot, unit_price, cost_price_snapshot, quantity, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of resolved) {
      const itemInfo = insertItem.run(
        info.lastInsertRowid, r.item.id, r.item.name, r.item.price, r.item.cost_price,
        r.quantity, r.item.price * r.quantity
      );
      // Ichimlik (yoki boshqa) taom omborga bog'langan bo'lsa — shu miqdorni
      // ombordan ayiramiz. Yetarli qoldiq bo'lmasa inventory.consume() xato
      // otadi, butun buyurtma (customer_orders yozuvi bilan birga) bekor bo'ladi.
      if (r.item.inventory_item_id) {
        inventory.consume(r.item.inventory_item_id, r.quantity, {
          customerOrderItemId: itemInfo.lastInsertRowid,
          productName: r.item.name,
        });
      }
    }
    // Yetkazib berish buyurtmasi kelganda admin+oshpaz+dastavkachi ekranlariga
    // baravar ko'rinadigan bildirishnoma (server/routes/deliveryAlerts.js
    // o'qiydi) — olib ketish (pickup) uchun yozilmaydi, faqat delivery.
    if (fulfillmentType === 'delivery') {
      db.prepare(
        `INSERT INTO notifications (message, is_read, customer_order_id, created_at)
         VALUES (?, 0, ?, ?)`
      ).run(`🚚 Yangi yetkazib berish buyurtmasi: ${name} — ${fmtSomPlain(totalAmount)}`, info.lastInsertRowid, ts);
    }

    return info.lastInsertRowid;
  });

  let id;
  try {
    id = run();
  } catch (err) {
    // Tranzaksiya allaqachon to'liq qaytarilgan — faqat xabarni mijoz
    // tiliga o'giramiz (L-13, yuqoridagi izohga qarang).
    if (err instanceof inventory.InventoryError && err.code === 'insufficient_stock') {
      throw new CustomerOrderError(outOfStockMessage(err.productName, err.available, err.unit));
    }
    throw err;
  }
  return { ok: true, id, total_amount: totalAmount, delivery_fee: deliveryFee };
}

module.exports = {
  CustomerOrderError,
  STATUSES,
  getOrder,
  listOrders,
  getOrderWithItems,
  countByStatus,
  transition,
  deleteOrder,
  createFromPublic,
};
