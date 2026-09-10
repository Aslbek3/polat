# Po'lat — UI/UX tahlili

**Sana:** 2026-09-10
**Qamrov:** 20 ta HTML sahifa, 2 ta CSS fayl (960 qator), 21 ta frontend JS fayl
**Usul:** 4 ta mustaqil yo'nalish — mijoz landing'i, xodim ekranlari, admin paneli, dizayn tizimi/accessibility. Har bir topilma kodni o'qib tasdiqlangan; eng muhimlari ishlab turgan ilovada (`http://127.0.0.1:3213`) jonli so'rovlar va hisob-kitob bilan qayta tekshirilgan (✔ belgisi bilan).

---

## Bajarilish holati (2026-09-10, kechqurun)

**✅** — band tuzatildi va tekshirildi. (**✔** — avvalgidek: tahlil paytida jonli tasdiqlangan topilma.)

| Bo'lim | Jami | ✅ Tuzatildi | Ochiq |
|---|---|---|---|
| Landing (L) | 46 | 39 | 7 |
| Xodim ekranlari (X) | 32 | 29 | 3 |
| Admin paneli (A) | 30 | 28 | 2 |
| Dizayn tizimi (D) | 60 | 50 | 10 (2 tasi muammo emas) |
| **Jami** | **168** | **146** | **22** |

### Ochiq qolganlar — va nima uchun

**Ataylab qoldirildi — qaror sizda:**
- **A-15** — desktopda menyu drawer ichida: 2026-09-08 da aynan shunday so'ralgan (CLAUDE.md). Doimiy ochiq sidebar kerak bo'lsa — bir qator CSS.
- **X-13** — "tayyor" xabari hamma afitsiantga: "qaysi afitsiant qaysi stolga" bog'lanishi yo'q, CLAUDE.md'da hujjatlashtirilgan qaror. Bog'lash — yangi imkoniyat.
- **L-43** — "Famliy" yozilishi: brend nomi, o'zgartirilmadi.
- **L-27** — xaritada boshqa joy nomi: restoranning o'z Google Maps sahifasi havolasi kerak.

**Haqiqiy kontent kerak — kod bilan hal bo'lmaydi:**
- **L-21** (qisman) — rasmsiz taomga harf-placeholder qo'yildi; haqiqiy suratlar admin → Menyu'dan yuklanadi.
- **L-30, L-31, L-38** — galereya va "Biz haqimizda"dagi Unsplash stok suratlar — restoranning o'z suratlari kerak.
- **L-45** — "Bizning shior" hero matnini takrorlaydi — boshqa shior matni kerak.

**Yangi imkoniyat (§8, alohida kelishiladi):**
- **A-10** (qisman) — o'rtacha chek va kecha bilan taqqoslash bosh sahifaga qo'shildi; grafik, top taomlar, CSV eksport — §8.
- **X-32** — taomga izoh ("achchiqsiz") — bazaga ustun + afitsiant/oshpaz UI.

