# Oshxona printeri agenti

Ofitsiant "Oshxonaga yuborish" bosganda oshxona printeridan chek **o'zi** chiqadi.
Brauzer ochiq turishi shart emas, QZ Tray kerak emas, "Allow" oynasi chiqmaydi.

```
Ofitsiant (mobil internet) → VPS → [shu agent] → printer 192.168.1.230:9100
```

📘 **To'liq qo'llanma: [QOLLANMA.md](QOLLANMA.md)** — tushuntirish, o'rnatish,
avtomatik ishga tushirish, nosozliklarni topish, sozlamalar, texnik ma'lumot.

---

## Tez boshlash (5 qadam)

1. **Admin panelda hisob:** Xodimlar → yangi xodim, login `printer`, rol **Oshpaz**.
2. **Node.js 18+** o'rnating ([nodejs.org](https://nodejs.org), LTS).
3. **Sozlang:** `config.example.json` dan nusxa olib `config.json` deb nomlang,
   server manzili, login/parol va printer IP'sini yozing.
4. **Printerni sinang:**
   ```
   node print-agent.js --test
   ```
   "SINOV" cheki chiqishi kerak.
5. **Ishga tushiring:** `node print-agent.js` (yoki `start.bat`).
   Avtomatik ishga tushirish — [QOLLANMA.md, 6-bo'lim](QOLLANMA.md#6-avtomatik-ishga-tushirish).

⚠️ Shundan keyin oshxonadagi brauzerda `kitchen.html` sahifasini **yoping** —
aks holda chek ikki nusxa chiqadi.

---

## Buyruqlar

```
node print-agent.js          # doimiy ishlash
node print-agent.js --test   # printerga sinov cheki (serversiz)
node print-agent.js --once   # bir marta tekshirish (nosozlik qidirish)
node test/e2e.js             # ichki sinov (printer ham, server ham kerak emas)
```

Server kodi **o'zgarmagan** — agent mavjud API'dan foydalanadi
(`/api/login`, `/api/chef/kitchen-tickets/pending`, `.../printed`).
