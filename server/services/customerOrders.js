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

const { db } = require('../db');
const inventory = require('./inventory');

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

module.exports = {
  CustomerOrderError,
  STATUSES,
  getOrder,
  transition,
  deleteOrder,
};
