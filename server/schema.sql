-- Po'lat restorani bazasi. Barcha jadvallar CREATE TABLE IF NOT EXISTS —
-- server/db.js har safar ko'tarilishida shu faylni qayta qo'llaydi, mavjud
-- ma'lumotga tegmaydi.

-- Foydalanuvchilar: admin + afitsiantlar + oshpazlar. Hech qachon hard-delete
-- qilinmaydi (orders/order_items/expenses ularga FK bilan bog'langan) — faqat
-- is_active=0. ESKATMA: 'chef' roli 2026-08-26'da qo'shildi — mavjud (eski)
-- bazalarda bu CHECK'ni o'zgartirish uchun server/db.js'dagi
-- migrateAddChefRole() ishlatiladi (SQLite'da ustunning CHECK'ini to'g'ridan
-- to'g'ri ALTER qilib bo'lmaydi, shu sabab jadval qayta qurib ko'chiriladi).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'waiter', 'chef')),
  full_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Restoran stollari.
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES menu_categories(id),
  name TEXT NOT NULL,
  price INTEGER NOT NULL, -- so'm
  is_available INTEGER NOT NULL DEFAULT 1, -- tezkor "tugadi" belgisi
  is_active INTEGER NOT NULL DEFAULT 1, -- soft-delete
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);

-- Bitta stolda bir vaqtning o'zida faqat bitta 'open' buyurtma bo'lishi mumkin —
-- pastdagi qisman unikal indeks buni DB darajasida kafolatlaydi.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER NOT NULL REFERENCES tables(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by INTEGER NOT NULL REFERENCES users(id),
  opened_at TEXT NOT NULL,
  closed_by INTEGER REFERENCES users(id),
  closed_at TEXT,
  total_amount INTEGER,
  note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_open_per_table
  ON orders(table_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Append-only qatorlar: mehmon ovqat davomida qo'shimcha buyursa, shu ochiq
-- buyurtmaga yangi qator qo'shiladi (eskisi o'zgarmaydi). Narx har doim
-- qo'shilgan paytdagi nusxa (unit_price) — menyu narxi keyin o'zgarsa ham
-- eski buyurtmalar o'zgarmay qoladi.
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  name_snapshot TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  subtotal INTEGER NOT NULL,
  added_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  ready_at TEXT, -- oshpaz "tayyor" deb belgilagan vaqt (NULL = hali tayyor emas)
  sent_at TEXT, -- afitsiant "Oshxonaga yuborish" bosgan vaqt (NULL = hali yuborilmagan,
                -- oshpaz kitchen ekranida ko'rmaydi — server/routes/chefKitchen.js filtrlaydi)
  picked_up_at TEXT, -- afitsiant "Qabul qildim" bosgach to'ldiriladi (server/routes/waiterNotifications.js) —
                      -- shundan keyin taom oshpaz ekranidan yo'qoladi (chefKitchen.js filtrlaydi)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount INTEGER NOT NULL,
  expense_date TEXT NOT NULL, -- YYYY-MM-DD
  note TEXT,
  category TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

-- Umumiy key/value sozlamalar (restoran nomi/manzil/telefon — chek sarlavhasi uchun).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Landing sahifadagi "Stol bron qilish" oynasidan kelgan so'rovlar. Mehmon
-- login qilmasdan yuboradi (server/routes/publicReservations.js, ochiq API),
-- admin panelda ko'rib chiqiladi (server/routes/adminReservations.js).
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 2,
  res_date TEXT NOT NULL, -- YYYY-MM-DD
  res_time TEXT NOT NULL, -- HH:MM
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'cancelled')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(res_date);

-- Landing sahifadagi menyu + savat orqali kelgan olib ketish/yetkazib berish
-- buyurtmalari. Mehmon login qilmasdan yuboradi (server/routes/publicMenu.js +
-- publicCustomerOrders.js, ochiq API), admin panelda ko'rib chiqiladi
-- (server/routes/adminCustomerOrders.js). Ichki afitsiant `orders` jadvalidan
-- ATAYLAB alohida — u yerda opened_by/table_id majburiy (login qilingan
-- afitsiant + stol talab qiladi), bu yerda esa mehmon hech biriga bog'liq emas.
CREATE TABLE IF NOT EXISTS customer_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  fulfillment TEXT NOT NULL DEFAULT 'pickup' CHECK (fulfillment IN ('pickup', 'delivery')),
  address TEXT,
  note TEXT,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'completed', 'cancelled')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_orders_status ON customer_orders(status);

CREATE TABLE IF NOT EXISTS customer_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_order_id INTEGER NOT NULL REFERENCES customer_orders(id),
  menu_item_id INTEGER REFERENCES menu_items(id),
  name_snapshot TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_order_items_order ON customer_order_items(customer_order_id);

-- Oshpaz dine-in taomni "🏁 Tayyor" deb belgilaganda (server/routes/chefKitchen.js)
-- afitsiantga ko'rsatiladigan bildirishnoma. Afitsiant ekrani (public/app.js)
-- har necha soniyada hali TASDIQLANMAGAN (acknowledged_at IS NULL) yozuvlarni
-- so'rab oladi (poll) va "Qabul qildim" tugmasi bilan ko'rsatadi; bosilgach
-- /api/waiter/notifications/:id/acknowledge shu qatorni kim (acknowledged_by_name)
-- va qachon (acknowledged_at) tasdiqlaganini yozadi. `is_read` eski (admin
-- versiyasidan qolgan, endi ishlatilmaydi) ustun — orqaga moslik uchun saqlangan.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  acknowledged_at TEXT,
  acknowledged_by_name TEXT,
  order_item_id INTEGER REFERENCES order_items(id), -- qaysi taomga tegishli (dine-in "tayyor"
                                                      -- bildirishnomasi uchun) — tasdiqlangach shu
                                                      -- taom order_items.picked_up_at bilan belgilanadi
                                                      -- va oshpaz ekranidan yo'qoladi (chefKitchen.js)
  created_at TEXT NOT NULL
);

-- Afitsiant stolni yopib hisob-kitob qilganda (2026-09-06'dan) chek endi
-- afitsiantning o'z ekranida CHOP ETILMAYDI — termal printer faqat
-- administrator kompyuteriga ulangani uchun bu jadvalga "chop etish kutilmoqda"
-- yozuvi qo'shiladi (server/services/orders.js closeTable()). Admin panelida
-- (public/app.js, initAdminPrintRequests) har necha soniyada printed_at IS NULL
-- bo'lgan yozuvlar so'raladi (poll) va "Chekni chop etish" tugmasi bilan
-- ko'rsatiladi; bosilganda /api/admin/print-requests/:id/printed shu qatorni
-- kim (printed_by) va qachon (printed_at) chop etganini yozadi.
CREATE TABLE IF NOT EXISTS print_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  created_at TEXT NOT NULL,
  printed_at TEXT,
  printed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_print_requests_pending ON print_requests(printed_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read);
-- idx_notifications_ack SHU YERDA EMAS — server/db.js'dagi migrateAddNotificationAck()
-- ichida yaratiladi. Sabab: eski (bu ustun qo'shilishidan oldingi) bazalarda
-- CREATE TABLE IF NOT EXISTS mavjud jadvalga tegmaydi, shu sabab bu yerda turgan
-- CREATE INDEX ustun hali ALTER bilan qo'shilmasdan turib ishga tushib, "no such
-- column" xatosi bilan butun serverni yiqitadi (2026-08-26'da amalda topilgan bug).
