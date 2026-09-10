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
          session_version INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
      `);
      db.exec(`
        INSERT INTO users_new (id, username, password_hash, password_salt, role, full_name, is_active, session_version, created_at)
        SELECT id, username, password_hash, password_salt, role, full_name, is_active, session_version, created_at FROM users;
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

// 'cost_price_snapshot' (2026-09-10) — sotilgan paytdagi tan narx.
// Batafsil sabab schema.sql'da. Mavjud yozuvlar menu_items'dagi JORIY
// qiymatdan to'ldiriladi — bu ideal emas (haqiqiy tarixiy narx ma'lum emas),
// lekin hech bo'lmasa hisobot BUNDAN KEYIN o'zgarmas bo'lib qoladi.
function migrateAddOrderItemCostSnapshot() {
  for (const table of ['order_items', 'customer_order_items']) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some((c) => c.name === 'cost_price_snapshot')) continue;
    addColumnIfMissing(table, 'cost_price_snapshot', 'cost_price_snapshot INTEGER');
    const filled = db
      .prepare(
        `UPDATE ${table} SET cost_price_snapshot =
           (SELECT m.cost_price FROM menu_items m WHERE m.id = ${table}.menu_item_id)
         WHERE cost_price_snapshot IS NULL AND menu_item_id IS NOT NULL`
      )
      .run();
    if (filled.changes > 0) {
      console.log(`Migratsiya: '${table}' — ${filled.changes} ta qatorga tan narx nusxasi yozildi.`);
    }
  }
}

// 'customer_orders.stock_state' (2026-09-10) — buyurtmaning ombor qoldig'iga
// nisbatan holati ('held'/'released'/'spent'). Batafsil izoh schema.sql'da,
// mantiq server/services/customerOrders.js'da.
//
// Mavjud yozuvlar to'ldiriladi: bekor qilinganlar 'released' (ular uchun
// qoldiq allaqachon qaytarilgan), qolganlari standart 'held'.
function migrateAddCustomerOrderStockState() {
  const cols = db.prepare('PRAGMA table_info(customer_orders)').all();
  if (cols.some((c) => c.name === 'stock_state')) return;
  addColumnIfMissing('customer_orders', 'stock_state', "stock_state TEXT NOT NULL DEFAULT 'held'");
  const moved = db
    .prepare("UPDATE customer_orders SET stock_state = 'released' WHERE status = 'cancelled'")
    .run();
  if (moved.changes > 0) {
    console.log(`Migratsiya: ${moved.changes} ta bekor qilingan buyurtma 'released' deb belgilandi.`);
  }
}

// 'users.session_version' (2026-09-10) — imzolangan sessiya cookie'sini
// bekor qilish imkoni. Parol tiklanganda yoki hisob bloklanganda oshiriladi,
// shundan keyin eski cookie darhol ishlamay qoladi (server/auth.js).
// Idempotent, oddiy ALTER ADD COLUMN.
function migrateAddUserSessionVersion() {
  addColumnIfMissing('users', 'session_version', 'session_version INTEGER NOT NULL DEFAULT 0');
}

