// Xarajatlar (`expenses`) bilan ishlashning yagona joyi — 2026-09-10
// arxitektura refaktori.
//
// NEGA BU FAYL BOR: loyiha qoidasi bo'yicha route fayllari `db.prepare()` ni
// BEVOSITA chaqirmaydi — barcha ma'lumot kirishi `server/services/` da
// to'planadi (services/orders.js, services/customerOrders.js kabi).
// `routes/adminExpenses.js` bu qoidani buzardi: SQL ham, validatsiya ham,
// HTTP javobi ham bitta faylda aralashib yotardi. Endi route faqat HTTP
// qatlami (kirishni oladi -> shu yerdagi funksiyani chaqiradi -> res.json),
// xarajat qoidalari esa shu yerda.
//
// Sana/summa/matn tekshiruvlari `server/validation.js` dan olinadi —
// ayniqsa `parseDate` MUHIM: xarajat sanasi SATR sifatida solishtiriladi
// (`expense_date >= ?`), daromad esa `date()` bilan normallashtiriladi, ya'ni
// format buzilsa xarajat sanali filtrga tushmay qoladi va "Hisobot" sahifasi
// filtr bilan va filtrsiz TURLI sof foyda ko'rsatardi (validation.js izohiga
// qarang).
const { db, nowIso } = require('../db');
const { parseAmount, parseDate, parseText } = require('../validation');

class ExpenseError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Matn maydonlarining chegaralari bitta joyda — POST va PUT bir xil
// tekshiruvdan o'tishi uchun (2026-09-10 gacha PUT'da umuman tekshiruv
// yo'q edi).
const NOTE_RULES = { field: 'Izoh', max: 1000 };
const CATEGORY_RULES = { field: 'Turkum', max: 100 };

function findExpense(id) {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!row) throw new ExpenseError('Xarajat topilmadi', 404);
  return row;
}

// Ro'yxatning yuqori chegarasi (2026-09-10, A-12). NEGA: ilgari LIMIT yo'q
// edi — sahifa butun tarixni (yiliga ~1100 yozuv, bir necha yilda o'n
// minglab) har ochilganda yuklardi; better-sqlite3 sinxron bo'lgani uchun
// bu vaqtda butun server kutib turadi. 500 — bir oylik xarajatdan ancha
// ko'p, ya'ni oylik davr bilan ishlaganda hech narsa kesilmaydi.
const EXPENSES_LIMIT = 500;

// Xarajatlar ro'yxati, ixtiyoriy sana oralig'i bilan. Kim kiritgani
// (`created_by_name`) ham qo'shiladi — xodim o'chirilgan bo'lsa LEFT JOIN
// tufayli qator baribir qaytadi. `from`/`to` berilmasa — hammasi (eng
// yangi 500 tasi); standart davrni (joriy oy) frontend o'zi yuboradi.
//
// Qaytaradi: `{ expenses, total_count, total_amount }`. Oxirgi ikkitasi
// CHEKLOVSIZ (oraliqdagi BARCHA xarajatlar bo'yicha) — route ularni
// `X-Total-Count` / `X-Total-Amount` sarlavhalariga qo'yadi. NEGA jami
// alohida: frontend "Jami"ni ro'yxatdan yig'sa, 500 dan ko'p yozuvda summa
// JIMGINA kam chiqardi — kassir `/bills`da aynan shu xato bo'lgan edi
// (routes/kassirBilling.js izohiga qarang).
function listExpenses({ from, to } = {}) {
  let where = ' WHERE 1=1';
  const params = [];
  if (from) { where += ' AND e.expense_date >= ?'; params.push(from); }
  if (to) { where += ' AND e.expense_date <= ?'; params.push(to); }
  const expenses = db
    .prepare(
      `SELECT e.*, COALESCE(u.full_name, u.username) AS created_by_name
       FROM expenses e LEFT JOIN users u ON u.id = e.created_by${where}
       ORDER BY e.expense_date DESC, e.id DESC LIMIT ${EXPENSES_LIMIT}`
    )
    .all(...params);
  const totals = db
    .prepare(`SELECT COUNT(*) AS cnt, COALESCE(SUM(e.amount), 0) AS amount FROM expenses e${where}`)
    .get(...params);
  return { expenses, total_count: totals.cnt, total_amount: totals.amount };
}

// Yangi xarajat. Sana berilmasa — bugungi kun.
function createExpense(body, createdBy) {
  const { amount, expense_date: expenseDate, note, category } = body || {};
  const amountNum = parseAmount(amount, { field: 'Summa' });
  const date = expenseDate && String(expenseDate).trim()
    ? parseDate(expenseDate, { field: 'Sana' })
    : nowIso().slice(0, 10);
  const noteText = parseText(note, NOTE_RULES);
  const categoryText = parseText(category, CATEGORY_RULES);
  const info = db
    .prepare(
      `INSERT INTO expenses (amount, expense_date, note, category, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(amountNum, date, noteText, categoryText, createdBy, nowIso());
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
}

// Tahrirlash: faqat yuborilgan maydonlar o'zgaradi, qolgani eski qiymatida
// qoladi. Yuborilganlari POST bilan AYNAN bir xil tekshiruvdan o'tadi.
function updateExpense(id, body) {
  const existing = findExpense(id);
  const amount = body?.amount !== undefined ? parseAmount(body.amount, { field: 'Summa' }) : existing.amount;
  const date = body?.expense_date !== undefined
    ? parseDate(body.expense_date, { field: 'Sana' })
    : existing.expense_date;
  const note = body?.note !== undefined ? parseText(body.note, NOTE_RULES) : existing.note;
  const category = body?.category !== undefined ? parseText(body.category, CATEGORY_RULES) : existing.category;
  db.prepare('UPDATE expenses SET amount = ?, expense_date = ?, note = ?, category = ? WHERE id = ?').run(
    amount, date, note, category, id
  );
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
}

function deleteExpense(id) {
  findExpense(id);
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  return { ok: true };
}

module.exports = {
  ExpenseError,
  EXPENSES_LIMIT,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
};
