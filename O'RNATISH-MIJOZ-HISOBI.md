# Mijoz hisobi — VPS'ga o'rnatish yo'riqnomasi (2026-11-01)

Bu yangilanish landing saytiga **mijoz hisobi** qo'shadi: mijoz telefon raqamini kiritadi, **Telegram bot** orqali 6 xonali kod oladi va kiradi. Hisobda buyurtmalar tarixi, bronlar, saqlangan manzillar va profil bo'ladi.

## 1. Telegram bot ochish (bir marta, 2 daqiqa)

1. Telegram'da **@BotFather**ni oching → `/newbot`.
2. Nom bering (masalan `Ziyo Family`) va username bering (masalan `ZiyoFamilyBot`, oxiri `bot` bilan tugashi shart).
3. BotFather bergan **tokenni** saqlab qo'ying (`123456789:AA...` ko'rinishida). Uni hech kimga, hech qanday chatga yubormang.
4. (Ixtiyoriy) `/setuserpic` — logotip, `/setdescription` — "Ziyo Family saytiga kirish kodlari".

> ⚠️ **Yangi bot oching.** Agar bu token boshqa joyda ham ishlatilsa (boshqa server yoki webhook), Telegram `409 Conflict` beradi va kodlar kelmaydi.

## 2. Serverga yuklash

Avval bazaning zaxira nusxasini oling:

```bash
cd /path/to/polat            # loyiha papkasi
cp data/polat.db data/polat.db.bak-$(date +%Y%m%d-%H%M)
```

Kodni yangilang (git orqali):

```bash
git fetch origin
git checkout main && git pull           # yoki: git merge mijoz-hisobi
```

Yoki zip'dagi fayllarni xuddi shu papka tuzilishi bilan ustidan yozing.

## 3. `.env`ga token qo'shish

`.env` fayliga quyidagi qatorni qo'shing:

```
TELEGRAM_BOT_TOKEN=123456789:AA...sizning_tokeningiz
```

`SESSION_SECRET` bo'sh **bo'lmasligi** kerak (aks holda har restartda mijozlar ham hisobdan chiqib ketadi).

## 4. Qayta ishga tushirish

```bash
pm2 restart polat --update-env
pm2 logs polat --lines 30
```

Logda quyidagilar ko'rinishi kerak:

```
Migratsiya: 'customer_orders' jadvaliga 'customer_id' ustuni qo'shilmoqda...
Migratsiya: 'reservations' jadvaliga 'customer_id' ustuni qo'shilmoqda...
Telegram bot @ZiyoFamilyBot ishga tushdi (mijoz kirishi)
```

Yangi `npm install` **shart emas**: hech qanday yangi paket qo'shilmagan (Node 18+ ichidagi `fetch` ishlatiladi).

Nginx sozlamasiga tegish ham shart emas: bot webhook emas, server o'zi Telegram'ga ulanadi.

## 5. Tekshirish

1. https://ziyofamily.com/landing/ sahifasida header'da **"Kirish"** paydo bo'lishi kerak.
2. Kirish → raqamingiz → **Telegram'ni ochish** → Start → **📱 Raqamni ulashish** → kod keladi → saytga kiriting.
3. Ismingizni yozing → hisob ochiladi.
4. Menyudan buyurtma bering: ism/telefon o'zi to'ldiriladi, buyurtma "Buyurtmalar"da ko'rinadi.
5. Stol bron qiling: bron "Bronlar"da ko'rinadi va bekor qilish mumkin.

## Muammolar

| Belgi | Sabab / yechim |
|---|---|
| "Telegram orqali kirish hozircha ishlamayapti" | `TELEGRAM_BOT_TOKEN` yo'q yoki noto'g'ri. `.env`ni tekshiring, `pm2 restart polat --update-env` |
| Logda `409 Conflict` | Token boshqa joyda ishlatilmoqda. Yangi bot oching |
| Logda `fetch failed` / `ETIMEDOUT` | Server `api.telegram.org`ga chiqa olmayapti (firewall). `curl https://api.telegram.org` bilan tekshiring |
| Bot "Telegram raqamingiz boshqa" deydi | Mijoz saytda Telegram'ga ulangan raqamdan boshqa raqam yozgan |

## Xavfsizlik (qisqacha)

- Kod bazada ochiq holda emas, **HMAC-xesh** sifatida saqlanadi. Kod 5 daqiqa amal qiladi, 5 marta noto'g'ri kiritilsa bekor bo'ladi, qayta yuborish oralig'i 60 soniya.
- Bot faqat mijozning **o'z** kontaktini qabul qiladi (Telegram tasdiqlagan raqam), boshqa odam raqamini ulab bo'lmaydi.
- Mijoz cookie'si (`polat_customer`) xodimlar cookie'sidan butunlay alohida. Mijoz hech qachon admin yoki kassa sahifasiga kira olmaydi.
- "Barcha qurilmalardan chiqish" tugmasi boshqa qurilmalardagi sessiyalarni ham darhol yopadi.
- Eski (anonim) buyurtmalar hisobga avtomatik bog'lanmaydi. Faqat hisobga kirib berilgan yangi buyurtma va bronlar ko'rinadi.

## SMS orqali kod (ixtiyoriy, Telegram'i yo'q mijozlar uchun)

Telegram asosiy usul bo'lib qoladi (bepul). SMS faqat "Telegram'im yo'q" tugmasini bosganlarga yuboriladi va har bir SMS **pullik** (~70–200 so'm).

1. **my.eskiz.uz** da ro'yxatdan o'ting va balansni to'ldiring.
2. Kabinetda SMS shablonini yuboring va tasdiqlating (3 ish kunigacha). Masalan:
   `Ziyo Family: kirish kodingiz {code}. Kodni hech kimga bermang.`
   Kabinetdagi shablonda `{code}` o'rniga Eskiz talab qilgan belgini qo'ying. Matnning qolgan qismi `.env`dagi `SMS_CODE_TEMPLATE` bilan **harfma-harf bir xil** bo'lishi kerak.
3. `.env` fayliga qo'shing:
   ```
   ESKIZ_EMAIL=kabinet_emailingiz
   ESKIZ_PASSWORD=kabinet_parolingiz
   SMS_CODE_TEMPLATE=Ziyo Family: kirish kodingiz {code}. Kodni hech kimga bermang.
   # ixtiyoriy:
   # ESKIZ_FROM=ZiyoFamily        (tasdiqlangan alfa-nom bo'lsa)
   # SMS_PER_PHONE_DAILY=5
   # SMS_DAILY_LIMIT=300
   ```
4. `pm2 restart polat --update-env`.

Shablon tasdiqlanmaguncha Eskiz faqat test matnlarini yuboradi. Shu sabab sozlamalarni shablon tasdiqlangandan keyin qo'ying. `ESKIZ_*` bo'sh bo'lsa, saytda SMS tugmasi umuman chiqmaydi.

**Pul himoyasi:** IP bo'yicha 10 daqiqada 3 ta, bitta raqamga sutkada 5 ta, butun saytga sutkada 300 ta SMS. Limit tugasa, mijozga Telegram orqali kirish taklif qilinadi. Xato bo'lsa, `pm2 logs polat` da `SMS yuborishda xato:` qatori chiqadi.
