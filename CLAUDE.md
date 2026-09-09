# Po'lat restorani — buyurtma, hisob-kitob va mijozlar uchun landing tizimi

Repo ildizidagi asosiy `claude-code-web`dan **butunlay mustaqil** Node.js/Express 5 + better-sqlite3 veb-ilova (o'z `package.json`, o'z serveri, o'z SQLite bazasi — `data/polat.db`). `/root/vps/claudeweb/` uy papkasining o'zi ICHIDA joylashgan (`savdo-hisob`/`Post bot 10` kabi mustaqil loyiha), shuning uchun ACL izolyatsiyasiga to'liq mos.

Olti turdagi foydalanuvchi uchun mo'ljallangan:

1. **Mijoz (login shart emas)** — landing sahifa: menyuni ko'radi, har bir taomga miqdor (+/−) qo'shib savatga to'ldiradi, pastda suzuvchi savat panelidagi "Buyurtma berish" orqali olib ketish/yetkazib berish buyurtmasi beradi (yetkazib berishda ixtiyoriy ravishda brauzer GPS lokatsiyasini ham ulashishi mumkin), stol bron qiladi, restoran haqida ma'lumot va aloqa (manzil/xarita/telefon) ko'radi. (2026-09-08'gacha bu oqim faqat CSS darajasida tayyor edi, HTML/JS yo'q edi — pastdagi "Holat — 2026-09-08" bo'limiga qarang.)
2. **Afitsiant** — stollarni boshqaradi: buyurtma qo'shadi, hisob-kitob qilib chek chiqaradi.
3. **Oshpaz** — oshxona ekrani: band stollar va onlayn buyurtmalarni (endi olib ketish/yetkazib berish turi bilan) ko'radi, onlayn buyurtmani tasdiqlaydi/tayyor deb belgilaydi.
4. **Dastavkachi** (`courier`, 2026-09-08'da qo'shildi) — faqat yetkazib berish buyurtmalarini ko'radi (`/courier/orders.html`): mijoz ismi/telefoni/manzili, ixtiyoriy GPS xaritaga havola, taomlar ro'yxati; oshxona "tayyor" deb belgilagandan keyin **"🚚 Yetkazildi"** tugmasi bilan yetkazganini qayd etadi.
5. **Kassir** (`kassir`, 2026-09-09'da qo'shildi) — faqat hisob-kitob (`/kassir/tables.html`+`order.html`): stollarni ko'radi, joriy buyurtmani (faqat o'qish) ko'radi, "💳 Hisob-kitob qilish" bilan stolni yopib chek chiqaradi — taom qo'sha olmaydi/menyuni ko'rmaydi. Afitsiantning o'zi ham hamon stolni yopa oladi (ikkalasi bir-birini almashtirmaydi).
6. **Admin** — hamma narsani boshqaradi (menyu, stollar, xodimlar — endi dastavkachi/kassir rollari bilan, xarajat, bronlar, onlayn buyurtmalar — chek chiqarish bilan, hisobot).

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
  services/inventory.js  — Ombor (2026-09-07): mahsulot CRUD, kirim/chiqim (consume/release/adjustStock),
                           menyu bilan avtomatik sinxronizatsiya (InventoryError) — pastdagi "Holat" bo'limiga qarang
  routes/
    adminMenu.js, adminUsers.js, adminTables.js, adminExpenses.js, adminReports.js,
    adminReservations.js, adminCustomerOrders.js, adminInventory.js   — hammasi requireRole('admin')
    waiterTables.js, waiterMenu.js, waiterOrders.js — afitsiant (va admin) uchun
    chefKitchen.js                                  — oshpaz (va admin) uchun, faqat o'qish + onlayn buyurtma holati
    courierOrders.js                                — dastavkachi (va admin) uchun, 2026-09-08 (pastga qarang)
    deliveryAlerts.js                                — admin+oshpaz+dastavkachi BARAVAR ko'radigan "yangi yetkazib berish
                                                        buyurtmasi" bildirishnomasi, 2026-09-08 (pastga qarang)
    publicMenu.js, publicReservations.js, publicCustomerOrders.js — login SHART EMAS (mijoz uchun)
