## 2026-09-26 (4) — Kassir "Hisoblash" cheki uchun ixtiyoriy mijoz raqami

- Nima qilindi: kassirning "Hisoblash" (qo'lda chek) ekranidagi pastki gold panelga (Jami/Tozalash/Chek chiqarish qatoriga) ixtiyoriy "📞 Mijoz raqami" input maydoni qo'shildi. Kiritilsa — bazaga saqlanadi, chek matnida ("Mijoz: ...") va termal printerdagi chekda ham chiqadi, Statistika ro'yxatida ham (📞 belgisi bilan) ko'rinadi. Kiritilmasa hech narsa o'zgarmaydi (ixtiyoriy, NULL).
- O'zgargan fayllar: `server/schema.sql`/`server/db.js` (`manual_bills.customer_phone`, yangi `migrateAddManualBillCustomerPhone()`), `server/services/manualBills.js` (`sanitizePhone()`, `createManualBill()` uchinchi parametr, receipt'ga qo'shildi), `server/routes/kassirBilling.js` (`req.body.customer_phone`ni uzatish + `/bills` so'roviga `phone` ustuni), `public/app.js` (chek modal va ESC-POS chekda "Mijoz: ..." qatori), `public/kassir/manual.html`/`manual.js` (input maydoni, so'rovga qo'shish, tozalashda bo'shatish), `public/kassir/stats.js` (ro'yxatda telefon ko'rsatish), `public/style.css` (`.order-total-bar.with-phone` — faqat shu sahifaga xos, boshqa sahifalardagi bir xil klassga tegmadi).
- Natija: migratsiya avval nusxada, so'ng haqiqiy bazada sinaldi (xatosiz), `manualBills.createManualBill()` to'g'ridan-to'g'ri chaqirilib telefon bilan/bo'sh/juda uzun holatlar tekshirildi (hammasi kutilganidek), test yozuvlari bazadan to'liq o'chirildi. `pm2 restart polat --update-env` xatosiz, jarayon barqaror **online** (restart soni faqat +1), avtomatik backup ham muvaffaqiyatli ishladi. **Haqiqiy brauzerda vizual tekshiruv qilinmadi** (bu muhitda headless brauzer yo'q) — foydalanuvchi tomonidan tekshirish tavsiya etiladi.

## 2026-09-26 (3) — "Turlari" panelida uzun nom stepperni siqib/kesib qo'yishi tuzatildi

- Nima qilindi: "Turlari" (variantlar) ro'yxatida nomi va "− son +" stepperi bitta qatorda ekani sababli uzun nomlar (masalan "Mini Non Burger") siqilib kesilib qolayotgan edi. Endi nomi TEPADA o'z to'liq eniga ega alohida qatorda, narxi+tugma esa PASTDA ikkinchi qatorda chiqadi (asosiy kartochkaning nomi/narx-tugma joylashuviga o'xshash).
- O'zgargan fayllar: `public/menu-picker.js` (`mpRenderVariantRow` — yangi `.mp-vr-bottom` qatori), `public/style.css` (`.mp-variant-row` endi `flex-direction:column`, yangi `.mp-vr-bottom`).
- Natija: `node -c` xatosiz, CSS qavs balansi (205/205) to'g'ri. Statik fayl — restart shart emas.

## 2026-09-26 (2) — Menyu kartochkasida miqdor stepper ("− son +") va to'liq ekran tuzatishi

- Nima qilindi: (1) "📋 Menyu" modali endi haqiqatan BUTUN ekranni qoplaydi — avval `max-width:1040px` sababli chekkalarda orqadagi sahifa (topbar/pastki panel) xira ko'rinib turardi, `.menu-pick-modal`ga `position:fixed; inset:0` qo'yildi. (2) Har bir taom kartochkasida (va "Turlari" panelidagi variantlarda) endi miqdor 0 bo'lsa oddiy "+" tugma, 1 yoki undan ko'p bo'lsa "− <son> +" stepper chiqadi — umumiy `menu-picker.js` komponentiga qo'shildi (`mpQtyControl`, `mpRenderGrid`ning yangi `getQty` parametri).
- O'zgargan fayllar: `public/menu-picker.js` (umumiy, kassir VA afitsiant ishlatadi — lekin afitsiantda `getQty` uzatilmagani uchun uning ko'rinishi o'zgarmadi), `public/kassir/manual.js` (`getMenuPickQty`/`findRowForMenuItem`/`decrementMenuItem` yangi, `pickMenuItem` shu yordamchidan foydalanadi), `public/style.css` (`.menu-pick-modal` to'liq ekran, `.mp-qty-stepper` ixcham ko'rinish).
- Natija: `node -c` barcha faylda xatosiz, CSS qavs balansi (204/204) to'g'ri, `pm2`da `polat` jarayoni online qoldi (statik fayl, restart shart emas). **Haqiqiy brauzerda vizual tekshiruv qilinmadi** (bu muhitda headless brauzer yo'q) — foydalanuvchi tomonidan tekshirish tavsiya etiladi.

## 2026-09-26 — Kassir "Hisoblash" menyu modalida tanlangan taomlar ko'rinishi

- Nima qilindi: kassirning "Hisoblash" bo'limidagi "📋 Menyu" modali (to'liq ekran) ochiq turganda, sarlavha yonida (o'ng burchakda) hozircha tanlangan taomlar kichik "chip" (`Nomi ×son`) ko'rinishida jonli chiqadi — kassir modalni yopmasdan nima qo'shganini ko'radi.
- O'zgargan fayllar: `public/kassir/manual.js` (yangi `renderMenuPickSelected()`, `openMenuPicker()`/`pickMenuItem()`da chaqiriladi, modal HTML'iga `.menu-pick-header`/`#menuPickSelected` qo'shildi), `public/style.css` (`.menu-pick-header`/`.menu-pick-selected`/`.menu-pick-chip`).
- Natija: `node -c` va CSS qavs balansi tekshirildi, xatosiz. Statik fayl — restart shart emas. **Haqiqiy brauzerda vizual tekshiruv qilinmadi** (bu muhitda headless brauzer yo'q) — foydalanuvchi tomonidan tekshirish tavsiya etiladi.

## 2026-09-23 — Admin paroli o'zgartirildi

- Nima qilindi: admin hisobi (login: `polat`) paroli **Polat3** ga o'zgartirildi (bazada to'g'ridan-to'g'ri scrypt xeshlab yangilandi, `server/passwords.js` orqali).
- O'zgargan: faqat baza (`data/polat.db` — `users` jadvali), kod o'zgarmadi. Restart shart bo'lmadi.
- Natija: haqiqiy `/api/login` so'rovi bilan yangi parol tasdiqlandi (200 OK, admin sifatida kirdi).

## 2026-09-20 — Oshxonaga avtomatik chek chiqarish

- Nima qilindi: afitsiant "🍽️ Oshxonaga yuborish" tugmasini bosganda endi oshxonadagi printerga AVTOMATIK (tugmasiz) zakaz cheki chiqadi — faqat stol nomi + taom nomi/soni, narxsiz.
- O'zgargan fayllar: `server/schema.sql` (yangi `kitchen_tickets`/`kitchen_ticket_items` jadvallari), `server/services/orders.js` (`sendPendingItems()`), `server/routes/chefKitchen.js` (yangi `GET /kitchen-tickets/pending` + `POST /kitchen-tickets/:id/printed`), `server/index.js` (`/api/qz`ga `chef` roli qo'shildi), `public/app.js` (`KITCHEN_PRINTER_NAME`, `buildEscPosKitchenTicket`, `printKitchenTicketView`, `initChefKitchenTicketPrinting`).
- Natija: to'liq HTTP oqim vaqtinchalik test hisoblar bilan sinaldi, ishlayapti; `pm2 restart polat` xatosiz, jarayon barqaror online.
- Keyingi qadam (foydalanuvchi tomonidan, jismoniy qurilmada): oshxona kompyuteriga QZ Tray o'rnatish, printerni Windows'da aynan **"Oshxona-Printer"** deb nomlash, sertifikatni ("override.crt") joylashtirish, va shu kompyuterda oshpaz login qilingan holda `/chef/kitchen.html` sahifasini doim ochiq qoldirish. Shu sozlash bo'lmaguncha haqiqiy qog'ozga chop etish sinalmagan.
- Tafsilot: `CLAUDE.md`dagi "Holat — 2026-09-20" bo'limi.