**Dizayn-tizim sayqali (xatti-harakatga ta'siri yo'q, butun CSS bo'ylab refaktor):**
- **D-A1** — landing va ilova ikki alohida dizayn tili: ataylab (mijoz brendi ≠ ish ekrani).
- **D-D2, X-29** — tipografik shkala / `font-size` tokenlari; **D-E1, D-E2** — spacing tizimi; **D-F10** — breakpointlar; **D-J6, D-J7, D-J8** — klass/modal/badge izchilligi.

**Muammo emas:** D-C2 (faqat qorong'i tema — to'g'ri qaror), D-H13 (`lang="uz"` to'g'ri).

### Tekshiruv
- `npm test` — **206/206** (jumladan yangi `test/business-time.test.js`: Toshkent 00:00–05:00 sotuvlari to'g'ri kunga tushadi).
- Playwright, ishlab turgan server: 21 sahifa × 5 rol × 320/390/1280px — **171/171** (JS xatosi, CSP buzilishi, gorizontal scroll yo'q).
- Landing: 58/58 (1-to'lqin) + oxirgi o'zgarishlar (D-B7, D-D4, D-I4) 320 va 1280px'da.

---

## Mundarija

1. [Umumiy baho](#1-umumiy-baho)
2. [Harakat rejasi — qaysi tartibda tuzatish kerak](#2-harakat-rejasi)
3. [Kuchli tomonlar](#3-kuchli-tomonlar)
4. [Mijoz landing sahifasi](#4-mijoz-landing-sahifasi)
5. [Xodim ekranlari (afitsiant, oshpaz, kassir, kuryer)](#5-xodim-ekranlari)
6. [Admin paneli](#6-admin-paneli)
7. [Dizayn tizimi, responsive, accessibility](#7-dizayn-tizimi-responsive-accessibility)
8. [Qo'shish mumkin bo'lgan yangi imkoniyatlar](#8-qoshish-mumkin-bolgan-yangi-imkoniyatlar)
9. [Ilova: o'lchangan raqamlar](#9-ilova-olchangan-raqamlar)

**Jiddiylik darajalari:**
🔴 **KRITIK** — ishni to'xtatadi, pul hisobini buzadi yoki foydalanuvchini noto'g'ri xulosaga olib keladi
🟠 **JIDDIY** — kunlik ishda sezilarli ishqalanish yoki mijoz yo'qotish
🟡 **O'RTA** — noqulaylik, lekin aylanib o'tish yo'li bor
⚪ **KICHIK** — sayqal

**Mehnat hajmi:** `kichik` (< 1 soat) · `o'rta` (1–6 soat) · `katta` (1+ kun)

---

## 1. Umumiy baho

**Kutilganidan yaxshiroq.** Loyihada haqiqiy dizayn tizimining poydevori bor: 30 ta CSS token (rang, radius, soya) izchil ishlatilgan, `renderList()`, `customConfirm()`, `withBusy()` kabi umumiy qatlamlar bor, va eng muhimi — **rang hech qayerda yagona ma'lumot tashuvchisi emas** (holat badge'lari doim matn bilan keladi). Bunday intizom kam uchraydi.

Zaif tomonlar uchta o'qda to'plangan, va ularning **deyarli hammasi arxitektura emas, aniq CSS qoidalari**:

| O'q | Holat | Asosiy sabab |
|---|---|---|
| **Responsive** | Telefonda 3 ta ekran buziladi, 1920px'da kontent chapga yopishadi | 6–7 ta aniq CSS qoidasi |
| **Accessibility** | 41 ta input yorliqsiz, zoom bloklangan, fokus ko'rinmaydi | Mexanik ish, bir necha soat |
| **Kontrast** | Kassirning asosiy tugmasi 2.42:1, barcha yorliqlar ~3.8:1 | **2 ta o'zgaruvchi qiymati** |

Bundan tashqari biznesga bevosita ta'sir qiladigan bir nechta funksional bo'shliq bor: **bosh sahifada raqamlar qo'shilmaydi**, **oshxonada vaqt ko'rsatilmaydi**, **katta harf bilan login hisobni qulflaydi**, **mijoz savati saqlanmaydi**, **taomlarning birortasida rasm yo'q**.

---

## 2. Harakat rejasi

### 1-bosqich — bugun (~2 soat, eng yuqori foyda/mehnat nisbati)

Bu 12 ta band KRITIK muammolarning yarmidan ko'pini yopadi va hammasi bir necha qatorlik o'zgarish.

| # | Nima | Qayerda | Nega | ID |
|---|---|---|---|---|
| 1 | `autocapitalize="none" autocorrect="off" spellcheck="false"` + serverda `COLLATE NOCASE` | `login.html:20`, `server/auth.js:199` | Hozir katta harf bilan login hisobni **15 daqiqaga qulflaydi** | X-10 |
| 2 | Bosh sahifaga "Tan narx" plitkasi | `admin/index.html`, `index.js` | Hozir ekrandagi raqamlar **qo'shilmaydi** | A-01 |
| 3 | `maximum-scale=1` ni olib tashlash | 20 ta HTML, 5-qator | Zoom bloklangan (WCAG buzilishi) | D-H1 |
| 4 | `:root { color-scheme: dark }` + `::placeholder { color: var(--text-dim) }` | `style.css:3` | Sana/vaqt tanlagich va placeholder ko'rinmaydi | D-C1 |
| 5 | Kassir tugmalarini `.btn.primary` klassiga o'tkazish | `kassir/manual.html:37`, `kassir/order.html:26`, `waiter/order.html:33` | 2.42:1 → 10.4:1 | D-B1 |
| 6 | `--text-faint: #7c7360` → `#9a9078` | `style.css:15` | Barcha yorliqlar AA'dan o'tadi | D-B2 |
| 7 | `.btn:disabled, button:disabled { opacity:.5; cursor:not-allowed }` | `style.css` | `withBusy()` ishlaydi, lekin ko'rinmaydi | X-04 |
| 8 | `:focus-visible { outline: 2px solid var(--gold-2); outline-offset: 2px }` | ikkala CSS | Klaviatura bilan yurib bo'lmaydi | D-H5 |
| 9 | `main { margin: 0 auto }` ni ≥720px'da tiklash | `style.css:200` | 1920px'da kontent chapga yopishgan | D-F1 |
| 10 | Kuryer "Yetkazildi" va oshpaz "Tayyor" ga `customConfirm` | `courier/orders.js`, `chef/kitchen.js` | Qaytarib bo'lmaydigan amal, 6–8px qo'shni tugma bilan | X-08, X-09 |
| 11 | Xarajat kartasiga `created_by_name` | `admin/expenses.js:25` | Ma'lumot keladi, chizilmaydi — pul mas'uliyati | A-13 |
| 12 | Landing meta-tavsifidagi "Toshkent" → "Farg'ona, Quva" | `landing/index.html:7` | Google va Telegram'da noto'g'ri shahar | L-28 |

### 2-bosqich — shu hafta (~1–2 kun)

| # | Nima | ID |
|---|---|---|
| 13 | Oshpaz ekraniga **kutish vaqti** (`⏱ 12 daq`) + FIFO tartib + 15/25 daqiqada rang | X-01 |
| 14 | Bildirishnoma ro'yxatini `position: sticky` qilish — scroll'da yo'qolmaydi va sahifani sakratmaydi | X-02, X-03 |
| 15 | Telefonda buziladigan 3 ta ekran: admin nav, kassir "Qo'lda hisoblash", admin statistika | D-F2, D-F3, D-F5 |
| 16 | `.order-total-bar { flex-wrap: wrap; gap: 8px }` | D-F4 |
| 17 | Bosish maydonlarini 44px'ga: `.qty-stepper`, `.btn.small`, `←`, checkbox | X-17, D-G |
| 18 | `env(safe-area-inset-bottom)` ilovaga ham (landing'da allaqachon bor) | D-F8 |
| 19 | Mijoz savatini `localStorage`ga saqlash | L-07 |
| 20 | Checkout'da qatorni +/− / o'chirish | L-06 |
| 21 | Buyurtma muvaffaqiyatli bo'lganda raqam va summani ko'rsatish (server allaqachon qaytaradi) | L-12 |
| 22 | Hisobot ro'yxatiga uchala manbani birlashtirish | A-02 |
| 23 | Tarmoq xatosini o'zbekchalashtirish (`Failed to fetch` → "Internet aloqasi yo'q") | X-15 |
| 24 | 41 ta inputga `label for=` | D-H2 |

### 3-bosqich — keyingi hafta(lar)

| # | Nima | ID |
|---|---|---|
| 25 | Bir xil taomni birlashtirish ("Osh ×3", uchta qator emas) | X-06 |
| 26 | Miqdorni tez kiritish (raqamga bosilsa `2 / 5 / 10` tugmalari) | X-05 |
| 27 | "Oshxonaga yuborish"ni pastki panelga ko'chirish | X-14 |
| 28 | Bosh sahifani "ertalabki brifing"ga aylantirish | A-03 |
| 29 | Ro'yxatlarga qidiruv | A-08, X-22 |
| 30 | Yetkazib berish narxi/vaqti/to'lov usulini ko'rsatish | L-29 |
| 31 | Modallar uchun umumiy `openModal()` — `role`, focus trap, Escape | D-H6 |
| 32 | Hisobotga: eng ko'p sotilgan taom, marja, soatlik grafik, CSV eksport | A-10, §8 |

### Alohida ish (kod emas, lekin eng katta ta'sir)

**Taomlarning haqiqiy fotolari.** Menyudagi 11 ta taomning birortasida rasm yo'q (✔ API bilan tasdiqlangan), galereyada esa 6 ta Unsplash stok foto. Admin panelida rasm yuklash imkoniyati **allaqachon bor** — faqat foto sessiya kerak. Menyu rasmi buyurtma qarorining №1 omili.

---

## 3. Kuchli tomonlar

Bular yaxshi ishlangan va **o'zgartirilmasligi** kerak.

### 3.1. `renderList()` — "band restoran" muammosining haqiqiy yechimi
`public/app.js:179-236`

Xodim ekranlari har 8–15 soniyada avtomatik yangilanadi. Bu odatda uchta xatoni keltirib chiqaradi, `renderList()` esa uchalasini bitta joyda hal qiladi:
- **`dedupe`** — ma'lumot o'zgarmagan bo'lsa `innerHTML` umuman yozilmaydi. Ekran sakramaydi, tugma `mousedown`/`mouseup` orasida DOM'dan olib tashlanib bosish "yutilmaydi".
- **`seq` navbati** — eskirgan javob yangisining ustidan yozmaydi.
- **`isPoll`** — fon xatosida ro'yxat o'chirilmaydi, faqat toast chiqadi (bir xil xato takrorlanmaydi).

16 ta ekranda izchil ishlatilgan.

### 3.2. Xavfli tugmalar hech qachon birga ko'rinmaydi
`public/waiter/order.js` — `applyOrderControls()`

Afitsiant ekranida "Bekor qilish" va "Hisob-kitob" bitta panelda turadi, lekin **bir vaqtda hech qachon ko'rinmaydi**: taom bo'lsa faqat "Hisob-kitob", bo'lmasa faqat "Bekor qilish". Bu tasdiqlash oynasidan ham kuchliroq — xato **umuman mumkin emas**.

### 3.3. Ombor kirim/chiqim oqimi
`public/admin/inventory.js:181-195`

Admindan faqat **musbat** son so'raladi, ishorani (+/−) tizim o'zi qo'yadi. Hozirgi qoldiq oyna ichida ko'rsatiladi ("Hozirgi qoldiq: 45 dona"), tugma matni ham moslashadi ("Kirim qilish"/"Chiqim qilish"). "Manfiy son yozaymi?" degan klassik chalkashlik butunlay yo'q.

### 3.4. Ma'lumot yo'qolishining oldi olingan joylar
- **Xodimni o'chirish** (`admin/waiters.js:29-39`): faoliyat tarixi bo'lsa tugma "Faolsizlantirish", bo'lmasa "O'chirish". Tasdiqlash matni ham shunga qarab o'zgaradi.
- **Ombor yuklanmasa bog'lanish uzilmaydi** (`admin/menu.js:330-350`): sun'iy `<option>` bilan saqlanadi.
- **O'chirilgan menyu bandlarini tiklash** (`admin/menu.js:177-205`).
- **Bekor qilingan buyurtmada ombor holati belgisi** (`admin/customer-orders.js:23-28`): "📦 Ombor qaytarildi" / "📦 Ombor sarflangan".

### 3.5. Rang tizimi va kontrast asoslari
- 30 ta CSS token, qo'lda yozilgan hex juda kam
- Har bir holat rangining (`--danger/--warn/--ok`) o'z `-light` foni bor
- **Asosiy palitra sog'lom** (✔ hisoblangan): asosiy matn **15.76:1**, `.dim` **7.88:1**, landing oltin tugma **7.74:1**
- **Rang yagona signal emas** — WCAG'ning eng ko'p buziladigan qoidasi bu yerda to'g'ri

### 3.6. Landing'dagi puxta joylar
- **Bron vaqti validatsiyasi** (`landing/script.js:64-79`): bugungi sana tanlansa vaqt minimumi hozirgi vaqtga suriladi, o'tgan vaqt tozalanadi
- **Geolokatsiya rad etilsa aniq maslahat**: "manzilni qo'lda yozing"
- **Savat menyu qayta chizilganda saqlanadi**
- **Faqat 2 ta majburiy maydon**, `autocomplete="name"/"tel"` to'g'ri
- **`env(safe-area-inset-bottom)`** — iPhone hisobga olingan
- **10 ta `label for=`** — landing formalari accessibility bo'yicha to'g'ri qilingan

### 3.7. Boshqalar
- `customConfirm()` — brauzerning "127.0.0.1 says" oynasi o'rniga ilova modali, 11 ta faylda
- `@media print` chek uchun to'g'ri (`@page { size: 80mm auto }`)
- iOS zoom muammosi to'g'ri usulda hal qilingan (`input { font-size: 16px }`)
- Oshpazga mijoz PII'si yuborilmaydi
- `<html lang="uz">` — 20/20 sahifada to'g'ri

---

## 4. Mijoz landing sahifasi

`public/landing/index.html`, `style.css`, `script.js`

Bu biznes uchun eng muhim ekran — mijoz shu yerdan buyurtma beradi.

### 4.1. Birinchi taassurot va konversiya yo'li

✅ **L-01 🟠 Hero 100vh — menyu ikkinchi ekranda** · `style.css:120` · `o'rta`
`height: 100vh; min-height: 560px`. 390×844 telefonda birinchi taom **~1.3 ekran** pastda. 3–4 ta taom ko'rib savatga qo'shish uchun ~2 ekran aylantirish kerak.
*Qisman yumshatuvchi:* hero'da "Menyuni ko'rish" tugmasi va `aria-label`li pastga ishorasi bor.
**Tuzatish:** hero'ni ~`70svh` ga tushirish.

✅ **L-02 🟠 Asosiy tugma "Stol bron qilish", buyurtma emas** · `index.html:41-42` · `kichik`
Oltin rangli birlamchi tugma bron uchun, menyu esa ikkilamchi "ghost". Daromad buyurtmadan kelsa, ierarxiya teskari.

✅ **L-03 🟠 Mobilda header'da CTA yo'q** · `style.css:492` · `kichik`
`.header-cta { display: none }` @1040px. Mijoz pastga tushib ketsa menyuga qaytish uchun gamburger → menyu → tanlash kerak.

✅ **L-04 🟡 "Xodim kirishi" mobilda menyu bandi bilan teng vaznda** · `style.css:491`
Tasodifan bosilsa sahifa almashadi va **savat yo'qoladi** (L-07).

✅ **L-05 ⚪ Galereya rasmlari bosiladigandek ko'rinadi, lekin hech narsa qilmaydi** · `style.css:308`
`cursor: pointer` va `:hover { scale(1.02) }` bor, handler yo'q.

### 4.2. Savat va checkout

✅ **L-06 🟠 Checkout'da qatorni o'zgartirib/o'chirib bo'lmaydi** · `script.js:366-372` · `o'rta`
`renderCheckoutSummary()` faqat matn chiqaradi. "Osh ×3" ni ×2 qilish uchun: oynani yop → menyuda top → "−" bos → qayta och. Klassik tark etish sababi.

✅ **L-07 🟠 Savat hech qayerda saqlanmaydi** · `script.js:160` · `kichik`
`const cart = {}`, `localStorage` yo'q. Sahifa yangilansa, orqaga bosilsa, qo'ng'iroq kelsa yoki `tel:` havola bosilsa — savat nolga tushadi. **Ayniqsa xavfli:** server "Menyudagi bir band endi mavjud emas, **sahifani yangilang**" deydi (`customerOrders.js:281`) — ya'ni o'z maslahati savatni o'ldiradi.

✅ **L-08 🟡 Savat panelida tarkibni ko'rib bo'lmaydi** · `index.html:192-200`
Faqat "N ta taom" va jami. Tarkibni ko'rish uchun yagona yo'l — checkout formasini ochish.

✅ **L-09 🟠 Suzuvchi savat paneli oxirgi taomni to'sadi** · `style.css:263-269` · `kichik` ✔
`.cart-bar` `fixed; bottom: 0`, ~76px. `body` ga hech qanday `padding-bottom` qo'shilmaydi — oxirgi taomning "+/−" tugmalari va footer panel ostida qoladi.
**Tuzatish:** `.cart-bar.show` bo'lganda `body { padding-bottom: 96px }`.

✅ **L-10 🟡 Modal ichida ichma-ich aylantirish** · `style.css:283-286, 395`
5 tadan ortiq band bo'lsa mobilda ikkita scroll maydoni paydo bo'ladi.

✅ **L-11 🟡 Pickup buyurtmasida manzil baribir yuboriladi** · `script.js:404, 417`
Mijoz avval "Yetkazib berish"ni tanlab manzil yozsa, keyin "Olib ketish"ga qaytsa — yashirin maydon qiymati yuboriladi. Admin/kuryer ekranida pickup buyurtmasida manzil ko'rinadi.

✅ **L-12 🟠 Buyurtma raqami mijozga ko'rsatilmaydi** · `script.js:427-430` · `kichik`
Server `{ ok, id, total_amount }` qaytaradi, klient `data`ni **umuman ishlatmaydi**. Mijozda buyurtma raqami yo'q, summa tasdig'i yo'q. Oynani yopishi bilan tasdiq izsiz yo'qoladi.

✅ **L-13 🟠 Ombor xatosi mijozga ichki tilda chiqadi** · `inventory.js:289` → `script.js:440` · `kichik`
Mijoz literal `Yetarli qoldiq yo'q (hozir: 2 dona)` xabarini ko'radi — **qaysi taom ekani aytilmaydi**.
**Tuzatish:** "«Kola 0.5L» tugab qoldi. Uni savatdan olib tashlang yoki miqdorini kamaytiring."

✅ **L-14 🟡 Validatsiya bitta xato ko'rsatadi va maydonni belgilamaydi** · `script.js:407-411`
Xato formaning pastida chiqadi, aybdor maydon `focus` olmaydi, qizarmaydi.

✅ **L-15 ⚪ Telefon formati tekshirilmaydi** · `script.js:408`
Klient "abc"ni yuboradi, serverdan 400 keladi.

✅ **L-16 🟡 Rate-limit 5/daqiqa, IP bo'yicha, bron va buyurtma uchun umumiy** · `server/index.js:171-178`
Restoran Wi-Fi'si yoki bitta NAT ortidagi mijozlar bir-birini bloklaydi.

### 4.3. Mobil

**Qamrab olingan kengliklar:** 1040, 860, 640, 480px. **640–860 oralig'ida menyu uchun hech narsa yo'q, ≤360px uchun hech narsa yo'q.**

✅ **L-17 🟠 Asosiy konversiya tugmalari barmoq uchun kichik**

| Element | Fayl:qator | O'lcham | Holat |
|---|---|---|---|
| `.menu-qty button` (mobil) | `style.css:242` | **36×36** | ❌ eng ko'p bosiladigan tugma |
| `.book-modal-close` | `style.css:404` | **34×34** | ❌ |
| `.location-btn` | `style.css:442-446` | ~35px | ❌ |
| `.fulfillment-opt` | `style.css:434-437` | ~39px | ❌ |
| `.nav-toggle` | `style.css:108` | 40×40 | ❌ chegarada |
| `.nav-close` | `style.css:497` | 44×44 | ✅ |
| `.menu-tab` | `style.css:188` | ~45px | ✅ |

**Eng og'rig'i:** mobilda "+" tugmasi desktopdagidan **kichraytirilgan** (40→36) — teskari.

✅ **L-18 🟡 Mobil menyuda ikkita yopish tugmasi ustma-ust** · `style.css:494-501` vs `:106-115`
Gamburger va `.nav-close` deyarli bir xil koordinatada. `.nav-links` `z-index: 99`, header `100` — overlay header ostida qoladi.

✅ **L-19 ⚪ Mobil menyu ochilganda scroll bloklanmaydi** · `script.js:26-29`

✅ **L-20 🟡 `100vh` mobil brauzer panellarini hisobga olmaydi** · `style.css:120`
`dvh`/`svh` fallback yo'q — iOS Safari'da pastga ishora URL paneli ostida qolishi mumkin.

### 4.4. Menyu ko'rinishi

**L-21 🟠 Menyuda birorta rasm yo'q, galereyada 6 ta stok foto** ✔
API: 11 ta taom, rasmi bor — **0**. Bo'sh holat uchun placeholder ham yo'q.

✅ **L-22 🟠 "Tugadi" holati o'qib bo'lmas darajada xira** · `style.css:217` · `kichik`
`opacity: 0.55` bilan (oq fonda):
- "Tugadi" nishoni: **2.29:1**
- narx: **2.23:1**
- tavsif: **2.33:1**

Ya'ni eng muhim signal ("bu taom yo'q") eng o'qib bo'lmaydigan elementga aylangan.
**Tuzatish:** `opacity` o'rniga aniq xira ranglar, nishonni to'liq quyuqlikda qoldirish.

✅ **L-23 🟡 "Turlari (N)" mexanizmi noaniq** · `script.js:213-219`
"Osh — 35 000" va ostida yopiq "Turlari (2)". Mijoz uchun oddiy "Osh" alohida taommi yoki standart turmi — noaniq. Qimmatroq variantlar bir bosish ortida yashiringan, "35 000 dan boshlab" ko'rsatilmaydi.

✅ **L-24 ⚪ "Turlari" tugmasi taom nomidan vizual og'irroq** · `style.css:248-253`

✅ **L-25 ⚪ Miqdor 0 da ham "−" ko'rsatiladi** · `script.js:178-184`
Odatiy naqsh: 0 da faqat "+" yoki "Qo'shish", bosilgach stepper'ga aylanadi.

✅ **L-26 ⚪ Savatga qo'shilganda hech qanday tasdiq yo'q** · `script.js:266-267`

### 4.5. Ishonch elementlari

**L-27 🟡 Xaritada boshqa restoran nomi** · `index.html:128`
Embed URL'da `Shaurma Po'lat Lavash`. *Eslatma:* `CLAUDE.md` bu **ataylab** qoldirilganini aytadi (URL parametri buzilmasin uchun). Texnik sabab tushunarli, lekin mijoz pul to'lashdan oldin boshqa nomni ko'radi. Google Maps'da joy nomini yangilash yechim bo'ladi.

✅ **L-28 🟠 Meta-tavsifda noto'g'ri shahar** · `index.html:7` · `kichik` ✔
"**Toshkent** markazida" — restoran esa Farg'ona, Quva (`:37`, `:108`). Bu matn Google natijasida va Telegram'da ko'rinadi.

✅ **L-29 🔴 Yetkazib berish narxi, vaqti va to'lov usuli hech qayerda aytilmaydi** · `o'rta`
Mijoz "Yetkazib berish"ni tanlab, quyidagilarni **bilmasdan** yuboradi: narxi, vaqti, minimal buyurtma, naqd/karta, hudud. Konversiya uchun eng katta noaniqlik.

**L-30 🟠 Barcha rasmlar Unsplash stok fotosi** · `index.html:34, 68-73, 80, 88`
G'arb fine-dining muhitini ko'rsatadi, mahalliy restoranni emas. Ikki zarar: ishonch ("bu ularning joyi emas") va texnik (sekin tarmoqda hero bo'sh qora quti).

**L-31 🟡 Stok odam surati "Bizning shior" deb belgilangan** · `index.html:87-93`
Yonida hero'dagi **aynan o'sha** matn (`:39` = `:91`). Shablon to'ldirilmagani ko'rinib turibdi.

✅ **L-32 🟡 Telegram ulashish preview'i yo'q** · `index.html:3-10`
`og:title`, `og:description`, `og:image` yo'q. O'zbekistonda havola asosan Telegram orqali tarqaladi. `schema.org/Restaurant` ham yo'q.

### 4.6. Accessibility (landing)

✅ **L-33 🟠 Pinch-zoom bloklangan** · `index.html:5` ✔ — qarang D-H1

✅ **L-34 🟠 Modallar ARIA'siz va fokus tuzog'isiz** · `index.html:143-189, 203-255`
`role="dialog"`, `aria-modal` yo'q, fokus modalga ko'chmaydi, Tab bilan orqa sahifaga chiqib ketiladi. *Escape ishlaydi.*

✅ **L-35 🟡 Xato xabarlari ekran o'qiruvchiga e'lon qilinmaydi** · `#bkError`, `#coError`
`role="alert"` / `aria-live` yo'q.

✅ **L-36 🟡 "Buyurtma turi" yorlig'i hech narsaga bog'lanmagan** · `index.html:224`
Toggle oddiy `<button>`lardan iborat, `role="radiogroup"` yo'q, tanlangan variant **faqat rang bilan** bildiriladi.

✅ **L-37 ⚪ Emoji ikonkalar matn sifatida o'qiladi** (📍🕑📞) — `aria-hidden` yo'q

**L-38 ⚪ Galereya rasmlari CSS `background-image`** — alt yo'q, SEO'da indekslanmaydi

✅ **L-39 ⚪ Gamburgerda `aria-expanded` yo'q**

✅ **L-40 🟡 Tugmalarda fokus ko'rsatkichi yo'q** — inputlarda to'g'ri qilingan, tugmalarda yo'q

✅ **L-41 ⚪ Kicker matnlari 4.23:1** · `style.css:41-44` (12px uppercase)

### 4.7. Matn va til

✅ **L-42 🟡 "Bizni kuting"** · `index.html:103` — ma'no noto'g'ri. Kerak: "Biz bilan bog'laning" yoki "Bizni toping".

**L-43 🟡 "Famliy" — izchil emas** · `index.html:84` ✔
7 joyda "Ziyo **F**amliy", 84-qatorda "Ziyo **f**amliy". Izchillik yo'qligi bu imlo xatosi ("Family") bo'lishi mumkinligini ko'rsatadi. *Eslatma:* `CLAUDE.md` 2026-09-08 da brend nomi ataylab o'zgartirilganini qayd etgan — egasi bilan aniqlashtirish kerak.

✅ **L-44 ⚪ "mahsulotlaridan"** · `index.html:85` → "mahsulotlardan"

**L-45 ⚪ Hero tagline aynan takrorlanadi** · `:39` va `:91`

✅ **L-46 ⚪ "N ta taom"** · `script.js:285` — savatda suv va choy bo'lsa ham "3 ta taom". "3 ta" tabiiyroq.

**Xato xabarlari:** klient tomondagilar yaxshi (nima qilishni aytadi), server tomondan kelganlari yomon (L-13).

---

## 5. Xodim ekranlari

Afitsiant, oshpaz, kassir, kuryer. Bular planshet/telefonda, tez sur'atda, band restoranda — bir qo'lda, ba'zan iflos qo'l bilan, shoshib ishlatiladi.

### 5.1. Kritik

✅ **X-01 🔴 Oshpaz ekranida vaqt umuman yo'q — FIFO buziladi** · `chef/kitchen.js:29-32` · `o'rta`
Server `sent_at`ni **yuboradi** (✔ API javobida bor), ekran **chizmaydi**. Stollar `sort_order, id` bo'yicha tartiblanadi, yuborilgan vaqt bo'yicha **emas**.
*Stsenariy:* 20:15, 6 ta stol band. "Stol 4" 25 daqiqa kutayotgan, lekin raqami katta bo'lgani uchun pastda. Oshpaz buni bilmaydi. Kechikkan buyurtma qizarmaydi.
**Tuzatish:** `⏱ 12 daq` + eng eski `sent_at` bo'yicha tartib + 15 daqiqada `--warn`, 25'da `--danger` ramka. Yangi API kerak emas.

✅ **X-02 🔴 "Tayyor" xabari scroll qilinsa yo'qoladi** · `app.js:758-772`, `style.css:224`
Topbar `sticky`, bildirishnoma ro'yxati esa **emas**. Ovoz, tebranish, topbar'da hisoblagich — hech biri yo'q. Afitsiant menyuning pastida bo'lsa xabarni ko'rmaydi, osh sovuydi.

✅ **X-03 🔴 Xabar kelganda sahifa 52px pastga sakraydi** · `app.js:774-791`
Karta oqimga qo'shiladi. Afitsiant "Lag'mon"ning "+"iga barmog'ini tushirayotganda xabar keladi — barmoq "Manti"ga tushadi. `renderList()` bu himoyani beradi, lekin bildirishnoma konteyneri **undan tashqarida**. 3 ta taom bir vaqtda tayyor bo'lsa — 156px sakrash.
**Tuzatish (X-02 va X-03 birga):** `.notif-list { position: sticky; top: <topbar balandligi> }` — bitta CSS qoidasi.

### 5.2. Jiddiy

✅ **X-04 🟠 Bloklangan tugma bloklanganday ko'rinmaydi** ✔ · `kichik`
`style.css`da `:disabled` qoidasi **umuman yo'q**. `withBusy()` tugmani bloklaydi — ikki marta buyurtma tushishining oldi olinadi — lekin ko'rinish **0% o'zgaradi**. Sekin internetda xodim "ishlamadi" deb yana bosadi. Kodning o'z izohi buni tan oladi (`courier/orders.js:73-76`).

✅ **X-05 🟠 Miqdorni 5 qilish = 5 bosish, 5 ta HTTP so'rovi** · `waiter/order.js:167` · `o'rta`
12 kishilik to'y stoli = **12 bosish**, sekin Wi-Fi'da ~20 soniya.
**Tuzatish:** qator raqamiga bosilsa `2 / 5 / 10` tez-tugmalari.

✅ **X-06 🟠 Bir taomni 3 marta bossa — 3 ta alohida qator** ✔ · `server/services/orders.js:100-104` · `o'rta`
Jonli tasdiq: "Osh ×1", "Osh ×1", "Osh ×1". Oshpaz ekranida uchta qator va uchta "Tayyor" tugmasi, chekda ham uchta.
**Tuzatish:** yuborilmagan (`sent_at IS NULL`) bir xil qator bo'lsa `quantity`ni oshirish. Allaqachon yuborilganga qo'shmaslik.

✅ **X-07 🟠 Afitsiant qatorida qaysi taom tayyor ekani ko'rinmaydi** · `waiter/order.js:232` · `kichik`
`ready_at` javobda bor, ishlatilmaydi. Faqat "Kutilmoqda" va hech narsa — "tayyorlanmoqda" va "TAYYOR" bir xil ko'rinadi.

✅ **X-08 🟠 Kuryer "Yetkazildi"ni tasdiqlashsiz bosadi — "Xarita" 8px yonida** · `courier/orders.js:34, 40-45` · `kichik`
Ikkalasi 36px, 8px oraliq, orqaga qaytarish yo'li yo'q. Mototsikl ustida bir qo'lda.

✅ **X-09 🟠 Oshpazda "Tasdiqlash" va "Tayyor" 6px oraliqda, tasdiqlashsiz** · `chef/kitchen.js:85-88` · `kichik`
"Tayyor" bosilsa buyurtma oshpaz ekranidan **butunlay yo'qoladi** va kuryerga signal ketadi. Oshpaz uni qayta topa olmaydi.

✅ **X-10 🟠 Katta harf bilan login hisobni 15 daqiqaga qulflaydi** ✔ · `kichik`

```
afitsiant  -> 200     Server qidiruvi: WHERE username = ?   (harfga SEZGIR)
Afitsiant  -> 401     Limiter kaliti:  user:${toLowerCase()} (kichik harfga keltiriladi)
AFITSIANT  -> 401     login.html:      autocapitalize YO'Q
```

Telefon klaviaturasi birinchi harfni avtomatik kattalashtiradi → 401 → xodim qayta uradi → 10-urinishda **to'g'ri yozilgan `afitsiant` ham qulflanadi**. Smena boshida.
*Eslatma:* bu 2026-09-10 da qo'shilgan rate-limiter tufayli og'irlashgan — limiter kalitini kichik harfga keltirish to'g'ri qaror edi, lekin qidiruvning harfga sezgirligi bilan birga nomuvofiqlik yaratdi.

✅ **X-11 🟠 Chiqish tugmasi tasdiqlashsiz, ~28px, har sahifada yuqori o'ngda** · `style.css:141-145` · `kichik`
Bosh barmoq tegsa sessiya tugaydi. Qayta kirish: landing → "Xodim kirishi" → login → parol → stollar = **4–5 qadam**, mijoz kutib turibdi.

✅ **X-12 🟠 Bekor qilingan taomning "tayyor" xabari abadiy osilib qoladi** ✔ · `orders.js:195-217` · `kichik`
`cancelOrderItem()` bildirishnomaga tegmaydi. *Naqsh bor:* `kitchen.js:104` "tayyor emas"ga qaytarilganda xabarni o'chiradi — faqat ikkinchi joyga qo'llanmagan.

**X-13 🟠 Bildirishnoma hamma afitsiantga ko'rinadi, har kim tasdiqlay oladi** · `services/notifications.js:20-26` · `o'rta`
`notifications`da `user_id` yo'q. Afitsiant A odat bo'yicha "Qabul qildim" bosadi — lekin bu B ning stoli. B hech qachon bilmaydi, taom oshxonada qoladi.

✅ **X-14 🟠 "Oshxonaga yuborish" tepada, "Hisob-kitob" barmoq zonasida** · `waiter/order.html:20, 33` · `o'rta`
Eng ko'p ishlatiladigan amal eng uzoqda, stolni yakuniy yopadigan amal esa barmoq turgan joyda. Prioritet teskari.

### 5.3. O'rta

✅ **X-15 🟡 Tarmoq uzilsa inglizcha `Failed to fetch`** · `app.js:44-62` · `kichik`
`navigator.onLine` ishlatilmagan. Xodim internet yo'qligini tushunmaydi, "tizim buzuq" deb o'ylaydi.

✅ **X-16 🟡 Toast 3 soniya, bitta element, faqat rang bilan farqlanadi** · `app.js:119-131`
Ikki xato ketma-ket bo'lsa faqat oxirgisi ko'rinadi. Yopish tugmasi yo'q.

✅ **X-17 🟡 Bosish maydonlari — 44px qoidasi qisman buzilgan**

| Element | O'lcham | Holat |
|---|---|---|
| `.qty-stepper button` (+/−) | **32×32** | ❌ eng ko'p bosiladigan, eng kichigi |
| `.btn.small` (Qabul qildim, Tayyor, Yetkazildi) | **36px** | ❌ |
| `.remove-item` (×) | **32px eni** | ❌ |
| `.logout-btn` | **~28px** | ❌ |
| Orqaga `←` | **~20×24** | ❌ oddiy `<a>` |
| `.btn` | 44px | ✅ |
| `.tabs button`, `.bottom-nav a` | 44px | ✅ |
| `#menuItems .btn.add` | 44px, 100% en | ✅ eng yaxshi qaror |
| `.fab` | 56px | ✅ |

Tizim qoidani **biladi** (`.btn`da yozilgan), eng ko'p bosiladigan uchta elementda buzgan.

✅ **X-18 🟡 Navigatsiya rollar orasida izchil emas**

| Rol | Navigatsiya |
|---|---|
| Kassir | 3 tabli panel (mobil) / drawer (≥720px) |
| Afitsiant | Yo'q — faqat 20px `←` |
| Oshpaz | Yo'q |
| Kuryer | Yo'q |

Lekin `.app-body` **har bir** sahifada mavjud bo'lmagan panel uchun **76px** joy ajratadi, `.order-total-bar` esa bo'sh joy ustida osilib turadi.

✅ **X-19 🟡 Menyu bir marta yuklanadi va hech qachon yangilanmaydi** · `waiter/order.js:392`
19:00 da ochilgan ekran, 21:00 da osh tugadi — afitsiant hamon ko'radi, mijozga "bor" deydi.

✅ **X-20 🟡 `.order-total-bar` telefonda sig'maydi** · `style.css:361-366`
`flex-wrap` yo'q. Kassir "Qo'lda hisoblash"da 360px'da ~445px kerak.

✅ **X-21 🟡 Zoom bloklangan, matn esa mayda** — 11–13px badge/label, qarang D-H1

✅ **X-22 🟡 Menyuda qidiruv yo'q** · `waiter/order.html:26-27`

✅ **X-23 🟡 `mt-4` klassi mavjud emas** · `chef/kitchen.js:29`
CSS'da faqat `.mt-8` va `.mt-16` bor — oshxona kartochkasida taom qatorlari 0px oraliqda.

✅ **X-24 🟡 Ekranga qaytganda ma'lumot eskirgan** — `visibilitychange` ishlatilmagan

### 5.4. Kichik

- ✅ **X-25** `login.html:19,21` — `<div class="login-label">`, `<label for>` emas
- ✅ **X-26** Parolni ko'rsatish tugmasi yo'q; `enterkeyhint="go"` yo'q
- ✅ **X-27** Login tugmasi so'rov davomida matnini o'zgartirmaydi
- ✅ **X-28** Xodim ekranlarida ~34 ta inline `style=`, tokenda yo'q ranglar (`#c0392b`)
- **X-29** 13 xil `font-size`, tokenlashtirilmagan
- ✅ **X-30** Oshpazga narx ko'rsatiladi — kerak emas, ekranni band qiladi
- ✅ **X-31** Bildirishnomada miqdor yo'q: "Stol 3 taomi tayyor: Osh" (3 ta bo'lsa ham)
- **X-32** Taomga izoh ("achchiqsiz", "pyozsiz") qo'shish imkoniyati umuman yo'q

---

## 6. Admin paneli

Restoran egasi/menejeri ishlatadi — kunda bir necha marta, kompyuter yoki planshetdan.

### 6.1. Kritik — pul hisobi

✅ **A-01 🔴 Bosh sahifadagi raqamlar qo'shilmaydi** ✔ · `admin/index.js:7-10` · `kichik`

```
Ekranda ega ko'radi:          Server hisoblaydi:
  Bugungi tushum    120 000     revenue          120 000
  Bugungi xarajat         0     expenses_total         0
  Sof foyda          60 000     cost_of_goods     60 000   ← EKRANDA YO'Q
                                net               60 000
```

Ega hisobida `120 000 − 0 = 120 000`, ekranda `60 000`. `grep cost_of_goods public/` → **0 natija**. Server tan narxni hisoblaydi, frontend hech qayerda ko'rsatmaydi.
Ega ikki xulosaga kelishi mumkin: "hisob-kitobi buzuq" yoki "60 ming so'm qayoqqa ketdi?".
**Tuzatish:** 5-plitka "Taom tan narxi". ~15 daqiqa.

✅ **A-02 🔴 Hisobotdagi tushum 3 manbadan, ro'yxat 1 tadan** · `services/reports.js:47-55` vs `:119-140` · `o'rta`
`summary` stol + landing + kassir cheklarini qo'shadi, `listOrders()` faqat stol buyurtmalarini. "2 ta buyurtma" yoziladi, pastda 1 ta karta.
*Qiziq detal:* kassir `stats.html`da ikkala manbani birlashtirgan to'liq ro'yxatni ko'radi — **kassirning solishtirish imkoni egadan yaxshiroq**.
**Tuzatish:** `kassirBilling.js`dagi `/bills` naqshini qayta ishlatish.

### 6.2. Jiddiy

✅ **A-03 🟠 Bosh sahifa faqat "bugun", taqqoslash va ogohlantirish yo'q** · `index.js:5-6`
Ertalab 9:00 da tushum 0, band stol yo'q — ekran deyarli bo'sh. Yo'q narsalar: kecha bilan taqqoslash, shu oy jami, kam qoldiq, yangi buyurtmalar soni, bugungi bronlar.

✅ **A-04 🟠 Bosh sahifa umuman yangilanmaydi** · `index.js:36-40`
`setInterval` yo'q. "Hozir band stollar" ertalabki holatda muzlab qoladi. (Chek navbati esa har 3 soniyada yangilanadi.)

✅ **A-05 🟠 Yangi bron kelganda hech kim xabar olmaydi** · `routes/publicReservations.js`
Faqat `INSERT`, bildirishnoma yo'q, bronlar sahifasi yangilanmaydi. Kechikkan bron = yo'qotilgan mijoz.

✅ **A-06 🟠 Bronlar teskari tartibda va hech qachon arxivlanmaydi** · `services/reservations.js:33`
`ORDER BY res_date DESC` — keyingi oyning broni bugungisidan **yuqorida**. Filtr yo'q.

✅ **A-07 🟠 Mijoz buyurtmalari: 200 ta karta, filtrsiz, har 15 soniyada**
2 oydan keyin 190 tasi "Bajarildi". "Nechta yangi buyurtma bor?" hisoblagichi yo'q.

✅ **A-08 🟠 Hech qayerda qidiruv yo'q** ✔
Butun admin panelda **0 ta** qidiruv maydoni. 200 ta taomdan "Lag'mon"ni topish — Ctrl+F.

✅ **A-09 🟠 Ombordagi "kam qoldi" alifbo tartibida ko'milib ketadi** · `services/inventory.js:41`
50 ta mahsulotdan tugaganini ko'rish uchun hammasini ko'zdan kechirish kerak.

**A-10 🟠 Hisobotda grafik, eksport, top taomlar, band soatlar, o'rtacha chek — yo'q** ✔
Atigi 3 ta endpoint. Hisobot javob beradi: *"qancha tushum/xarajat/foyda?"*. Javob **bermaydi**: qaysi taom eng ko'p daromad keltiradi, qaysisi sotilmaydi, qaysi soatlarda band, o'rtacha chek, o'tgan haftaga nisbatan o'sish, qaysi afitsiant qancha sotdi. → §8

✅ **A-11 🟠 Davr tanlashda tayyor tugmalar yo'q, "Ko'rsatish" javob bermaydi** · `reports.html:31-48`
Oylik hisobot uchun mobil `date` tanlagichda 6–8 teginish. "Ko'rsatish" bosilganda ekranda **eski raqamlar** turaveradi — ular yangi davrga tegishlidek tuyuladi.

✅ **A-12 🟠 Xarajatlar sahifasi butun tarixni yuklaydi, "Jami" davrsiz** · `expenses.js:72-76`
`LIMIT` yo'q. Yiliga ~1100 karta, tepada "Jami: 340 000 000 so'm". Hisobot esa bugunni ochadi — **ikki sahifa ikki xil mantiqda**.

✅ **A-13 🟠 Xarajatni kim kiritgani ko'rsatilmaydi** · `expenses.js:22-28` · **1 qator**
`created_by_name` serverdan keladi, chizilmaydi. Pul mas'uliyati masalasi.

✅ **A-14 🟠 Holat tugmalari yonma-yon va tasdiqlanmaydi** · `customer-orders.js:73-79`
`🖨 Chek` `✅ Tasdiqlash` `🏁 Bajarildi` `❌ Bekor qilish` `🗑 O'chirish` — bitta qatorda. Faqat oxirgisi tasdiqlanadi. "Bajarildi" o'rniga "Bekor qilish" bosilsa — ombor qaytariladi, orqaga yo'l yo'q.

**A-15 🟠 Desktopda har o'tishda 2 ta bosish** · `style.css:184-201`
≥720px'da sidebar drawer'ga yashiringan. 1920px monitorda joy bor. Kuniga 20–30 marta.

### 6.3. Ma'lumot arxitekturasi

Menyu tartibi foydalanish chastotasini **aks ettirmaydi**:

| Tartib | Bo'lim | Haqiqiy chastota |
|---|---|---|
| 1 | Bosh sahifa | kunlik |
| 2 | Menyu | oyda bir necha (sozlash) |
| 3 | Stollar | yiliga bir necha (sozlash) |
| 4 | Xodimlar | oyda bir (sozlash) |
| 5 | Xarajat | kunlik |
| 6 | Bronlar | kunlik |
| 7 | Buyurtmalar | soatlik |
| 8 | Ombor | haftalik |
| 9 | Hisobot | kunlik |

Eng kam ishlatiladigan uchtasi eng qulay o'rinlarda, eng kerakli ikkitasi oxirida.

**Taklif:** ikki guruh —
- **Kunlik ish:** Bosh sahifa, Buyurtmalar, Bronlar, Hisobot, Xarajat, Ombor
- **Sozlash:** Menyu, Stollar, Xodimlar

Bu mobil pastki panelni 5 tagacha qisqartiradi (D-F2 hal bo'ladi).

### 6.4. O'rta

- ✅ **A-16** Mobilda 9 ta tab sig'maydi — qarang D-F2
- ✅ **A-17** Uzun formada "Saqlash" ekrandan tashqarida (`.modal-actions` `sticky` emas)
- ✅ **A-18** Validatsiya faqat saqlaganda va 3 soniyalik toast orqali — maydon belgilanmaydi
- ✅ **A-19** Klaviatura qo'llab-quvvatlanmaydi — Esc, Enter, autofocus yo'q (`<form>` elementi yo'q)
- ✅ **A-20** Modallarni yopish qoidasi bir xil emas (ba'zilari fonga bosilsa yopiladi, ba'zilari yo'q)
- ✅ **A-21** To'ldirilgan formani "Bekor" tasodifan yo'qotadi
- ✅ **A-22** Hisobot ro'yxati 200 tada kesiladi — bu haqda hech narsa aytilmaydi
- ✅ **A-23** Bo'sh holatlar yo'l ko'rsatmaydi (faqat ombor'da yaxshi: "Yuqoridagi tugma bilan qo'shing (masalan: Suv, Salfetka)")
- ✅ **A-24** Qayta yuklashda plitkalar eski qiymatni ushlab turadi

### 6.5. Kichik

- ✅ **A-25** Kirim oynasi har doim "Necha **dona** keldi?" — birlik litr yoki quti bo'lishi mumkin
- ✅ **A-26** "Xarajat" (menyu) vs "Xarajatlar" (sarlavha); "Xodimlar" vs "Yangi foydalanuvchi"
- ✅ **A-27** "Buyurtmalar" nomi ikki ma'noli — faqat landing buyurtmalari, stol buyurtmalari "Hisobot"da
- ✅ **A-28** "Sof foyda" plitkasida "Bugungi" prefiksi yo'q, yonidagilarda bor
- ✅ **A-29** Zoom bloklangan — qarang D-H1
- ✅ **A-30** "Yopilgan buyurtma" hisoblagichi kassir cheklarini ham sanaydi — "Sotuvlar" to'g'riroq

---

## 7. Dizayn tizimi, responsive, accessibility

### 7.1. Rang tizimi

**D-A1 🟠 Ikki mustaqil dizayn tili** · `style.css:3-46` vs `landing/style.css:3-22`
Bir xil nomli o'zgaruvchilar turli qiymat bilan:

| Token | Ilova | Landing |
|---|---|---|
| `--text-dim` | `#b3a891` | `#6d6357` |
| `--radius` | 12px | 14px |
| `--radius-lg` | 18px | 26px |
| Urg'u rangi | oltin `#c9a227` | terracotta `#c1502e` |

Mijoz landing'dan login'ga o'tganda boshqa brendga tushgandek his qiladi.

✅ **D-A2 🟡 Tokendan tashqari inline ranglar** — `#c0392b` 6 ta joyda (palitrada yo'q, `--danger` = `#e2665c`)

✅ **D-A3 🟡 Shriftlar keraksiz yuklanadi** — Playfair ikki marta, `Cormorant Garamond` har sahifada yuklanadi, lekin **bitta qoidada** ishlatiladi. `@import` render'ni bloklaydi.

✅ **D-A4 ⚪** `style.css:443` — bitta qoidada `font-size` ikki marta

✅ **D-A5 ⚪** `.table-desktop` / `.card-list-mobile` — CSS yozilgan, hech qayerda ishlatilmagan

**Umumiy son:** 85 ta unikal rang qiymati ✔ (tokenlar 52 ta).

### 7.2. Kontrast (WCAG AA — oddiy matn 4.5:1)

#### ❌ O'tmaganlar

| ID | Juftlik | Nisbat | Jiddiylik |
|---|---|---|---|
| ✅ **D-B1** | Kassir asosiy tugmasi — oltin oq fonda ✔ | **2.42:1** | 🔴 |
| ✅ **D-B2** | `--text-faint` fonda — `th`, `.field label`, `.login-label`, `.stat-tile .label`, `.bottom-nav a`, `.t-status` ✔ | **3.73–3.95:1** | 🟠 eng keng tarqalgan |
| ✅ **D-B3** | `.badge.low` | 3.97:1 | 🟠 |
| ✅ **D-B4** | `.btn.primary` gradient to'q uchida | 4.17:1 | 🟡 |
| ✅ **D-B5** | `.btn.danger` | 4.44:1 | ⚪ chegarada |
| ✅ **D-B6** | Landing `.kicker` | 4.23:1 | 🟡 |
| ✅ **D-B7** | Hero tagline rasm ustida | ~3.6:1 | 🟡 rasmga bog'liq |
| — | Landing "Tugadi" `opacity: 0.55` bilan | **2.23–2.33:1** | 🟠 (L-22) |
| — | Placeholder (`color-scheme` yo'q) | **~2.0:1** | 🔴 |

#### ✅ O'tganlar

| Juftlik | Nisbat |
|---|---|
| Asosiy matn ✔ | **15.76:1** |
| `.dim` (ilova) ✔ | **7.88:1** |
| `.dim` (landing) | 5.88:1 |
| `.badge.ok` / `.badge.debt` | 4.62 / 5.05 |
| Landing oltin tugma | 7.74–11.02 |
| Chek matni | 13.74 |

**Tuzatish — 2 ta qiymat butun ilovani tuzatadi:**
- `--text-faint: #7c7360` → `#9a9078` (≈5.6:1)
- `--danger: #e2665c` → `#ea8078` (badge 5.3:1)

### 7.3. Dark mode va native widget'lar

✅ **D-C1 🔴 `color-scheme: dark` e'lon qilinmagan** ✔ · `style.css:3`
Ilova to'liq to'q rejimda, lekin brauzerga aytilmagan. Natijada `<input type="date">` va `type="time"` ning **native ikonkasi va paneli yorug'** chiqadi — qora ikonka qora fonda ko'rinmaydi. Sana filtri amalda ishlatib bo'lmaydi (`expenses.html`, `reports.html`, `kassir/stats.html`). Shuningdek `<select>`, scrollbar, autofill foni va placeholder.
**Tuzatish:** 1 qator.

**D-C2 ⚪ `prefers-color-scheme`** — qo'llab-quvvatlanmaydi, va bu **to'g'ri qaror**: oshxona/kassa ekranlari kechqurun ishlaydi, doimiy to'q rejim ma'qul. Faqat D-C1ni tuzatish kerak.

✅ **D-C3 ⚪** `<meta name="theme-color">` yo'q

### 7.4. Tipografika

✅ **D-D1 🟠 Bironta ham `line-height` yo'q** ✔ · `style.css` (457 qator — **0 ta**)
Butun ilova brauzerning `normal` (≈1.15) qiymatida. Taom tavsifi kabi ko'p qatorli matn siqiq.
**Tuzatish:** `body { line-height: 1.5 }` — vizual regressiyani ko'zdan kechirish bilan.

**D-D2 🟡 Miqyos yo'q** ✔
16 xil o'lcham (11→26px) — deyarli har bir butun son. Bu miqyos emas, tasodifiy tanlov. HTML/JS'da yana 21 ta inline `font-size`.

✅ **D-D3 🟡 Eng kichik matn — 11px** — `.badge`, `th`, `.bottom-nav a`, `.stat-tile .label`. D-B2 bilan birga: **11px va 3.7:1 kontrast bir joyda** — eng yomon kombinatsiya.

✅ **D-D4 ⚪** Hero `h1` 320px'da `line-height: 1` bilan harf dumlari tegadi

✅ **D-D5 ⚪** ALL CAPS + `letter-spacing` 9 ta joyda — o'zbek matnida apostrof bilan o'qish sekinlashadi

### 7.5. Oraliq (spacing)

**D-E1 🟡 Ilova: asosan izchil, lekin tizim e'lon qilinmagan** — `gap` 8/12px (yaxshi), `padding`da 4-tizimdan tashqari 6 xil qiymat. Radius va soya tokenlashtirilgan, oraliq esa **yo'q**.

**D-E2 🟡 Landing: sezilarli tarqoq** — 12 xil `gap`, 4 ga bo'linmaydigan qiymatlar (5, 11, 15, 22, 26, 34, 38).

### 7.6. Responsive

**Barcha chegaralar:** ✔

| Fayl | Chegaralar | Metodologiya |
|---|---|---|
| `style.css` | 480, 640, **641**, 720 | `min-width` (mobile-first) |
| `landing/style.css` | 480, 640, 860, 1040 | `max-width` (desktop-first) |

6 xil chegara, **qarama-qarshi ikki metodologiya**. 768px (planshet) aniq qamrab olinmagan.

✅ **D-F1 🟠 1920px'da kontent chapga yopishadi** · `style.css:200` · **1 so'z**
`@media (min-width:720px) { main { margin: 0 } }` bazadagi `margin: 0 auto`ni bekor qiladi. Katta monitorda chapda 900px kontent, o'ngda ~1000px bo'sh.

✅ **D-F2 🔴 Admin mobil navigatsiyasi o'qib bo'lmaydi** · `style.css:169-182`
9 ta element `flex:1` qatorda. 320px'da har biri **35.5px**, yorliqlar ~60–75px kerak. Matn o'raladi.

✅ **D-F3 🔴 Kassir "Qo'lda hisoblash" barcha telefonlarda gorizontal siljiydi** · `style.css:331-334`
`.item-row` minimal ≈ **416px**, 320px telefonda `.card` ichki kengligi **256px**. 375px'da ham 311px < 416px.

✅ **D-F4 🟠 `.order-total-bar` telefonda sig'maydi** · `style.css:361-366`
320px'da 288px mavjud, ~407px kerak. Afitsiant/kassirning eng muhim harakat paneli kesiladi.

✅ **D-F5 🟠 Admin statistikasi 7 xonali tushumda sahifani siljitadi** · `style.css:306-313`
`"12 500 000 so'm"` ≈130px, 480px'da kafel ichki kengligi ≈75px. Grid `1fr` min-content'gacha kengayadi.
**Tuzatish:** `repeat(auto-fit, minmax(140px, 1fr))`.

✅ **D-F6 🟡** Afitsiant menyusi 320px'da ham 2 ustun — siqiq

✅ **D-F7 🟠 Ilovada `overflow-x` himoyasi yo'q** — landing'da bor. F3/F4/F5 to'g'ridan-to'g'ri gorizontal siljishga aylanadi.

✅ **D-F8 🟠 `env(safe-area-inset-bottom)` ilovada yo'q** — `manifest.json`da `display: standalone` (PWA). Pastki nav iPhone home-indicator ostida qoladi. Landing'da **bor**.

✅ **D-F9 🟡** 5 ta sahifada nav yo'q, lekin 76px joy ajratiladi (X-18 bilan bir xil)

**D-F10 🟡** Ilova 720px'da, landing 860px'da "buriladi" — turli nuqtalar

### 7.7. Bosish maydonlari (44×44px me'yori)

#### Ilova

| Element | O'lcham | Yetishmayapti |
|---|---|---|
| `input[type=checkbox]` ("mavjud") | **~13×13** | **−31px** 🔴 |
| `.logout-btn` | ~28px | −16px |
| `.nav-toggle-btn` ("☰ Menyu") | ~30px | −14px |
| `.qty-stepper button` | 32×32 | −12px |
| `.remove-item` | 32px en | −12px |
| `.btn.small` (butun admin panel) | 36px | −8px |
| `.bottom-nav a` (320px) | 35.5px en | −8.5px |
| `.field input` | ~41px | −3px |
| `.login-card button` | ~42px | −2px |

#### Landing

| Element | O'lcham | Yetishmayapti |
|---|---|---|
| `.nav-links a` (desktop) | ~24px | −20px |
| `.scroll-cue` | 26×42 | −18px en |
| `.nav-login` | ~31px | −13px |
| `.book-modal-close` | 34×34 | −10px |
| `.location-btn` | ~36px | −8px |
| `.menu-qty button` (≤640px) | 36×36 | −8px |
| `.fulfillment-opt`, `.btn-pill`, `.nav-toggle` | ~40px | −4px |

✅ **44px va undan katta:** `.btn`, `.tabs button`, `.fab`, `.btn.add`, landing `.btn-solid`, `.menu-tab`, `.nav-close`, `.book-field input`.

### 7.8. Accessibility

✅ **D-H1 🔴 Pinch-zoom 20 ta sahifada bloklangan** ✔ · barcha `*.html:5` · **1 daqiqa**
`maximum-scale=1` — WCAG 1.4.4 buzilishi. **Va keraksiz:** iOS zoom muammosi allaqachon `input { font-size: 16px }` bilan hal qilingan. Ko'zoynak taqadigan oshpaz 11px badge'ni kattalashtira olmaydi.

✅ **D-H2 🔴 41 ta input yorliqqa bog'lanmagan** ✔ · `o'rta`
Xodim ilovasida `label for=` — **0 ta**. Yorliqlar `<div class="field"><label>Nomi</label><input id="fName"></div>` — `<label>` inputni o'ramaydi, `for` yo'q. Login'da umuman `<div>`. Ekran o'qiruvchi 41 ta inputni "edit text" deb o'qiydi.
*Solishtirish:* landing'da **10 ta `label for=`** — ya'ni u to'g'ri qilingan, ilova qismi qilinmagan.

✅ **D-H3 🟠 Ikonka-tugmalar matnsiz va `aria-label`siz** — `✎`, `🗑` (`admin/inventory.js:55-56`, `admin/menu.js:102-103`)

✅ **D-H4 🟠 30 ta bir xil "+" tugmasi** — qaysi taomga tegishli ekani aytilmaydi

✅ **D-H5 🟠 `:focus-visible` yo'q** ✔ — faqat inputlarda `:focus`. To'q oltin gradient ustida standart halqa ko'rinmaydi. *Yaxshi tomoni:* hech qayerda `outline: none` bilan butunlay o'chirilmagan.

✅ **D-H6 🟠 Modallarda `role`, focus trap, Escape yo'q** — butun loyihada `role=` va `tabindex=` — **0 ta**. Yopilgach fokus qaytarilmaydi, scroll qulflanmaydi. (Landing'da Escape va scroll qulfi bor.)

✅ **D-H7 🟠 Yopiq modallar Tab tartibida qoladi (landing)** — `opacity:0; pointer-events:none` bilan yashiriladi, `display:none` emas. Klaviatura foydalanuvchisi ko'rinmas ~12 ta maydonga tushib qoladi. *Ilovada to'g'ri hal qilingan* (`.hidden { display:none !important }`).

✅ **D-H8 🟡** Sidebar rejimida `.bottom-nav` ekrandan chiqarilgan, lekin 9 ta havola fokuslanadi

✅ **D-H9 🟡** 4 ta `<img>`da `alt` yo'q (landing'da to'g'ri: `alt=""`)

✅ **D-H10 🟡** Bosiladigan `<div>`lar — `tabindex`, `role="button"`, klaviatura hodisasi yo'q

✅ **D-H11 🟡** Sarlavha ierarxiyasi yo'q — faqat `<h1>`, qolganlari `<div class="card-title">`

✅ **D-H12 ⚪** Navigatsiya emojilarida `aria-hidden` yo'q

**D-H13 ✅** `<html lang="uz">` — 20/20 to'g'ri

✅ **D-H14 ⚪** Google Maps `<iframe>`da `title` yo'q

✅ **D-H15 ⚪** `prefers-reduced-motion` qo'llab-quvvatlanmaydi

### 7.9. Chek (print)

✅ **D-I1 🟡** Chek **modali** print uchun tayyorlanmagan — Ctrl+P'da fon, tugmalar, navigatsiya chiqadi. (Asosiy yo'l QZ Tray → ESC/POS, bu faqat zaxira.)

✅ **D-I2 🟡** Print'da `body { color }` bekor qilinmaydi — oq fonda oq matn

✅ **D-I3 ⚪** Chek foni krem qoladi — toner sarfi

✅ **D-I4 ⚪** Landing'da `@media print` yo'q

**Chek (ESC/POS) — tasdiqlangan holat:** ✔ 42 belgi ichiga sig'adi, "JAMI" qatori ikki barobar kenglikda to'g'ri 21 belgiga tekislanadi. **Yetishmaydi:** chek raqami, restoran telefoni/manzili (`settings` jadvalida bor, ishlatilmaydi), afitsiant/kassir ismi.

### 7.10. Izchillik

✅ **D-J1 🟠 Ikki qarama-qarshi o'zaro ta'sir modeli** ✔
Ilova: **0 ta** `:hover`, 9 ta `:active` — lekin admin/kassir **sichqonchali kompyuterda** ishlaydi.
Landing: 15 ta `:hover`, **0 ta** `:active` — lekin auditoriya **telefon**, hover "yopishib" qoladi.
Ikkalasi bir-birining kerakli xatti-harakatiga ega.
**Tuzatish:** `@media (hover: hover)` ichida hover, `:active` har doim.

✅ **D-J2 🟠 `:disabled` uslubi yo'q** — X-04 bilan bir xil

✅ **D-J3 🟡 Xato uch xil ko'rinishda** — ro'yxat xatosi **bo'sh ro'yxat bilan aynan bir xil** ko'rinadi (`<p class="dim">`). "Hech narsa yo'q" va "yuklab bo'lmadi"ni ajratib bo'lmaydi.

✅ **D-J4 🟡 Native `alert()` 3 joyda qolgan** — printer xatosi "127.0.0.1:3213 says" oynasida

✅ **D-J5 ⚪** `<div style="flex:1;">` 12 faylda takrorlangan

**D-J6 ⚪** `.menu-variants-toggle` — bir xil klass nomi, ikki xil ko'rinish

**D-J7 ⚪** Modal naqshi ikki xil (ilova: pastdan sheet; landing: markazda scale)

**D-J8 ⚪** Badge ikki xil padding/fon bilan

✅ **D-J9 ⚪** Bo'sh holat matnlari: "Hozir band stol yo'q." va "Hozircha band stol yo'q." — bir xil narsa

---

## 8. Qo'shish mumkin bo'lgan yangi imkoniyatlar

Mavjud muammolarni tuzatishdan tashqari — restoranga haqiqiy qiymat qo'shadigan narsalar.

### 8.1. Egaga yetishmayotgan ma'lumot (eng katta bo'shliq)

Hozir panel bitta savolga javob beradi: *"bugun qancha pul tushdi?"*. Ega esa **qaror qabul qilish** uchun boshqa savollarni beradi. Ma'lumotlarning hammasi bazada allaqachon bor.

| Imkoniyat | Nega kerak | Hajm |
|---|---|---|
| **Eng ko'p / eng kam sotilgan taomlar** (miqdor va daromad bo'yicha) | Menyuni qisqartirish va narx qo'yish qarori shundan chiqadi. "3 oyda 2 marta sotilgan taom" menyudan olib tashlanadi. | `o'rta` |
| **Taom bo'yicha foyda (marja)** | Eng ko'p sotiladigan taom eng ko'p foyda keltirmasligi mumkin. `cost_price_snapshot` allaqachon saqlanadi. | `kichik` (yuqoridagi bilan birga) |
| **Kun/soat bo'yicha grafik** | Xodimlar jadvali va aksiya vaqtini tanlash uchun. Kutubxona shart emas — oddiy CSS ustunlar. | `o'rta` |
| **O'rtacha chek + davrlar taqqoslashi** ("▲12% o'tgan haftaga nisbatan") | Mutlaq raqam ma'nosiz, o'zgarish ma'noli. Ikkala raqam allaqachon bor. | `kichik` |
| **Xarajatlar turkumlar bo'yicha** | "Oyiga qancha kommunalga, qancha go'shtga?" — `category` maydoni bor, hech qachon guruhlanmaydi. | `kichik` |
| **Afitsiant bo'yicha sotuv** | Mukofot/motivatsiya tizimi uchun. `added_by` / `closed_by` allaqachon saqlanadi. | `kichik` |
| **CSV eksport** | Buxgalter va soliq uchun. `Blob` + `a[download]` bilan ~30 qator. | `kichik` |

### 8.2. Operatsion imkoniyatlar

| Imkoniyat | Nega kerak | Hajm |
|---|---|---|
| **Taomga izoh** ("achchiqsiz", "pyozsiz") | Real restoranda har kuni uchraydi, hozir tizimda iz qolmaydi | `o'rta` |
| **Ovoz/tebranish signali** (oshpaz "tayyor" bosganda) | Shovqinli zalda vizual karta yetarli emas | `o'rta` |
| **Bildirishnomani afitsiantga bog'lash** | Hozir har kim har kimning xabarini "yutadi" (X-13) | `o'rta` |
| **Stolni ko'chirish / birlashtirish** | Mijozlar boshqa stolga o'tadi, guruhlar birlashadi | `o'rta` |
| **Hisobni bo'lish** | "Har kim o'zinikini to'laydi" — keng tarqalgan so'rov | `katta` |
| **To'lov usuli belgisi** (naqd / karta / Click / Payme) | Kassa kechqurun hisob-kitob qilishi uchun | `kichik` |
| **Chegirma / xizmat haqi** | Doimiy mijozlar, banket, xizmat foizi | `o'rta` |

### 8.3. Mijoz tomoni

| Imkoniyat | Nega kerak | Hajm |
|---|---|---|
| **Buyurtma holatini kuzatish** (`/order/<id>`) | Mijoz "qabul qilindi"dan keyin ko'r qoladi. Raqam allaqachon serverdan keladi. | `katta` |
| **Telegram bildirishnoma** (buyurtma holati o'zgarganda) | O'zbekistonda asosiy aloqa kanali | `o'rta` |
| **Takroriy buyurtma** ("oldingi buyurtmani qaytarish") | Doimiy mijozlar uchun konversiya | `o'rta` |
| **QR menyu** (stol ustida) | Mijoz menyuni o'z telefonidan ko'radi, afitsiantni kutmaydi | `o'rta` |

### 8.4. Hamma rollar uchun

| Imkoniyat | Nega kerak | Hajm |
|---|---|---|
| **Profil sahifasi — o'z parolini o'zgartirish** ✔ | Hozir **hech kim o'z parolini o'zgartira olmaydi** — faqat admin tiklaydi. `session_version` mexanizmi tayyor, ulanadi xolos. | `o'rta` |
| **Oflayn holat ko'rsatkichi** | Internet uzilsa xodim buni bilsin (X-15) | `kichik` |

---

## 9. Ilova: o'lchangan raqamlar

Bu raqamlar ishlab turgan ilovada yoki kodni to'g'ridan-to'g'ri hisoblash orqali **mustaqil tasdiqlangan** (✔ belgisi).

### Kontrast (WCAG formulasi bilan hisoblangan)

| Juftlik | Nisbat | AA |
|---|---|---|
| Kassir asosiy tugmasi (oltin / oq) | 2.42:1 | ❌ |
| `--text-faint` / `--bg` | 3.95:1 | ❌ |
| `--text-faint` / `.card` | 3.73:1 | ❌ |
| `--danger` badge / o'z foni | 5.14:1 | ✅ |
| `.dim` / `--bg` | 7.88:1 | ✅ |
| Asosiy matn / `--bg` | 15.76:1 | ✅ |

### Kod

| O'lchov | Qiymat |
|---|---|
| CSS tokenlar | 52 (34 ilova + 18 landing) |
| Unikal rang qiymatlari | 85 |
| Shrift o'lchamlari | 16 xil (11–26px) |
| Media query chegaralari | 6 xil (480, 640, 641, 720, 860, 1040) |
| `line-height` qoidalari (`style.css`) | **0** |
| `:focus-visible` | **0** |
| `:disabled` uslubi | **0** |
| `color-scheme` | **0** |
| `maximum-scale=1` bor sahifalar | **20 / 20** |
| Xodim ilovasi inputlari / `label for=` | **41 / 0** |
| Landing `label for=` | 10 |
| Qidiruv maydonlari | **0** |
| Grafik / eksport | **0 / 0** |

### Jonli tekshiruvlar

| Tekshiruv | Natija |
|---|---|
| `afitsiant` / `Afitsiant` / `AFITSIANT` login | 200 / **401** / **401** |
| Bosh sahifa: `revenue − expenses_total` vs `net` | 120 000 vs **60 000** |
| Public menyuda rasmli taomlar | **0 / 11** |
| Landing meta-tavsifidagi shahar | **Toshkent** (haqiqiy: Farg'ona, Quva) |
| Bir taomni 3 marta qo'shish | **3 ta alohida qator** |
| Chek (ESC/POS) eng uzun qator | 42 / 42 belgi ✅ |

---

*Bu hujjat 2026-09-10 dagi holatni aks ettiradi. Tuzatishlar kiritilgach tegishli bandlarni "✅ tuzatildi" deb belgilab, sanasini qo'shish tavsiya etiladi — `CLAUDE.md`dagi "Holat" bo'limlari naqshi bo'yicha.*
