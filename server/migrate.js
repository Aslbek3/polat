// CLI: node server/migrate.js — sxemani (qayta) qo'llaydi, boshlang'ich admin
// hisobini va standart sozlamalarni urug'laydi. server/db.js allaqachon serverni
// ko'tarishda avtomatik chaqiradi; bu skript qo'lda, deploy oldidan alohida
// tekshirish uchun ishlatiladi.
require('dotenv').config({ override: true });

const { db, ensureSchema, nowIso } = require('./db');
const { hashPassword } = require('./passwords');

ensureSchema();

const defaultSettings = {
  restaurant_name: "Po'lat",
  restaurant_phone: '',
  restaurant_address: '',
};

const upsertSetting = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`
);

const seed = db.transaction(() => {
  for (const [key, value] of Object.entries(defaultSettings)) {
    upsertSetting.run(key, value);
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (!existing) {
    // 2026-09-10: ilgari bu yerda `|| 'change-me'` turardi — ya'ni
    // ADMIN_PASSWORD ni qo'yishni unutish JIMGINA hammaga ma'lum parolli
    // admin hisobi yaratardi. Internetga ochiq serverda bu hisobni egallab
    // olish uchun yetarli edi. Endi parol berilmasa migratsiya to'xtaydi.
    if (!adminPassword || String(adminPassword).length < 8) {
      throw new Error(
        "ADMIN_PASSWORD .env da qo'yilishi SHART (kamida 8 belgi) — boshlang'ich " +
        "admin hisobi shu parol bilan yaratiladi.\n" +
        "Kuchli parol yaratish uchun:\n" +
        "    node -e \"console.log(require('crypto').randomBytes(12).toString('base64url'))\""
      );
    }
    const { salt, hash } = hashPassword(adminPassword);
    db.prepare(
      `INSERT INTO users (username, password_hash, password_salt, role, full_name, is_active, created_at)
       VALUES (?, ?, ?, 'admin', 'Administrator', 1, ?)`
    ).run(adminUsername, hash, salt, nowIso());
    console.log(`Admin hisobi yaratildi: ${adminUsername}`);
  }
});
seed();

console.log(`Migratsiya bajarildi: ${new Date().toISOString()}`);
console.log(
  'Jadvallar:',
  db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name).join(', ')
);