public/
  login.html            — barcha xodim (admin/afitsiant/oshpaz/dastavkachi) uchun yagona kirish sahifasi
  app.js, style.css      — xodim sahifalari uchun umumiy (fetch wrapper, nav, toast, formatlash, chek/QZ Tray
                           infratuzilmasi — dine-in HAM, mijoz buyurtmasi HAM) — qorong'i/oltin uslub
  admin/                — index, menu, tables, waiters ("Xodimlar"), expenses, reservations,
                           customer-orders (endi "🖨 Chek" tugmasi + 15s avto-yangilanish bilan),
                           reports, inventory ("Ombor") — har biri .html + .js
  waiter/                — tables, order, receipt
  chef/                  — kitchen.html + kitchen.js (15s'da avtomatik yangilanadi, endi olib ketish/yetkazib
                           berish turini ham ko'rsatadi)
  courier/               — orders.html + orders.js (2026-09-08, yangi — 15s'da avtomatik yangilanadi)
  landing/               — index.html, style.css, script.js — MIJOZLAR uchun, mustaqil dizayn tizimi
                           (terracotta/qora/oltin, Playfair Display + Poppins), login shart emas;
                           2026-09-08'dan to'liq ishlaydigan savat/checkout/lokatsiya bilan
data/polat.db            — SQLite fayli (gitignored, avtomatik yaratiladi)
```

## Ma'lumotlar bazasi (SQLite, `server/schema.sql`)

- **`users`** — `role` CHECK IN (`admin`, `waiter`, `chef`, `courier`). Hech qachon hard-delete qilinmaydi, faqat `is_active=0`.
- **`tables`** — restoran stollari (nom/raqam).
- **`menu_categories`** / **`menu_items`** — `is_active` (soft-delete) + `is_available` (tezkor "tugadi" belgisi). Bitta umumiy menyu — ham afitsiant, ham oshpaz, ham mijoz (landing) shu yerdan o'qiydi. `menu_categories.require_inventory_link` va `menu_items.inventory_item_id` — Ombor bilan bog'lanish (2026-09-07, pastga qarang).
- **`inventory_items`** / **`inventory_movements`** — Ombor (2026-09-07): suv/salfetka va shunga o'xshash sarflanadigan mahsulotlar qoldig'i + har bir kirim/chiqim harakati tarixi. To'liq tafsilot pastdagi "Holat — 2026-09-07: Ombor (inventory) tizimi" bo'limida.
- **`orders`** / **`order_items`** — afitsiant tomonidan stolga qo'shiladigan **dine-in** buyurtmalar. Bitta stolda bir vaqtning o'zida faqat bitta `open` buyurtma (qisman unikal indeks bilan DB darajasida kafolatlangan). Yopilganda `total_amount` hisoblanadi, chek (`getReceipt`) chiqariladi.
- **`expenses`** — kunlik xarajatlar (hisobotdagi sof foyda hisobi uchun).
- **`settings`** — key/value (hozircha ishlatilmayapti faol, kelajak uchun).
- **`reservations`** — landing'dagi "Stol bron qilish" oynasidan (login shart emas). `status`: new/confirmed/cancelled.
- **`customer_orders`** / **`customer_order_items`** — landing'dagi menyu+savat orqali kelgan **olib ketish/yetkazib berish** buyurtmalari (login shart emas, `orders`dan ATAYLAB alohida — bu yerda stol/afitsiant shart emas). `fulfillment`: pickup/delivery. `status`: new/confirmed/completed/cancelled — **diqqat, `completed` oshpaz tomonidan "taom tayyor" ma'nosida ishlatiladi, "yetkazib bo'lindi" degani EMAS** (pastdagi "Holat — 2026-09-08" bo'limidagi bug fix'ga qarang). `location_lat`/`location_lng` (2026-09-08) — mijoz brauzer Geolocation API orqali ixtiyoriy ulashgan GPS koordinata (yetkazib berishda). `delivered_at` (2026-09-08) — dastavkachi "🚚 Yetkazildi" bosgan vaqt, `status`dan ATAYLAB alohida ustun. Narx HAR DOIM serverda menu_items'dan qayta hisoblanadi, mijoz yuborgan narxga ishonilmaydi.

**Muhim migratsiya eslatmasi:** SQLite'da ustunning CHECK shartini to'g'ridan-to'g'ri ALTER qilib bo'lmaydi. `'chef'` roli qo'shilganda (2026-08-26) mavjud `users` jadvali `server/db.js`dagi `migrateAddChefRole()` orqali xavfsiz qayta qurilib ko'chirildi (yangi jadval → INSERT SELECT → DROP → RENAME, `foreign_key_check` bilan tekshirilib). Idempotent — har safar server ko'tarilganda CHECK'da `'chef'` bor-yo'qligini tekshiradi, bor bo'lsa hech narsa qilmaydi. Kelajakda yana shunga o'xshash CHECK o'zgarishi kerak bo'lsa, shu funksiyani namuna sifatida ishlating.

## Rollar va ruxsatlar (`server/auth.js`)

- Cookie: `polat_session` (HMAC-SHA256 imzolangan, `HttpOnly`, `SameSite=Lax`, `TRUST_PROXY=1` bo'lgani uchun HTTPS orqali `Secure` ham qo'shiladi).
- `OPEN_PATHS` + `/landing/*` — login shart emas.
- `requireAuth`: `/admin/*`, `/chef/*`, `/waiter/*`, `/courier/*` (va mos `/api/*`) — har biri faqat o'z roliga ochiq, **admin hammasiga kira oladi**. Boshqa rol hududiga kirishga urinilsa avtomatik o'z "uy" sahifasiga qaytariladi (`homeForRole()`).
- `requireRole(role|role[])` — bitta rol yoki massiv qabul qiladi (masalan `requireRole(['admin','chef'])`).
- Parol: `scrypt` (tuz + `timingSafeEqual`), minimal uzunlik **6 belgi** (2026-08-26'da 4'dan oshirildi).

## Asosiy oqimlar

**Afitsiant (dine-in):** `/waiter/tables.html` (stollar tarmog'i, bo'sh/band) → stolga kirib menyudan taom qo'shadi (`/waiter/order.html`, har bosilgan "+" alohida `order_items` qatori sifatida qo'shiladi, lekin oshpazga DARHOL yubormaydi — "Kutilmoqda" belgisi bilan ro'yxatda turadi) → hammasini yig'ib bo'lgach **"🍽️ Oshxonaga yuborish"** tugmasi (faqat hali yuborilmagan taom bo'lsa ko'rinadi, sonini ko'rsatadi) → shu paytgacha yig'ilgan taomlarning HAMMASI bitta paytda oshpazga ko'rinadigan bo'ladi → keyinroq yana taom qo'shilsa, xuddi shu tsikl takrorlanadi (yana "Kutilmoqda" → yana "Yuborish") → **"Hisob-kitob"** → stol yopiladi, chek chiqadi (`/waiter/receipt.html`, chop etish tugmasi bilan).

**Oshpaz:** `/chef/kitchen.html` — band stollar (taom+miqdor, faqat ko'rish) va onlayn buyurtmalar (olib ketish/yetkazib berish belgisi + ✅ Tasdiqlash / 🏁 Tayyor tugmalari bilan) ro'yxati, 15s'da avtomatik yangilanadi.

**Dastavkachi (2026-09-08):** `/courier/orders.html` — faqat `fulfillment='delivery'` (va bekor qilinmagan) buyurtmalar, 15s'da avtomatik yangilanadi. Har biri: mijoz ismi/telefoni/manzili, ixtiyoriy GPS xaritaga havola, taomlar, va oshxona "tayyor" (`status='completed'`) deb belgilagandan keyingina faollashadigan **"🚚 Yetkazildi"** tugmasi (`delivered_at` maydonini to'ldiradi — bekor qilib bo'lmaydi, idempotent himoyalangan).

**Mijoz (landing, `/landing/`):**
- **Hero** — restoran nomi, shior, "Stol bron qilish" (oyna/modal).
- **Menyu** — haqiqiy (admin kiritgan) kategoriya/taomlar, `−`/`+` bilan savatga qo'shiladi, pastda suzuvchi savat paneli, "Buyurtma berish" → checkout oynasi (ism/telefon/olib ketish yoki yetkazib berish/manzil/izoh) → `POST /api/public/orders`.
- **Galereya, Biz haqimizda, Aloqa** (manzil/xarita/ish vaqti/telefon) — statik kontent (Unsplash surat manzillari, real suratlar bilan almashtirish mumkin).
- Header'da **"Xodim kirishi"** — `/login.html`ga o'tadi.

**Admin:** barcha bo'lim — Bosh sahifa (band stollar + kunlik statistika), Menyu, Stollar, **Xodimlar** (admin/afitsiant/oshpaz/**dastavkachi** yaratish — rol tanlanadi), Xarajat, **Bronlar**, **Buyurtmalar** (onlayn, 15s avto-yangilanadi, 🖨 Chek/✅/🏁/❌/🗑 bilan — yetkazib berish buyurtmasi "tayyor" bo'lgandan keyin `delivered_at`ga qarab "🚚 Yetkazilishi kutilmoqda"/"✅ Yetkazildi" deb aniq ko'rsatiladi), **Ombor** (2026-09-07 — suv/salfetka va h.k. qoldig'i, kirim/chiqim, tarix, menyu bilan avtomatik bog'lanish), Hisobot.

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

## Holat — 2026-09-07: Ombor (inventory) tizimi qo'shildi

Foydalanuvchi so'rovi bilan bitta uzun sessiyada (bir nechta ketma-ket so'rov orqali, qadam-baqadam) yangi **Ombor** bo'limi qurildi: suv/salfetka va shunga o'xshash sarflanadigan mahsulotlar qoldig'ini boshqarish, menyu bilan avtomatik bog'lanish (narx/mavjudlik/ko'rinish), va bu bog'lanishni to'liq ikki tomonlama (ombor → menyu, menyu → ombor) qildi.

**1. Asosiy CRUD + kirim/chiqim (`server/services/inventory.js`, yangi fayl):**
- Yangi jadvallar: `inventory_items` (`name`, `unit`, `quantity`, `low_stock_threshold`, `cost_price`, `sale_price`, `volume`, `is_active`) va `inventory_movements` (append-only tarix — `delta`, `reason` CHECK IN `restock/adjustment/order/return`, `note`, `order_item_id`/`customer_order_item_id`, `created_by`, `created_at`).
- `menu_items.inventory_item_id` (nullable, FK emas — SQLite ALTER cheklovi, ilova darajasida bog'lanish) — bitta menyu taomini bitta ombor mahsulotiga ixtiyoriy bog'laydi. Bir nechta menyu taomi bitta ombor mahsulotiga bog'lanishi CHEKLANMAGAN.
- `InventoryError` (OrderError bilan bir xil naqsh, `status` maydoni bilan) — `routeUtils.js`dagi `asyncRoute()` avtomatik to'g'ri HTTP kod bilan qaytaradi.
- `adminInventory.js` (`/api/admin/inventory/*`, `requireRole('admin')`): `GET/POST /items`, `PUT/DELETE /items/:id`, `POST /items/:id/adjust` (kirim/chiqim), `GET /items/:id/movements` (tarix).
- **O'chirish naqshi** boshqa jadvallar bilan bir xil: harakat tarixi (`inventory_movements`) yo'q bo'lsa hard-delete, bor bo'lsa faqat `is_active=0` (soft-delete) + unga bog'langan menyu taomlari avtomatik "uziladi" (`inventory_item_id=NULL`).

**2. Menyu bilan avtomatik sinxronizatsiya (bir tomonlama, ombor → menyu, "yagona manba" tamoyili):**
- **Mavjudlik:** `syncMenuAvailability()` — bog'langan taomning `is_available`i endi QO'LDA emas, ombor qoldig'idan hisoblanadi (qoldiq>0 => mavjud, 0 => "tugadi"). `adminMenu.js`dagi `PATCH /items/:id/availability` bog'langan taom uchun **rad etiladi** (400, "Ombor bo'limidan boshqaring").
- **Narx:** `syncMenuPricing()` — bog'langan taomning `price`i ombor mahsulotining `sale_price`idan olinadi. `adminMenu.js`dagi `POST/PUT /items` bog'langan holatda **mijoz/admin yuborgan narxni butunlay e'tiborsiz qoldiradi** (server tomonda majburan ombor narxi qo'yiladi — hatto qasddan boshqa narx yuborilsa ham, curl bilan sinalgan). `cost_price` (tan narxi) hech qachon menyu javoblarida chiqmaydi — faqat Ombor sahifasida (admin-only).
- Admin panelida (`public/admin/menu.js`) bog'langan taom uchun "mavjud" checkbox o'rniga `📦 <ombor nomi> (<hajm>): <qoldiq> <birlik>` badge, narx maydoni esa ombor mahsuloti tanlanganda avtomatik to'ldirilib **readonly** bo'lib qoladi (`applyInventoryPriceLock()`).

**3. Buyurtma paytida avtomatik kamayish/qaytarish (`server/services/orders.js`, `publicCustomerOrders.js`, `adminCustomerOrders.js`):**
- Afitsiant taom qo'shsa (`addItemToTable`) — bog'langan bo'lsa `inventory.consume()` chaqiriladi (yetarli qoldiq bo'lmasa `InventoryError` — butun tranzaksiya, order_item qo'shilishi bilan birga, bekor bo'ladi).
- Miqdor o'zgarsa (`updateOrderItemQuantity`) — faqat FARQ (delta) ombordan ayiriladi/qaytariladi.
- Taom bekor qilinsa (`cancelOrderItem`) — to'liq miqdor omborga qaytariladi (`release()`), qayta bekor qilishdan himoyalangan.
- Mijoz (landing) buyurtmasi (`publicCustomerOrders.js`) — xuddi shunday `consume()`, yetarli qoldiq bo'lmasa xatolik.
- Admin mijoz buyurtmasini `cancelled`ga o'zgartirsa yoki hali yakunlanmagan buyurtmani o'chirsa (`adminCustomerOrders.js`) — ombor qoldig'i avtomatik qaytariladi (`returnStockForCustomerOrder()`).
- Barcha harakatlar `inventory_movements`ga yoziladi (`reason='order'`/`'return'`) — Ombor sahifasidagi **"📜 Tarix"** oynasida ko'rinadi.

**4. "Tugadi" ko'rinishi — oldin butunlay yashirilardi, endi belgi bilan ko'rsatiladi:**
- `publicMenu.js`/`waiterMenu.js` avval `is_available=1` filtri bilan tugagan taomlarni ro'yxatdan butunlay olib tashlar edi (mijoz/afitsiant nega yo'qolganini bilmasdi) — endi filtr olib tashlandi, `is_available` maydoni item bilan birga qaytadi.
- Frontend (`public/waiter/order.js`, `public/landing/script.js`) — tugagan taom endi ko'rinadi, lekin xira (`opacity`) va qizil **"Tugadi"** belgisi bilan, afitsiant ekranida `+` tugmasi o'rniga `—` (disabled).

**5. Ombor mahsulotiga hajm (`volume`, masalan suv uchun "0.5L"/"1L") va tan narx/sotuv narx (`cost_price`/`sale_price`) qo'shildi** — Ombor sahifasidagi formada so'raladi, ro'yxatda ko'rsatiladi (foyda/birlik hisoblab chiqiladi), menyu tanlash select'ida ("Suv (0.5L) — 5 dona") va bog'langan taom badge'ida ("📦 Suv (0.5L): 5 dona") ko'rinadi.

**6. Kirim/chiqim UX — avval bitta chalkash "± Qoldiq" (musbat=kirim/manfiy=chiqim bitta maydonda) tugmasi bor edi, endi ikkiga ajratildi:** **"📥 Kirim"** (aniq **"Necha dona keldi?"** so'raydi, faqat musbat son) va **"📤 Chiqim"** (**"Necha dona ketdi?"**) — ishora ichkarida avtomatik qo'yiladi. **"📜 Tarix"** tugmasi — har bir mahsulot uchun barcha kirim/chiqim/buyurtma-orqali-sarflangan/qaytgan harakatlarni (sana, miqdor, sabab, izoh, kim) ro'yxat qilib ko'rsatadi (`GET /items/:id/movements`).

**7. Kategoriya darajasida "faqat ombor bilan bog'langan taomlar ko'rinsin" qoidasi (`menu_categories.require_inventory_link`):** yoqilgan kategoriyada (masalan "Ichimliklar") ombor bilan bog'lanmagan taomlar mijoz/afitsiant menyusida **butunlay yashirin** turadi (`publicMenu.js`/`waiterMenu.js` filtri), admin panelida esa baribir ko'rinadi — "🚫 Yashirin (ombor yo'q)" belgisi bilan. Admin panelida kategoriya modaliga checkbox qo'shildi, kategoriya kartasida "📦 Faqat ombor" badge chiqadi.

**8. Real production bug topildi va tuzatildi — "omborga yangi qo'shilgan ichimliklar menyuda chiqmayapti":** 6-bosqichgacha ombor mahsuloti qo'shish **avtomatik** menyu taomi yaratmasdi — admin qo'lda Menyu bo'limiga o'tib, alohida taom yaratib, ombor bilan bog'lashi kerak edi (foydalanuvchi buni bilmagani uchun yangi qo'shgan "Flavis"/"Dena" ichimliklari menyuda ko'rinmay qoldi). Tuzatish: `inventory.createItem()`/`updateItem()`ga ixtiyoriy `menu_category_id` parametri qo'shildi — berilsa, `ensureMenuLink()` shu ombor mahsuloti asosida (nomi/hajmi/sotuv narxi bilan) menyu taomini **darhol** yaratib bog'laydi (allaqachon bog'langan bo'lsa jim o'tkazib yuboriladi — dublikat yaratilmaydi). Ombor formasiga **"Menyuda ko'rsatish"** bo'lim tanlash maydoni qo'shildi (`public/admin/inventory.html`/`.js`) — bog'lanmagan mahsulotlar uchun ro'yxatda qizil **"Menyuda yo'q"** belgisi chiqadi. Production'dagi "Flavis"/"Dena" shu funksiya orqali retroaktiv Ichimliklar bo'limiga bog'lab qo'yildi.

**Migratsiyalar** (`server/db.js`, hammasi idempotent `ALTER TABLE ADD COLUMN`/yangi `CREATE TABLE IF NOT EXISTS`): `migrateAddMenuItemInventoryLink()`, `migrateAddInventoryPricing()`, `migrateAddInventoryVolume()`, `migrateAddCategoryInventoryRequirement()` — har biri alohida `pm2 restart` bosqichida production bazasida xatosiz o'tgani tasdiqlangan (`polat-error.log`ning eng oxirgi yozuvi hamon 2026-08-26'dagi eski, oldindan ma'lum bug — bu sessiyada YANGI xato qo'shilmagani shu orqali tasdiqlangan).

**Tekshirilgan (har bosqichda):** `node22 -c` barcha yangi/o'zgargan JS faylda xatosiz; schema.sql `:memory:` bazada `foreign_keys=ON` bilan sinalgan; har migratsiya production `data/polat.db`ning **haqiqiy nusxasida** oldindan sinalgan; to'liq end-to-end HTTP oqimlar (ombor yaratish → menyuga bog'lash → buyurtma bilan kamayish → tugash → bekor qilish bilan qaytish → narx sinxronizatsiyasi → kategoriya filtri → avto-bog'lash) curl orqali qadamma-qadam tasdiqlangan, har safar test yozuvlari (`inventory_items`/`inventory_movements`/vaqtinchalik `menu_items`/`orders`) to'liq hard-delete qilib tozalangan, production ma'lumotlariga (Pepsi/Flavis/Dena va ularning haqiqiy zaxirasi) tegilmagan. Har bir bosqichdan keyin `pm2 restart polat --update-env` — jarayon barqaror **online**, crash-loop yo'q.

## Holat — 2026-09-07: chek chop etilgach admin avtomatik o'z bo'limiga qaytariladi

Foydalanuvchi so'rovi: "admin chekni chop etgandan so'ng avto ortga qaytsin administrator bo'limiga". Kontekst — chek amalda faqat ADMIN tomonidan chop etiladi: afitsiant stolni yopganda (`order.js`dagi `closeBtn`) chek endi o'zida chop etilmaydi (printer faqat administrator kompyuteriga ulangan), server buni `print_requests` navbatiga yozadi, admin panelidagi bildirishnoma kartasi (`app.js`dagi `renderPrintRequests()`) `../waiter/receipt.html?order=...`ni **yangi tabda** (`target="_blank"`) ochadi; shu bilan bir qatorda `admin/reports.js`dagi "Chek" havolasi ham xuddi shu sahifaga (bu safar xuddi shu tabda) olib boradi. Avval chek chop etilgach (QZ Tray yoki fallback brauzer chop etish) sahifada hech narsa avtomatik sodir bo'lmasdi — faqat afitsiant uchun mo'ljallangan "Stollarga qaytish" havolasi bor edi (admin uchun mantiqsiz).

- **`public/waiter/receipt.js`** — yangi `returnToAdminAfterPrint()`: `GET /api/me` orqali joriy foydalanuvchi rolini so'raydi, faqat `role === 'admin'` bo'lsa davom etadi (afitsiant to'g'ridan-to'g'ri shu sahifaga kirib qolsa — kamdan-kam holat — hech narsa o'zgarmaydi). `toast()` bilan xabar ko'rsatib, so'ng: agar sahifa yangi tab sifatida ochilgan bo'lsa (`window.opener` bor) — shu tabni `window.close()` bilan yopadi (natijada admin allaqachon ochiq turgan asosiy admin tabiga "qaytadi"); yopib bo'lmasa (masalan Hisobot sahifasidan xuddi shu tabda ochilgan holat) — `document.referrer` `/admin/` ichida bo'lsa o'sha sahifaga, aks holda `../admin/index.html`ga yo'naltiradi.
- Bu funksiya ham asosiy **"Chekni chop etish"** (QZ Tray, `chekChopEtish()` muvaffaqiyatli tugagach) tugmasidan, ham **"Oddiy (brauzer) chop etish"** havolasidan (`window.print()` + `afterprint` hodisasi) keyin ishga tushadi — ikkala chop etish yo'li ham bir xil xatti-harakatga ega.
- **Tekshirilgan:** `node22 -c public/waiter/receipt.js` xatosiz; `pm2 restart polat --update-env` xatosiz, jarayon barqaror **online** (crash-loop yo'q). Haqiqiy brauzerda QZ Tray orqali chop etish (Windows admin kompyuterida) hali sinalmagan — kod darajasida va syntaksis jihatidan tekshirilgan, funksional tasdiqni admin real ishlatganda berish tavsiya etiladi.

## Holat — 2026-09-07: admin'ga "hisob-kitob qilindi" bildirishnomasi tezlashtirildi

Foydalanuvchi so'rovi: "hisobot habari tezroq kelsin" — aniqlashtiruvchi savoldan (`AskUserQuestion`) so'ng bu admin panelidagi **"chek chop etish" bildirishnomasi** (`pollPrintRequests()`, `public/app.js`) ekani tasdiqlandi (afitsiant/oshpaz "taomi tayyor" bildirishnomasi emas).

- **`public/app.js`, `initAdminPrintRequests()`** — `setInterval(pollPrintRequests, ...)` intervali **10000ms → 3000ms**ga tushirildi. Endi afitsiant stolni yopgandan keyin admin ekranida bildirishnoma ko'pi bilan ~3 soniyada (avval ~10 soniyagacha) chiqadi.
- Afitsiant→oshpaz yo'nalishidagi boshqa poll (`pollWaiterNotifications`, "taomi tayyor" xabari) — **o'zgartirilmadi**, 10s'da qoladi (so'rov faqat admin bildirishnomasiga oid edi).
- Statik `public/` fayli — build bosqichi yo'q, Express to'g'ridan-to'g'ri diskdan xizmat qiladi, `pm2 restart` shart emas (brauzerda hard-refresh yetarli). Faqat `node22 -c` bilan sintaksis tekshirildi.

## Holat — 2026-09-07: chek chop etish endi yangi oyna/tab OCHMAYDI (modal)

Foydalanuvchi so'rovi: "chek chqarish uchun har safar yangi oyna ochmasin". Aniqlashtiruvchi savoldan (`AskUserQuestion`) so'ng "modal oyna" varianti tanlandi: hech qanday yangi tab/window ochilmasin, chek shu (admin) sahifaning o'zida popup-modal ko'rinishida chiqib, o'sha yerdan chop etilsin.

**Avvalgi holat:** admin panelidagi "chop etish kutilmoqda" bildirishnomasi (`renderPrintRequests()`, `public/app.js`) va Hisobot bo'limidagi "Chek" havolasi (`admin/reports.js`) ikkalasi ham `/waiter/receipt.html?order=...`ga (alohida sahifa, birinchisi `target="_blank"` bilan yangi tabda) navigatsiya qilardi — QZ Tray kutubxonasi va chop etish mantig'i faqat o'sha sahifada (`public/waiter/receipt.js`) mavjud edi.

**Yangi holat — QZ Tray/chek mantig'i `public/app.js`ga (umumiy fayl) ko'chirildi**, endi hech qaysi tugma navigatsiya qilmaydi:

- **`loadQzTray()`** — QZ Tray kutubxonasini (`qz-tray.js`, CDN) faqat kerak bo'lganda (chek birinchi marta chop etilayotganda) dinamik `<script>` bilan "lazy" yuklaydi — har bir admin sahifa yuklanishida oldindan yuklanmaydi.
- **`setupQzSecurity()`, `padReceiptLine()`, `buildEscPosReceipt()`** — `receipt.js`dan bir xilda ko'chirilgan (o'zgarishsiz mantiq).
- **`ensureReceiptModal()` / `renderReceiptBox()` / `showReceiptModal(view)`** — mavjud `.modal-backdrop`/`.modal`/`.modal-actions` CSS naqshidan (customConfirm/showInfoModal bilan bir xil) foydalanib, chekni (`.receipt` klassi, xuddi shu dizayn) modal ichida ko'rsatadi, "Chekni chop etish" va "Yopish" tugmalari bilan.
- **`printReceiptView(view)`** — QZ ulanish + chop etish (avvalgi `chekChopEtish()` mantig'i, endi sahifa-agnostik funksiya sifatida).
- **`openReceiptByOrderId(orderId)`** — `GET /api/waiter/orders/:id/receipt`ni chaqirib, `showReceiptModal()`ni ko'rsatadi (admin `/api/waiter/*`ga kira oladi — `server/auth.js`dagi rol qoidasi bo'yicha).
- **`renderPrintRequests()`** — endi `<a href=... target="_blank">` o'rniga oddiy `<button>`, bosilganda `markPrintRequestPrinted()` (avvalgidek darhol navbatdan olib tashlaydi) VA `openReceiptByOrderId()` (modalni ochadi) ikkalasi ham chaqiriladi — sahifa hech qayerga ketmaydi.
- **`admin/reports.js`**dagi "Chek" havolasi ham xuddi shunday `<button data-order-id>`ga almashtirildi, bosilganda `openReceiptByOrderId()` chaqiriladi.
- **`public/waiter/receipt.html`/`receipt.js` o'zgartirilmadi, o'chirilmadi** — endi ilova ichidan hech qaysi tugma unga havola bermaydi (orphan holatga o'tdi), lekin fayl mustaqil ishlayveradi — kelajakda to'g'ridan-to'g'ri URL (`/waiter/receipt.html?order=X`) orqali qo'lda ochish hali ishlaydi (zaxira/troubleshooting uchun zarar keltirmaydi, shuning uchun ataylab o'chirilmadi).
- Oldingi sessiyada (yuqoridagi "chek chop etilgach admin avtomatik o'z bo'limiga qaytariladi" bo'limi) qo'shilgan `receipt.js`dagi `returnToAdminAfterPrint()` endi ishlatilmaydi (chunki navigatsiya umuman yo'q — modal shunchaki yopiladi) — lekin o'zi ishlatilayotgan joyda (`receipt.html`ning mustaqil ochilishi) hamon to'g'ri ishlayveradi, shu sabab olib tashlanmadi.
- **Tekshirilgan:** `node22 -c` ikkala o'zgargan faylda (`app.js`, `admin/reports.js`) xatosiz, CSS qavs balansi (157/157) tekshirildi; `pm2 restart polat --update-env` xatosiz, jarayon barqaror **online** (restart soni faqat +1, crash-loop yo'q). **Haqiqiy brauzerda QZ Tray orqali modal ichidan chop etish (Windows admin kompyuterida, jismoniy printer bilan) hali amalda sinalmagan** — kod/sintaksis darajasida tekshirilgan, birinchi haqiqiy foydalanishda tasdiqlab qo'yish tavsiya etiladi.

## Holat — 2026-09-07: "chek yuklanmayapti" — haqiqiy production bug topildi va tuzatildi

Foydalanuvchi darhol keyingi xabarda "tekshir chek yuklanmayapti" dedi. Sabab — yuqoridagi modal o'zgarishida `public/app.js`ga QZ Tray mantig'i ko'chirilganda, u yerda `let qzSecuritySetUp = false;` va `function buildEscPosReceipt(view)` deb e'lon qilingan edi — lekin **xuddi shu nomlar** allaqachon `public/waiter/receipt.js`da ham bor edi (o'sha sahifa `../app.js`ni HAM, `receipt.js`ni HAM ketma-ket ulaydi). Ikkala `<script>` bitta HTML sahifada bo'lgani uchun ularning top-level `let`/`const` e'lonlari BITTA umumiy lexical scope'ni bo'lishadi — natijada brauzerda `receipt.html` ochilganda **`SyntaxError: Identifier 'qzSecuritySetUp' has already been declared`** paydo bo'lib, `receipt.js`ning BUTUN fayli parse bosqichida ishga tushmay qolardi. Bu esa faylning eng ohiridagi `document.addEventListener('DOMContentLoaded', load)` qatori HECH QACHON chaqirilmasligini anglatardi — demak chek ma'lumoti hech qachon so'ralmas, sahifa boshlang'ich statik **"Yuklanmoqda..."** matnida abadiy qotib qolardi. (`function` e'lonlari — masalan ikkalasida ham bo'lgan `buildEscPosReceipt` — xuddi shu tarzda to'qnashmaydi, faqat `let`/`const` uchun bu qat'iy SyntaxError.)

- **Aniqlash usuli:** avval koddagi barcha yangi funksiyalarni real Node.js `vm` konteksti orqali ikkala skriptni ("app.js" so'ng "receipt.js") ketma-ket bitta lexical scope'da `vm.runInContext()` bilan ishga tushirib, brauzerdagi real vaziyat qayta hosil qilindi — shu orqali `SyntaxError: Identifier 'qzSecuritySetUp' has already been declared` xatosi tasdiqlandi (avval alohida `node22 -c` — faqat bitta faylni tekshiradi, shu sabab bunday kesishma xatoni umuman ko'rsatmaydi).
- **Tuzatish — `public/waiter/receipt.js`:** endi umumiy QZ Tray mantiqni (`setupQzSecurity`, `padLine`/`buildEscPosReceipt`, `qzSecuritySetUp`) o'zida TAKRORLAMAYDI — bularning barchasi `app.js`da bir marta ta'riflangan (`printReceiptView()`, `RECEIPT_PRINTER_NAME` va h.k.), `chekChopEtish()` endi shunchaki `await printReceiptView(lastView)`ni chaqiradi. Faqat shu sahifaga xos qismlar (`escapeHtml`, `renderReceipt`, `load`, `returnToAdminAfterPrint`) qoldi — bularning nomlari `app.js`dagi hech narsaga to'g'ri kelmaydi, xavfsiz.
- **Tekshirilgan:** `node22 -c` receipt.js'da xatosiz; yuqoridagi `vm.runInContext()` simulyatsiyasi endi ikkala skript ketma-ket yuklanganda **hech qanday xato bermasligini** tasdiqladi; haqiqiy HTTP orqali (`curl` bilan admin sifatida login qilib) `/waiter/receipt.html?order=38` 200 qaytardi, `/api/waiter/orders/38/receipt` to'g'ri JSON qaytardi, serverdan qaytgan `app.js`da `qzSecuritySetUp` 3 marta (o'z ichida, normal), `receipt.js`da esa endi 0 marta (olib tashlangani tasdiqlandi) uchrashini tekshirildi. `pm2 restart polat --update-env` xatosiz, jarayon barqaror **online** (crash-loop yo'q).
- **Saboq:** bir nechta `<script>` faylni bitta HTML sahifaga ulaganda, ular orasida `let`/`const` nom to'qnashuvi oddiy `node -c` (yagona fayl sintaksis tekshiruvi) bilan UMUMAN sezilmaydi — faqat ikkalasi HAQIQATDA bitta sahifada birga yuklanganda paydo bo'ladi. Kelajakda `app.js`ga umumiy funksiya/o'zgaruvchi qo'shilganda, uni ulaydigan har bir sahifa-maxsus skriptda (`receipt.js`, `order.js`, va h.k.) xuddi shu nom band emasligini tekshirish kerak.

## Holat — 2026-09-08: admin panel chap menyusi (sidebar) ochiladigan/yopiladigan drawer qilindi

Foydalanuvchi skrinshot bilan ko'rsatib so'radi: "shu tugmalar bo'limlarga kirganda [menyu] yopilsin, menyu bosilsa ochilsin" — ya'ni admin panel chap menyusi (Bosh sahifa/Menyu/Stollar/Xodimlar/Xarajat/Bronlar/Buyurtmalar/Ombor/Hisobot) har doim ochiq turishdan chiqib, tugma bilan ochiladigan/yopiladigan drawer'ga aylantirilishi kerak edi.

**Kontekst — bitta `#bottomNav` ikki rejimda ishlaydi (`public/style.css`):** <720px kenglikda (telefon) — pastki gorizontal ikonka-bar (o'zgartirilmadi); >=720px kenglikda (planshet/kompyuter/landshaft telefon — foydalanuvchi skrinshotidagi holat aynan shu) — chapdagi vertikal sidebar, avval **doim ochiq/sticky** edi (200px joy egallab, hech qachon yopilmasdi).

**O'zgarishlar (faqat >=720px rejimiga tegishli, mobil pastki bar tegilmadi):**
- **`public/style.css`** — `@media (min-width:720px)` ichidagi `.bottom-nav` endi `position: sticky` emas, `position: fixed` + `transform: translateX(-100%)` bilan standart holatda ekrandan chiqarilgan (kenglik 200px→240px, oqim/flow'dan chiqarilgan, shuning uchun `main` doim to'liq kenglikni egallaydi); `.bottom-nav.open` — `transform: translateX(0)`. Yangi `.nav-toggle-btn` (topbar'dagi "☰ Menyu" tugmasi, standart holatda `display:none`, faqat >=720px'da `inline-flex`) va `.nav-backdrop` (ochiq bo'lganda fonni qorong'ilashtiradigan, bosilsa yopadigan qatlam) qo'shildi.
- **`public/app.js`** — `initNav(activePage)` (allaqachon barcha 9 admin sahifaning o'z JS faylidan chaqirilib turadi) ichiga yangi `initNavToggle(nav)` qo'shildi: topbar'ga `#navToggleBtn` tugmasi va `#navBackdrop`ni dinamik yaratadi (`ensureNotifList()` bilan bir xil naqsh — 9 ta HTML faylni alohida tahrirlash shart bo'lmadi), tugma bosilsa `nav`/`backdrop`ga `.open` klassini almashtiradi, backdrop yoki istalgan nav-havola (`<a>`) bosilsa `.open`ni olib tashlaydi (menyu yopiladi).
- `--nav-h`ga bog'liq boshqa qoidalar (`.fab`, `.order-total-bar`) tekshirildi — ularning ikkalasida ham allaqachon `@media(min-width:720px)` ustida mustaqil `bottom` qiymati bor edi (sidebar joyiga bog'liq emas), shuning uchun bu o'zgarish ularga ta'sir qilmadi.

**Tekshirilgan:** `node22 -c app.js` xatosiz; `style.css`da qavslar balansi (163/163) teng; fayl egaligi `claudeweb:claudeweb`. Statik `public/` fayllari (build bosqichi yo'q) — `pm2 restart polat` shart emas, brauzerda hard-refresh yetarli. **Haqiqiy brauzerda vizual/interaktiv tekshiruv (tugma bosilganda ochilish, bo'lim tanlanganda yopilish, backdrop bosilganda yopilish) hali qilinmagan** — foydalanuvchi tomonidan amalda sinab ko'rish tavsiya etiladi.

## Holat — 2026-09-08: mijoz landing sahifasida savat/checkout (haqiqatan) ishga tushirildi

Loyiha hujjatida (yuqoridagi eski holatlar) va CSS'da (`public/landing/style.css`dagi `.cart-bar`, `.checkout-summary`, `.menu-qty`) savat/buyurtma oqimi ANCHADAN BERI "tayyor" deb yozib qo'yilgan edi, lekin tekshiruvda aniqlandiki HTML/JS tomoni umuman yo'q edi — mijoz menyuni faqat o'qiy olardi, "zakaz qilish" imkoniyati jismonan mavjud emas edi (faqat "Stol bron qilish" ishlardi). Backend (`server/routes/publicCustomerOrders.js`, `POST /api/public/orders`) esa allaqachon to'liq tayyor edi.

- **`public/landing/index.html`** — pastda suzuvchi savat paneli (`#cartBar`, jami son+summa+"Buyurtma berish") va "Stol bron qilish" bilan bir xil uslubdagi checkout modal (`#checkoutBackdrop` — ism/telefon/olib ketish yoki yetkazib berish tugmalari/manzil/izoh/savat xulosasi/muvaffaqiyat ekrani) qo'shildi.
- **`public/landing/script.js`** — har bir menyu qatoriga miqdor tugmalari (`−`/`+`, mavjud CSS'ga ulandi), savat holati (`cart` obyekti), checkout forma yuborilganda `POST ../api/public/orders`.
- **`public/landing/style.css`** — `.fulfillment-toggle`/`.fulfillment-opt` (olib ketish/yetkazib berish tanlovi) yangi qo'shildi.
- **Tekshirilgan:** `node22 -c` xatosiz, HTML `<div>` va CSS `{}` balansi teng. Statik fayl, `pm2 restart` shart emas.

## Holat — 2026-09-08: "Xaritada ko'rish" tugmasi (oq fon) + GPS lokatsiya (`location_lat`/`location_lng`)

Ikki alohida so'rov bilan: (1) checkout oynasida umumiy `.btn` uslubiga yangi **`.btn.light`** (oq fon, qora matn) varianti qo'shildi. (2) Yetkazib berish tanlanganda **"📍 Joylashuvni yuborish"** tugmasi — brauzer `navigator.geolocation.getCurrentPosition()` orqali GPS koordinatani so'raydi (ixtiyoriy, ruxsat berilmasa/xato bo'lsa buyurtma baribir manzil matni bilan davom etadi), muvaffaqiyatli bo'lsa buyurtma bilan birga `location_lat`/`location_lng` yuboriladi.

- **`server/schema.sql` + `server/db.js`** — `customer_orders`ga `location_lat`/`location_lng` (REAL, nullable) ustunlari, `migrateAddCustomerOrderLocation()` bilan mavjud bazaga ham qo'shildi.
- **`server/routes/publicCustomerOrders.js`** — qiymatlarni diapazon bo'yicha (-90..90/-180..180) tekshiradi, noto'g'ri bo'lsa jimgina e'tiborsiz qoldiradi.
- **`public/admin/customer-orders.js`** — lokatsiya bor bo'lsa "🗺 Xaritada ko'rish" (Google Maps) havolasi chiqadi.
- **Tekshirilgan:** migratsiya production bazada sinaldi, `pm2 restart` xatosiz, jarayon barqaror online.

## Holat — 2026-09-08: "Dastavka" (courier) roli qo'shildi

Yangi to'rtinchi xodim roli — faqat yetkazib berish buyurtmalarini ko'radigan/yetkazganini belgilaydigan dastavkachi.

- **`users.role` CHECK'ga `'courier'` qo'shildi** — `migrateAddChefRole()` bilan bir xil xavfsiz "jadval qayta qurish" naqshi (`migrateAddCourierRole()`, SQLite CHECK'ni to'g'ridan-to'g'ri ALTER qilib bo'lmagani uchun).
- **`customer_orders.delivered_at`** (nullable TEXT) — dastavkachi "Yetkazildi" bosgan vaqt. **ATAYLAB `status`dan alohida** — `status='completed'` allaqachon oshpaz tomonidan "taom tayyor" ma'nosida band (`server/routes/chefKitchen.js`), ikkalasini bitta ustunga sig'dirish chalkashlikka olib kelardi.
- **`server/routes/courierOrders.js`** (yangi, `requireRole(['admin','courier'])`) — `GET /orders` (fulfillment='delivery', bekor qilinmagan), `PUT /orders/:id/deliver` (faqat `status='completed'` bo'lsa ruxsat, ikki marta bosib bo'lmaydi — idempotent himoya).
- **`server/auth.js`** — `homeForRole('courier') → '/courier/orders.html'`, `/courier/*`+`/api/courier/*` hudud ajratildi.
- **`public/courier/orders.html`+`orders.js`** (yangi) — 15s avto-yangilanadi, har buyurtmada mijoz/telefon/manzil/xarita havolasi/taomlar, pastda **yonma-yon 2 ustunda** "🗺 Xaritada ko'rish" (oq tugma) + "🚚 Yetkazildi" (faqat oshxona tayyor deganda faollashadi).
- **`public/admin/waiters.js`/`waiters.html`** — "Xodimlar" bo'limida yangi foydalanuvchi yaratishda **"Dastavka"** roli tanlov sifatida qo'shildi (`ROLE_LABEL`/`ROLE_BADGE`).
- **`server/routes/adminUsers.js`** — rol validatsiya massiviga `'courier'` qo'shildi.
- **Tekshirilgan (production bazaga qarshi, to'liq oqim bilan):** migratsiya ikkalasi ham xatosiz; test dastavkachi hisobi bilan login → admin API'ga kirish urinishi to'g'ri **403** → tayyor bo'lmagan buyurtmani yetkazishga urinish rad etildi → admin tasdiqlab/tayyor deb belgilagach dastavkachi muvaffaqiyatli "yetkazdi" → ikkinchi marta urinish rad etildi. Barcha test ma'lumotlari tozalandi, `pm2 restart` xatosiz, jarayon barqaror online.

## Holat — 2026-09-08: yangi yetkazib berish buyurtmasi — admin+oshpaz+dastavkachiga BARAVAR bildirishnoma

Foydalanuvchi tasvirlagan jarayon: "mijoz yetkazib berishga buyurtma bersa, xabar oshpazga, administratorga va dastavkachiga borsin — dastavkachi admindan chekni oladi, keyin oshpazdan taomni olib yetkazadi." Buni ta'minlash uchun barcha uch rolga bir vaqtda ko'rinadigan bildirishnoma qo'shildi (afitsiant-oshpaz "taomi tayyor" bildirishnomasi bilan bir xil naqsh — poll + "Ko'rdim" tugmasi + ~30s grace-oyna).

- **`notifications.customer_order_id`** (nullable, `migrateAddNotificationCustomerOrderId()`) — mavjud `order_item_id` (dine-in'ga xos) bilan aralashib ketmasligi uchun ATAYLAB alohida ustun.
- **`server/routes/publicCustomerOrders.js`** — yangi **yetkazib berish** (delivery, pickup emas) buyurtmasi kelganda bir xil tranzaksiyada `notifications`ga `"🚚 Yangi yetkazib berish buyurtmasi: <ism> — <summa>"` yoziladi.
- **`server/routes/deliveryAlerts.js`** (yangi) — `GET /unread`, `POST /:id/acknowledge`; `server/index.js`da `requireRole(['admin','chef','courier'])` bilan ulandi (afitsiant kira olmaydi).
- **`public/app.js`** — yangi blok (`ensureDeliveryAlertList`/`renderDeliveryAlerts`/`pollDeliveryAlerts`/`initDeliveryAlerts`), `/admin/`, `/chef/`, `/courier/` sahifalarining barchasida 5s'da poll qiladi. **Alohida konteynerda** (`deliveryAlertList`, mavjud `notifList`dan farqli) — aks holda admin sahifasidagi "chek chop etish" bildirishnomalar ro'yxati bilan bir-birining innerHTML'ini almashtirib yuborardi.
- **Tekshirilgan:** to'liq end-to-end — test buyurtma → bildirishnoma yozildi → admin/test-oshpaz/test-dastavkachi barchasi ko'ra oldi → biri "Ko'rdim" bosgach boshqalari ~30s ichida "kim ko'rdi"ni ko'rdi (grace-oyna ishladi). Test ma'lumotlari tozalandi.

## Holat — 2026-09-08: adminda mijoz buyurtmasi uchun ham chek chiqarish qo'shildi

Ilgari `public/app.js`dagi QZ Tray termal printer infratuzilmasi (`buildEscPosReceipt`, `renderReceiptBox`, `showReceiptModal`) faqat afitsiantning dine-in (stol) hisob-kitobi uchun ishlardi. Endi bir xil infratuzilma mijoz online buyurtmalari (`customer_orders`) uchun ham ishlaydi.

- **`public/app.js`** — `renderReceiptBox`/`printReceiptView` endi `view.kind === 'customer'` bo'yicha ajratiladi (dine-in yo'li o'zgarmadi). Yangi `renderCustomerReceiptBox`, `buildEscPosReceiptCustomer`, `openCustomerReceiptModal(order)` — oxirgisi admin allaqachon yuklab olgan buyurtma obyektidan (items bilan birga) **hech qanday qo'shimcha API so'rovisiz** to'g'ridan-to'g'ri chek oynasini ochadi.
- **`public/admin/customer-orders.js`** — har bir buyurtma kartochkasiga **"🖨 Chek"** tugmasi qo'shildi.
- **Tekshirilgan:** funksiya nomlarida to'qnashuv yo'qligi tasdiqlandi (o'tgan safar xuddi shu turdagi to'qnashuv — "chek yuklanmayapti" — haqiqiy production bug bo'lgan edi, yuqoridagi "2026-09-07: chek yuklanmayapti" bo'limiga qarang); `renderCustomerReceiptBox`/`buildEscPosReceiptCustomer` Node `vm` konteksti orqali sinalib to'g'ri HTML/ESC-POS bayt chiqargani tasdiqlandi. **Haqiqiy termal printerga chop etish hali sinalmagan** (Windows/QZ Tray'ga bog'liq, faqat admin kompyuterida amalda tekshirish mumkin).

## Holat — 2026-09-08: 2 ta real bug topildi va tuzatildi (yetkazib berish oqimi)

Foydalanuvchi so'rovi bilan admin va oshpaz ekranlari yetkazib berish buyurtmasi bo'yicha tekshirildi, ikkita haqiqiy muammo aniqlandi (biri production bazadagi haqiqiy buyurtma — #9 — orqali tasdiqlandi):

1. **Admin — chalg'ituvchi "Bajarildi" belgisi:** oshpaz taomni "tayyor" deb belgilasa (`status='completed'`), admin "Buyurtmalar"da **"Bajarildi"** (tugadi) deb ko'rsatilardi — hatto dastavkachi hali yetkazmagan bo'lsa ham (`delivered_at` bo'sh), hech qanday ogohlantirishsiz. Tuzatish: `public/admin/customer-orders.js` — endi yetkazib berish buyurtmasi uchun asosiy belgi `delivered_at`ga qarab **"🚚 Yetkazilishi kutilmoqda"** (hali yo'q) yoki **"✅ Yetkazildi"** (bor) deb aniq ko'rsatiladi.
2. **Oshpaz — buyurtma turi umuman ko'rinmasdi:** `public/chef/kitchen.js`dagi onlayn buyurtmalar ro'yxati `fulfillment`ni (olib ketish/yetkazib berish) ko'rsatmasdi. Tuzatish: har qatorda endi **"Olib ketish"**/**"Yetkazib berish"** belgisi ham chiqadi.
3. **Admin — sahifa avtomatik yangilanmasdi:** "Buyurtmalar" sahifasi faqat ochilganda bir marta yuklanardi (oshpaz/dastavkachi ekranlaridan farqli o'laroq avto-yangilanish yo'q edi) — dastavka holati o'zgarishini ko'rish uchun F5 kerak edi. Tuzatish: oshpaz/dastavkachi bilan bir xil **15s** avto-yangilanish qo'shildi.

**Tekshirilgan:** ikkala render tuzatish ham Node `vm` konteksti orqali haqiqiy production ma'lumotlar (#8 — yetkazilgan, #9 — hali yetkazilmagan) bilan sinaldi, natija to'g'ri chiqdi. Statik fayllar, `pm2 restart` shart emas, baribir jarayon holati tekshirilib barqaror **online** ekani tasdiqlandi.

## Holat — 2026-09-08: mijoz landing sahifasi — brend/manzil/aloqa ma'lumotlari yangilandi + mobil navigatsiya bugi tuzatildi

Bir nechta ketma-ket kichik so'rov bilan `public/landing/index.html`/`style.css`/`script.js` mazmun va mobil navigatsiya jihatdan yangilandi:

- **Brend nomi butun saytda "Po'lat" → "Ziyo Famliy"ga o'zgartirildi** — nafaqat landing, balki barcha sahifa (`title`, footer, login, admin/afitsiant/oshpaz/dastavkachi panellari sarlavhalari, `manifest.json` `name`/`short_name`, chek chiqarish shablonlari — `public/app.js` va `public/waiter/receipt.js`dagi "Po'lat restorani" matnlari) — jami 19 ta faylda. **Ataylab tegilmagan:** xaritadagi (`landing/index.html`, `contact-map` iframe) Google Maps'ning haqiqiy joy nomi ("Shaurma Po'lat Lavash") — bu texnik URL parametri, o'zgartirilsa xarita ishlamay qolishi mumkin edi; shuningdek `server/migrate.js`dagi `restaurant_name: "Po'lat"` default seed qiymati va `server/schema.sql`/`package.json`dagi ichki izoh/tavsif — bular saytda ko'rinmaydigan backend/hujjat matnlari.
- **Manzil/joylashuv** — hero kicker "Toshkent · Fine dining" → "Farg'ona Quva · Fine dining"; "Manzil" qatori reverse-geocode orqali (Nominatim) aniqlangan haqiqiy manzilga — "Farg'ona viloyati, Quva tumani, Farg'ona halqa yo'li"ga; "Aloqa" bo'limidagi xarita iframe foydalanuvchi bergan haqiqiy Google Maps embed kodiga (`Shaurma Po'lat Lavash`, koordinata 40.5098512, 72.0861361) almashtirildi (`width`/`height` konteyner uchun `100%` qilib qoldirildi, `src`/`allowfullscreen`/`referrerpolicy` foydalanuvchi bergan holicha).
- **Telefon** — ikkita raqam (`+998916527771`, `+998985757574`) "Telefon" qatorida ikkalasi ham ko'rsatiladi; "Qo'ng'iroq qilish" tugmasi oxirgi so'rovga ko'ra `+998985757574`ga ulangan.
- **Ish vaqti** — "10:00–24:00" → "24/7".
- **"Bizning tarix" matni** — yangi sarlavha ("Yetti yildan ortiq davom etayotgan ishtiyoq") va matn (2019-yil, "Ziyo famliy", Quva tumani, "sifatli, halollik sertifikati bor mahsulotlar").
- **Oshpaz kartochkasi → "Bizning shior"** — "Bosh oshpaz — Alisher Qodirov" + shaxsiy iqtibos o'rniga "Bizning shior" yorlig'i va hero tagline matni ("Olov ustida pishirilgan taomlar, samimiy muhit va unutilmas kechqurun") qo'yildi (yonidagi rasm o'zgarishsiz qoldi).
- **Bug: header brend nomi 2 qatorga bo'linib, navigatsiya siqilib ketardi** — "Po'lat" (qisqa) o'rniga uzunroq "Ziyo Famliy" matni sig'may, `.header-inner`dagi flex elementlar (brend/nav/tugma) 860–1040px oraliq kenglikda siqilib matn ichki qatorlarga bo'linib ketayotgan edi. Tuzatish: `.brand`ga `white-space: nowrap; flex-shrink: 0;` qo'shildi, mobil/off-canvas navigatsiyaga o'tish chegarasi `860px → 1040px`ga oshirildi (shu oraliqda endi siqilish o'rniga avtomatik mavjud hamburger+to'liq ekranli yon panelga o'tadi).
- **Yon panelga yopish (×) tugmasi qo'shildi** — o'ng yuqori burchakda aylana shaklidagi `#navClose` tugmasi (`index.html`, `nav-links` ichida birinchi element), `script.js`da umumiy `closeNav()` funksiyasiga ulandi (hamburger va havola-bosilganda-yopish bilan bir xil mantiq).
- **Yon paneldagi barcha tugmalar (5 ta havola + "Xodim kirishi" + × yopish) bir xil ko'rinishga keltirildi** — bir xil pill-shakl chegara (`1px solid rgba(255,255,255,0.3)`, `border-radius:999px`), bir xil `padding: 10px 30px` va `font-size: 20px` (ilgari "Xodim kirishi" boshqacha, kichikroq — 12px shrift, boshqa border-rang — ko'rinardi, global `.nav-login` qoidasi mobil oynada override qilindi).

**Tekshirilgan:** har bosqichda `node -c` (JS sintaksis), CSS qavslar balansi va HTML `<div>` teglari soni tenglashtirilib tasdiqlandi. Barchasi statik `public/` fayllari (build bosqichi yo'q) — `pm2 restart polat` shart emas, brauzerda hard-refresh yetarli. **Haqiqiy brauzerda vizual tekshiruv (turli ekran kengliklarida, GPS/aloqa/xarita) hali to'liq qilinmagan** — foydalanuvchi skrinshotlar orqali bosqichma-bosqich tasdiqlagan holatlar bundan mustasno.

## Holat — 2026-09-08: admin menyuga taom qo'shganda/tahrirlaganda "Tan narxi" maydoni qo'shildi

Foydalanuvchi so'rovi: "admin menyu qo'shayotganda taom tan narxi bilan sotuvdagi narxini ham qo'sh" — ilgari `menu_items` jadvalida faqat sotuv narxi (`price`) bor edi, tan narx umuman saqlanmasdi (faqat Ombor bo'limidagi `inventory_items.cost_price`/`sale_price` — u ham faqat omborga bog'langan taomlar uchun). Endi HAR BIR menyu taomi (ombor bilan bog'langan yoki yo'q) uchun tan narx ixtiyoriy ravishda kiritilishi mumkin.

- **`server/schema.sql`** — `menu_items`ga yangi `cost_price INTEGER` ustuni (nullable — majburiy emas, admin har doim ham tan narxni bilmasligi mumkin).
- **`server/db.js`** — yangi `migrateAddMenuItemCostPrice()` (boshqa `menu_items` migratsiyalari bilan bir xil oddiy `ALTER TABLE ADD COLUMN` naqshi, idempotent), migratsiya ro'yxatiga qo'shildi.
- **`server/routes/adminMenu.js`** — `POST/PUT /items` endi `cost_price`ni qabul qiladi (`parseOptionalCostPrice()` — bo'sh/berilmagan bo'lsa `NULL`, aks holda manfiy bo'lmagan butun son, aks holda 400). Taom ombor mahsulotiga bog'langan bo'lsa (mavjud "narx" mantig'i bilan bir xil qoida) — `cost_price` ham admin/mijoz yuborgan qiymatga qaramay har doim `inventory_items.cost_price`dan majburan olinadi (yagona manba).
- **`server/routes/waiterMenu.js`** — avval `SELECT *` edi, endi aniq ustunlar ro'yxatiga o'zgartirildi (`cost_price` ATAYLAB chiqarib tashlangan) — tan narx **faqat admin panelida** ko'rinadi, afitsiant/mijoz (publicMenu.js allaqachon aniq ustun ro'yxati ishlatgani uchun xavfsiz edi) buni ko'rmaydi.
- **`public/admin/menu.html`/`menu.js`** — taom modalida "Sotuv narxi"dan oldin yangi **"Tan narxi (so'm, ixtiyoriy — faqat admin ko'radi)"** maydoni; ombor mahsuloti tanlansa (mavjud narx-qulflash mantig'i bilan bir xil) tan narx ham avtomatik to'ldirilib readonly bo'ladi. Admin ro'yxatida (taom nomi ostida) tan narx kiritilgan bo'lsa `(tan narxi X so'm, foyda Y so'm)` kichik matn ko'rsatiladi.
- **Tekshirilgan:** migratsiya avval `/tmp`dagi production baza nusxasida, so'ng haqiqiy bazada (`node22 -e "require('./server/db.js')"`) sinaldi — xatosiz, `cost_price` ustuni qo'shildi, mavjud qatorlar `cost_price=NULL` bilan qoldi (ma'lumot yo'qolmadi); `pm2 restart polat --update-env` xatosiz, jarayon barqaror **online** (restart soni faqat +1, xato logidagi eski `acknowledged_at` yozuvi 26-avgustdan qolgan tarixiy holat ekani fayl vaqti bilan tasdiqlandi, yangi xato yo'q). To'liq end-to-end HTTP oqim admin sessiyasi orqali sinaldi: `cost_price` bilan/siz taom yaratish, `PUT` bilan yangilash, manfiy qiymat 400 qaytarishi, admin javobida `cost_price` bor-u afitsiant (`/api/waiter/menu`) va mijoz (`/api/public/menu`) javoblarida **yo'qligi** tasdiqlandi. Test taomlari sinovdan so'ng bazadan to'liq hard-delete qilindi (buyurtma tarixida ishlatilmagani uchun), production ma'lumotlariga iz qoldirilmadi.

## Holat — 2026-09-08: Bosh sahifa/"Sof foyda" endi sotilgan taomlarning tan narxini hisobga oladi

Foydalanuvchi so'rovi: "bugungi tushum" sotuv narxlari bo'yicha tursin (bu allaqachon shunday edi), "sof foyda" esa endi tan narxini ham hisobga olib chiqsin. Ilgari `GET /api/admin/reports/summary` (Bosh sahifa'dagi 4 ta stat-kartochka VA Hisobot sahifasi — ikkalasi ham shu bitta endpoint'dan foydalanadi) `net`ni faqat `revenue - expenses_total` deb hisoblardi — sotilgan taomlarning yuqoridagi bandda qo'shilgan `cost_price`si umuman hisobga olinmasdi, ya'ni "sof foyda" aslida faqat "tushum minus qo'lda kiritilgan xarajatlar" edi, haqiqiy mahsulot tannarxisiz.

- **`server/routes/adminReports.js`** — `/summary`ga yangi COGS (cost of goods sold) so'rovi qo'shildi: yopilgan (`orders.status='closed'`) buyurtmalarning bekor qilinmagan (`order_items.status='active'`) qatorlarini `menu_items`ga bog'lab, `SUM(oi.quantity * COALESCE(mi.cost_price, 0))` — sana filtri (`from`/`to`) `revenue`/`expenses` bilan bir xil. Javobga yangi `cost_of_goods` maydoni qo'shildi, `net` endi `revenue - cost_of_goods - expenses_total`.
- **Muhim cheklov:** tan narxi **snapshot emas** — `order_items`da (unit_price kabi) sotuv paytidagi tan narx alohida saqlanmaydi, shu sabab hisob-kitob HOZIRGI `menu_items.cost_price`dan foydalanadi (agar admin keyinchalik tan narxni o'zgartirsa, eski buyurtmalarning "sof foyda"si ham shu yangi qiymat bilan qayta hisoblanadi — sotuv narxi/`revenue` esa `order_items.unit_price` snapshot orqali o'zgarmasdan qoladi). Tan narxi kiritilmagan (`cost_price IS NULL`) taomlar COGS'ga `0` qo'shadi — ya'ni ular uchun "sof foyda" haqiqatda "sof" emas, oshirib ko'rsatiladi (admin ular uchun ham tan narx kiritishi tavsiya etiladi).
- Frontend (`public/admin/index.js`/`index.html`, `public/admin/reports.js`/`reports.html`) **o'zgartirilmadi** — ular allaqachon `summary.net`ni to'g'ridan-to'g'ri ko'rsatgani uchun server tomonidagi formula tuzatilishi ikkala sahifada ham avtomatik qo'llanildi, yangi UI-elementi qo'shilmadi.
- **Tekshirilgan:** yangi SQL so'rov haqiqiy production bazaga qarshi to'g'ridan-to'g'ri (`node22 -e`) sinaldi — bugungi kun uchun `revenue=236000`, `cogs=70000` to'g'ri hisoblandi (faqat tan narxi kiritilgan taomlar qo'shildi); endpoint autentifikatsiyasiz `401` qaytarishi tasdiqlandi (parol bilmasdan haqiqiy admin-sessiyali HTTP so'rov sinalmadi); `pm2 restart polat --update-env` xatosiz, jarayon barqaror **online**.

## Holat — 2026-09-09: to'liq audit (18 topilma) — barchasi tuzatildi

Foydalanuvchi so'rovi bilan avval butun loyiha (server + public) satr-satr audit qilindi (7 mustaqil burchakdan: to'g'rilik, olib tashlangan xulq-atvor, qayta ishlatish/takrorlanish, samaradorlik, soddalashtirish, konvensiyalar/hujjat mosligi, arxitektura/kelajakka moslik), so'ng barcha 18 ta tasdiqlangan topilma tuzatildi. Hech qanday funksional so'rov o'zgartirilmadi — faqat xato/kamchiliklar.

**Real xato/mantiqiy nuqsonlar (10 ta):**
1. `server/routes/adminCustomerOrders.js` — allaqachon `completed` (tayyorlangan/yetkazilgan) buyurtma bekor qilinsa ombor noto'g'ri qaytarilardi (overselling xavfi) — endi DELETE handleridagi bilan bir xil qoida (`completed`dan keyin qaytarilmaydi).
2. Xuddi shu faylda — bekor qilingan buyurtma qayta faollashtirilganda ombor endi qayta sarflanadi (`consumeStockForCustomerOrder()`, yetarli qoldiq bo'lmasa butun amal bekor bo'ladi).
3. `server/routes/waiterNotifications.js` — endi faqat `order_item_id IS NOT NULL` (dine-in "tayyor") yozuvlarni ko'rsatadi/tasdiqlaydi — kuryer/oshpazga tegishli yetkazib berish bildirishnomasi afitsiantga endi chiqmaydi.
4. `server/routes/adminReports.js` `/summary` — endi `customer_orders` (landing/olib ketish/yetkazib berish) ham `revenue`/`cost_of_goods`ga qo'shiladi (ilgari faqat dine-in `orders` hisoblanardi).
5. `server/routes/adminMenu.js` — `GET /categories`/`GET /items` endi `?include_inactive=1` qo'llab-quvvatlaydi, `public/admin/menu.js`da yangi "🗑 O'chirilganlar" bo'limi ♻️ Tiklash tugmasi bilan — soft-delete qilingan kategoriya/taomni endi admin panelidan ko'rish/qaytarish mumkin.
6. `server/services/inventory.js` `syncMenuPricing()` — endi `cost_price`ni ham (nafaqat `price`ni) bog'langan taom(lar)ga o'tkazadi.
7. `ensureMenuLink()` — avtomatik yaratilgan menyu yozuviga endi `cost_price` ham kiritiladi (ilgari doim `NULL` qolardi).
8. `server/routes/adminMenu.js` — `require_inventory_link` qoidasi endi serverda ham tekshiriladi (ilgari faqat frontendda) — lekin FAQAT bog'lanish/bo'lim haqiqatan o'zgartirilganda (eski, qoida qo'shilishidan oldingi yozuvlarni oddiy tahrirlash/tiklashni bloklamaydi).
9. `getInventoryRow()` — endi faqat faol (`is_active=1`) ombor mahsulotlarini qaytaradi — taomni o'chirilgan ombor mahsulotiga bog'lab bo'lmaydi.
10. `server/services/inventory.js` `createItem()`/`updateItem()` — `ensureMenuLink()` endi asosiy tranzaksiyadan TASHQARIDA chaqiriladi — eskirgan/noto'g'ri `menu_category_id` endi ombor mahsulotining o'zini yo'qqa chiqarmaydi, faqat `_link_warning` bilan ogohlantiradi (`public/admin/inventory.js` buni endi toast orqali ko'rsatadi).

**Samaradorlik (1 ta):** `server/routes/courierOrders.js` `GET /orders` — N+1 so'rov o'rniga bitta `IN (...)` so'rov (15s'da poll qilinadigani uchun muhim).

**Kod takrori/arxitektura (6 ta):** `server/services/notifications.js` (yangi) — `waiterNotifications.js`/`deliveryAlerts.js`dagi deyarli bir xil poll/tasdiqlash mantig'ini birlashtirdi; `server/db.js` — `addColumnIfMissing()` yordamchisi 12+ migratsiyani bittalab qatorga qisqartirdi, 4 ta haqiqiy o'lik migratsiya (`migrateAddInventoryPricing`/`Volume`/`CategoryInventoryRequirement`/`MenuItemCostPrice` — `schema.sql`da allaqachon bor ustunlar) olib tashlandi, `migrateAddChefRole`/`migrateAddCourierRole` yagona `migrateSyncUserRoles()`ga birlashtirildi; `server/services/inventory.js` — `computeAvailability()` yordamchisi 4 joydagi bir xil formulani birlashtirdi; **`server/roles.js`** (yangi) — yagona `ROLES`/`ROLE_NAMES`/`homeForRole()` manbasi, `auth.js`/`adminUsers.js`/`db.js` (CHECK constraint) endi shu yerdan o'qiydi (client tomon — `public/admin/waiters.js`, `public/login.html` — alohida runtime bo'lgani uchun hamon qo'lda mos saqlanadi, izoh bilan belgilangan); `escapeHtml()` 15 xil faylda takrorlangan edi — endi `public/app.js`da yagona (`public/landing/script.js` bundan mustasno, u `app.js`ni ulamaydi).

**Konvensiya (1 ta):** `server/auth.js`/`public/app.js`dagi eskirgan "bu ilova /polat/ ostki yo'lida proksi qilinadi" izohlari — proksi allaqachon olib tashlangan (yuqoridagi "Ishga tushirilgan holat"ga qarang), izohlar haqiqiy arxitekturaga mos tuzatildi (funksional o'zgarish yo'q, nisbiy yo'l yondashuvi baribir to'g'ri edi).

**Ataylab tegilmagan (arxitektura darajasidagi, kod bilan "tuzatib" bo'lmaydigan kamchiliklar):** bitta menyu taomi hamon faqat bitta ombor mahsulotiga bog'lanishi mumkin (retsept/ko'p-ingredientli taom — masalan kombo — qo'llab-quvvatlanmaydi; buni tuzatish yangi join-jadval bilan sxema qayta qurishni talab qiladi, hozircha real ehtiyoj yo'q); client-tomon rol ro'yxatlari (`waiters.js`, `login.html`) hamon qo'lda saqlanadi (build tizimi yo'qligi sababli server modulini ulab bo'lmaydi).

## Holat — 2026-09-09 (2): yangi **kassir** roli qo'shildi (alohida login/parol, faqat hisob-kitob + chek)

Foydalanuvchi so'rovi: kassir uchun alohida login/parol. Aniqlashtirish savoliga ko'ra kassir **faqat** stollarni hisob-kitob qilish (yopish) + chek chiqarish huquqiga ega — taom qo'sha olmaydi, menyuni ko'rmaydi. Afitsiantning o'zi ham hamon stolni yopa oladi (ikkalasi bir-birini almashtirmaydi — foydalanuvchi ataylab shunday tanladi).

- **`server/roles.js`** — `ROLES` ro'yxatiga `{ name: 'kassir', homePath: '/kassir/tables.html' }` qo'shildi. Kechagi refaktordan keyin bu YAGONA kod o'zgarishi kifoya bo'ldi: `server/auth.js` (rol-hudud aniqlash + uy sahifasi), `server/db.js` (`migrateSyncUserRoles()` — `users.role` CHECK constraint'iga `kassir`ni AVTOMATIK qo'shdi, yangi migratsiya funksiyasi yozish shart bo'lmadi) va `server/routes/adminUsers.js` (rol validatsiyasi) — HAMMASI shu yagona ro'yxatdan o'qigani uchun o'zgarishsiz to'g'ri ishladi.
- **`server/routes/kassirTables.js`** (yangi) — `GET /tables`, `GET /tables/:id/order`, `POST /tables/:id/close`, `POST /tables/:id/cancel-order` (bo'sh buyurtmani chek chiqarmasdan yopish), `GET /tables/:id/receipt/latest`, `GET /orders/:id/receipt` — barchasi `server/services/orders.js`dagi AFITSIANT bilan bir xil xizmat funksiyalaridan foydalanadi (taom qo'shish/miqdor o'zgartirish funksiyalari ATAYLAB ulanmagan). `server/index.js`da `requireRole(['admin','kassir'])` bilan `/api/kassir` ostida ulandi.
- **`public/kassir/`** (yangi papka) — `tables.html`/`tables.js` (stollar ro'yxati, afitsiantnikiga o'xshash) va `order.html`/`order.js` (bitta stolning joriy buyurtmasini **faqat o'qish** uchun ko'rsatadi — miqdor +/− tugmalari yo'q, menyu yo'q — va **💳 Hisob-kitob qilish** tugmasi bilan yopib, chekni o'sha zahoti shu sahifaning o'zida ko'rsatadi/chop etadi).
- **`public/app.js`** — `openReceiptByOrderId(orderId)` endi ixtiyoriy `area` parametr qabul qiladi (standart `'waiter'`, kassir sahifasi `'kassir'` bilan chaqiradi) — chek endpoint yo'li shunga qarab tanlanadi, boshqa chaqiruvchilar (admin print-navbat) o'zgarishsiz ishlayveradi.
- **`public/login.html`** (redirect switch), **`public/admin/waiters.js`** (`ROLE_LABEL`/`ROLE_BADGE`), **`public/admin/waiters.html`** (yangi xodim qo'shish formasidagi rol `<select>`) — qo'lda qo'shilgan 3 ta joy (client-tomon, build tizimi yo'qligi sababli `server/roles.js`ni ulab bo'lmaydi — bu holat `server/roles.js`ning o'zida ham izohlangan).
- **Tekshirilgan:** barcha yangi/o'zgargan fayl `node -c` xatosiz; butun server moduli qayta yuklanganda `migrateSyncUserRoles()` `users` jadvalini avtomatik qayta qurib `kassir`ni CHECK'ga qo'shgani (`SELECT sql FROM sqlite_master` bilan) va 4 ta mavjud foydalanuvchi/roli o'zgarishsiz qolgani tasdiqlandi; `pm2 restart polat --update-env` xatosiz, jarayon barqaror **online**; **haqiqiy HTTP oqim** vaqtinchalik test foydalanuvchisi (`__test_kassir__`) bilan to'liq sinaldi — login `role:"kassir"` qaytardi, `GET /api/kassir/tables` `200`, `GET /api/waiter/tables` va `GET /api/admin/users` ikkalasi ham `403`, `GET /kassir/tables.html` `200`, `GET /waiter/tables.html` esa `302` bilan `/kassir/tables.html`ga qaytarib yubordi (`homeForRole()` to'g'ri ishlagani tasdiqlandi) — test foydalanuvchisi sinovdan so'ng bazadan butunlay o'chirildi, production ma'lumotlariga iz qoldirilmadi. **Haqiqiy admin panel orqali kassir xodim yaratish va chekni QZ Tray bilan haqiqiy printerga chop etish** hali amalda (real qurilmada) sinalmagan — admin tomonidan tekshirish tavsiya etiladi.

**Tekshirilgan (avvalgi audit sessiyasi):** barcha o'zgargan/yangi 27 ta fayl `node -c` bilan sintaksis xatosiz; `node22 -e "require('./server/index.js')"` orqali butun server moduli (barcha `require()`lar, `server/db.js`dagi barcha migratsiyalar) haqiqiy production bazasiga qarshi xatosiz yuklandi (migratsiya loglari chiqmadi — bu barcha ustun/rol allaqachon mavjudligini, ya'ni "o'lik" deb topilgan 4 ta migratsiya haqiqatan xavfsiz o'chirilganini tasdiqladi); yangi murakkab SQL so'rovlar (`adminReports.js` COGS/revenue UNION, `courierOrders.js` IN-so'rov, `adminMenu.js` dinamik WHERE) alohida `db.prepare()` bilan sinaldi; `node server/migrate.js` xatosiz; `pm2 restart polat --update-env` xatosiz, jarayon 45+ soniya barqaror **online** (restart soni o'zgarmadi — yangi xato yo'q; xato logidagi yagona `acknowledged_at` yozuvi fayl vaqti bilan 2026-08-26'dan qolgan eski/tarixiy holat ekani alohida tasdiqlandi), `GET /api/ping` va `GET /api/public/menu` `200` qaytardi, `pm2 save` bilan saqlandi.

## Holat — 2026-09-10: to'liq audit (2-bosqich) — testlar joriy qilindi va 10 ta xato tuzatildi

Foydalanuvchi so'rovi bilan butun loyiha yana bir bor senior darajada tahlil
qilindi. Avvalgi (2026-09-09) auditdan farqi: bu safar avval **test
infratuzilmasi qurildi**, har bir topilma **yiqiladigan test bilan
isbotlandi**, keyin tuzatildi. Yakunda **111 test, hammasi o'tadi**.

### Test infratuzilmasi (yangi)

- **`server/sqliteDriver.js`** — SQLite drayveri tanlash qatlami.
  **Muammo:** `better-sqlite3` native modul; yangi Node (v24+) uchun prebuild
  bo'lmaydi va `npm install` manbadan qurishga urinadi (Windows'da Visual
  Studio Build Tools, Linux'da build-essential kerak). Natijada loyihaga
  umuman test yozib bo'lmasdi.
  **Yechim:** production hamon `better-sqlite3`da qoladi; u yuklanmasa
  avtomatik ravishda Node 22.5+ o'zida bor `node:sqlite` (DatabaseSync) ga
  tushadi. Testlar esa **har doim** `node:sqlite`da ishlaydi
  (`POLAT_SQLITE_DRIVER=node`) — hech qanday native buildsiz, har qanday
  mashinada. Shim `prepare/exec/pragma/transaction` ni qoplaydi; ichma-ich
  tranzaksiyalar SAVEPOINT bilan (buni `services/orders.js` talab qiladi —
  uning tranzaksiyasi ichida `inventory.consume()` o'z tranzaksiyasini ochadi).
- **`server/db.js`** — `POLAT_DB_PATH` env qo'shildi (testlar `:memory:`).
- **`test/helpers.js`** — fixture yordamchilari (`createUser`, `createTable`,
  `createMenuItem`, `createInventoryItem`, `stockOf` va h.k.).
- **`test/*.test.js`** — `node --test`, tashqi kutubxonasiz. Route testlari
  kichik Express app + soxta `req.user` + `app.listen(0)` + o'rnatilgan
  `fetch` bilan ishlaydi (supertest kerak emas).
- **`npm test`** qo'shildi.

### Tuzatilgan xatolar (10 ta)

**Ombor qoldig'i yeyilishi — 3 xil sabab, hammasi bitta ildizdan:** buyurtma
holati va uning ombor ta'siri UCH faylda mustaqil yozilgan edi.

1. `services/orders.js` — **bekor qilingan qatorning miqdorini oshirish**
   ombordan qoldiqni qayta sarflar, lekin qator hamon `cancelled` bo'lgani
   uchun na hisobga kirar, na uni qayta bekor qilib qoldiqni qaytarib
   bo'lardi (`cancelOrderItem` faqat `active` qatorni qaytaradi) — qoldiq
   butunlay yo'qolardi. Endi status guard bor.
2. `routes/adminCustomerOrders.js` — **holat sikli**:
   `cancelled -> completed -> cancelled -> completed` har aylanishda qoldiqni
   yana bir marta yeb ketardi.
3. `routes/chefKitchen.js` — **oshpaz ombor mantig'ini butunlay chetlab
   o'tardi** (faqat `UPDATE customer_orders SET status`).

   **Yechim:** yangi **`server/services/customerOrders.js`** — yagona
   `transition()`. Ombor holati endi O'TISHDAN chamalanmaydi, u bazada
   saqlanadi: **`customer_orders.stock_state`** = `held` / `released` /
   `spent`. Shu sabab har o'tish **idempotent**.
   `spent` — 2026-09-09 auditidagi "tayyorlangan taomdan keyin ombor
   qaytarilmaydi" qoidasini SAQLAB QOLADI (u ataylab kiritilgan edi), lekin
   uni sikl takrorlanishiga chidamli qiladi.

4. **Mijoz buyurtmasini o'chirish 500 berardi** (statik tahlilda topilmagan,
   testlar aniqladi). `inventory_movements.customer_order_item_id` FK'si
   `ON DELETE` qoidasisiz, `PRAGMA foreign_keys=ON`. `DELETE` avval ombor
   qaytarib (YANGI movement yozib), keyin `customer_order_items` ni
   o'chirardi -> `FOREIGN KEY constraint failed`. Ya'ni **omborga bog'langan
   taomi bor har qanday mijoz buyurtmasini admin o'chira olmasdi**. Endi
   harakat tarixidagi havola avval `NULL` qilinadi (tarix o'chmaydi).

5. **`orders.status` ga `cancelled` qo'shildi.** Bo'sh buyurtmani bekor
   qilish uni `closed` qilib qo'yardi -> hisobotda haqiqiy buyurtma bo'lib
   sanalar, kassir "Hisoblar" ro'yxatida **0 so'mlik soxta chek** bo'lib
   chiqardi. Migratsiya eski shunday yozuvlarni ko'chiradi.

6. **Tekin taom.** `inventory_items.sale_price` standart qiymati `0`. Sotuv
   narxini kiritishni unutish -> bog'langan menyu taomi narxi 0 -> mijoz
   landing sahifasidan **tekinga** buyurtma berardi. Ikki kirish yo'li ham
   yopildi: yangi bog'lash va mavjud mahsulot narxini 0 ga tushirish
   (`syncMenuPricing` endi narxga tegmaydi).

7. **Dublikat menyu bandi.** `ensureMenuLink()` mavjud bog'lanishni
   `AND is_active = 1` bilan qidirardi -> bog'langan taom soft-delete
   qilingan bo'lsa ikkinchi nusxa yaratardi.

8. **Kassir "Jami" summasi kam ko'rsatardi.** `kassirBilling /bills` da
   `total_amount` `.slice(0, 300)` dan KEYIN hisoblanardi. Endi ikkala manba
   bitta `UNION ALL` ga birlashtirildi: ro'yxat 300 ta bilan cheklangan,
   jami va `count` esa SQL `SUM()`/`COUNT()` bilan hammasi bo'yicha.

9. **Qo'lda cheklar daromadga kirmasdi.** `adminReports /summary` revenue
   `manual_bills` ni umuman ko'rmasdi — admin "Hisobot" va kassir
   "Statistika" turli tushum ko'rsatardi.

10. **Hisobot o'tmishga qarab o'zgarardi.** COGS `menu_items.cost_price` dan
    JONLI o'qilardi. Admin bugun tan narxni o'zgartirsa, allaqachon yopilgan
    o'tgan oylarning "Sof foyda"si ham qayta hisoblanardi. Endi
    **`cost_price_snapshot`** (`order_items` va `customer_order_items`) —
    sotuv paytida to'ldiriladi. Sotuv narxi (`unit_price`) allaqachon nusxa
    edi, tan narx esa emas — shu nomuvofiqlik yopildi.

### Xavfsizlik tuzatishlari

- **Server toza klonda ko'tarilmasdi (eng kritik).** `routes/adminQz.js`
  modul yuklanish paytida `private-key.pem` ni o'qirdi, u esa `.gitignore`da
  -> `npm start` `ENOENT` bilan yiqilardi va chek chop etishga aloqasi yo'q
  butun ilova ishlamasdi. Endi kalit **lazy** o'qiladi: kalit bo'lmasa faqat
  `/api/qz` `503` qaytaradi.
- **Sessiya hech qachon eskirmasdi.** Cookie faqat `user.id` ni imzolardi:
  o'g'irlangan cookie abadiy ishlardi, parol tiklash uni bekor qilmasdi,
  yagona chora hisobni butunlay bloklash edi.
  Endi format `"<userId>.<authStamp>.<issuedAtMs>"`, 30 kunlik muddat
  **serverda** majburlanadi. `authStamp = HMAC(SESSION_SECRET, password_hash
  + session_version)` — Django'ning `session_auth_hash` yondashuvi: parol
  **har qanday yo'l bilan** o'zgarsa (API, qo'lda SQL, kelajakdagi yangi
  route) sessiya avtomatik o'ladi. Parol xeshi cookie'ga oshkor bo'lmaydi.
  **Eski formatdagi cookie'lar rad etiladi** — joylashtirilganda hamma bir
  marta qayta login qiladi (bu ataylab).
  Yangi ustun: **`users.session_version`** (parol tiklanganda / hisob
  bloklanganda oshiriladi).
- **`/api/login` da hech qanday cheklov yo'q edi** (CLAUDE.md "Xavfsizlik —
  2026-08-26" da ataylab qoldirilgan deb belgilangan). Brute-force'dan
  tashqari **DoS**: parol tekshiruvi `scrypt` (~50-100 ms) va u SINXRON —
  o'nlab parallel so'rov butun saytni qotirardi.
  Endi ikki qatlam, faqat MUVAFFAQIYATSIZ urinish sanaladi
  (`skipSuccessful`): **hisob bo'yicha 10/15 daq** (IP almashtirish yordam
  bermaydi — asosiy himoya) va **IP bo'yicha 40/15 daq** (hajmli hujumga
  qarshi; ataylab yuqoriroq, chunki bitta NAT ortida butun restoran
  planshetlari bo'lishi mumkin).
  `createRateLimiter` ga `keyFn` / `skipSuccessful` qo'shildi; xotira
  tozalash ham vaqt bo'yicha (ilgari faqat 5000 yozuvdan keyin, keyin HAR
  so'rovda to'liq skan).
- **`ADMIN_PASSWORD` endi majburiy.** Ilgari `|| 'change-me'` — parolni
  qo'yishni unutish JIMGINA hammaga ma'lum parolli admin hisobi yaratardi.
- **`SESSION_SECRET` bo'sh bo'lsa endi ogohlantiradi** (avvalgidek ishlaydi,
  lekin jim emas — PM2 crash-loop bo'lsa "nega hamma doim chiqib ketyapti?"
  degan tushunarsiz muammoga aylanardi).
- **Xavfsizlik sarlavhalari** (hech qanday yo'q edi): CSP,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy`. Ataylab `helmet` o'rniga qo'lda — loyihaning mavjud
  falsafasi shu. CSP ro'yxati haqiqatda ishlatiladigan manbalardan
  (`cdn.jsdelivr.net` QZ Tray, `fonts.googleapis.com`,
  `images.unsplash.com`, `www.google.com` xarita iframe, `ws/wss localhost`
  QZ Tray aloqasi). ATTENTION: `'unsafe-inline'` qoldirildi (login.html
  inline `<script>` + 90 dan ortiq inline `style=`), shu sabab CSP bu yerda
  XSS'ga to'liq himoya emas — asosiy himoya hamon `escapeHtml()`.
- **Oxirgi faol adminni yo'qotib qo'yish mumkin edi** —
  `PUT /admin/users/:id` orqali admin o'z rolini o'zgartirishi yoki o'zini
  bloklashi mumkin edi va tizimga kirish imkoni qolmasdi (`DELETE` da himoya
  bor edi, `PUT` da yo'q).
- **`userHasActivity()` ga `manual_bills` va `inventory_movements` qo'shildi**
  — ular yetishmayotgan edi, natijada kassir (chek chiqargan) yoki ombor
  tuzatishi qilgan xodimni o'chirishga urinilganda
  `SQLITE_CONSTRAINT_FOREIGNKEY` otar va foydalanuvchi sababi tushunarsiz
  "Server xatosi" ko'rardi.
- **QZ `/sign` ga 4 KB uzunlik chegarasi** — ilgari ixtiyoriy uzunlikdagi har
  qanday satrni server kaliti bilan imzolab berardi.

### Migratsiyalar (hammasi idempotent, haqiqiy eski baza ustida sinalgan)

`migrateAddUserSessionVersion` -> `migrateSyncUserRoles` ->
`migrateSyncOrderStatus` -> ... -> `migrateAddCustomerOrderStockState` ->
`migrateAddOrderItemCostSnapshot`

**TARTIB MUHIM:** `session_version` `migrateSyncUserRoles()` dan OLDIN
qo'shilishi shart — u jadvalni qayta qurayotganda ustunlarni nom bo'yicha
ko'chiradi, ustun hali bo'lmasa `INSERT...SELECT` "no such column" bilan
yiqilardi. `migrateSyncOrderStatus()` `orders` jadvalini qayta quradi, shu
sabab uning 3 ta indeksini QO'LDA tiklaydi (`ensureSchema()` bu
migratsiyadan oldin ishlagani uchun `CREATE INDEX IF NOT EXISTS` ularni
qayta yaratmaydi).

**Tekshirilgan:** realistik eski production sxemasi (kassir roli yo'q,
`cancelled` yo'q, yangi ustunlar yo'q, ma'lumot bilan) yaratilib, unga barcha
migratsiyalar qo'llandi — CHECK'lar yangilandi, eski soxta-yopilgan buyurtma
`cancelled`ga, bekor qilingan mijoz buyurtmasi `released`ga ko'chdi, tan narx
nusxalari to'ldirildi, `order_items` va FK butunligi saqlandi, indekslar
tiklandi, ikkinchi marta ishga tushirilganda hech narsa qilmadi.

**Haqiqiy HTTP smoke-test:** `/api/ping`, `/login.html`, `/landing/`,
`/api/public/menu` -> 200; `/api/me`, `/api/qz/certificate` cookiesiz -> 401;
`/admin/index.html` -> 302; to'liq login oqimi (noto'g'ri parol 401 -> login
200 -> `/api/me` 200 -> `/api/admin/users` 200 -> parol tiklash 200 -> **eski
cookie 401** -> yangi parol bilan login 200).

### HALI SINALMAGAN / KEYINGI QADAMLAR

- Brauzerda vizual tekshiruv — **CSP biror narsani buzmaganini tasdiqlash
  uchun SHART** (landing xaritasi, shriftlar, QZ Tray chek chop etish).
- QZ Tray bilan haqiqiy printerga chek chop etish.
- Production'ga deploy (`git pull` + `npm run migrate` + `pm2 restart polat`).
  Deploy'dan keyin barcha xodimlar bir marta qayta login qilishi kerak —
  cookie formati o'zgardi.
- Arxitektura ishlari (hali qilinmagan): versiyalangan migratsiya tizimi
  (`schema_migrations`), `lib/permissions.js` (URL prefiksiga asoslangan
  avtorizatsiya o'rniga), qolgan 13 route faylni servis qatlamiga ko'chirish,
  pagination va N+1 so'rovlar.

## Holat — 2026-09-10 (2): chuqur qayta tahlil — yana 24 ta xato topildi va tuzatildi

Birinchi bosqichdan keyin (10 ta xato) loyiha yana bir bor, boshqa burchaklardan
tahlil qilindi: admin frontendi, rol sahifalari frontendi, `adminMenu.js` uchun
testlar, server ichki mantig'i va xavfsizlik — beshta mustaqil yo'nalish.
Yakunda **160 test, hammasi o'tadi** (5 marta ketma-ket tekshirildi).

### KRITIK — rol avtorizatsiyasini harf registri bilan chetlab o'tish

Express'da `case sensitive routing` **standart holatda o'chiq**:
`app.use('/api/waiter', ...)` `/api/WAITER/...` ni ham qabul qiladi.
`server/auth.js` dagi rol-hudud tekshiruvi esa `req.path.startsWith(
'/api/waiter/')` — **harfga sezgir**. Natijada prefiks harfini o'zgartirish
butun avtorizatsiya modelini chetlab o'tardi. Haqiqiy so'rovlar bilan
tasdiqlangan edi:

```
dastavkachi sessiyasi:
  POST /api/waiter/tables/1/close  -> 403  (to'g'ri)
  POST /api/WAITER/tables/1/close  -> 200  <- stol YOPILDI, chek navbatga tushdi
  POST /api/WAITER/tables/1/send   -> 200  <- oshxonaga yuborildi
```

Ya'ni loyiha ataylab qurgan rol chegarasi (kassir taom qo'sha olmaydi, kuryer
stollarga tegmaydi) amalda mavjud emas edi — hujum uchun oddiy xodim sessiyasi
va brauzer konsolidan bitta `fetch()` yetarli.

**NEGA AYNAN `/api/waiter`:** qolgan HAMMA guruhda aniq `requireRole()` bor edi,
faqat shu 4 ta mount uni tashlab, butunlay `requireAuth()` dagi prefiks
tekshiruviga tayanardi.

Ikki qatlamli tuzatish: `app.set('case sensitive routing', true)` va
`/api/waiter` ga ham aniq `requireRole(['admin','waiter'])`.

### KRITIK — login xatosi HECH QACHON ko'rinmasdi

`public/app.js` `api()` HAR QANDAY 401 ni "sessiya tugadi" deb `login.html` ga
yo'naltirardi — **login sahifasining o'zida ham** (u yerda `API_BASE` bo'sh,
ya'ni o'sha sahifa qayta yuklanardi). Noto'g'ri parol kiritilganda xato xabari
ekranda ko'rinishga ulgurmasdan forma tozalanardi.

Xodim "tugma ishlamayapti" deb o'ylab qayta-qayta urar, **10-urinishda shu
auditda qo'shilgan hisob-limitiga urilib 15 daqiqaga qulflanardi** va nega
ekanini bilmasdi. Ya'ni rate-limit qo'shilishi bu xatoni battar qilgan edi.
Endi `api(path, { noAuthRedirect: true })` bor.

### Server: chegaralar va bo'shliqlar

- **Raqamlarda yuqori chegara yo'q edi** (yangi `server/validation.js`).
  `{"quantity": 9007199254740991}` -> `orders.total_amount` ~9.0e19; yopilgan
  buyurtmani tuzatish/o'chirish uchun ilovada yo'l yo'q, ya'ni hisobot
  **abadiy** buzilardi. `{"unit_price": 1e308}` -> `subtotal` `Infinity` ->
  `SUM()` `Infinity` -> `JSON.stringify` `null` -> `/summary` doimo
  `revenue: null`.
- **Ochiq endpointlarda matn chegarasi yo'q edi** — bitta IP 5 so'rov/daqiqa
  x ~1 MB `note` = **~7 GB/kun** baza o'sishi.
- **Rate-limiter o'zi DoS vositasi edi** — kalit `user:<username>` Map kaliti
  sifatida 15 daqiqa xotirada turadi, uzunligi tekshirilmasdi: bitta IP'dan
  40 MB. PM2 FORK rejimida butun ilova o'lardi. Endi 64 belgi chegarasi.
- **Holat mashinasidagi bo'shliq** — `'spent'` belgisi `'completed'` dan
  CHIQISH paytida qo'yilardi, ya'ni bazadagi faktga emas, o'tish yo'liga
  bog'liq edi. Chetlab o'tish (probe bilan tasdiqlangan):
  `new -> completed -> confirmed -> cancelled` = **ombor qaytarildi**, garchi
  taom tayyorlangan bo'lsa ham. Endi `'spent'` `'completed'` ga KIRISHDA
  qo'yiladi va terminal.
- **Mijoz PII si oshpazga kelardi** — `chefKitchen.js` dagi `SELECT *` mijozning
  telefoni, uy manzili va GPS koordinatasini yuborardi (UI chizmasa ham).
  Oshxona planshetidan DevTools orqali har 15 soniyada yig'ib olish mumkin edi.
- **N+1 va cheklanmagan so'rovlar** — `adminCustomerOrders GET /` 1 yildan
  keyin **har 15 soniyada 11 001 ta sinxron SQLite so'rovi** qilardi (butun
  server bloklanadi). `courierOrders` esa `IN (...)` ning 32766 parametr
  chegarasiga urilib **32767-buyurtmadan boshlab butunlay 500** berardi.
- **`inventory.release()`** mavjudlik tekshirmasdi -> FK xatosi -> 500 va
  BUTUN tranzaksiya rollback (afitsiant taomni bekor qila olmasdi).
- **`chefKitchen` "tayyor"** idempotent emas edi -> ikki marta bosish IKKITA
  bildirishnoma yaratardi.
- **`adminExpenses`** sana formatini tekshirmasdi -> xarajat sanali filtrga
  tushmay, lekin filtrsiz jamiga kirib, "Hisobot" filtr bilan va filtrsiz
  **turli sof foyda** ko'rsatardi.
- **`routeUtils`** ataylab qo'yilgan 5xx xabarlarni yutardi (QZ 503 "kalit
  topilmadi" jumladan) — lazy-load o'zgarishining maqsadi yo'qqa chiqardi.

### Menyu (`adminMenu.js`) — 4 ta xato (yangi `test/menu.test.js`, 49 test)

- Ota taom bo'limga ko'chirilsa **variantlari eski bo'limda qolardi**.
- Variantning kategoriyasini otasidan mustaqil o'zgartirish mumkin edi.
- `PUT /categories/:id` va `PUT /items/:id` **bo'sh nomni qabul qilardi**
  (`POST` rad etardi) -> menyuda nomsiz bo'lim/taom, chekda bo'sh nom.
- Turlari **soft-delete** qilingan ota taom **hard-delete** bo'lardi va turlar
  yo'q otaga ishora qilib qolardi — tiklangandan keyin ham hech qayerda
  ko'rinmasdi.

### Chek (ESC/POS) — 6 ta xato

- Chek chiqmasdan turib "chop etilgan" deb belgilanardi: chop etish yiqilsa
  so'rov **butunlay yo'qolardi**.
- "JAMI" qatori ikki barobar kenglik rejimida 42 belgiga tekislanardi = **84
  ustun** -> 42 ustunli printerda summa keyingi qatorga tushib ketardi.
- Printerga **kod sahifasi hech qachon aytilmagan** (CP866 e'lon qilingan,
  lekin `ESC t` yo'q; `ESC @` init zavod standartiga qaytaradi).
- `fmtMoney` **U+00A0** (no-break space) qaytarardi -> CP866 da `0xFF` bayti
  -> chekda `1■234■567`.
- `showReceiptModal` har chaqirilganda **listener qo'shardi**: ikki chek ketma-ket
  ochilsa ikkala `onPrint` ham ishlab 2 ta chek chiqarardi.
- `padReceiptLine` off-by-one: aynan sig'adigan qatordan oxirgi belgi kesilardi.

Uchala `buildEscPos*` va uchala `render*ReceiptBox` birlashtirildi — aynan
takrorlanish tufayli bu xatolarni 3 joyda tuzatish kerak edi.

### Frontend poyga holatlari va UX

- **`changeQty` yo'qolgan yangilanish** — tez ikki marta bosish miqdorni 2 emas,
  1 ga oshirardi (ikkala klik ham eski `data-qty` o'qiydi).
- **Poll javobi yangi javobning ustidan yozardi** — `PATCH` javobi 3 ko'rsatar,
  keyin eski poll javobi 2 ga qaytarardi. Endi `reqSeq` bilan eskirgan javob
  render qilinmaydi (waiter/kassir/chef/courier).
- **`loadMenu()` da `try/catch` yo'q edi** — tarmoq bir soniyaga uzilsa menyu
  **abadiy bo'sh** qolardi, hech qanday xabarsiz.
- **`toggleAvailability`** xotiradagi ro'yxatni yangilamasdi -> admin amali
  jimgina teskarisiga o'girilardi.
- **Ombor so'rovi yiqilsa tahrirlashda bog'lanish jimgina uzilardi** — admin
  taom nomini tuzatsa taom ombordan uzilib ketardi.
- **15 s poll foydalanuvchi amaliga xalaqit berardi** — `mousedown`/`mouseup`
  orasida tushsa `click` umuman otilmasdi; poll xatosi butun ro'yxatni o'chirardi.
- **8 ta tugmada ikki marta bosish himoyasi yo'q edi** — eng og'iri ombor
  "Kirim qilish" (idempotent emas, miqdor **ikki marta** qo'shilardi).
- Bekor qilingan buyurtma chekda "Ochiq" deb yolg'on ko'rsatilardi; bo'sh stolda
  "Hisob-kitob" tugmasi ko'rinardi; kassir hisob-kitobdan keyin 8 soniyagacha
  eski ekranda qolardi; landing bronida bugungi sanaga o'tgan vaqt yuborish
  mumkin edi.

### Tekshirilgan, LEKIN xato EMAS (soxta signal bermaslik uchun)

- **XSS topilmadi.** Ishonchsiz yo'l oxirigacha kuzatildi (anonim
  `/api/public/*` dan admin/kuryer/oshpaz ekranlarigacha) — har bir qo'yilish
  nuqtasi `escapeHtml()` dan o'tadi, barcha atributlar qo'shtirnoq ichida.
  `landing/script.js` ning alohida nusxasi ham to'liq.
- **CSRF-token kerak emas.** 33 ta `router.get` handlerning birortasi ham
  holat o'zgartirmaydi; barcha mutatsiyalar POST/PUT/PATCH/DELETE va
  `express.json()` faqat `application/json` ni parse qiladi -> `SameSite=Lax`
  yetarli.
- **IDOR — bu ilovada zaiflik emas.** Bitta restoran, umumiy stollar; afitsiant
  boshqa afitsiant ochgan stolni yopa olishi *kerak*. Egalik tekshiruvi
  QO'SHILMADI — mavjud ish oqimini buzardi.
- **Fayl yuklashda ishlaydigan hujum yo'q** — SVG rad etiladi, fayl nomi
  `originalname` dan olinmaydi, `nosniff` qo'shilgan.
- **`sqliteDriver.js` SAVEPOINT shimi to'g'ri** — ichma-ich tranzaksiya
  rollback semantikasi probe bilan tasdiqlandi.
- **`listUnread(whereExtra)` va `addColumnIfMissing`** — SQL satr birlashtirish
  bor, lekin barcha chaqiruvchilar kompilyatsiya vaqtidagi literal beradi.
  In'ektsiya yo'li yo'q.

### ⚠️ Nginx bog'liqligi (tekshirilishi kerak)

`req.ip` `TRUST_PROXY=1` bilan `X-Forwarded-For` ning **eng oxirgi** qiymatini
oladi. Agar polatuz nginx bloki `proxy_set_header X-Forwarded-For
$proxy_add_x_forwarded_for;` ni qo'ymasa, mijoz o'z `X-Forwarded-For` ini
yuborib **IP-limitlarni butunlay aylanib o'tadi**. Nginx konfiguratsiyasi repoda
yo'q — VPS'da tekshirib, `docs/nginx.conf.example` sifatida qo'shish kerak.
(Hisob bo'yicha login cheklovi IP'ga bog'liq emas, ya'ni asosiy brute-force
himoyasi baribir ishlaydi.)

### Hali qilinmagan arxitektura ishlari

Bular **ataylab qoldirildi** — ular xato tuzatish emas, katta hajmli refaktor:

1. Versiyalangan migratsiya tizimi (`schema_migrations` jadvali + `migrations/`
   fayllari). Hozir `db.js` da 18 ta qo'lda yozilgan `migrateAddX()` har server
   ko'tarilganda ishlaydi; ular idempotent va sinalgan, lekin ro'yxat o'sib
   boradi va production qaysi versiyada ekanini bilish yo'li yo'q.
2. `lib/permissions.js` — URL prefiksiga asoslangan avtorizatsiya o'rniga
   imkoniyat (capability) asosidagi tekshiruv. **Xavfsizlik jihati yopildi**
   (aniq `requireRole` + case-sensitive routing), qolgani toza kod masalasi.
3. Qolgan 13 route faylni servis qatlamiga ko'chirish (hozir ular `db.prepare()`
   ni bevosita chaqiradi).
4. Frontend uchun umumiy render qatlami (`renderList()` yordamchisi) — hozir
   "yukla -> template -> innerHTML -> listener ulash" naqshi ~12 marta
   nusxalangan.
