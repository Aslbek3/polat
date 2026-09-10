// Stollar (tables) — admin panelidagi CRUD mantig'i.
//
// NEGA BU FAYL BOR: `routes/adminTables.js` bazaga BEVOSITA `db.prepare()`
// bilan murojaat qilardi va shu bilan loyihaning "ma'lumot kirishi faqat
// `services/` ichida" qoidasini buzardi. Alohida servis, ayniqsa, o'chirish
// uchun kerak: stolni "o'chirish" aslida `is_active = 0` (soft-delete) va
// undan oldin "bu stolda ochiq buyurtma bormi?" tekshiruvi bo'lishi SHART —
// bu qoida buyurtma mantig'iga (`services/orders.js`) bog'liq va uni route
// ichida saqlash uni ko'zdan qochirishga olib keladi.
//
// Bu SOF refaktor (2026-09-10): status kodlari, xato xabarlari va JSON javob
// shakli avvalgidek — hech qanday xulq o'zgarmagan. Shu sababdan nom
// tekshiruvi ham aynan avvalgi ko'rinishida (`!name || !String(name).trim()`)
// qoldirildi: `validation.js` dagi `parseText()` uzunlik chegarasini ham
// qo'shgan bo'lardi, ya'ni yangi 400 holati paydo bo'lardi — bu esa refaktor
// emas, alohida o'zgarish bo'ladi.

const { db, nowIso } = require('../db');

class TableError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// DIQQAT: bu yerda `is_active` bo'yicha filtr ATAYLAB YO'Q (farqi bor —
// `services/orders.js` dagi getTable() faqat faol stolni oladi). Admin
// paneli o'chirilgan stolni ham tahrirlay/ko'ra olishi kerak.
function getTable(id) {
  const row = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
  if (!row) throw new TableError('Stol topilmadi', 404);
  return row;
}

function list() {
  return db.prepare('SELECT * FROM tables ORDER BY sort_order, id').all();
}

function create({ name, sort_order: sortOrder } = {}) {
  if (!name || !String(name).trim()) throw new TableError('Nom kiritilishi shart');
  const info = db
    .prepare('INSERT INTO tables (name, sort_order, is_active, created_at) VALUES (?, ?, 1, ?)')
    .run(String(name).trim(), Number(sortOrder) || 0, nowIso());
  return db.prepare('SELECT * FROM tables WHERE id = ?').get(info.lastInsertRowid);
}

// Qisman yangilash: yuborilmagan maydon eski qiymatida qoladi.
function update(id, body) {
  const existing = getTable(id);
  const name = body?.name !== undefined ? String(body.name).trim() : existing.name;
  const sortOrder = body?.sort_order !== undefined ? Number(body.sort_order) : existing.sort_order;
  db.prepare('UPDATE tables SET name = ?, sort_order = ? WHERE id = ?').run(name, sortOrder, id);
  return db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
}

// Stol hech qachon bazadan haqiqatda o'chirilmaydi — buyurtmalar tarixi unga
// FK bilan bog'langan. Ochiq (`open`) buyurtmasi bor stolni esa yashirib ham
// bo'lmaydi: aks holda hisob-kitob qilinmagan buyurtma kassir ekranidan
// g'oyib bo'lardi.
function deactivate(id) {
  getTable(id);
  const openOrder = db.prepare("SELECT id FROM orders WHERE table_id = ? AND status = 'open'").get(id);
  if (openOrder) throw new TableError('Bu stolda ochiq buyurtma bor, avval hisob-kitob qiling');
  db.prepare('UPDATE tables SET is_active = 0 WHERE id = ?').run(id);
  return { ok: true };
}

module.exports = {
  TableError,
  getTable,
  list,
  create,
  update,
  deactivate,
};
