# Po'lat restorani — buyurtma, hisob-kitob va mijozlar uchun landing tizimi

Repo ildizidagi asosiy `claude-code-web`dan **butunlay mustaqil** Node.js/Express 5 + better-sqlite3 veb-ilova (o'z `package.json`, o'z serveri, o'z SQLite bazasi — `data/polat.db`). `/root/vps/claudeweb/` uy papkasining o'zi ICHIDA joylashgan (`savdo-hisob`/`Post bot 10` kabi mustaqil loyiha), shuning uchun ACL izolyatsiyasiga to'liq mos.

Uch turdagi foydalanuvchi uchun mo'ljallangan:

1. **Mijoz (login shart emas)** — landing sahifa: menyuni ko'radi, savatga qo'shib olib ketish/yetkazib berish buyurtmasi beradi, stol bron qiladi, restoran haqida ma'lumot va aloqa (manzil/xarita/telefon) ko'radi.
2. **Afitsiant** — stollarni boshqaradi: buyurtma qo'shadi, hisob-kitob qilib chek chiqaradi.
3. **Oshpaz** — oshxona ekrani: band stollar va onlayn buyurtmalarni ko'radi, onlayn buyurtmani tasdiqlaydi/tayyor deb belgilaydi.
4. **Admin** — hamma narsani boshqaradi (menyu, stollar, xodimlar, xarajat, bronlar, onlayn buyurtmalar, hisobot).

## Ishga tushirilgan holat

PM2'da **`polat`** nomi bilan (claudeweb'ning o'z alohida PM2 daemonida, root PM2'dan mustaqil), `.env`: `PORT=3213`, `HOST=127.0.0.1`. **Ilgari** asosiy `claude-code-web` ichida `/polat/` yo'lida reverse-proksi qilib ulangan edi (`savdo-hisob`/`/savdo/` bilan bir xil naqsh), lekin bu keyinchalik olib tashlangan (`claude-code-web/server/index.js`da shunday izoh qoldirilgan). **Hozir** `polat` o'zining alohida subdomeni orqali, to'g'ridan-to'g'ri nginx (`/etc/nginx/sites-available/polatuz`, mustaqil Certbot sertifikati) orqali `127.0.0.1:3213`ga proxy qilinadi — shu sabab `.env`da `TRUST_PROXY=1` (to'g'ridan-to'g'ri nginx orqasida). Cookie nomi to'qnashuvining oldini olish uchun **`"polat_session"`**. (2026-09-04'da tekshiruv paytida bu eskirgan holat hujjatda aniqlanib tuzatildi.)

- **Mijozlar uchun:** https://polatuz.duckdns.org/ (avtomatik `/landing/`ga yo'naltiradi, login shart emas)
- **Xodimlar uchun:** https://polatuz.duckdns.org/login.html (yoki landing header'idagi "Xodim kirishi" tugmasi)

## Fayl strukturasi

```
server/
  index.js              — Express bootstrap, route'larni ulash, static serve, "/" -> "/landing/" redirect
  db.js                 — better-sqlite3 ulanish (WAL, foreign_keys=ON), sxemani avtomatik qo'llaydi,
                           migrateAddChefRole() — 'chef' rolini eski bazalarga xavfsiz qo'shadi
  schema.sql            — barcha jadval ta'riflari (CREATE TABLE IF NOT EXISTS)
  migrate.js            — qo'lda migratsiya/seed CLI (`npm run migrate`), boshlang'ich admin hisobini yaratadi
  auth.js               — signed-cookie login/logout/rol-asosli himoya middleware (admin/waiter/chef)
  passwords.js          — scrypt parol xeshlash (tuz + timingSafeEqual)
  routeUtils.js         — asyncRoute() wrapper — 500 xatolarda mijozga umumiy xabar, tafsilot faqat logga
  services/orders.js     — stolga buyurtma qo'shish/yopish tranzaksion mantig'i (OrderError)
  routes/
    adminMenu.js, adminUsers.js, adminTables.js, adminExpenses.js, adminReports.js,
    adminReservations.js, adminCustomerOrders.js   — hammasi requireRole('admin')
    waiterTables.js, waiterMenu.js, waiterOrders.js — afitsiant (va admin) uchun
    chefKitchen.js                                  — oshpaz (va admin) uchun, faqat o'qish + onlayn buyurtma holati
    publicMenu.js, publicReservations.js, publicCustomerOrders.js — login SHART EMAS (mijoz uchun)
public/
  login.html            — barcha xodim (admin/afitsiant/oshpaz) uchun yagona kirish sahifasi
  app.js, style.css      — xodim sahifalari uchun umumiy (fetch wrapper, nav, toast, formatlash) — qorong'i/oltin uslub
  admin/                — index, menu, tables, waiters ("Xodimlar"), expenses, reservations,
                           customer-orders, reports — har biri .html + .js
  waiter/                — tables, order, receipt
  chef/                  — kitchen.html + kitchen.js (15s'da avtomatik yangilanadi)
  landing/               — index.html, style.css, script.js — MIJOZLAR uchun, mustaqil dizayn tizimi
                           (terracotta/qora/oltin, Playfair Display + Poppins), login shart emas
data/polat.db            — SQLite fayli (gitignored, avtomatik yaratiladi)
```

