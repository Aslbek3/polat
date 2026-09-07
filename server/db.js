const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'polat.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}

// SQLite'da mavjud ustunning CHECK constraint'ini to'g'ridan-to'g'ri ALTER
// qilib bo'lmaydi — shu sabab 'chef' roli qo'shilganda (2026-08-26) eski
// bazalar uchun jadvalni SQLite'ning rasmiy tavsiya qilingan usulida qayta
// qurib ko'chirish kerak: yangi jadval yarat -> ma'lumotni ko'chir -> eskisini
// o'chir -> nomini almashtir. `users`ga FK bilan bog'langan boshqa jadvallar
// (orders/order_items/expenses) buzilmaydi, chunki oxirida jadval yana xuddi
// shu "users" nomi bilan qayta paydo bo'ladi. Idempotent: agar CHECK'da
// allaqachon 'chef' bo'lsa (yangi o'rnatilgan yoki avval migratsiya qilingan
// bo'lsa), hech narsa qilmaydi.
function migrateAddChefRole() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!row || row.sql.includes("'chef'")) return;

  console.log("Migratsiya: 'users' jadvaliga 'chef' roli qo'shilmoqda...");
  db.pragma('foreign_keys = OFF');
  try {
    const run = db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'waiter', 'chef')),
          full_name TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );
      `);
      db.exec(`
        INSERT INTO users_new (id, username, password_hash, password_salt, role, full_name, is_active, created_at)
        SELECT id, username, password_hash, password_salt, role, full_name, is_active, created_at FROM users;
      `);
      db.exec('DROP TABLE users;');
      db.exec('ALTER TABLE users_new RENAME TO users;');
    });
    run();
    const check = db.pragma('foreign_key_check');
    if (check.length > 0) {
      throw new Error('foreign_key_check muvaffaqiyatsiz: ' + JSON.stringify(check));
    }
    console.log("Migratsiya tugadi: 'chef' roli qo'shildi.");
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

// 'order_items'ga 'ready_at' ustuni (oshpaz "tayyor" belgisi) qo'shish — CHECK
// constraint emas, oddiy nullable ustun, shuning uchun 'chef' roli kabi
// jadvalni butunlay qayta qurish shart emas, oddiy ALTER ADD COLUMN yetarli.
// Idempotent: ustun allaqachon bor bo'lsa hech narsa qilmaydi.
function migrateAddOrderItemReadyAt() {
  const cols = db.prepare("PRAGMA table_info(order_items)").all();
  if (cols.some((c) => c.name === 'ready_at')) return;
  console.log("Migratsiya: 'order_items' jadvaliga 'ready_at' ustuni qo'shilmoqda...");
  db.exec('ALTER TABLE order_items ADD COLUMN ready_at TEXT');
  console.log("Migratsiya tugadi: 'ready_at' qo'shildi.");
}

// 'sent_at' — afitsiant "Oshxonaga yuborish" tugmasini bosgach to'ldiriladi (2026-08-26).
// Shu ustun bo'lmagan (eski) qatorlar/bazalar uchun ham oddiy ALTER ADD COLUMN yetarli.
// Idempotent: ustun allaqachon bor bo'lsa hech narsa qilmaydi. Mavjud (eski) faol
// order_items qatorlari uchun ustun NULL bo'lib qoladi — bu "hali yuborilmagan" deb
// talqin qilinadi, lekin chef ekrani faqat YANGI qo'shiladigan qatorlarga ta'sir qiladi
// (eski, allaqachon boshlangan buyurtmalar uchun amaliyotda muammo emas, chunki bu
// funksiya joriy ochiq buyurtmalar bo'lmagan paytda joylashtirilgan).
function migrateAddOrderItemSentAt() {
  const cols = db.prepare("PRAGMA table_info(order_items)").all();
  if (cols.some((c) => c.name === 'sent_at')) return;
  console.log("Migratsiya: 'order_items' jadvaliga 'sent_at' ustuni qo'shilmoqda...");
  db.exec('ALTER TABLE order_items ADD COLUMN sent_at TEXT');
  console.log("Migratsiya tugadi: 'sent_at' qo'shildi.");
}

// 'acknowledged_at'/'acknowledged_by_name' — afitsiant "Qabul qildim" tugmasini
// bosgach to'ldiriladi (2026-08-26). Idempotent, oddiy ALTER ADD COLUMN (nullable).
// Indeks ATAYLAB shu funksiya ichida (schema.sql'da EMAS) yaratiladi — ustun
// hali qo'shilmagan eski bazada schema.sql'dagi CREATE INDEX ustunga tegib
// "no such column" bilan yiqilib qolar edi (ensureSchema() bu migratsiyadan
// OLDIN ishlaydi). Bu yerda ALTER'dan keyin, har doim (idempotent) chaqiriladi.
function migrateAddNotificationAck() {
  const cols = db.prepare("PRAGMA table_info(notifications)").all();
  if (!cols.some((c) => c.name === 'acknowledged_at')) {
    console.log("Migratsiya: 'notifications' jadvaliga 'acknowledged_at'/'acknowledged_by_name' ustunlari qo'shilmoqda...");
    db.exec('ALTER TABLE notifications ADD COLUMN acknowledged_at TEXT');
    db.exec('ALTER TABLE notifications ADD COLUMN acknowledged_by_name TEXT');
    console.log("Migratsiya tugadi: 'acknowledged_at'/'acknowledged_by_name' qo'shildi.");
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_ack ON notifications(acknowledged_at)');
}

// 'picked_up_at' — afitsiant "Qabul qildim" tugmasini bosgach to'ldiriladi (2026-08-26),
// shundan keyin taom oshpaz ekranidan yo'qoladi (chefKitchen.js GET /tables filtrlaydi).
// Idempotent, oddiy ALTER ADD COLUMN (nullable).
function migrateAddOrderItemPickedUpAt() {
  const cols = db.prepare("PRAGMA table_info(order_items)").all();
  if (cols.some((c) => c.name === 'picked_up_at')) return;
  console.log("Migratsiya: 'order_items' jadvaliga 'picked_up_at' ustuni qo'shilmoqda...");
  db.exec('ALTER TABLE order_items ADD COLUMN picked_up_at TEXT');
  console.log("Migratsiya tugadi: 'picked_up_at' qo'shildi.");
}

// 'order_item_id' — bildirishnoma qaysi taomga tegishli ekanini bog'laydi (2026-08-26),
// "Qabul qildim" bosilganda shu taomni picked_up_at bilan belgilash uchun kerak.
// Idempotent, oddiy ALTER ADD COLUMN (nullable, FK emas — SQLite'da ALTER bilan FK
// qo'shib bo'lmaydi, lekin better-sqlite3/ilova darajasida bog'lanish yetarli).
function migrateAddNotificationOrderItemId() {
  const cols = db.prepare("PRAGMA table_info(notifications)").all();
  if (cols.some((c) => c.name === 'order_item_id')) return;
  console.log("Migratsiya: 'notifications' jadvaliga 'order_item_id' ustuni qo'shilmoqda...");
  db.exec('ALTER TABLE notifications ADD COLUMN order_item_id INTEGER');
  console.log("Migratsiya tugadi: 'order_item_id' qo'shildi.");
}

// Har doim serverni ko'tarishda sxema mavjudligini tekshiramiz (CREATE TABLE IF NOT EXISTS
// bo'lgani uchun xavfsiz, ma'lumotni o'chirmaydi) — alohida `npm run migrate` ham mavjud.
ensureSchema();
migrateAddChefRole();
migrateAddOrderItemReadyAt();
migrateAddOrderItemSentAt();
migrateAddNotificationAck();
migrateAddOrderItemPickedUpAt();
migrateAddNotificationOrderItemId();

function nowIso() {
  return new Date().toISOString();
}

module.exports = { db, ensureSchema, nowIso, DB_PATH };
