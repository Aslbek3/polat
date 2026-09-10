// Bronlar (reservations) — admin panelidagi ko'rish/holat/o'chirish mantig'i.
//
// NEGA BU FAYL BOR: `routes/adminReservations.js` bazaga BEVOSITA
// `db.prepare()` bilan murojaat qilardi, ya'ni loyihaning "har qanday
// ma'lumot kirishi faqat `services/` ichida" qoidasi buzilgan edi. Bundan
// tashqari bron holatlarining ro'yxati (`new`/`confirmed`/`cancelled`)
// route ichida qo'lda yozilgan edi — endi u shu yerda, YAGONA joyda turadi
// (kelajakda bron mijoz tomonidan ham boshqariladigan bo'lsa, ro'yxat ikkinchi
// marta qayta yozilmasin).
//
// Bu SOF refaktor (2026-09-10): status kodlari, xato xabarlari va JSON javob
// shakli avvalgidek — hech qanday xulq o'zgarmagan.

const { db } = require('../db');

class ReservationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const STATUSES = ['new', 'confirmed', 'cancelled'];

function getReservation(id) {
  const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  if (!row) throw new ReservationError('Bron topilmadi', 404);
  return row;
}

function list() {
  return db
    .prepare('SELECT * FROM reservations ORDER BY res_date DESC, res_time DESC, id DESC')
    .all();
}

// TEKSHIRUV TARTIBI MUHIM: avval bron bor-yo'qligi (404), keyin holat
// to'g'riligi (400). Route'dagi hozirgi xulq aynan shunday edi — mavjud
// bo'lmagan ID ga noto'g'ri status yuborilsa 404 qaytadi, 400 emas.
function updateStatus(id, status) {
  getReservation(id);
  if (!STATUSES.includes(status)) {
    throw new ReservationError("Holatni to'g'ri tanlang");
  }
  db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, id);
  return getReservation(id);
}

function remove(id) {
  getReservation(id);
  db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
  return { ok: true };
}

module.exports = {
  ReservationError,
  STATUSES,
  list,
  updateStatus,
  remove,
};
