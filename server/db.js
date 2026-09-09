const path = require('path');
const fs = require('fs');
const { openDatabase } = require('./sqliteDriver');
const { ROLE_NAMES } = require('./roles');

// `POLAT_DB_PATH` — testlar uchun (`:memory:`) yoki muqobil joylashuv uchun.
// Berilmasa odatdagi `data/polat.db`. Papka faqat haqiqiy fayl bazasi uchun
// yaratiladi — xotiradagi baza uchun disk papkasi kerak emas (2026-09-10).
const DB_PATH = process.env.POLAT_DB_PATH || path.join(__dirname, '..', 'data', 'polat.db');

if (DB_PATH !== ':memory:') {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const db = openDatabase(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}

// Oddiy "ustun bormi? bo'lmasa ALTER TABLE bilan qo'sh" naqshi — ilgari har bir
// migrateAdd*() funksiyasi shu 5 qatorni (tekshir/log/ALTER/log) mustaqil qo'lda
// takrorlagan edi (2026-09-09'da birlashtirildi, pastdagi migratsiyalarning
// ko'pchiligi endi shu yordamchidan foydalanadi — bir nechta ustun qo'shadigan
// yoki indeks yaratadigan murakkabroqlari hamon o'zining to'liq funksiyasida
// qoladi).
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  console.log(`Migratsiya: '${table}' jadvaliga '${column}' ustuni qo'shilmoqda...`);
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`Migratsiya tugadi: '${column}' qo'shildi.`);
}