## Ma'lumotlar bazasi (SQLite, `server/schema.sql`)

- **`users`** — `role` CHECK IN (`admin`, `waiter`, `chef`). Hech qachon hard-delete qilinmaydi, faqat `is_active=0`.
- **`tables`** — restoran stollari (nom/raqam).
- **`menu_categories`** / **`menu_items`** — `is_active` (soft-delete) + `is_available` (tezkor "tugadi" belgisi). Bitta umumiy menyu — ham afitsiant, ham oshpaz, ham mijoz (landing) shu yerdan o'qiydi.
- **`orders`** / **`order_items`** — afitsiant tomonidan stolga qo'shiladigan **dine-in** buyurtmalar. Bitta stolda bir vaqtning o'zida faqat bitta `open` buyurtma (qisman unikal indeks bilan DB darajasida kafolatlangan). Yopilganda `total_amount` hisoblanadi, chek (`getReceipt`) chiqariladi.
- **`expenses`** — kunlik xarajatlar (hisobotdagi sof foyda hisobi uchun).
- **`settings`** — key/value (hozircha ishlatilmayapti faol, kelajak uchun).
- **`reservations`** — landing'dagi "Stol bron qilish" oynasidan (login shart emas). `status`: new/confirmed/cancelled.
- **`customer_orders`** / **`customer_order_items`** — landing'dagi menyu+savat orqali kelgan **olib ketish/yetkazib berish** buyurtmalari (login shart emas, `orders`dan ATAYLAB alohida — bu yerda stol/afitsiant shart emas). `fulfillment`: pickup/delivery. `status`: new/confirmed/completed/cancelled. Narx HAR DOIM serverda menu_items'dan qayta hisoblanadi, mijoz yubor gan narxga ishonilmaydi.

**Muhim migratsiya eslatmasi:** SQLite'da ustunning CHECK shartini to'g'ridan-to'g'ri ALTER qilib bo'lmaydi. `'chef'` roli qo'shilganda (2026-08-26) mavjud `users` jadvali `server/db.js`dagi `migrateAddChefRole()` orqali xavfsiz qayta qurilib ko'chirildi (yangi jadval → INSERT SELECT → DROP → RENAME, `foreign_key_check` bilan tekshirilib). Idempotent — har safar server ko'tarilganda CHECK'da `'chef'` bor-yo'qligini tekshiradi, bor bo'lsa hech narsa qilmaydi. Kelajakda yana shunga o'xshash CHECK o'zgarishi kerak bo'lsa, shu funksiyani namuna sifatida ishlating.

## Rollar va ruxsatlar (`server/auth.js`)

- Cookie: `polat_session` (HMAC-SHA256 imzolangan, `HttpOnly`, `SameSite=Lax`, `TRUST_PROXY=1` bo'lgani uchun HTTPS orqali `Secure` ham qo'shiladi).
- `OPEN_PATHS` + `/landing/*` — login shart emas.
- `requireAuth`: `/admin/*`, `/chef/*`, `/waiter/*` (va mos `/api/*`) — har biri faqat o'z roliga ochiq, **admin hammasiga kira oladi**. Boshqa rol hududiga kirishga urinilsa avtomatik o'z "uy" sahifasiga qaytariladi (`homeForRole()`).
- `requireRole(role|role[])` — bitta rol yoki massiv qabul qiladi (masalan `requireRole(['admin','chef'])`).
- Parol: `scrypt` (tuz + `timingSafeEqual`), minimal uzunlik **6 belgi** (2026-08-26'da 4'dan oshirildi).

## Asosiy oqimlar

**Afitsiant (dine-in):** `/waiter/tables.html` (stollar tarmog'i, bo'sh/band) → stolga kirib menyudan taom qo'shadi (`/waiter/order.html`, har bosilgan "+" alohida `order_items` qatori sifatida qo'shiladi, lekin oshpazga DARHOL yubormaydi — "Kutilmoqda" belgisi bilan ro'yxatda turadi) → hammasini yig'ib bo'lgach **"🍽️ Oshxonaga yuborish"** tugmasi (faqat hali yuborilmagan taom bo'lsa ko'rinadi, sonini ko'rsatadi) → shu paytgacha yig'ilgan taomlarning HAMMASI bitta paytda oshpazga ko'rinadigan bo'ladi → keyinroq yana taom qo'shilsa, xuddi shu tsikl takrorlanadi (yana "Kutilmoqda" → yana "Yuborish") → **"Hisob-kitob"** → stol yopiladi, chek chiqadi (`/waiter/receipt.html`, chop etish tugmasi bilan).

