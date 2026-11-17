# Po'lat v2 — arxitektura (TypeScript + PostgreSQL)

Eski ilova (`../server`, Express + SQLite) **o'zgarishsiz ishlashda davom etadi**.
v2 shu papkada alohida quriladi va tayyor bo'lgach eski backend o'rnini egallaydi.
Frontend (`../public`) o'zgarmaydi — v2 xuddi shu API yo'llarini beradi.

Zaxira: eski holat `zaxira/2026-11-17-sqlite` tegi (commit `c4579c3`).

## Tuzilma

```
v2/
  migrations/NNNN_nom.sql   — versiyalangan sxema (faqat YANGI fayl qo'shiladi, eskisi tahrirlanmaydi)
  src/
    config/                 — .env zod bilan tekshiriladi; xato bo'lsa server ishga tushmaydi
    db/pool.ts              — pg Pool, withTransaction(), BIGINT -> number
    db/migrator.ts          — migratsiya runner (checksum, advisory lock, har biri tranzaksiyada)
    http/app.ts             — createApp(deps): global holatsiz, testda alohida baza bilan quriladi
    http/middleware.ts      — request-id + log, xavfsizlik sarlavhalari (CSP), xato ishlovchisi
    http/errors.ts          — AppError oilasi (400/401/403/404/409/410/429)
    http/validate.ts        — zod bilan kirishni tekshirish
    lib/logger.ts           — pino (cookie/parol/token/kod yashiriladi)
    modules/<mavzu>/        — (keyingi bosqichlar) routes.ts -> service.ts -> repository.ts
  test/                     — haqiqiy PostgreSQL bilan (vitest)
```

## Qatlam qoidalari

1. **routes** — faqat HTTP: kirishni `parse(schema, req.body)` bilan tekshiradi, service'ni chaqiradi, javob qaytaradi. SQL yo'q.
2. **service** — biznes mantiq va tranzaksiya chegarasi (`db.withTransaction`). Faqat `AppError` otadi.
3. **repository** — faqat SQL, parametrli so'rovlar (`$1`), string birlashtirish yo'q.
4. Pul/ombor/buyurtma amallari — tranzaksiyada, poyga holatlarida `SELECT ... FOR UPDATE`.
5. Narx doim serverda `menu_items`dan olinadi.
6. Vaqt bazada `TIMESTAMPTZ` (UTC); kunlik hisobot `AT TIME ZONE 'Asia/Tashkent'`.

## Baza himoyasi (SQLite'dan farqi)

Biznes qoidalari bazaning o'zida — kod xato qilsa ham baza qabul qilmaydi:
manfiy narx/qoldiq yo'q, miqdor > 0, bitta stolda bitta ochiq buyurtma,
bitta kassirda bitta ochiq smena, to'lov turi faqat cash/card/mixed,
oshxona cheki yo stolga yo onlayn buyurtmaga tegishli, mijoz telefoni `+998XXXXXXXXX`,
SQLite'da yo'q bo'lgan barcha FOREIGN KEY'lar.

## Buyruqlar

```bash
cp .env.example .env          # DATABASE_URL, SESSION_SECRET ...
npm ci
npm run migrate               # sxemani qo'llash (idempotent)
npm run dev                   # ishlab chiqish
npm test                      # TEST_DATABASE_URL (nomida "test" bo'lishi SHART — har safar tozalanadi)
npm run build && npm start    # production
```

## Bosqichlar

| # | Bosqich | Holat |
|---|---|---|
| 1 | Asos: config, log, pool, migratsiyalar, to'liq sxema, xato ishlovchisi, testlar | ✅ |
| 2 | Kirish va rollar: xodim/mijoz sessiyalari (session_version bilan bekor qilish), rate-limit bazada | ⏳ |
| 3 | Menyu va ombor | ⏳ |
| 4 | Stol buyurtmalari va kassa (smena, to'lov, qo'lda chek) | ⏳ |
| 5 | Onlayn buyurtma, yetkazish hududi, printer navbati (WS), Telegram/SMS | ⏳ |
| 6 | Hisobot/audit, SQLite -> PostgreSQL ko'chirish skripti, VPS yo'riqnomasi | ⏳ |
