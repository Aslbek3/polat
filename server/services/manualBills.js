// Kassir "Hisoblash" (qo'lda chek) xizmat qatlami — 2026-09-09'da qo'shildi.
// server/services/orders.js'ga o'xshab db.transaction() bilan atomik ishlaydi,
// lekin stol/menyuga hech qanday bog'liqligi yo'q: kassir har bir qatorga
// erkin nom + narx + miqdor kiritadi, server faqat qiymatlarni tekshiradi va
// subtotal/jamini o'zi hisoblaydi (mijoz tomonidan yuborilgan jamiga ishonilmaydi).
const { db, nowIso } = require('../db');
const { MAX_AMOUNT, MAX_QUANTITY } = require('../validation');
const reports = require('./reports');

class ManualBillError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function validateItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ManualBillError('Kamida bitta taom qatori kiriting');
  }
  if (rawItems.length > 100) {
    throw new ManualBillError("Bitta chekda ko'pi bilan 100 qator bo'lishi mumkin");
  }
  return rawItems.map((raw) => {
    const name = String((raw && raw.name) || '').trim();
    const unitPrice = Number(raw && raw.unit_price);
    const quantity = Number(raw && raw.quantity);
    if (!name) throw new ManualBillError("Taom nomi kiritilmagan qator bor");
    if (name.length > 200) throw new ManualBillError(`"${name.slice(0, 30)}..." nomi juda uzun`);

    // 2026-09-10: ilgari narx uchun faqat `Number.isFinite(x) && x > 0`
    // tekshirilardi — na yuqori chegara, na butun son talabi bor edi:
    //   {"unit_price": 1e308, "quantity": 2}  ->  subtotal = Infinity
    // SQLite uni saqlaydi, SUM() ham Infinity qaytaradi, JSON.stringify
    // esa `null` — ya'ni /api/admin/reports/summary DOIMO
    // `revenue: null` qaytarardi va manual_bills'ni o'chirish endpointi
    // ham yo'q. Kasr narx esa (0.5) "1.5 so'm"lik chek chiqarardi.
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > MAX_AMOUNT) {
      throw new ManualBillError(`"${name}" uchun narx noto'g'ri`);
    }
    // Butunlik alohida — bu yerda qiymat allaqachon haqiqiy musbat son,
    // shuning uchun foydalanuvchiga aniq sababni aytamiz (0.5 kabi kasr
    // narx "1.5 so'm"lik chek chiqarardi).
    if (!Number.isInteger(unitPrice)) {
      throw new ManualBillError(`"${name}" uchun narx butun son bo'lishi kerak (tiyin yo'q)`);
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
      throw new ManualBillError(`"${name}" uchun miqdor noto'g'ri`);
    }
    return { name, unit_price: unitPrice, quantity, subtotal: unitPrice * quantity };
  });
}

function createManualBill(rawItems, userId) {
  const items = validateItems(rawItems);
  const total = items.reduce((sum, it) => sum + it.subtotal, 0);

  const run = db.transaction(() => {
    const ts = nowIso();
    const info = db
      .prepare('INSERT INTO manual_bills (created_by, total_amount, created_at) VALUES (?, ?, ?)')
      .run(userId, total, ts);
    const billId = info.lastInsertRowid;
    const insertItem = db.prepare(
      `INSERT INTO manual_bill_items (manual_bill_id, name, unit_price, quantity, subtotal)
       VALUES (?, ?, ?, ?, ?)`
    );
    items.forEach((it) => insertItem.run(billId, it.name, it.unit_price, it.quantity, it.subtotal));
    return billId;
  });

  return getManualBillReceipt(run());
}