// 'orders.status' CHECK'iga 'cancelled' qo'shish (2026-09-10). SQLite'da
// mavjud CHECK'ni ALTER bilan o'zgartirib bo'lmaydi — migrateSyncUserRoles()
// bilan bir xil usulda jadval qayta quriladi.
//
// NEGA: bo'sh buyurtmani bekor qilish (cancelEmptyOrder) ilgari uni 'closed'
// qilib qo'yardi. Natijada u adminReports '/summary' dagi orders_count'ga
// haqiqiy buyurtma bo'lib qo'shilar, kassirBilling '/bills' ro'yxatida esa
// 0 so'mlik soxta chek bo'lib chiqardi. Migratsiya eski shunday yozuvlarni
// ('Bekor qilindi...' izohi bilan belgilangan) 'cancelled'ga ko'chiradi.
//
// MUHIM: 'orders' jadvali DROP qilinganda uning indekslari ham yo'qoladi —
// ensureSchema() bu migratsiyadan OLDIN ishlagani uchun ular qayta
// yaratilmaydi, shu sabab bu yerda qo'lda tiklanadi.
function migrateSyncOrderStatus() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'").get();
  if (!row || row.sql.includes("'cancelled'")) return;

  console.log("Migratsiya: 'orders' jadvaliga 'cancelled' holati qo'shilmoqda...");
  db.pragma('foreign_keys = OFF');
  try {
    const run = db.transaction(() => {
      db.exec(`
        CREATE TABLE orders_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_id INTEGER NOT NULL REFERENCES tables(id),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
          opened_by INTEGER NOT NULL REFERENCES users(id),
          opened_at TEXT NOT NULL,
          closed_by INTEGER REFERENCES users(id),
          closed_at TEXT,
          total_amount INTEGER,
          note TEXT
        );
      `);
      db.exec(`
        INSERT INTO orders_new (id, table_id, status, opened_by, opened_at, closed_by, closed_at, total_amount, note)
        SELECT id, table_id, status, opened_by, opened_at, closed_by, closed_at, total_amount, note FROM orders;
      `);
      db.exec('DROP TABLE orders;');
      db.exec('ALTER TABLE orders_new RENAME TO orders;');
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_open_per_table ON orders(table_id) WHERE status = 'open';");
      db.exec('CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);');
      db.exec('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);');

      // Eski 'bekor qilingan' yozuvlarni to'g'ri holatga ko'chirish.
      const moved = db
        .prepare("UPDATE orders SET status = 'cancelled' WHERE status = 'closed' AND total_amount = 0 AND note LIKE 'Bekor qilindi%'")
        .run();
      if (moved.changes > 0) {
        console.log(`Migratsiya: ${moved.changes} ta eski bekor qilingan buyurtma 'cancelled'ga ko'chirildi.`);
      }
    });
    run();
    const check = db.pragma('foreign_key_check');
    if (check.length > 0) {
      throw new Error('foreign_key_check muvaffaqiyatsiz: ' + JSON.stringify(check));
    }
    console.log("Migratsiya tugadi: 'cancelled' holati qo'shildi.");
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
// ─────────────────────────────────────────────────────────────────────────
// MIGRATSIYA RO'YXATI VA UNI QO'LLASH (2026-09-10, 3-bosqich)
//
// NEGA O'ZGARTIRILDI: ilgari bu yerda 18 ta funksiya shunchaki ketma-ket
// chaqirilardi. Ular idempotent edi, ya'ni ishlardi — LEKIN:
//   - server har ko'tarilganda 18 marta PRAGMA/SELECT tekshiruvi bajarilardi;
//   - production bazasi QAYSI holatda ekanini bilishning YO'LI YO'Q edi
//     (`schema.sql` esa allaqachon haqiqatdan ajrab ketgan — masalan
//     `users.role` CHECK'ida `kassir` yo'q, uni migratsiya qo'shadi);
//   - "bu migratsiya qo'llanganmi?" degan savolga faqat ustunlarni qo'lda
//     tekshirib javob berish mumkin edi.
//
// Endi `schema_migrations` jadvali har bir migratsiyaning qo'llangan
// vaqtini yozib boradi. Qo'llanganlari QAYTA ISHLAMAYDI.
//
// MUHIM: mavjud migratsiyalarning HAMMASI idempotent bo'lib qoladi — bu
// ataylab. Shu sabab yangi tizimga o'tish XAVFSIZ: eski bazada ular bir
// marta ishlaydi (ko'pchiligi hech narsa qilmaydi, chunki ustun allaqachon
// bor) va ro'yxatga yoziladi; keyingi ko'tarilishlarda umuman tegilmaydi.
//
// YANGI MIGRATSIYA QO'SHISH: pastdagi massiv OXIRIGA `{ id, up }` qo'shing.
// `id` — o'zgarmas (uni keyin O'ZGARTIRMANG, aks holda migratsiya qayta
// ishlaydi). Tartib muhim — massiv tartibida bajariladi.
const MIGRATIONS = [
  // ⚠️ TARTIB MUHIM: session_version migrateSyncUserRoles()dan OLDIN
  // qo'shilishi shart — u jadvalni qayta qurayotganda ustunlarni NOM
  // bo'yicha ko'chiradi, ya'ni ustun hali mavjud bo'lmasa INSERT...SELECT
  // "no such column" bilan yiqilardi.
  { id: '001_user_session_version', up: migrateAddUserSessionVersion },
  { id: '002_sync_user_roles', up: migrateSyncUserRoles },
  { id: '003_sync_order_status', up: migrateSyncOrderStatus },
  { id: '004_order_item_ready_at', up: migrateAddOrderItemReadyAt },
  { id: '005_order_item_sent_at', up: migrateAddOrderItemSentAt },
  { id: '006_notification_ack', up: migrateAddNotificationAck },
  { id: '007_order_item_picked_up_at', up: migrateAddOrderItemPickedUpAt },
  { id: '008_notification_order_item_id', up: migrateAddNotificationOrderItemId },
  { id: '009_menu_item_description', up: migrateAddMenuItemDescription },
  { id: '010_menu_item_image', up: migrateAddMenuItemImage },
  { id: '011_menu_item_volume', up: migrateAddMenuItemVolume },
  { id: '012_menu_item_inventory_link', up: migrateAddMenuItemInventoryLink },
  { id: '013_menu_item_parent', up: migrateAddMenuItemParent },
  { id: '014_customer_order_location', up: migrateAddCustomerOrderLocation },
  { id: '015_customer_order_delivered_at', up: migrateAddCustomerOrderDeliveredAt },
  { id: '016_notification_customer_order_id', up: migrateAddNotificationCustomerOrderId },
  { id: '017_customer_order_stock_state', up: migrateAddCustomerOrderStockState },
  { id: '018_order_item_cost_snapshot', up: migrateAddOrderItemCostSnapshot },
];

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id)
  );
  const record = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');

  let ranCount = 0;
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    try {
      migration.up();
      record.run(migration.id, new Date().toISOString());
      ranCount += 1;
    } catch (err) {
      // Migratsiya yiqilsa serverni JIMGINA ko'tarmaymiz — yarim
      // qo'llangan sxema bilan ishlash ma'lumotni buzishi mumkin.
      console.error(`[polat] Migratsiya '${migration.id}' muvaffaqiyatsiz:`, err.message);
      throw err;
    }
  }
  if (ranCount > 0) {
    console.log(`Migratsiya: ${ranCount} ta yangi migratsiya qo'llandi.`);
  }
}

// Sxema har doim tekshiriladi (CREATE TABLE IF NOT EXISTS — xavfsiz,
// ma'lumotni o'chirmaydi), keyin qo'llanmagan migratsiyalar bajariladi.
ensureSchema();
runMigrations();

function nowIso() {
  return new Date().toISOString();
}

module.exports = { db, ensureSchema, nowIso, DB_PATH };