**Oshpaz:** `/chef/kitchen.html` — band stollar (taom+miqdor, faqat ko'rish) va onlayn buyurtmalar (✅ Tasdiqlash / 🏁 Tayyor tugmalari bilan) ro'yxati, 15s'da avtomatik yangilanadi.

**Mijoz (landing, `/landing/`):**
- **Hero** — restoran nomi, shior, "Stol bron qilish" (oyna/modal).
- **Menyu** — haqiqiy (admin kiritgan) kategoriya/taomlar, `−`/`+` bilan savatga qo'shiladi, pastda suzuvchi savat paneli, "Buyurtma berish" → checkout oynasi (ism/telefon/olib ketish yoki yetkazib berish/manzil/izoh) → `POST /api/public/orders`.
- **Galereya, Biz haqimizda, Aloqa** (manzil/xarita/ish vaqti/telefon) — statik kontent (Unsplash surat manzillari, real suratlar bilan almashtirish mumkin).
- Header'da **"Xodim kirishi"** — `/login.html`ga o'tadi.

**Admin:** barcha bo'lim — Bosh sahifa (band stollar + kunlik statistika), Menyu, Stollar, **Xodimlar** (admin/afitsiant/oshpaz yaratish — rol tanlanadi), Xarajat, **Bronlar**, **Buyurtmalar** (onlayn, ✅/🏁/❌/🗑 bilan), Hisobot.

## `.env` kalitlari

| Kalit | Vazifasi |
|---|---|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Boshlang'ich admin hisobi (`server/migrate.js` orqali, faqat hali mavjud bo'lmasa yaratiladi). |
| `PORT` / `HOST` | `3213` / `127.0.0.1`. |
| `SESSION_SECRET` | Cookie imzolash uchun HMAC kaliti. |
| `TRUST_PROXY` | **`1` bo'lishi SHART** — nginx/asosiy proksi orqasida `req.secure`ni to'g'ri aniqlash (Secure cookie) uchun. 2026-08-26'da `0` xato qiymat ekani topilib tuzatildi (pastga qarang). |

## Xavfsizlik — 2026-08-26'da tekshiruv va tuzatishlar

To'liq kod bazasi (barcha route, auth, frontend JS) qo'lda ko'rib chiqildi:

