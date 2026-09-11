# Po'lat — pushlar va o'zgarishlar

**Branch:** `fix/audit-2026-09-10` (`main`ga tegilmagan) · Vaqt — Toshkent (UTC+5)

## Pushlar

| # | Vaqt | Oraliq | Nima ketdi |
|---|---|---|---|
| 1 | 09-10 02:29 | `[new branch]` → `ec53acf` | Branch yaratildi: testlar, ombor, xavfsizlik, hisobot |
| 2 | 09-10 kunduzi | … → `b8eac07` | 2-bosqich audit + arxitektura refaktori |
| 3 | 09-10 22:52 | `b8eac07..3945e3f` | UI/UX 1-to'lqin + UTC+5 biznes vaqti |
| 4 | 09-10 23:59 | `3945e3f..879f632` | Xodim ekranlari + admin paneli |
| 5 | 09-11 09:43 | `879f632..07d6e3c` | Chuqur tahlil: 5 ta mantiqiy xato |

## Oxirgi 10 ta commit

**`07d6e3c` · 09-11 09:43 — Chuqur tahlil: 5 ta mantiqiy xato**
- Oshxonaga yuborilgan taom miqdori oshirilsa, qo'shimcha endi alohida qator bo'lib oshxonaga boradi (ilgari oshpaz ko'rmasdi, pul esa olinardi).
- Oshxona tartibi faqat hali tayyor bo'lmagan taomlar bo'yicha.
- Yuborilmagan taomli stolni server yopmaydi; kassir aniq tasdiqlasa yopadi.
- Yetkazib berish o'chirilgani va minimal summa serverda tekshiriladi; yetkazish narxi saqlanadi va chekda chiqadi.
- Bosh sahifa o'tgan kungi tasdiqlanmagan bronni sanamaydi. 221/221 test.

**`879f632` · 09-10 23:58 — UI/UX 3-to'lqin: admin paneli**
- Bosh sahifa: Tushum − Tan narx − Xarajat = Sof foyda, kecha bilan taqqoslash, "E'tibor talab qiladi".
- Hisobot uch manbani ko'rsatadi; filtrlar, qidiruv; yangi **Sozlamalar** sahifasi.

**`8303a19` · 09-10 23:27 — UI/UX 2-to'lqin: xodim ekranlari**
- Oshxona: kutish vaqti va rangi; afitsiant: taom holati, miqdorni tez tanlash; kassir va kuryer telefonga sig'adi; login katta harf bilan ishlaydi.

**`3945e3f` · 09-10 22:51 — UTC+5 biznes vaqti**
- Toshkentda 00:00–05:00 sotuvlari endi to'g'ri kunga yoziladi (ilgari oldingi kunga tushardi).

**`bd318d2` · 09-10 22:37 — UI/UX 1-to'lqin**
- Dizayn tizimi (kontrast, 44px tugmalar, zoom), umumiy JS (modal, xato maydon ostida), landing savati, bir xil taomlar birlashadi ("Osh ×3").

**`b8eac07` · 09-10 10:21 — Frontend `renderList()` qatlami**
- 16 ta sahifadagi takroriy kod bitta joyga; poll xatosi ro'yxatni o'chirmaydi, tugma bosilayotganda yo'qolmaydi.

**`73d0fbc` · 09-10 10:06 — Route'lar servis qatlamiga**
- 12 ta yangi servis; route fayllari bazaga to'g'ridan-to'g'ri murojaat qilmaydi. Xulq o'zgarmagan.

**`0649fd5` · 09-10 10:02 — Structured logging**
- JSON loglar, `X-Request-Id`, parollar logda yashiriladi.

**`2790793` · 09-10 10:00 — Migratsiya va ruxsat tizimi**
- Versiyalangan migratsiyalar (`schema_migrations`); ruxsatlar bitta jadvalda (`permissions.js`).

**`3e0bfe1` · 09-10 03:04 — CLAUDE.md**
- 2-bosqich audit hujjatlashtirildi (24 ta xato).

## Eslatma

- Joylashtirilgandan keyin hamma xodim bir marta qayta login qiladi.
- Admin → **Sozlamalar**'da yetkazib berish narxi va shartlarini to'ldiring.
- Batafsil: `CLAUDE.md` va `docs/UI-UX-TAHLIL.md`.
