const express = require('express');
const { db, nowIso } = require('../db');
const { hashPassword } = require('../passwords');
const { asyncRoute } = require('../routeUtils');
const { ROLE_NAMES } = require('../roles');

const router = express.Router();

const PUBLIC_FIELDS = 'id, username, role, full_name, is_active, created_at';

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


router.get('/', asyncRoute((req, res) => {
  const rows = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users ORDER BY role, username`).all();
  const withActivity = rows.map((u) => ({ ...u, has_activity: userHasActivity(u.id) }));
  res.json(withActivity);
}));

router.post('/', asyncRoute((req, res) => {
  const { username, password, role, full_name } = req.body || {};
  if (!username || !String(username).trim()) return res.status(400).json({ error: 'Login kiritilishi shart' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Parol kamida 6 belgi bo\'lishi kerak' });
  if (!ROLE_NAMES.includes(role)) return res.status(400).json({ error: "Rol noto'g'ri" });
  const uname = String(username).trim();
  const dup = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (dup) return res.status(400).json({ error: 'Bu login band' });
  const { salt, hash } = hashPassword(password);
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, password_salt, role, full_name, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(uname, hash, salt, role, full_name ? String(full_name).trim() : null, nowIso());
  res.json(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(info.lastInsertRowid));
}));

router.put('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const fullName = req.body?.full_name !== undefined ? String(req.body.full_name).trim() : existing.full_name;
  const role = req.body?.role !== undefined ? req.body.role : existing.role;
  const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;
  if (!ROLE_NAMES.includes(role)) return res.status(400).json({ error: "Rol noto'g'ri" });

  // 2026-09-10: oxirgi faol adminni yo'qotishdan himoya. Ilgari admin o'z
  // rolini 'waiter'ga o'zgartira olardi yoki o'zini bloklay olardi — bundan
  // keyin admin paneliga KIRISHNING YO'LI QOLMASDI (DELETE'da "o'zingizni
  // o'chira olmaysiz" tekshiruvi bor edi, PUT'da esa yo'q edi).
  const losesAdmin = existing.role === 'admin' && existing.is_active === 1 && (role !== 'admin' || !isActive);
  if (losesAdmin && countOtherActiveAdmins(existing.id) === 0) {
    return res.status(400).json({
      error: "Bu tizimdagi yagona faol admin — rolini o'zgartirib yoki bloklab bo'lmaydi. Avval boshqa admin qo'shing",
    });
  }

  // Hisob bloklanganda sessiyani ham darhol bekor qilamiz. `requireAuth()`
  // allaqachon `is_active = 1` ni tekshiradi, lekin hisob keyinroq qayta
  // faollashtirilsa ESKI cookie yana ishlab ketardi — session_version'ni
  // oshirish buni yopadi.
  const bumpSession = existing.is_active === 1 && isActive === 0;
  db.prepare(
    `UPDATE users SET full_name = ?, role = ?, is_active = ?,
       session_version = session_version + ? WHERE id = ?`
  ).run(fullName, role, isActive, bumpSession ? 1 : 0, req.params.id);

  res.json(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(req.params.id));
}));

router.post('/:id/reset-password', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  const { password } = req.body || {};
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Parol kamida 6 belgi bo\'lishi kerak' });
  const { salt, hash } = hashPassword(password);
  // 2026-09-10: `session_version + 1` — parol tiklanganda shu foydalanuvchining
  // BARCHA eski sessiyalari darhol tugaydi. Ilgari eski cookie parol
  // almashtirilgandan keyin ham ishlayverardi, ya'ni "parolini o'zgartirdim"
  // xavfsizlik chorasi amalda hech narsa bermasdi (server/auth.js'ga qarang).
  db.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ?, session_version = session_version + 1 WHERE id = ?'
  ).run(hash, salt, req.params.id);
  res.json({ ok: true });
}));

router.delete('/:id', asyncRoute((req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  if (Number(req.params.id) === Number(req.user.id)) {
    return res.status(400).json({ error: "O'zingizni o'chira olmaysiz" });
  }
  // Agar xodimning buyurtma/chek tarixi bo'lsa, haqiqiy o'chirish FK'ni
  // buzadi va tarixni buzadi — shunday hollarda faqat faolsizlantiriladi
  // (is_active=0). Tarixi yo'q bo'lsa (masalan yangi/hech ishlatilmagan
  // xodim) qator butunlay o'chiriladi.
  // 2026-09-10: PUT'dagi bilan bir xil himoya — oxirgi faol admin o'chirilsa
  // tizimga kirish imkoni qolmaydi. (Yuqoridagi "o'zingizni o'chira
  // olmaysiz" tekshiruvi buni qoplamaydi: ikkinchi admin birinchisini
  // o'chirib, keyin o'z rolini o'zgartirishi mumkin edi.)
  if (existing.role === 'admin' && existing.is_active === 1 && countOtherActiveAdmins(existing.id) === 0) {
    return res.status(400).json({
      error: "Bu tizimdagi yagona faol admin — o'chirib bo'lmaydi. Avval boshqa admin qo'shing",
    });
  }
  if (userHasActivity(req.params.id)) {
    // session_version + 1 — bloklangan xodimning ochiq sessiyasi darhol tugaydi.
    db.prepare('UPDATE users SET is_active = 0, session_version = session_version + 1 WHERE id = ?').run(req.params.id);
    return res.json({ ok: true, hardDeleted: false });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true, hardDeleted: true });
}));

module.exports = router;
