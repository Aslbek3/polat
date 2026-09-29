# Oshxona printeri — to'liq qo'llanma

**Nima hal qilinadi:** ofitsiant telefonidan "Oshxonaga yuborish" bosilganda
oshxona printeridan chek **o'zi** chiqadi. Brauzer ochiq turishi shart emas,
har safar "Allow" ruxsat oynasi chiqmaydi, ofitsiant qaysi internetda
(Wi-Fi yoki mobil) bo'lishi ahamiyatsiz.

Hujjat kimlar uchun: restoran egasi va o'rnatuvchi uchun (1–8 bo'limlar),
dasturchi uchun (9–11 bo'limlar).

---

## Mundarija

1. [Muammo nima edi](#1-muammo-nima-edi)
2. [Yechim qanday ishlaydi](#2-yechim-qanday-ishlaydi)
3. [Nima kerak](#3-nima-kerak)
4. [O'rnatish — qadam-baqadam](#4-ornatish--qadam-baqadam)
5. [Tekshirish](#5-tekshirish)
6. [Avtomatik ishga tushirish](#6-avtomatik-ishga-tushirish)
7. [Kundalik ishlatish va nazorat](#7-kundalik-ishlatish-va-nazorat)
8. [Muammolar va yechimlari](#8-muammolar-va-yechimlari)
9. [Sozlamalar ma'lumotnomasi](#9-sozlamalar-malumotnomasi)
10. [Xavfsizlik](#10-xavfsizlik)
11. [Texnik ma'lumot (dasturchi uchun)](#11-texnik-malumot-dasturchi-uchun)
12. [Tez-tez so'raladigan savollar](#12-tez-tez-soraladigan-savollar)

---

## 1. Muammo nima edi

Ofitsiant taom yuborganda oshxonaga chek chiqishi kerak. Eski usulda chek
oshxonadagi kompyuterning **brauzeridan** (`kitchen.html` sahifasi) **QZ Tray**
dasturi orqali chiqardi. Bundan uchta muammo kelib chiqardi:

| Muammo | Oqibati |
|---|---|
| Brauzer doim ochiq turishi kerak | Kimdir tasodifan yopsa, cheklar chiqmay qoladi va buni hech kim sezmaydi |
| QZ Tray har chop etishda "Allow" so'raydi | Oshxonada tugma bosib turadigan odam yo'q |
| Ofitsiant mobil internetda ishlaydi | Uning telefoni restoran tarmog'idagi printerga umuman ulana olmaydi |

Oxirgi nuqta eng muhimi: **telefon printerga to'g'ridan-to'g'ri ulanmaydi va
ulanishi ham shart emas.**

---

## 2. Yechim qanday ishlaydi

Chop etish qarori serverda qabul qilinadi, chekni esa restoran ichidagi
kichik dastur — **agent** — printerga yuboradi.

```
  Ofitsiant telefoni            VPS server                Restoran tarmog'i
  (mobil internet)          polatuz.duckdns.org
        │                          │
        │  1. "Oshxonaga yuborish" │
        ├─────────────────────────►│
        │                          │  2. chek navbatga yoziladi
        │                          │     (kitchen_tickets)
        │                          │
        │                          │◄──── 3. "yangi chek bormi?" ────┐
        │                          │         (har 2 soniyada)        │
        │                          ├────► 4. chek ma'lumoti ────────►│
        │                          │                            ┌────┴─────┐
        │                          │                            │  AGENT   │
        │                          │                            └────┬─────┘
        │                          │                                 │ 5. ESC/POS
        │                          │                                 ▼
        │                          │                        ┌──────────────────┐
        │                          │                        │ printer          │
        │                          │◄─── 6. "chop etildi" ──│ 192.168.1.230    │
        │                          │                        └──────────────────┘
```

**Nega aynan shunday:** printer restoran routeri ortida, ichki manzilda
(`192.168.1.230`) turadi — internetdan unga kirib bo'lmaydi. Shuning uchun
ulanishni agent **ichkaridan tashqariga** ochadi. Natijada:

- routerni sozlash shart emas,
- provayderdan oq (statik) IP sotib olish shart emas,
- printer internetga ochilmaydi (begona odam unga chek chiqara olmaydi).

**Muhim xususiyat:** chek printerga **muvaffaqiyatli** yuborilgandan keyingina
"chop etildi" deb belgilanadi. Printer o'chiq bo'lsa yoki qog'oz tugasa — chek
navbatda qoladi va printer tiklangach o'zi chiqadi. Buyurtma hech qachon
yo'qolmaydi.

**Serverga tegilmagan.** Agent serverning allaqachon mavjud API'sidan
foydalanadi, shuning uchun VPS'da hech narsa yangilanmaydi, `pm2 restart`
qilinmaydi.

---

## 3. Nima kerak

| # | Nima | Izoh |
|---|---|---|
| 1 | **Tarmoqdagi printer** | 80mm ESC/POS termal printer, Ethernet bilan. Sizdagi XP-80 mos: selftestda `Interface: USB & Ethernet`, `IP address: 192.168.1.230`, `Net DHCP: Disabled` |
| 2 | **Doim yoqiq kompyuter** | Restoran Wi-Fi/tarmog'ida. Kassa kompyuteri bo'lsa ham bo'ladi. Muqobil: Raspberry Pi yoki eski Android (Termux) |
| 3 | **Node.js 18+** | Bepul, [nodejs.org](https://nodejs.org) — LTS versiyasi |
| 4 | **Alohida hisob** | Admin panelda: login `printer`, rol **Oshpaz** |

**Printer qayerda turishi kerak?** Oshxonada. Agar hozir kassada bo'lsa:
- printerni oshxonaga ko'chiring (tarmoq kabeli yoki Wi-Fi orqali), yoki
- kassaga alohida printer oling — agent ikkalasini boshqara oladi.

Agent va printer **bir xil tarmoqda** bo'lishi kifoya; ular yonma-yon turishi
shart emas.

---

## 4. O'rnatish — qadam-baqadam

### 4.1. Admin panelda hisob yarating

1. https://polatuz.duckdns.org — admin sifatida kiring
2. **Xodimlar** → yangi xodim
3. Login: `printer`, Rol: **Oshpaz**, parol: kuchli (kamida 6 belgi)

> Nega alohida hisob: agent kim ekani loglarda aniq ko'rinadi va kerak bo'lsa
> bu hisobni boshqalarga tegmasdan bloklash mumkin.

### 4.2. Node.js o'rnating

[nodejs.org](https://nodejs.org) → **LTS** → Windows Installer → hammasiga Next.

Tekshirish: `Win+R` → `cmd` → `node -v` → `v20.x.x` (yoki undan yuqori) chiqishi kerak.

### 4.3. Agentni yuklab oling

Brauzerda oching:

```
https://github.com/Aslbek3/polat/archive/refs/heads/printer-agent.zip
```

Arxivni oching va ichidagi **`agent`** papkasini `C:\polat-agent` ga ko'chiring.

> Internetsiz variant: `agent` papkasini USB bilan ko'chiring.

### 4.4. Sozlamani yozing

`C:\polat-agent` ichida `config.example.json` faylidan nusxa oling va
**`config.json`** deb nomlang. Bloknotda ochib to'ldiring:

```json
{
  "server": "https://polatuz.duckdns.org",
  "username": "printer",
  "password": "4.1-bandda yaratgan parol",
  "printer": { "host": "192.168.1.230", "port": 9100 }
}
```

**Printer IP'sini qayerdan bilaman?** Printerni o'chiring, qog'oz tugmasini
bosib turgan holda yoqing — selftest chiqadi, undagi `IP address` qatoriga
qarang.

---

## 5. Tekshirish

### 5.1. Printer ishlayaptimi (serversiz)

`C:\polat-agent` papkasida `Shift` + o'ng tugma → **"Open PowerShell window here"**:

```
node print-agent.js --test
```

Printerdan "SINOV" deb yozilgan chek chiqishi kerak. Chiqmasa — [8-bo'lim](#8-muammolar-va-yechimlari).

### 5.2. To'liq oqim

```
node print-agent.js
```

Ekranda ko'rinishi kerak:

```
Agent ishga tushdi — server: https://polatuz.duckdns.org, printer: 192.168.1.230:9100
Serverga kirildi: printer (chef)
Server bilan aloqa yaxshi
```

Endi ofitsiant telefonidan bitta taom yuboring. 2–3 soniyada chek chiqadi va
ekranda yozuv paydo bo'ladi:

```
Chop etildi: #41 — Stol 5 (2xOsh, 1xLag'mon)
```

### 5.3. ⚠️ Eski usulni o'chiring

Agent ishlagach oshxonadagi brauzerda **`kitchen.html` sahifasini yoping**
(yoki QZ Tray'ni to'xtating). Aks holda ikkalasi bir xil chekni chop etib,
**ikki nusxa** chiqishi mumkin.

---

## 6. Avtomatik ishga tushirish

Kompyuter yoqilganda agent o'zi ishlashi uchun (Windows):

1. `Win+R` → `taskschd.msc` → **Create Basic Task**
2. Nomi: `Polat printer agenti` → Next
3. Trigger: **When I log on** → Next
4. Action: **Start a program** → Program: `C:\polat-agent\start.bat` → Next → Finish
5. Ro'yxatdan yaratilgan vazifani toping → o'ng tugma → **Properties**:
   - **Run whether user is logged on or not** — foydalanuvchi chiqib ketsa ham ishlaydi
   - **Settings** bo'limida "Stop the task if it runs longer than" belgisini **olib tashlang** (agent doimiy ishlaydi)

`start.bat` agentni ishga tushiradi va u qandaydir sababga ko'ra to'xtasa,
10 soniyadan keyin qayta yoqadi.

**Tekshirish:** kompyuterni qayta yoqing va ofitsiant telefonidan taom yuboring.

---

## 7. Kundalik ishlatish va nazorat

Agent fonda ishlaydi — hech narsa qilish shart emas. Tekshirish kerak bo'lsa:

| Savol | Qayerdan bilinadi |
|---|---|
| Agent ishlayaptimi? | Ochiq oyna yoki `C:\polat-agent\print-agent.log` faylining oxirgi qatorlari |
| Bugun nechta chek chiqdi? | Log faylda `Chop etildi:` qatorlari |
| Xato bormi? | Log faylda `[XATO]` bilan boshlangan qatorlar |

Log fayl 1 MB dan oshsa avtomatik `print-agent.log.old` ga ko'chiriladi — disk
to'lib qolmaydi.

**Nima bo'lganda nima bo'ladi:**

| Holat | Natija |
|---|---|
| Printer o'chgan / qog'oz tugagan | Chek navbatda qoladi, printer tiklangach o'zi chiqadi. Oshpaz shu vaqtda buyurtmani ekranda ko'rib turadi |
| Internet uzilgan | Agent har 15 soniyada qayta urinadi; aloqa tiklangach navbatdagi hamma chek ketma-ket chiqadi |
| Kompyuter o'chgan | Cheklar serverda navbatda turadi; kompyuter yoqilgach hammasi chiqadi |
| Sessiya eskirgan | Agent o'zi qayta kiradi, hech kim aralashmaydi |

---

## 8. Muammolar va yechimlari

### Sinov cheki chiqmadi

Ketma-ket tekshiring:

1. Printer yoqilganmi, qog'oz bormi, indikator yashilmi?
2. IP to'g'rimi? Selftest chiqaring (qog'oz tugmasini bosib turib yoqing) →
   `IP address` qatori.
3. Kompyuter printerni ko'radimi:
   ```
   ping 192.168.1.230
   ```
   Javob kelmasa — ikkalasi bir tarmoqda emas yoki printer kabeli uzilgan.
4. Port ochiqmi:
   ```
   powershell Test-NetConnection 192.168.1.230 -Port 9100
   ```
   `TcpTestSucceeded : True` bo'lishi kerak.

### `login muvaffaqiyatsiz (401)`

- `config.json` dagi login/parol admin paneldagi hisob bilan bir xilmi?
- Hisob faolmi (Xodimlar ro'yxatida bloklanmaganmi)?

### `navbatni olishda xato (403)`

Hisobning roli **Oshpaz** yoki **Admin** bo'lishi shart. Ofitsiant yoki kassir
roli bu ma'lumotni ololmaydi.

### `server javob bermadi (timeout)`

- Kompyuterda internet bormi?
- Brauzerda https://polatuz.duckdns.org ochiladimi?

### Chek ikki nusxa chiqyapti

Oshxonadagi brauzerda `kitchen.html` hali ochiq — yoping yoki QZ Tray'ni
to'xtating ([5.3](#53-️-eski-usulni-ochiring)).

### Kirill harflar noto'g'ri (krakozyabra)

Printerning kod sahifasi `Page17 (PC866)` bo'lishi kerak — selftestda
`Default code page` qatoriga qarang. Boshqa bo'lsa ayting, agentdagi kod
sahifasini moslash mumkin.

### Chek qatorlari o'ralib ketyapti

`config.json` da `"width"` ni kichraytiring: 80mm qog'oz uchun `42` (xavfsiz)
yoki `48` (to'liq eni).

### Agent ishlayapti, lekin chek chiqmayapti

Log faylga qarang. `Server bilan aloqa yaxshi` bor, lekin `Chop etildi` yo'q
bo'lsa — demak navbatda chek yo'q. Sabablari: ofitsiant "Oshxonaga yuborish"
tugmasini bosmagan (faqat taom qo'shgan), yoki chekni eski usul (brauzer)
allaqachon olib bo'lgan.

---

## 9. Sozlamalar ma'lumotnomasi

`config.json` fayli:

| Kalit | Standart | Nima qiladi |
|---|---|---|
| `server` | `https://polatuz.duckdns.org` | Server manzili |
| `username` / `password` | — | Agent kiradigan hisob (rol: Oshpaz) |
| `printer.host` | `192.168.1.230` | Printerning IP manzili |
| `printer.port` | `9100` | ESC/POS porti (odatda o'zgarmaydi) |
| `pollMs` | `2000` | Navbatni necha millisekundda tekshirish |
| `retryMs` | `15000` | Xatodan keyin qancha kutish |
| `width` | `42` | Bir qatordagi belgilar soni |
| `beep` | `true` | Chek chiqqanda ovoz berish |
| `cut` | `true` | Qog'ozni avtomatik qirqish |
| `copies` | `1` | Nechta nusxa chiqarish |
| `tzOffsetMinutes` | `300` | Chekdagi vaqt (Toshkent = UTC+5) |

Buyruqlar:

```
node print-agent.js          # doimiy ishlash (asosiy rejim)
node print-agent.js --test   # printerga sinov cheki (serversiz)
node print-agent.js --once   # bir marta tekshirib chiqish (nosozlik qidirish)
```

Parolni faylga yozmasdan, muhit o'zgaruvchisi bilan ham berish mumkin:
`POLAT_SERVER`, `POLAT_USER`, `POLAT_PASS`, `PRINTER_HOST`, `PRINTER_PORT`.

---

## 10. Xavfsizlik

- **`config.json` hech qachon GitHub'ga yuklanmaydi** — `.gitignore` ga
  qo'shilgan. Repo ochiq (public), parol u yerga tushmasligi kerak.
- **Printer internetga ochilmaydi.** Router sozlanmaydi, port ochilmaydi —
  ulanish faqat ichkaridan tashqariga.
- **Agent hisobi cheklangan**: faqat oshpaz huquqlari. U bilan hisobot ko'rish,
  narx o'zgartirish yoki stol yopish mumkin emas.
- Parolni almashtirish kerak bo'lsa: admin panelda parolni o'zgartiring va
  `config.json` da ham yangilang, keyin agentni qayta ishga tushiring.

---

## 11. Texnik ma'lumot (dasturchi uchun)

### Fayllar

```
agent/
  print-agent.js        — asosiy dastur (tashqi kutubxonasiz, Node 18+)
  config.example.json   — sozlama namunasi
  config.json           — haqiqiy sozlama (gitignore)
  start.bat             — Windows uchun ishga tushirgich (avtomatik qayta yoqish)
  README.md             — qisqacha
  QOLLANMA.md           — shu hujjat
  test/e2e.js           — soxta printer va soxta server bilan sinov
```

### Ishlatiladigan API (server kodi o'zgarmagan)

| So'rov | Vazifasi |
|---|---|
| `POST /api/login` | Sessiya cookie'sini olish |
| `GET /api/chef/kitchen-tickets/pending` | Chop etilmagan cheklar (`printed_at IS NULL`) |
| `POST /api/chef/kitchen-tickets/:id/printed` | Chop etildi deb belgilash |

Chek navbatini server `services/orders.js` dagi `sendPendingItems()` ichida
yaratadi — ya'ni ofitsiant "Oshxonaga yuborish" bosganda.

### Chop etish

- Protokol: xom ESC/POS, TCP port 9100 (drayver kerak emas).
- Kod sahifasi: `ESC t 17` = PC866 (printerning standart sahifasi). O'zbek
  lotin harflari ASCII bo'lgani uchun o'zgarishsiz o'tadi; kirill harflar
  CP866 baytlariga aylantiriladi; apostrof turlari (`oʻ`, `’`) oddiy `'` ga.
- Shrift: stol nomi ikki barobar en+bo'y, taomlar ikki barobar **bo'y**
  (en saqlanadi — uzun taom nomi keyingi qatorga o'ralib ketmaydi).
- Oxirida: signal (`ESC B`) va qirqish (`GS V A`).

### Sinov

```
node agent/test/e2e.js
```

Soxta TCP printer va soxta HTTP server ko'tariladi, agent alohida jarayonda
`--once` bilan ishlaydi. Tekshiriladi: login, navbatni olish, ESC/POS baytlar,
CP866 kirill, Toshkent vaqti, "chop etildi" belgilash, printer o'chiq holati,
noto'g'ri parol. Hozirgi holat: **16/16 o'tadi**.

### Kelajakda qo'shish mumkin

- **Kassa chekini ham shu yo'lga o'tkazish** — QZ Tray butunlay kerak bo'lmaydi
  va "Allow" oynasi hech qayerda chiqmaydi.
- **Ikkinchi printer (bar)** — menyu bo'limlariga "stansiya" belgisi qo'shilsa,
  ichimliklar barga, taomlar oshxonaga chiqadi.
- **Admin panelda holat** — "agent ulangan / uzilgan", oxirgi chek vaqti.

---

## 12. Tez-tez so'raladigan savollar

**Ofitsiant restoran Wi-Fi'siga ulanishi kerakmi?**
Yo'q. U mobil internetda bo'lsa ham bo'ladi — telefon faqat serverga ulanadi.

**VPS'ga nimadir o'rnatish kerakmi?**
Yo'q. Server kodi umuman o'zgarmagan.

**Agent ishlamay qolsa buyurtma yo'qoladimi?**
Yo'q. Cheklar serverda navbatda turadi va agent ishga tushgach chiqadi.
Oshpaz shu vaqtda ham buyurtmani ekranda ko'radi.

**Kompyuterni kechasi o'chirsak bo'ladimi?**
Ha. Ertalab yoqilganda navbatdagi cheklar chiqadi.

**Bitta agent ikkita printerni boshqara oladimi?**
Hozirgi versiyada bitta. Ikkinchi printer kerak bo'lsa aytilsin — stansiyalarga
ajratish qo'shiladi (yoki ikkinchi nusxa boshqa config bilan ishga tushiriladi).

**Internet butunlay uzilib qolsa-chi?**
Ofitsiantning telefoni ham serverga ulana olmaydi — buyurtma umuman
yaratilmaydi. Bunga yechim restoran ichida lokal server bo'lishi kerak; bu
alohida, kattaroq ish.

**Chek ko'rinishini o'zgartirsa bo'ladimi?**
Ha — `print-agent.js` dagi `buildKitchenTicket()` funksiyasi. Ayting, kerakli
ko'rinishga keltiraman.
