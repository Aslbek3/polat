// Xodimlar (`users`) bilan ishlashning yagona joyi — 2026-09-10 arxitektura
// refaktori.
//
// NEGA BU FAYL BOR: loyiha qoidasi bo'yicha route fayllari bazaga bevosita
// murojaat qilmaydi — barcha SQL `server/services/` da to'planadi
// (services/orders.js, services/customerOrders.js kabi).
// `routes/adminUsers.js` bu qoidani buzardi va uning ichida shunchaki
// "CRUD" emas, TIZIMNI HIMOYA QILADIGAN qoidalar yotardi:
//   - oxirgi faol adminni yo'qotmaslik (`countOtherActiveAdmins`),
//   - tarixi bor xodimni haqiqiy o'chirmaslik (`userHasActivity`),
//   - bloklash/parol tiklashda `session_version` ni oshirib eski
//     sessiyalarni darhol tugatish.
// Bu qoidalar HTTP qatlamida emas, shu yerda turishi kerak — kelajakda
// boshqa joydan (masalan skript yoki yangi endpoint) foydalanuvchi
// o'chirilsa, himoya birga ketadi.
const { db, nowIso } = require('../db');
const { hashPassword } = require('../passwords');
const { ROLE_NAMES } = require('../roles');

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Tashqariga chiqadigan maydonlar — parol xeshi/tuzi HECH QACHON
// qaytarilmaydi.
const PUBLIC_FIELDS = 'id, username, role, full_name, is_active, created_at';

const MIN_PASSWORD_LENGTH = 6;

function publicUser(id) {
  return db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id);
}

function findUser(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) throw new UserError('Foydalanuvchi topilmadi', 404);
  return row;
}

// Xodim biror jadvalda FK orqali izi bormi — bo'lsa haqiqiy o'chirish
// (FK buziladi/tarix yo'qoladi) xavfli, shuning uchun shunday hollarda
// faqat is_active=0 (soft-delete) qilinadi.
//
// 2026-09-10: ro'yxatga `manual_bills` va `inventory_movements` QO'SHILDI.
// Ular yetishmayotgan edi, natijada kassir (qo'lda chek chiqargan) yoki
// ombor tuzatishi qilgan xodimni o'chirishga urinilganda
// SQLITE_CONSTRAINT_FOREIGNKEY otar va foydalanuvchi sababi tushunarsiz
// "Server xatosi" ko'rardi. `manual_bills.created_by` NOT NULL bo'lgani
// uchun bu ayniqsa xavfli edi.
function userHasActivity(id) {
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE opened_by = ? OR closed_by = ?) +
         (SELECT COUNT(*) FROM order_items WHERE added_by = ?) +
         (SELECT COUNT(*) FROM expenses WHERE created_by = ?) +
         (SELECT COUNT(*) FROM manual_bills WHERE created_by = ?) +
         (SELECT COUNT(*) FROM inventory_movements WHERE created_by = ?) AS cnt`
    )
    .get(id, id, id, id, id, id);
  return row.cnt > 0;
}

// Berilgan foydalanuvchidan BOSHQA nechta faol admin bor (2026-09-10).
// 0 bo'lsa — bu oxirgi admin, uni bloklash/rolini o'zgartirish/o'chirish
// tizimga kirish imkonini butunlay yo'q qiladi.
function countOtherActiveAdmins(id) {
  return db
    .prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?")
    .get(id).cnt;
}

function assertRole(role) {
  if (!ROLE_NAMES.includes(role)) throw new UserError("Rol noto'g'ri");
}

function assertPassword(password) {
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    throw new UserError("Parol kamida 6 belgi bo'lishi kerak");
  }
}

// Ro'yxat: har bir xodim yonida `has_activity` — admin ekranida
// "o'chirilsa faqat bloklanadi" degan ogohlantirishni oldindan ko'rsatish
// uchun.
function listUsers() {
  const rows = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users ORDER BY role, username`).all();
  return rows.map((u) => ({ ...u, has_activity: userHasActivity(u.id) }));
}

function createUser(body) {
  const { username, password, role, full_name: fullName } = body || {};
  if (!username || !String(username).trim()) throw new UserError('Login kiritilishi shart');
  assertPassword(password);
  assertRole(role);
  const uname = String(username).trim();
  // X-10 (2026-09-10): bandlik tekshiruvi katta-kichik harfga BEFARQ.
  // NEGA: login endi `COLLATE NOCASE` bilan qidiriladi (server/auth.js
  // loginRoute). "Ali" bor bo'lsa-yu "ali" ham yaratilsa, ikkalasi bitta
  // kirish so'roviga mos kelib qolardi va ikkinchisi amalda kira olmasdi.
  // Shu sabab bunday juftlik umuman yaratilmaydi. (`schema.sql` dagi
  // `UNIQUE` cheklovi harfga sezgir — asosiy himoya shu yerda.)
  // Bloklangan (is_active = 0) hisob ham loginni band qiladi — u qayta
  // faollashtirilishi mumkin.
  const dup = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(uname);
  if (dup) throw new UserError('Bu login band');
  const { salt, hash } = hashPassword(password);
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, password_salt, role, full_name, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(uname, hash, salt, role, fullName ? String(fullName).trim() : null, nowIso());
  return publicUser(info.lastInsertRowid);
}