// SQLite'da mavjud ustunning CHECK constraint'ini to'g'ridan-to'g'ri ALTER
// qilib bo'lmaydi — shu sabab 'users.role' CHECK'iga yangi rol qo'shilishi
// kerak bo'lganda ('chef' 2026-08-26'da, 'courier' 2026-09-08'da qo'shilgan
// edi — ikkalasi ilgari alohida, deyarli bir xil funksiya edi, 2026-09-09'da
// birlashtirildi) jadval SQLite'ning rasmiy tavsiya qilingan usulida qayta
// qurib ko'chiriladi: yangi jadval yarat -> ma'lumotni ko'chir -> eskisini
// o'chir -> nomini almashtir. `users`ga FK bilan bog'langan boshqa jadvallar
// (orders/order_items/expenses) buzilmaydi, chunki oxirida jadval yana xuddi
// shu "users" nomi bilan qayta paydo bo'ladi.
//
// CHECK ro'yxati endi server/roles.js'dagi YAGONA ROLES manbasidan olinadi —
// kelajakda yangi rol qo'shilganda faqat roles.js'ga qo'shish kifoya, bu
// funksiya avtomatik ravishda yetishmayotgan rol(lar)ni aniqlab jadvalni
// qayta quradi. Idempotent: CHECK'da barcha rollar allaqachon bo'lsa hech
// narsa qilmaydi.
function migrateSyncUserRoles() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!row) return;
  const missing = ROLE_NAMES.filter((r) => !row.sql.includes(`'${r}'`));
  if (missing.length === 0) return;

  console.log(`Migratsiya: 'users' jadvaliga rol(lar) qo'shilmoqda: ${missing.join(', ')}...`);
  db.pragma('foreign_keys = OFF');
  try {
    const run = db.transaction(() => {
      const roleList = ROLE_NAMES.map((r) => `'${r}'`).join(', ');
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN (${roleList})),
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
    console.log(`Migratsiya tugadi: rol(lar) qo'shildi (${missing.join(', ')}).`);
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

// 'order_items'ga 'ready_at' ustuni (oshpaz "tayyor" belgisi) qo'shish — CHECK
// constraint emas, oddiy nullable ustun, shuning uchun rol qo'shishdagi kabi
// jadvalni butunlay qayta qurish shart emas, oddiy ALTER ADD COLUMN yetarli.
function migrateAddOrderItemReadyAt() {
  addColumnIfMissing('order_items', 'ready_at', 'ready_at TEXT');
}

// 'sent_at' — afitsiant "Oshxonaga yuborish" tugmasini bosgach to'ldiriladi (2026-08-26).
// Mavjud (eski) faol order_items qatorlari uchun ustun NULL bo'lib qoladi — bu
// "hali yuborilmagan" deb talqin qilinadi, lekin chef ekrani faqat YANGI
// qo'shiladigan qatorlarga ta'sir qiladi (eski, allaqachon boshlangan
// buyurtmalar uchun amaliyotda muammo emas, chunki bu funksiya joriy ochiq
// buyurtmalar bo'lmagan paytda joylashtirilgan).
function migrateAddOrderItemSentAt() {
  addColumnIfMissing('order_items', 'sent_at', 'sent_at TEXT');
}

// 'acknowledged_at'/'acknowledged_by_name' — afitsiant "Qabul qildim" tugmasini
// bosgach to'ldiriladi (2026-08-26). Idempotent, oddiy ALTER ADD COLUMN (nullable).
// Indeks ATAYLAB shu funksiya ichida (schema.sql'da EMAS) yaratiladi — ustun
// hali qo'shilmagan eski bazada schema.sql'dagi CREATE INDEX ustunga tegib
// "no such column" bilan yiqilib qolar edi (ensureSchema() bu migratsiyadan
// OLDIN ishlaydi). Bu yerda ALTER'dan keyin, har doim (idempotent) chaqiriladi.
function migrateAddNotificationAck() {
  addColumnIfMissing('notifications', 'acknowledged_at', 'acknowledged_at TEXT');
  addColumnIfMissing('notifications', 'acknowledged_by_name', 'acknowledged_by_name TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_ack ON notifications(acknowledged_at)');
}

// 'picked_up_at' — afitsiant "Qabul qildim" tugmasini bosgach to'ldiriladi (2026-08-26),
// shundan keyin taom oshpaz ekranidan yo'qoladi (chefKitchen.js GET /tables filtrlaydi).
// Idempotent, oddiy ALTER ADD COLUMN (nullable).
function migrateAddOrderItemPickedUpAt() {
  addColumnIfMissing('order_items', 'picked_up_at', 'picked_up_at TEXT');
}

// 'order_item_id' — bildirishnoma qaysi taomga tegishli ekanini bog'laydi (2026-08-26),
// "Qabul qildim" bosilganda shu taomni picked_up_at bilan belgilash uchun kerak.
// Idempotent, oddiy ALTER ADD COLUMN (nullable, FK emas — SQLite'da ALTER bilan FK
// qo'shib bo'lmaydi, lekin better-sqlite3/ilova darajasida bog'lanish yetarli).
function migrateAddNotificationOrderItemId() {
  addColumnIfMissing('notifications', 'order_item_id', 'order_item_id INTEGER');
}

// 'customer_order_id' — yangi yetkazib berish (delivery) mijoz buyurtmasi
// kelganda admin+oshpaz+dastavkachiga baravar ko'rsatiladigan bildirishnomani
// bog'lash uchun (2026-09-08, schema.sql'dagi izohga qarang, server/routes/
// deliveryAlerts.js o'qiydi). Idempotent, oddiy ALTER ADD COLUMN (nullable,
// FK emas — boshqa migratsiyalar bilan bir xil naqsh).
function migrateAddNotificationCustomerOrderId() {
  addColumnIfMissing('notifications', 'customer_order_id', 'customer_order_id INTEGER');
}

// 'description' — admin taom haqida qo'shimcha ma'lumot (tarkibi, hajmi va h.k.)
// kiritishi uchun (2026-09-07). Afitsiant menyusida taom ustiga (+ tugmasi emas)
// bosilganda shu matn ko'rsatiladi. Idempotent, oddiy ALTER ADD COLUMN (nullable).
function migrateAddMenuItemDescription() {
  addColumnIfMissing('menu_items', 'description', 'description TEXT');
}

// 'image_url' — admin taomga ixtiyoriy rasm biriktirishi uchun (2026-09-07,
// server/routes/adminMenu.js'dagi POST /upload-image orqali yuklanadi).
// MAJBURIY EMAS — NULL bo'lsa frontend rasmsiz (faqat nom/narx) ko'rsatadi.
// Idempotent, oddiy ALTER ADD COLUMN (nullable).
function migrateAddMenuItemImage() {
  addColumnIfMissing('menu_items', 'image_url', 'image_url TEXT');
}

// 'volume' — nomdan keyin ko'rsatiladigan qisqa o'lcham/hajm belgisi (2026-09-07),
// masalan ichimliklar uchun "0.5L"/"1L". Erkin matn (raqam+birlik cheklanmagan —
// taomlar uchun "300g" kabi ham ishlatilishi mumkin). MAJBURIY EMAS. Idempotent,
// oddiy ALTER ADD COLUMN (nullable).
function migrateAddMenuItemVolume() {
  addColumnIfMissing('menu_items', 'volume', 'volume TEXT');
}

// 'inventory_item_id' — menyu taomini ombor mahsulotiga (2026-09-07, schema.sql'dagi
// yangi 'inventory_items' jadvali) ixtiyoriy bog'lash uchun. NULL = oddiy taom,
// mavjudligi hamon qo'lda (PATCH /availability) boshqariladi. Qiymat bo'lsa,
// server/services/inventory.js shu taomning is_available'ini ombor qoldig'idan
// avtomatik hisoblaydi. Idempotent, oddiy ALTER ADD COLUMN (nullable, FK emas —
// SQLite'da ALTER bilan FK qo'shib bo'lmaydi, ilova darajasida bog'lanish yetarli,
// boshqa migratsiyalar bilan bir xil naqsh).
function migrateAddMenuItemInventoryLink() {
  addColumnIfMissing('menu_items', 'inventory_item_id', 'inventory_item_id INTEGER');
}

// 'delivered_at' — dastavkachi (courier) "🚚 Yetkazildi" bosgan vaqt
// (2026-09-08, schema.sql'dagi izohga qarang). NULL = hali yetkazilmagan.
function migrateAddCustomerOrderDeliveredAt() {
  addColumnIfMissing('customer_orders', 'delivered_at', 'delivered_at TEXT');
}

// 'location_lat'/'location_lng' — mijoz landing sahifasida (yetkazib berish
// buyurtmasida) brauzer Geolocation API orqali ixtiyoriy ravishda ulashgan GPS
// koordinatasi (2026-09-08, public/landing/script.js'dagi "📍 Joylashuvni
// yuborish" tugmasi). Faqat "manzil" matn maydoniga qo'shimcha, aniqroq
// yetkazish uchun — MAJBURIY EMAS, mijoz ruxsat bermasa/qurilma qo'llamasa
// NULL qoladi. Admin panelda mavjud bo'lsa xaritaga havola sifatida ko'rsatiladi
// (public/admin/customer-orders.js).
function migrateAddCustomerOrderLocation() {
  addColumnIfMissing('customer_orders', 'location_lat', 'location_lat REAL');
  addColumnIfMissing('customer_orders', 'location_lng', 'location_lng REAL');
}

// 'parent_item_id' — taom "turi" (variant) funksiyasi uchun (2026-09-09,
// schema.sql'dagi izohga qarang). NULL = oddiy/asosiy taom, qiymat bo'lsa —
// shu taom ko'rsatilgan ota taomning bir turi. Idempotent, oddiy ALTER ADD
// COLUMN (nullable, FK emas — boshqa migratsiyalar bilan bir xil naqsh).
function migrateAddMenuItemParent() {
  addColumnIfMissing('menu_items', 'parent_item_id', 'parent_item_id INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_menu_items_parent ON menu_items(parent_item_id)');
}

// ESKATMA (2026-09-09): bu yerda ilgari 4 ta qo'shimcha migratsiya funksiyasi
// bor edi — migrateAddInventoryPricing/migrateAddInventoryVolume/
// migrateAddCategoryInventoryRequirement/migrateAddMenuItemCostPrice.
// Ularning barchasi endi HAQIQIY O'LIK KOD edi: schema.sql'dagi tegishli
// CREATE TABLE'lar (inventory_items.cost_price/sale_price/volume,
// menu_categories.require_inventory_link, menu_items.cost_price) allaqachon
// shu ustunlarni to'g'ridan-to'g'ri o'z ichiga oladi (production bazasida ham
// bu ustunlar ALLAQACHON mavjud — funksiyalar birinchi marta joriy qilingan
// paytda bir martalik ALTER TABLE sifatida ishlab, natija saqlanib qolgan),
// shuning uchun ular haqiqatda hech qachon "ustun yo'q" holatiga tushmasdi —
// server har safar ko'tarilganda foydasiz PRAGMA/ALTER tekshiruvidan boshqa
// hech narsa qilmasdi. Xavfsiz o'chirildi.
//
// Har doim serverni ko'tarishda sxema mavjudligini tekshiramiz (CREATE TABLE IF NOT EXISTS
// bo'lgani uchun xavfsiz, ma'lumotni o'chirmaydi) — alohida `npm run migrate` ham mavjud.
ensureSchema();
migrateSyncUserRoles();
migrateAddOrderItemReadyAt();
migrateAddOrderItemSentAt();
migrateAddNotificationAck();
migrateAddOrderItemPickedUpAt();
migrateAddNotificationOrderItemId();
migrateAddMenuItemDescription();
migrateAddMenuItemImage();
migrateAddMenuItemVolume();
migrateAddMenuItemInventoryLink();
migrateAddMenuItemParent();
migrateAddCustomerOrderLocation();
migrateAddCustomerOrderDeliveredAt();
migrateAddNotificationCustomerOrderId();

function nowIso() {
  return new Date().toISOString();
}

module.exports = { db, ensureSchema, nowIso, DB_PATH };