// public/app.js'dagi receipt modal (renderReceiptBox/buildEscPosReceipt)
// `view.kind` bo'yicha ajratadi — 'manual' shu yerda, 'customer' esa
// customer_orders uchun (app.js'da mavjud) ishlatiladi.
function getManualBillReceipt(billId) {
  const bill = db
    .prepare(
      `SELECT mb.*, COALESCE(u.full_name, u.username) AS created_by_name
       FROM manual_bills mb JOIN users u ON u.id = mb.created_by WHERE mb.id = ?`
    )
    .get(billId);
  if (!bill) throw new ManualBillError('Hisob topilmadi', 404);
  const items = db
    .prepare('SELECT * FROM manual_bill_items WHERE manual_bill_id = ? ORDER BY id ASC')
    .all(billId);
  return {
    kind: 'manual',
    order: {
      heading: "Qo'lda hisoblash",
      created_at: bill.created_at,
      created_by_name: bill.created_by_name,
    },
    items: items.map((it) => ({
      name_snapshot: it.name,
      unit_price: it.unit_price,
      quantity: it.quantity,
      subtotal: it.subtotal,
    })),
    total: bill.total_amount,
  };
}

// Kassirning "Statistika" ekrani uchun: ikkala yopilgan-hisob manbasi
// (dine-in `orders`, stol hisob-kitobi — afitsiant HAM yopgan bo'lishi
// mumkin — va `manual_bills`, qo'lda chek) birlashtirilib, vaqt bo'yicha
// kamayish tartibida qaytariladi. Har biri o'z cheki uchun (kind='table' ->
// GET /kassir/orders/:id/receipt, kind='manual' ->
// GET /kassir/manual-bills/:id/receipt) qayta ochilishi mumkin.
//
// 2026-09-10: `routes/kassirBilling.js` dan ko'chirildi (route bazaga bevosita
// murojaat qilardi). Shu bilan birga sana filtri `reports.appendDateFilter`
// orqali o'tadi — ilgari `date(o.closed_at)` UTC kunini olardi, ya'ni
// Toshkentda 00:00–05:00 oralig'idagi hisoblar kassir statistikasida OLDINGI
// kunga tushardi va admin hisobotidan farq qilardi (server/businessTime.js).
const BILLS_LIMIT = 300;

function listBills(query = {}) {
  const range = reports.dateRange(query);

  const tableParams = [];
  const tableSql = reports.appendDateFilter(`
    SELECT o.id AS id, 'table' AS kind, t.name AS label, o.total_amount AS total_amount,
           o.closed_at AS at, COALESCE(cu.full_name, cu.username) AS by_name
    FROM orders o
    JOIN tables t ON t.id = o.table_id
    LEFT JOIN users cu ON cu.id = o.closed_by
    WHERE o.status = 'closed'
  `, tableParams, 'o.closed_at', range);

  const manualParams = [];
  const manualSql = reports.appendDateFilter(`
    SELECT mb.id AS id, 'manual' AS kind, 'Qo''lda hisoblash' AS label, mb.total_amount AS total_amount,
           mb.created_at AS at, COALESCE(u.full_name, u.username) AS by_name
    FROM manual_bills mb
    JOIN users u ON u.id = mb.created_by
    WHERE 1=1
  `, manualParams, 'mb.created_at', range);

  // NEGA (2026-09-10): ilgari ikkala manba JS'da birlashtirilib `slice(0, 300)`
  // bilan qisqartirilar, jami summa va son esa SHU QISQARTIRILGAN ro'yxatdan
  // hisoblanardi — oraliqda 300 dan ko'p hisob bo'lsa "Jami summa" jimgina KAM
  // ko'rsatardi. Endi bitta UNION ALL so'rovi ikki marta ishlatiladi: biri —
  // ko'rsatiladigan ro'yxat (eng yangi 300 tasi), ikkinchisi — oraliqdagi
  // BARCHA hisoblar bo'yicha SUM/COUNT.
  const unionSql = `${tableSql} UNION ALL ${manualSql}`;
  const unionParams = [...tableParams, ...manualParams];

  const bills = db
    .prepare(`SELECT * FROM (${unionSql}) b ORDER BY b.at DESC LIMIT ${BILLS_LIMIT}`)
    .all(...unionParams);
  const totals = db
    .prepare(`SELECT COALESCE(SUM(b.total_amount), 0) AS total_amount, COUNT(*) AS cnt FROM (${unionSql}) b`)
    .get(...unionParams);

  return { bills, total_amount: totals.total_amount, count: totals.cnt };
}

module.exports = { ManualBillError, createManualBill, getManualBillReceipt, listBills };
