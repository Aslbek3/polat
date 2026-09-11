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
// KEYINGI O'ZGARISH (2026-09-10, UI/UX tahlili A-06): ro'yxat TARTIBI
// o'zgardi va ixtiyoriy filtrlar qo'shildi — list() izohiga qarang.

const { db } = require('../db');
const { localDateStr } = require('./reports');

class ReservationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const STATUSES = ['new', 'confirmed', 'cancelled'];
const SCOPES = ['upcoming', 'past', 'all'];

function getReservation(id) {
  const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  if (!row) throw new ReservationError('Bron topilmadi', 404);
  return row;
}

// Bronlar ro'yxati — 2026-09-10 (A-06).
//
// NEGA TARTIB O'ZGARDI: ilgari `ORDER BY res_date DESC` edi — keyingi oyning
// broni bugungisidan YUQORIDA turardi, bugun kechqurun keladigan mehmon esa
// ro'yxat o'rtasida ko'milib qolardi. Admin ro'yxatni "bugun kim keladi?"
// degan savol bilan ochadi. Endi:
//   1) bugundan boshlab kelajakdagilar — O'SIB boruvchi (eng yaqini birinchi),
//   2) keyin o'tganlari — KAMAYIB boruvchi (eng yaqin o'tgani birinchi).
// "Bugun" — server lokal sanasi (reports.localDateStr, dashboard bilan bir xil).
//
// Ixtiyoriy filtrlar: `status` (new|confirmed|cancelled), `scope`
// (upcoming|past|all). Standart `scope=all` ATAYLAB — mavjud frontend
// parametrsiz so'raydi va hamma bronni kutadi. Noma'lum qiymatlar e'tiborga
// olinmaydi (reports.js `status` filtri bilan bir xil yondashuv).
// `today` — faqat testlar uchun (sanani qotirish); odatda berilmaydi.
function list({ status, scope, today = localDateStr() } = {}) {
  const params = [];
  let sql = 'SELECT * FROM reservations WHERE 1=1';
  if (STATUSES.includes(status)) { sql += ' AND status = ?'; params.push(status); }
  const scopeVal = SCOPES.includes(scope) ? scope : 'all';
  if (scopeVal === 'upcoming') { sql += ' AND res_date >= ?'; params.push(today); }
  if (scopeVal === 'past') { sql += ' AND res_date < ?'; params.push(today); }
  sql += `
    ORDER BY (res_date < ?) ASC,
             CASE WHEN res_date >= ? THEN res_date || ' ' || res_time END ASC,
             CASE WHEN res_date < ? THEN res_date || ' ' || res_time END DESC,
             id ASC`;
  params.push(today, today, today);
  return db.prepare(sql).all(...params);
}

// Admin bosh sahifasi (dashboard) hisoblagichlari — A-03, A-05.
// A-05 (yangi bron kelganda hech kim bilmasdi) uchun bildirishnoma jadvali
// ATAYLAB ishlatilmadi: bosh sahifa `new_reservations`ni poll qiladi — bu
// yetarli va boshqa modulga (notifications) bog'liqlik qo'shmaydi.
//
// 2026-09-11: faqat BUGUNDAN boshlab (kelgusi) tasdiqlanmagan bronlar
// sanaladi. Ilgari o'tgan kungi, hech kim tasdiqlamagan bron ham "E'tibor
// talab qiladi"da ABADIY qolardi — endi hech narsa qilib bo'lmaydigan
// yozuv bosh sahifani doim "muammo bor" holatida ushlab turardi va
// "✅ Hammasi joyida" hech qachon chiqmasdi. `today` — faqat testlar uchun.
function countNew(today = localDateStr()) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM reservations WHERE status = 'new' AND res_date >= ?")
    .get(today).c;
}

function countForDate(date) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM reservations WHERE res_date = ? AND status != 'cancelled'")
    .get(date).c;
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

// Landing sahifadagi "Stol bron qilish" oynasidan keladigan bron (login shart
// emas). 2026-09-10: `routes/publicReservations.js` dan ko'chirildi — u
// bazaga BEVOSITA murojaat qilardi (ko'p qatorli `db\n.prepare(...)` shakli
// sabab oddiy `grep "db.prepare"` uni ko'rmagan edi). SOF refaktor:
// tekshiruvlar TARTIBI, xato matnlari va 400 kodi aynan avvalgidek.
function createFromPublic(payload) {
  const { full_name, phone, party_size, res_date, res_time, note } = payload || {};

  const name = String(full_name || '').trim();
  const phoneNum = String(phone || '').trim();
  const size = Number(party_size);
  const date = String(res_date || '').trim();
  const time = String(res_time || '').trim();
  const noteText = String(note || '').trim();

  if (!name) throw new ReservationError('Ismingizni kiriting');
  if (name.length > 120) throw new ReservationError('Ism juda uzun');
  if (!phoneNum || phoneNum.replace(/\D/g, '').length < 7) {
    throw new ReservationError("Telefon raqamini to'g'ri kiriting");
  }
  // Uzunlik chegaralari — ochiq endpoint, cheksiz matn = boshqarilmaydigan
  // baza o'sishi (customerOrders.createFromPublic dagi bilan bir xil sabab).
  if (phoneNum.length > 30) throw new ReservationError('Telefon raqami juda uzun');
  if (noteText.length > 1000) throw new ReservationError('Izoh juda uzun');
  if (!Number.isFinite(size) || size <= 0 || size > 50) {
    throw new ReservationError("Kishilar sonini to'g'ri kiriting");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ReservationError("Sanani to'g'ri tanlang");
  if (!/^\d{2}:\d{2}$/.test(time)) throw new ReservationError("Vaqtni to'g'ri tanlang");

  const info = db
    .prepare(
      `INSERT INTO reservations (full_name, phone, party_size, res_date, res_time, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`
    )
    .run(name, phoneNum, Math.round(size), date, time, noteText || null, new Date().toISOString());

  return { ok: true, id: info.lastInsertRowid };
}

module.exports = {
  ReservationError,
  STATUSES,
  SCOPES,
  list,
  countNew,
  countForDate,
  updateStatus,
  remove,
  createFromPublic,
};