- ✅ **Tuzatildi:** `.env`dagi `TRUST_PROXY=0` xato edi (boshqa barcha shu naqshdagi ilovalarda `=1`) — natijada sessiya cookie'sida `Secure` bayrog'i HECH QACHON qo'yilmas edi (HTTPS bo'lsa ham). `1`ga o'zgartirildi, `Set-Cookie`da `Secure` paydo bo'lgani `curl` bilan tasdiqlandi.
- ✅ **Tuzatildi:** `routeUtils.js`dagi `asyncRoute()` — kutilmagan (500) xatolarda endi mijozga umumiy `"Server xatosi..."` xabari qaytadi, ichki tafsilot (masalan xato matni/joyi) faqat serverning o'z logiga yoziladi. Kutilgan (400/404, masalan "Login band") xabarlar o'zgarishsiz qoldi.
- ✅ **Tuzatildi:** xodim paroli minimal uzunligi 4 → **6 belgi** (`adminUsers.js` + `waiters.js`).
- ✅ **Tasdiqlandi, muammo yo'q:** SQL in'ektsiya (hamma joyda parametrlangan so'rov), XSS (barcha frontend fayllarda `escapeHtml()`/`escapeAttr()`, faqat `.textContent` ishlatilgan joylarda xavf yo'q), onlayn buyurtmada narx serverda qayta hisoblanadi (mijoz narxiga ishonilmaydi), parol xeshlash (`scrypt`+tuz+`timingSafeEqual`), CSRF (`SameSite=Lax`).
- ⚠️ **Ataylab tuzatilmagan (foydalanuvchi so'rovi bilan, keyinroq qaytilishi mumkin):**
  1. Standart admin login/parol hozircha zaif (`polat`/`polat`) — **hozircha test uchun** shu holicha qoldirildi.
  2. `/api/login` va ochiq (`/api/public/reservations`, `/api/public/orders`) endpoint'larda rate-limit/spam himoyasi yo'q.

## Holat — 2026-08-25/26: loyiha yaratilgandan keyingi ishlar (bitta sessiyada)

Loyihaning o'zi (afitsiant/stol/buyurtma/chek/admin asosiy qismi) foydalanuvchi tomonidan avvalroq qurilgan va ishlab turgan edi. 2026-08-25/26'da bitta uzun sessiyada quyidagilar qo'shildi/o'zgartirildi:

1. **Dizayn — "lyuks" qorong'i+oltin uslub** — `public/style.css` (admin/afitsiant/oshpaz sahifalari): qora-ko'mir fon, oltin gradient aksentlar, **Playfair Display** serif sarlavhalar, chek uchun krem/qog'oz rangli maxsus ko'rinish, `icon.svg`/`manifest.json` mos yangilandi.
2. **Mijozlar uchun landing sahifa** (`public/landing/`) — to'liq yangi, mustaqil dizayn tizimi (terracotta/qora/oltin, Playfair+Poppins): Hero, Menyu (dastlab statik namuna, keyin **haqiqiy DB menyusi**ga almashtirildi), Galereya, Biz haqimizda, Aloqa (xarita/telefon/ish vaqti).
3. **"Stol bron qilish" oynasi** — landing'da modal, `reservations` jadvali + ochiq `POST /api/public/reservations` + admin panelda **"Bronlar"** ko'rish/boshqarish sahifasi.
4. **Menyu+savat+onlayn buyurtma** — landing'dagi statik menyu real DB'ga ulandi (`GET /api/public/menu`), savat/checkout oynasi qo'shildi, `customer_orders`/`customer_order_items` jadvallari + ochiq `POST /api/public/orders` (narx serverda qayta hisoblanadi) + admin panelda **"Buyurtmalar"** sahifasi.
5. **Bosh sahifa (`/`) endi login so'ramaydi** — to'g'ridan-to'g'ri `/landing/`ga yo'naltiradi; landing header'ida xodimlar uchun kichik **"Xodim kirishi"** havolasi qo'shildi; xodim **"Chiqish"** bossa endi `login.html`ga emas, **landing**ga qaytariladi (`public/app.js`).
6. **Oshpaz (chef) roli** — `users.role`ga `'chef'` qo'shildi (xavfsiz migratsiya bilan, yuqoriga qarang), yangi `/chef/kitchen.html` ekrani, `requireAuth`/`requireRole` rol-asosli hududlarga umumlashtirildi, admin "Xodimlar" bo'limida oshpaz yaratish imkoniyati qo'shildi (nav yorlig'i "Afitsiantlar" → "Xodimlar"ga o'zgartirildi).
7. **Xavfsizlik tekshiruvi va tuzatishlar** — yuqoridagi bo'limga qarang.

**Har bir bosqich production'da (`pm2 restart polat --update-env`) sinaldi:** syntax tekshiruvlari (`node22 -c`), HTML teg balansi, CSS qavs balansi, va eng muhimi — haqiqiy HTTP so'rovlar bilan end-to-end oqimlar (login/logout, rol-asosli kirish cheklovlari, bron/buyurtma yaratish+narx tekshiruvi+admin ko'rinishi, chef migratsiyasi FK-check bilan) — har safar test ma'lumotlari keyin tozalangan. Jarayon barqaror **online**, crash-loop yo'q.

## Holat — 2026-08-26: oshpaz "Tayyor" tugmasi bosilganda AFITSIANTGA bildirishnoma

Foydalanuvchi so'rovi bilan qo'shildi: oshpaz `/chef/kitchen.html`da dine-in stol taomini **🏁 Tayyor** deb belgilaganda (`PUT /api/chef/items/:id/ready`, faqat `ready:true` tomonga o'tganda — orqaga qaytarilganda emas), **afitsiant** ekranining istalgan sahifasida (`/waiter/*`) 10 soniyalik poll orqali toast xabar chiqadi: `"<stol nomi> taomi tayyor: <taom nomi>"`. (Birinchi versiya adminga yuborar edi — foydalanuvchi buni sinab ko'rib, "yo'q, faqat afitsiantga borsin" deb tuzatishni so'radi, shu bilan admin yo'nalishi olib tashlanib afitsiantga o'zgartirildi.)

- **Yangi jadval** (`server/schema.sql`): `notifications` (`id`, `message`, `is_read`, `created_at`) — oddiy `CREATE TABLE IF NOT EXISTS`, mavjud bazaga alohida migratsiya kerak emas (server har ko'tarilishda `ensureSchema()` orqali avtomatik yaratadi). Umumiy (broadcast) — hozircha "qaysi afitsiant qaysi stolga xizmat qilyapti" degan bog'lanish yo'q, shu sabab barcha faol afitsiant sessiyalari xuddi shu xabarlarni ko'radi (admin ham `/waiter/*`ga kirsa ko'radi, chunki admin barcha hududga kira oladi — lekin admin panelining o'zida (`/admin/*`) endi HECH QANDAY poll yo'q).
- **`server/routes/chefKitchen.js`** — `ready:true` bo'lganda `order_id → orders.table_id → tables.name` orqali stol nomini topib, `notifications`ga yozadi.
- **`server/routes/waiterNotifications.js`** (`server/index.js`da `/api/waiter/notifications` ostida, oddiy `requireAuth`ning `/api/waiter/*` hudud qoidasi bilan — admin ham kira oladi, chef yo'q): `GET /unread` (o'qilmaganlar ro'yxati) va `POST /read` (`{ids:[...]}` — o'qilgan deb belgilaydi).
- **`public/app.js`** (umumiy fayl) — `initWaiterNotifications()`: faqat `window.location.pathname`da `/waiter/` bo'lsa ishga tushadi (admin/chef/login/landing sahifalarida keraksiz so'rov yubormaydi), 10s'da `unread`ni so'rab, `toast()` bilan ko'rsatadi, darhol `read` bilan belgilaydi.
- Onlayn (mijoz, `customer_orders`) buyurtmalar uchun **bildirishnoma qo'shilmadi** — so'rov aniq "stol taomi tayyor"ga oid edi, faqat dine-in (`order_items.ready_at`) oqimiga tegishli.
- **Tekshirilgan:** `node22 -c` barcha o'zgargan/yangi fayllarda xatosiz; `pm2 restart polat --update-env` (ikki marta — avval admin versiyasi, keyin afitsiant versiyasi) xatosiz, jarayon barqaror **online** (crash-loop yo'q); haqiqiy HTTP oqim ikkala versiyada ham admin sessiyasi orqali end-to-end sinaldi (vaqtinchalik test stol yaratildi → taom qo'shildi → `/api/chef/items/:id/ready` chaqirildi → mos `unread` endpoint to'g'ri xabarni qaytardi → `POST /read` orqali bo'shab qoldi; eski `/api/admin/notifications/*` endi 404 qaytarishi ham tasdiqlandi). Test ma'lumotlari (stol/buyurtma/taom qatori/bildirishnoma) har safar sinovdan so'ng bazadan **to'liq hard-delete** qilindi (soft-delete emas — aks holda "Bugungi tushum" hisobotiga soxta summa qo'shilib qolar edi), production ma'lumotlariga iz qoldirilmadi.

## Holat — 2026-08-26: afitsiant taomni oshpazga DARHOL emas, "Yuborish" tugmasi bilan yuboradi

Foydalanuvchi so'rovi: "Afitsiant menyuda taomni tanlaganda uni to'g'ridan-to'g'ri oshpazga yubormaydi, oldin barchasini tayyorlaydi (yig'adi), keyin yuborish tugmasini bosadi va oshpaz uni ko'radi." Avval `/waiter/order.html`da menyudan "+" bosilgan taom ZUM darhol oshpaz kitchen ekranida ko'rinardi (`order_items` qo'shilgach `buildOrderView` orqali filtrsiz chiqar edi); endi ikki bosqichli bo'ldi — qo'shish (afitsiantning o'z "Joriy buyurtma" ro'yxatida "Kutilmoqda" belgisi bilan) va alohida "yuborish" (hammasi birdan oshpazga ochiladi).

- **Yangi ustun** (`order_items.sent_at`, nullable TEXT) — `server/schema.sql`ga (yangi bazalar uchun) va `server/db.js`dagi `migrateAddOrderItemSentAt()` (eski `migrateAddOrderItemReadyAt()` namunasida, oddiy `ALTER TABLE ADD COLUMN`, idempotent) orqali mavjud bazaga ham qo'shildi. `NULL` = hali yuborilmagan, sana = yuborilgan payt.
- **`server/services/orders.js`** — yangi `sendPendingItems(tableId)`: shu stolning ochiq buyurtmasidagi `status='active' AND sent_at IS NULL` bo'lgan barcha qatorlarni bitta tranzaksiyada `sent_at = hozir` qiladi (yuborilmagan taom bo'lmasa `OrderError` — 400). `addItemToTable()` o'zgarmadi — yangi qator har doim `sent_at=NULL` bilan qo'shiladi (INSERT ustunlar ro'yxatida yo'q, SQLite avtomatik NULL beradi).
- **`server/routes/waiterOrders.js`** — yangi `POST /waiter/tables/:id/send` (`sendPendingItems`ni chaqiradi, yangilangan order view qaytaradi).
- **`server/routes/chefKitchen.js`** — `GET /chef/tables` endi har bir stol uchun `view.items.filter((it) => it.sent_at)` — faqat yuborilganlar chef ekranida ko'rinadi (stol o'zi hamon "band" ko'rinadi, lekin taom qatori yo'q bo'lsa "Hali taom qo'shilmagan" matni chiqadi — bu allaqachon mavjud matn, o'zgartirilmagan). `PUT /chef/items/:id/ready` endi `item.sent_at` yo'q bo'lsa 400 qaytaradi (himoya — chef UI'da tugma bo'lmasa ham, to'g'ridan-to'g'ri API chaqirilsa ham yuborilmagan taomni "tayyor" qilib bo'lmaydi).
- **Frontend** (`public/waiter/order.html` + `order.js`) — "Joriy buyurtma" kartochkasi tepasida yangi **"🍽️ Oshxonaga yuborish (N)"** tugmasi (faqat yuborilmagan taom bo'lsa ko'rinadi, sonini ko'rsatadi, `sendToKitchen()` → `POST /waiter/tables/:id/send` → ro'yxatni qayta chizadi + toast). Har bir yuborilmagan qator nomi yonida `badge debt` (mavjud sariq-ogohlantirish uslubi) bilan **"Kutilmoqda"** yorlig'i chiqadi; yuborilgach yorliq yo'qoladi.
- **Muhim cheklov (ataylab):** bu funksiya faqat YANGI qo'shiladigan `order_items` qatorlariga taalluqli — deploy paytida bazada ochiq (`status='open'`) buyurtma yo'qligi tekshirildi (0 ta), shu sabab hech qanday real-vaqtdagi stol/buyurtma bu migratsiyadan zarar ko'rmadi (agar ochiq buyurtma bo'lganida, uning eski qatorlari `sent_at=NULL` bilan qolib, oshpaz ekranidan "yo'qolib qolar edi" — bu holat yuz bermadi).
- **Tekshirilgan:** barcha o'zgargan/yangi fayl `node22 -c` xatosiz, `order.html`dagi `<div>` teglar balansli; `pm2 restart polat --update-env` xatosiz, migratsiya logda tasdiqlandi (`'sent_at' qo'shildi`), jarayon barqaror **online**; to'liq end-to-end HTTP oqim sinaldi — taom qo'shilgach chef ro'yxatida **yo'q** ekani (`items: []`), yuborishdan oldin `PUT /ready` **400** qaytarishi, `POST /send` chaqirilgach chef ro'yxatida **paydo bo'lishi**, shundan keyin `PUT /ready` **200** bilan muvaffaqiyatli o'tishi va afitsiantga bildirishnoma kelishi — barchasi tasdiqlandi. Test ma'lumotlari sinovdan so'ng bazadan to'liq hard-delete qilindi.

## Holat — 2026-08-26: afitsiant bildirishnomasi endi "Qabul qildim" tugmasi bilan tasdiqlanadi

Foydalanuvchi so'rovi: "Afitsiantga boradigan bildirishnomani tasdiqlik qilish kerak — qabul qildim tugmasini bosadigan qil, va bosgan afitsiant ismi chiqsin 'qabul qildi' deb." Avvalgi versiya oddiy 3 soniyalik `toast()` edi va poll o'zi avtomatik "o'qilgan" deb belgilardi (tugma yo'q edi, kim ko'rgani ham qayd etilmasdi). Endi bildirishnoma ekranda **doimiy kartochka** sifatida turadi, tugma bosilmaguncha yo'qolmaydi, va bosilgach kim bosgani (login qilgan xodimning ismi) kartochkada ko'rsatiladi.

- **Yangi ustunlar** (`notifications.acknowledged_at`, `notifications.acknowledged_by_name`, ikkalasi ham nullable TEXT) — `server/schema.sql`ga (yangi bazalar uchun) va `server/db.js`dagi `migrateAddNotificationAck()` orqali mavjud bazaga ham qo'shildi. **Diqqat — shu joyda haqiqiy production xatosi topilib tuzatildi:** boshida indeksni (`CREATE INDEX ... (acknowledged_at)`) `schema.sql`ning o'ziga qo'ygan edim — bu eski (ustun hali yo'q) bazada `ensureSchema()` ALTER'dan OLDIN ishlagani uchun `"no such column: acknowledged_at"` bilan serverni chinakam **yiqitib qo'ydi** (`pm2 restart` xato bilan crash-loop'ga kirdi, ↺ 17→32'ga ko'tarildi). Tuzatish: indeks endi faqat `migrateAddNotificationAck()` ichida, ALTER'dan KEYIN yaratiladi — qayta joylashtirilgach `node22 -e "require('./server/db.js')"` bilan alohida oldindan sinaldi, keyingina `pm2 restart` qilindi va barqaror online bo'ldi.
- **`server/routes/waiterNotifications.js`** — `GET /unread` endi `acknowledged_at IS NULL OR acknowledged_at >= (hozir-30s)` bilan qaytaradi (30 soniyalik "grace-oyna" — shu tufayli bitta afitsiant "Qabul qildim" bossa, boshqa afitsiantlarning ekranida ham qisqa vaqt "✅ &lt;Ism&gt; qabul qildi" holati ko'rinib, so'ng ro'yxatdan tushib qoladi, hamma tomondan izchil). Yangi `POST /:id/acknowledge` — `req.user.full_name || req.user.username`ni `acknowledged_by_name`ga yozadi, `acknowledged_at = hozir`; idempotent (allaqachon tasdiqlangan bo'lsa qayta yozmaydi, borini qaytaradi).
- **`public/app.js`** — endi `toast()` o'rniga har sahifada (waiter) dinamik yaratiladigan **`#notifList`** konteyner (topbar'dan keyin joylashtiriladi, `ensureNotifList()`), har bildirishnoma o'z kartochkasida: tasdiqlanmagan bo'lsa **"Qabul qildim"** tugmasi, tasdiqlangan bo'lsa **"✅ &lt;Ism&gt; qabul qildi"** matni. `public/style.css`ga `.notif-list`/`.notif-card`/`.notif-card.done` (sariq=kutilmoqda, yashil=tasdiqlangan, mavjud `--warn`/`--ok` ranglar) qo'shildi.
- **Eski bildirishnomalar tozalandi:** bu funksiyadan oldingi haqiqiy (test bo'lmagan, foydalanuvchining o'zi avvalroq sinab ko'rgan) 5 ta bildirishnoma yozuvi bazada `acknowledged_at=NULL` holida qolib ketgan edi (ustun ular yaratilgandan keyin qo'shilgani uchun) — deploy qilinishi bilan bularning barchasi yangi afitsiant ekranida keraksiz "eski, hozir tasdiqlash kerak" kartochkasi bo'lib chiqib qolar edi. Shu sabab bir martalik tozalash bajarildi: `acknowledged_at = created_at`, `acknowledged_by_name = 'Tizim (eski yozuv)'` qilib retroaktiv "tasdiqlangan" deb belgilandi (o'chirilmadi — tarix sifatida qoldi, faqat endi hech kimga faol ko'rinmaydi).
- **Tekshirilgan:** `node22 -c` barcha o'zgargan fayllarda xatosiz, CSS qavs balansi tekshirildi; birinchi `pm2 restart` **crash-loop**ga kirdi (yuqoridagi bug), bu **haqiqiy production incident** sifatida aniqlanib zudlik bilan tuzatildi, tuzatilgan versiya alohida `node22 -e` bilan oldindan sinalgach qayta deploy qilindi va barqaror **online** holatga qaytdi (keyingi tekshiruvda restart soni ko'tarilmadi). To'liq end-to-end HTTP oqim sinaldi: taom tayyor → `unread`da tasdiqlanmagan holda ko'rindi → `POST /acknowledge` → javobda `acknowledged_by_name:"Administrator"` va `acknowledged_at` to'g'ri qaytdi → qayta chaqirilganda idempotent (o'zgarmadi). Test ma'lumotlari va eski test-artefaktlari tozalandi, production'ga iz qoldirilmadi.

## Holat — 2026-08-26: "Qabul qildim" tugmasi olib tashlandi — oddiy 15 soniyalik toast'ga qaytarildi

Foydalanuvchi darhol keyingi xabarda soddalashtirishni so'radi: **"15 soniya ko'rinsin, xolos"** — aniqlashtiruvchi savoldan keyin (`AskUserQuestion`) tanlangan variant: bildirishnoma 15 soniyadan keyin g'oyib bo'ladi, tugma/kim-ko'rgani funksiyasi butunlay olib tashlanadi. Demak yuqoridagi "Qabul qildim" bosqichi (doimiy kartochka + tugma + ism ko'rsatish) **shu sessiyaning o'zida qaytarib olindi** — endi eng birinchi ("faqat toast") versiyaga qaytdi, faqat davomiylik 3s emas 15s.

- **`public/app.js`** — `toast(message, type, durationMs=3000)` ga uchinchi (`durationMs`) parametr qo'shildi (boshqa barcha eski chaqiruvlar o'zgarishsiz, standart 3s qoladi). `pollWaiterNotifications()` sodda holatga qaytdi: `unread` so'raladi → bor bo'lsa `toast(..., 'ok', 15000)` (15 soniya) → darhol `POST /waiter/notifications/read` bilan o'qilgan deb belgilanadi. Butun kartochka-ro'yxat mexanizmi (`ensureNotifList`, `renderWaiterNotifications`, `acknowledgeWaiterNotification`, `escapeHtmlNotif`) fayldan olib tashlandi.
- **`server/routes/waiterNotifications.js`** — `POST /:id/acknowledge` o'chirildi, o'rniga eski-oddiy `GET /unread` (`is_read=0` filtri) + `POST /read` (`{ids:[...]}`, `is_read=1` qiladi) qaytarildi.
- **`public/style.css`** — `.notif-list`/`.notif-card`/`.notif-card.done` qoidalari (endi ishlatilmaydi) olib tashlandi.
- **DB sxemasi ATAYLAB o'zgartirilmadi** — `notifications.acknowledged_at`/`acknowledged_by_name` ustunlari (va ularning migratsiyasi `server/db.js`da) bazada **qoladi**, lekin endi hech qanday so'rov ularni o'qimaydi/yozmaydi (o'lik ustunlar). SQLite'da ustun o'chirish qo'shimcha risk/murakkablik keltirgani uchun ataylab qilinmadi — zarari yo'q.
- **Tekshirilgan:** `node22 -c` ikkala o'zgargan JS faylda xatosiz, CSS qavs balansi (139/139) tekshirildi; `pm2 restart polat --update-env` xatosiz, restart soni faqat +1 ko'tarildi (crash-loop yo'q); to'liq end-to-end HTTP oqim sinaldi (taom tayyor → `unread`da chiqdi → eski `/acknowledge` endi **404** → `POST /read` bilan belgilangach `unread` bo'shab qoldi). Test ma'lumotlari tozalandi; tekshiruv paytida bazada haqiqiy (foydalanuvchining o'zi ochgan) `open` buyurtma borligi payqalib, unga tegilmadi — keyinroq foydalanuvchining o'zi tomonidan yopilgani (`open orders: 0`) alohida tasdiqlandi.

## Holat — 2026-08-26: "Qabul qildim" tugmasi DARHOL qaytarib qo'yildi

Yuqoridagi soddalashtirishdan bir necha daqiqa o'tib foydalanuvchi "afitsiantda nega qabul qilish tugmasi yo'qolib qoldi, qaytar" dedi — demak oxirgi so'rov ("15 soniya ko'rinsin") aslida tugmani yo'qotishni emas, faqat qo'shimcha vaqt cheklovini nazarda tutgan ekan (yoki fikr o'zgardi). Shu sabab **darhol shu sessiyaning o'zida** "Qabul qildim" bosqichi (yuqoridagi "afitsiant bildirishnomasi endi 'Qabul qildim' tugmasi bilan tasdiqlanadi" bo'limidagi holat) so'zma-so'z qaytarildi: `server/routes/waiterNotifications.js` (30s grace-oynali `GET /unread` + `POST /:id/acknowledge`), `public/app.js` (`ensureNotifList`/`renderWaiterNotifications`/`acknowledgeWaiterNotification`/`escapeHtmlNotif` — kartochka + tugma + "✅ &lt;Ism&gt; qabul qildi"), `public/style.css` (`.notif-list`/`.notif-card`) — barchasi tiklandi. 15 soniyalik oddiy toast versiyasi (`durationMs` parametrli `toast()`, sodda `/read`) **butunlay bekor qilindi**.

- **Tasodifiy ijobiy tasdiq:** tozalash paytida bazada `acknowledged_by_name: "Johongir ALimov"` (haqiqiy afitsiant, id=4/`Johon0660`) yozuvi topildi — bu funksiya ilgari real ishlab turgan paytida haqiqiy xodim tomonidan chinakam "Qabul qildim" bosilganini tasdiqlaydi.
- **Yana bir marta eski-qoldiq tozalash:** soddalashtirilgan (faqat-toast) versiya faol bo'lgan qisqa oyna ichida yaratilgan 2 ta haqiqiy bildirishnoma (`is_read=1` lekin `acknowledged_at=NULL`, chunki o'sha paytda bu ustun ishlatilmagan edi) qaytarilgan versiyada yana "tasdiqlanmagan" bo'lib chiqib qolar edi — avvalgi holatdagi kabi `acknowledged_at=created_at`, `acknowledged_by_name='Tizim (eski yozuv)'` qilib retroaktiv yopib qo'yildi.
- **Tekshirilgan:** `node22 -c` xatosiz, CSS qavs balansi (144/144); `pm2 restart polat --update-env` xatosiz, jarayon barqaror **online**; `GET /unread` va `POST /:id/acknowledge` haqiqiy so'rov bilan qayta sinaldi (404 nonexistent id uchun, bo'sh ro'yxat tozalashdan keyin) — hammasi kutilganidek.

