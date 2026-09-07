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
  const adminPassword = process.env.ADMIN_PASSWORD || 'change-me';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (!existing) {
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
