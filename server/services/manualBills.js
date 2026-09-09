// Kassir "Hisoblash" (qo'lda chek) xizmat qatlami — 2026-09-09'da qo'shildi.
// server/services/orders.js'ga o'xshab db.transaction() bilan atomik ishlaydi,
// lekin stol/menyuga hech qanday bog'liqligi yo'q: kassir har bir qatorga
// erkin nom + narx + miqdor kiritadi, server faqat qiymatlarni tekshiradi va
// subtotal/jamini o'zi hisoblaydi (mijoz tomonidan yuborilgan jamiga ishonilmaydi).
const { db, nowIso } = require('../db');

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
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new ManualBillError(`"${name}" uchun narx noto'g'ri`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
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

module.exports = { ManualBillError, createManualBill, getManualBillReceipt };
