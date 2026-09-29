# Oshxona printeri agenti

Ofitsiant "Oshxonaga yuborish" bosganda oshxona printeridan chek **o'zi** chiqadi.
Brauzer ochiq turishi shart emas, QZ Tray kerak emas, hech qanday "Allow" oynasi chiqmaydi.

```
Ofitsiant (mobil internet) → VPS → [shu agent] → printer 192.168.1.230:9100
```

Ofitsiantning telefoni printerga ulanmaydi — u faqat serverga buyurtma yuboradi.
Chekni restoran ichidagi agent chop etadi, shuning uchun ofitsiant qaysi internetda
bo'lishi ahamiyatsiz.

---

## Nima kerak

1. **Restoran tarmog'idagi doim yoqiq kompyuter** — kassa kompyuteri bo'lsa ham bo'ladi.
   (Raspberry Pi yoki eski Android/Termux ham ishlaydi — dastur bir xil.)
2. **Node.js 18 yoki undan yangi** — https://nodejs.org (LTS versiyasi, "Next" bosib o'rnatiladi).
3. **Printer tarmoqda** — selftest qog'ozidagi IP manzil (masalan `192.168.1.230`),
   `Net DHCP: Disabled` bo'lsa manzil o'zgarmaydi. Agent shu manzilga ulanadi.
4. **Alohida hisob** — admin panelda: Xodimlar → yangi xodim, rol **Oshpaz**,
   login `printer`, parol kuchli bo'lsin. Bu hisob faqat agent uchun.

---

## O'rnatish (bir marta, ~10 daqiqa)

**1-qadam. Papkani ko'chiring.** Shu `agent` papkasini printer ulanadigan
kompyuterga ko'chiring (masalan `C:\polat-agent`).

**2-qadam. Sozlamani yozing.** `config.example.json` dan nusxa olib,
`config.json` deb nomlang va uchta joyni to'ldiring:

```json
{
  "server": "https://polatuz.duckdns.org",
  "username": "printer",
  "password": "...",
  "printer": { "host": "192.168.1.230", "port": 9100 }
}
```

**3-qadam. Printerni sinang** (serverga ulanmasdan):

```
node print-agent.js --test
```

Printerdan "SINOV" deb yozilgan chek chiqishi kerak. Chiqmasa — pastdagi
"Muammolar" bo'limiga qarang.

**4-qadam. Agentni ishga tushiring:**

```
node print-agent.js
```

Ekranda `Agent ishga tushdi` va `Serverga kirildi` yozuvi chiqadi. Endi
ofitsiant telefonidan bitta taom yuborib ko'ring — chek o'zi chiqishi kerak.

**5-qadam. Avtomatik ishga tushirish.** Kompyuter yoqilganda agent o'zi
ishlashi uchun (Windows):

1. `Win + R` → `taskschd.msc` → **Create Basic Task**
2. Nomi: `Polat printer agenti`
3. Trigger: **When I log on**
4. Action: **Start a program** → `C:\polat-agent\start.bat`
5. Finish → yaratilgan vazifani o'ng tugma → **Properties** →
   **Run whether user is logged on or not** belgilansa, foydalanuvchi
   chiqib ketsa ham ishlaydi.

`start.bat` agentni ishga tushiradi va u to'xtab qolsa 10 soniyada qayta yoqadi.

---

## ⚠️ Eski usulni o'chiring

Ilgari chek oshxonadagi brauzerdagi `kitchen.html` sahifasi orqali QZ Tray bilan
chiqardi. Agent ishga tushgach **o'sha sahifani yoping** (yoki QZ Tray'ni
to'xtating). Aks holda ikkalasi bir xil chekni chop etib, **ikki nusxa**
chiqishi mumkin.

---

## Kundalik ishlatish

Agent fonda ishlaydi, hech narsa qilish shart emas. Tekshirish kerak bo'lsa:

| Nima | Qayerdan |
|---|---|
| Agent ishlayaptimi | Ochiq oynada oxirgi yozuvlar yoki `print-agent.log` fayli |
| Nechta chek chiqdi | Log faylda `Chop etildi: #41 — Stol 5 (2xOsh)` qatorlari |
| Xatolar | Log faylda `[XATO]` bilan boshlangan qatorlar |

**Printer o'chsa yoki qog'oz tugasa:** chek yo'qolmaydi — navbatda turadi va
printer tiklangach o'zi chiqadi. Oshpaz shu vaqtda ham buyurtmani ekranda
(`kitchen.html`) ko'rib turadi.

**Internet uzilsa:** agent har 15 soniyada qayta urinadi, aloqa tiklangach
navbatdagi hamma chek ketma-ket chiqadi.

---

## Muammolar

**"Sinov cheki chiqmadi"**
- Printer yoqilganmi, qog'oz bormi?
- IP to'g'rimi? Printerni o'chirib-yoqib selftest chiqaring (qog'oz tugmasini
  bosib turib yoqing) — `IP address` qatoriga qarang.
- Kompyuter printer bilan bir tarmoqdami? Tekshirish: `ping 192.168.1.230`
- Port band emasmi: `telnet 192.168.1.230 9100` (yoki brauzerda tekshirib
  bo'lmaydi — `--test` eng ishonchli usul).

**"login muvaffaqiyatsiz (401)"**
- `config.json` dagi login/parol admin paneldagi hisob bilan bir xilmi?
- Hisob bloklanmaganmi (Xodimlar ro'yxatida faolmi)?

**"navbatni olishda xato (403)"**
- Hisobning roli **Oshpaz** (yoki Admin) bo'lishi shart. Ofitsiant/kassir roli
  bu API'ga kira olmaydi.

**"server javob bermadi (timeout)"**
- Kompyuterda internet bormi? `https://polatuz.duckdns.org` brauzerda ochiladimi?

**Kirill harflar noto'g'ri chiqsa**
- Printerning kod sahifasi `Page17 (PC866)` bo'lishi kerak (selftestda ko'rinadi).
  Boshqa bo'lsa aytib qo'ying — agentdagi kod sahifasini moslash mumkin.

**Chek juda uzun/qisqa chiqsa**
- `config.json` dagi `"width"` — 80mm qog'oz uchun `42` (xavfsiz) yoki `48` (to'liq eni).

---

## Qo'shimcha imkoniyatlar

| Sozlama | Nima qiladi |
|---|---|
| `"copies": 2` | Har chekni ikki nusxada chiqaradi (masalan bittasi barga) |
| `"beep": false` | Chek chiqqanda ovoz bermaydi |
| `"cut": false` | Qog'ozni avtomatik qirqmaydi |
| `"pollMs": 1000` | Navbatni tezroq tekshiradi (1 soniyada) |

Buyruqlar:

```
node print-agent.js          # doimiy ishlash
node print-agent.js --test   # printerga sinov cheki (serversiz)
node print-agent.js --once   # bir marta tekshirib chiqish (nosozlik qidirish)
```

---

## Ishlab chiquvchi uchun

Agent serverning mavjud API'sidan foydalanadi, **server kodi o'zgarmagan**:

- `POST /api/login`
- `GET /api/chef/kitchen-tickets/pending`
- `POST /api/chef/kitchen-tickets/:id/printed`

Chek faqat printerga muvaffaqiyatli yuborilgandan **keyin** "chop etildi" deb
belgilanadi — shuning uchun uzilish bo'lsa chek qayta chiqadi, lekin yo'qolmaydi.

Sinov (haqiqiy printer va serversiz, soxta TCP/HTTP bilan):

```
node agent/test/e2e.js
```