function updateUser(id, body) {
  const existing = findUser(id);
  const fullName = body?.full_name !== undefined ? String(body.full_name).trim() : existing.full_name;
  const role = body?.role !== undefined ? body.role : existing.role;
  const isActive = body?.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active;
  assertRole(role);

  // 2026-09-10: oxirgi faol adminni yo'qotishdan himoya. Ilgari admin o'z
  // rolini 'waiter'ga o'zgartira olardi yoki o'zini bloklay olardi — bundan
  // keyin admin paneliga KIRISHNING YO'LI QOLMASDI (o'chirishda "o'zingizni
  // o'chira olmaysiz" tekshiruvi bor edi, yangilashda esa yo'q edi).
  const losesAdmin = existing.role === 'admin' && existing.is_active === 1 && (role !== 'admin' || !isActive);
  if (losesAdmin && countOtherActiveAdmins(existing.id) === 0) {
    throw new UserError(
      "Bu tizimdagi yagona faol admin — rolini o'zgartirib yoki bloklab bo'lmaydi. Avval boshqa admin qo'shing"
    );
  }

  // Hisob bloklanganda sessiyani ham darhol bekor qilamiz. `requireAuth()`
  // allaqachon `is_active = 1` ni tekshiradi, lekin hisob keyinroq qayta
  // faollashtirilsa ESKI cookie yana ishlab ketardi — session_version'ni
  // oshirish buni yopadi.
  const bumpSession = existing.is_active === 1 && isActive === 0;
  db.prepare(
    `UPDATE users SET full_name = ?, role = ?, is_active = ?,
       session_version = session_version + ? WHERE id = ?`
  ).run(fullName, role, isActive, bumpSession ? 1 : 0, id);

  return publicUser(id);
}

function resetPassword(id, password) {
  findUser(id);
  assertPassword(password);
  const { salt, hash } = hashPassword(password);
  // 2026-09-10: `session_version + 1` — parol tiklanganda shu foydalanuvchining
  // BARCHA eski sessiyalari darhol tugaydi. Ilgari eski cookie parol
  // almashtirilgandan keyin ham ishlayverardi, ya'ni "parolini o'zgartirdim"
  // xavfsizlik chorasi amalda hech narsa bermasdi (server/auth.js'ga qarang).
  db.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ?, session_version = session_version + 1 WHERE id = ?'
  ).run(hash, salt, id);
  return { ok: true };
}

// `actorId` — amalni bajarayotgan xodimning id'si (HTTP qatlamidagi
// `req.user.id`). Servisga parametr sifatida uzatiladi, chunki "o'zini
// o'chirish" taqiqi bu yerdagi qolgan himoyalar bilan BIR ZANJIR: tekshiruv
// tartibi buzilmasligi kerak.
function deleteUser(id, actorId) {
  const existing = findUser(id);
  if (Number(id) === Number(actorId)) {
    throw new UserError("O'zingizni o'chira olmaysiz");
  }
  // Agar xodimning buyurtma/chek tarixi bo'lsa, haqiqiy o'chirish FK'ni
  // buzadi va tarixni buzadi — shunday hollarda faqat faolsizlantiriladi
  // (is_active=0). Tarixi yo'q bo'lsa (masalan yangi/hech ishlatilmagan
  // xodim) qator butunlay o'chiriladi.
  // 2026-09-10: yangilashdagi bilan bir xil himoya — oxirgi faol admin
  // o'chirilsa tizimga kirish imkoni qolmaydi. (Yuqoridagi "o'zingizni
  // o'chira olmaysiz" tekshiruvi buni qoplamaydi: ikkinchi admin
  // birinchisini o'chirib, keyin o'z rolini o'zgartirishi mumkin edi.)
  if (existing.role === 'admin' && existing.is_active === 1 && countOtherActiveAdmins(existing.id) === 0) {
    throw new UserError("Bu tizimdagi yagona faol admin — o'chirib bo'lmaydi. Avval boshqa admin qo'shing");
  }
  if (userHasActivity(id)) {
    // session_version + 1 — bloklangan xodimning ochiq sessiyasi darhol tugaydi.
    db.prepare('UPDATE users SET is_active = 0, session_version = session_version + 1 WHERE id = ?').run(id);
    return { ok: true, hardDeleted: false };
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return { ok: true, hardDeleted: true };
}

module.exports = {
  UserError,
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  deleteUser,
  userHasActivity,
  countOtherActiveAdmins,
};