## Holat — 2026-08-26: afitsiant "Qabul qildim" bossa, taom oshpaz ekranidan yo'qoladi

Foydalanuvchi so'rovi: "Afitsiant qabul qilganidan keyin oshpazdan mahsulot yo'qolsin." Avval oshpazning `/chef/kitchen.html`sida taom "tayyor" deb belgilangandan keyin ham stol yopilguncha ro'yxatda qolib turardi (faqat tugma "🏁 Tayyor" → "✅ Tayyor"ga o'zgarardi). Endi to'liq halqa yopildi: oshpaz tayyor deydi → afitsiantga bildirishnoma → afitsiant "Qabul qildim" bosadi → o'sha taom **darhol oshpaz ro'yxatidan yo'qoladi** (kitchen ekrani 15s ichida keyingi pollda buni ko'radi).

- **Yangi bog'lanish:** `notifications.order_item_id` (nullable INTEGER, FK emas — SQLite ALTER bilan FK qo'shib bo'lmaydi, lekin ilova darajasida yetarli) — bildirishnoma qaysi aniq `order_items` qatoriga tegishli ekanini bildiradi. `server/routes/chefKitchen.js`dagi "tayyor" INSERT'iga `item.id` qo'shildi.
- **Yangi holat:** `order_items.picked_up_at` (nullable TEXT) — afitsiant "Qabul qildim" bosganda to'ldiriladi.
- **`server/routes/waiterNotifications.js`** — `POST /:id/acknowledge` endi bitta tranzaksiyada ikkalasini ham bajaradi: bildirishnomani tasdiqlaydi VA (agar `order_item_id` bo'lsa) mos `order_items.picked_up_at`ni belgilaydi.
- **`server/routes/chefKitchen.js`** — `GET /tables` filtri kengaytirildi: `it.sent_at && !it.picked_up_at` (avval faqat `it.sent_at`). Ya'ni taom endi ikki shartda ko'rinadi — yuborilgan VA hali "qabul qilinmagan".
- Ikkala yangi ustun ham `server/schema.sql`ga (yangi bazalar) va `server/db.js`dagi `migrateAddOrderItemPickedUpAt()`/`migrateAddNotificationOrderItemId()` (mavjud bazalar, idempotent `ALTER TABLE ADD COLUMN`) orqali qo'shildi — avvalgi crash-loop sababidan saboq olib, deploydan oldin `node22 -e "require('./server/db.js')"` bilan alohida sinaldi, xatosiz o'tgach `pm2 restart` qilindi.
- **Tekshirilgan:** `node22 -c` barcha o'zgargan fayllarda xatosiz; migratsiya oldindan alohida sinaldi, `pm2 restart polat --update-env` xatosiz, jarayon barqaror **online** (restart soni faqat +1). To'liq end-to-end HTTP oqim sinaldi: taom tayyor + yuborilgan holatda oshpaz ro'yxatida **bor** ekani tasdiqlandi → afitsiant tasdiqlagach oshpaz ro'yxatida **yo'q** (`items: []`) ekani tasdiqlandi. Test ma'lumotlari (stol/buyurtma/taom/bildirishnoma) to'liq hard-delete qilindi, production'dagi haqiqiy ma'lumotlarga tegilmadi.
