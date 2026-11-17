# VPS'dagi AI uchun topshiriq: "Po'lat / Ziyo Family" saytini "Mijoz hisobi" yangilanishi bilan yangilash

Sen VPS serverda ishlayotgan tajribali DevOps/Node.js dasturchisan. Senga `polat-2026-11-01.zip` arxivi berilgan. U ishlab turgan "polat" saytining (Express 5 + better-sqlite3, PM2'da `polat` nomi bilan) yangi versiyasi. Vazifang: **ishlab turgan saytni hech narsani buzmasdan, ma'lumot yo'qotmasdan yangilash** va natijani tekshirib hisobot berish.

## Yangilanish nima qo'shadi

- Landing saytiga mijoz hisobi qo'shiladi: Telegram bot orqali 6 xonali kod bilan kirish, `/landing/account.html` sahifasi (buyurtmalar va bronlar tarixi, saqlangan manzillar, profil).
- Yangi server fayllari: `server/customerAuth.js`, `server/telegramBot.js`, `server/services/customerLogin.js`, `server/routes/customerAuth.js`, `server/routes/customerAccount.js`.
- Bazaga 5 ta yangi jadval (`customers`, `customer_addresses`, `customer_telegram`, `customer_login_links`, `customer_login_codes`) va `customer_orders`, `reservations` jadvallariga `customer_id` ustuni qo'shiladi. Migratsiya **avtomatik**, server ishga tushganda `server/db.js` bajaradi va u idempotent.
- Yangi npm paket **yo'q**. `npm install` shart emas.
- Telegram bot tokeni `server/index.js` ichida `DEFAULT_TELEGRAM_BOT_TOKEN` sifatida yozilgan. `.env`da `TELEGRAM_BOT_TOKEN` bo'lsa, o'sha ustun turadi.
- Batafsil ma'lumot: arxiv ichidagi `CLAUDE.md` va `O'RNATISH-MIJOZ-HISOBI.md`.

Arxivdagi `_yangilash/` papkasida:

- `ozgargan-fayllar.txt` — yangilanishda o'zgargan fayllar ro'yxati. `A` yangi fayl, `M` o'zgartirilgan fayl degani.
- `mijoz-hisobi.patch` — xuddi shu o'zgarishlar git patch ko'rinishida.
- `asos-commit.txt` — o'zgarishlar qaysi GitHub commit ustiga qurilgani (repo: `karimovabdulloh521-code/Polat_N1`).

## QAT'IY QOIDALAR (buzilmasin)

1. **Hech qachon tegma va ustidan yozma:** `.env`, `data/` (baza va zaxiralar), `public/uploads/`, `server/qz-keys/*.pem` (maxfiy kalit), `node_modules/`, `_arxiv/`, `.secrets/`.
2. **Faqat `ozgargan-fayllar.txt`dagi fayllarni** yangila. Arxivdagi boshqa fayllar faqat ma'lumot uchun. VPS'da ularning o'z (GitHub'da yo'q) o'zgarishlari bo'lishi mumkin, ularni ustidan yozma.
3. Hech narsani o'chirma (`rm -rf` yo'q). Faqat nusxa ol va qo'sh.
4. Har qadamdan oldin zaxira ol. Biror narsa noaniq yoki xavfli bo'lsa, **to'xta va foydalanuvchidan so'ra**.
5. Hech qanday maxfiy qiymatni (token, parol, `.env` qiymatlari) chatga yoki hisobotga chiqarma.
6. Bu kodni **ochiq** GitHub repo'ga push qilma: unda bot tokeni bor.

## Qadamlar

### 0. Loyiha papkasini aniqlash

```bash
pm2 describe polat | grep -E "exec cwd|script path"
```

Topilgan papkani `P` deb belgila (masalan `export P=/root/polat`). `$P/package.json` ichida `"name": "polat"` borligini tekshir.

### 1. Zaxira (majburiy)

```bash
TS=$(date +%Y%m%d-%H%M)
cd "$P"
# Kod zaxirasi (baza va uploads'siz)
tar czf ~/polat-kod-zaxira-$TS.tar.gz --exclude=node_modules --exclude=data --exclude=public/uploads -C "$P" .
# Baza zaxirasi (WAL bilan to'g'ri nusxa)
node -e "require('better-sqlite3')('data/polat.db').backup('data/polat.db.bak-$TS').then(()=>console.log('baza zaxirasi tayyor'))"
ls -la ~/polat-kod-zaxira-$TS.tar.gz data/polat.db.bak-$TS
```

### 2. Arxivni vaqtinchalik papkaga ochish

```bash
mkdir -p /tmp/polat-yangi && cd /tmp/polat-yangi
unzip -o /path/to/polat-2026-11-01.zip      # zip qayerga yuklangan bo'lsa
N=/tmp/polat-yangi/polat
cat $N/_yangilash/ozgargan-fayllar.txt
```

### 3. Har bir o'zgargan faylni xavfsiz yangilash

`ozgargan-fayllar.txt`dagi har bir fayl uchun quyidagicha ish tut.

**`A` (yangi fayl):** agar `$P/<fayl>` mavjud bo'lmasa, `$N/<fayl>`dan nusxa ol. Agar mavjud bo'lsa, to'xta va farqini foydalanuvchiga ko'rsat.

**`M` (o'zgartirilgan fayl):** VPS'dagi fayl GitHub'dagi asos versiyadan farq qiladimi, tekshir. Asos versiyani olish:

```bash
BASE=$(cat $N/_yangilash/asos-commit.txt)
curl -fsSL "https://raw.githubusercontent.com/karimovabdulloh521-code/Polat_N1/$BASE/<fayl>" -o /tmp/asos.tmp
diff <(sed -E 's/\?v=[A-Za-z0-9._-]+/?v=X/g' /tmp/asos.tmp) <(sed -E 's/\?v=[A-Za-z0-9._-]+/?v=X/g' "$P/<fayl>")
```

- **Farq yo'q** (yoki faqat `?v=...` versiya raqamlari farq qiladi): `cp "$N/<fayl>" "$P/<fayl>"`.
- **Boshqa farq bor:** VPS'da GitHub'da yo'q o'zgarish bor. Ustidan **yozma**. Yangilanishdagi o'zgarishlarni shu faylga qo'lda birlashtir (`mijoz-hisobi.patch`dagi tegishli qismlarni qo'lla). Natijani foydalanuvchiga diff bilan ko'rsat.
- GitHub'ga ulanib bo'lmasa, muqobil usul: `cd "$P" && git apply --check -v $N/_yangilash/mijoz-hisobi.patch` (yoki `patch -p1 --dry-run < ...`). Faqat `?v=` qatorlarida xato bersa, bu muammo emas: o'sha fayllarni zip'dagisi bilan almashtirsa bo'ladi. Boshqa xatolar bo'lsa, to'xta va foydalanuvchiga xabar ber.

Oxirida quyidagi fayllarning hammasi `$P` ichida borligini tekshir:
`server/customerAuth.js`, `server/telegramBot.js`, `server/services/customerLogin.js`, `server/routes/customerAuth.js`, `server/routes/customerAccount.js`, `public/landing/account.html`, `public/landing/account.js`, `public/landing/account.css`.

### 4. Sintaksis tekshiruvi

```bash
cd "$P"
for f in server/*.js server/routes/*.js server/services/*.js public/landing/*.js; do node --check "$f" || echo "XATO: $f"; done
node -v     # 18+ bo'lishi SHART (telegramBot.js global fetch ishlatadi)
```

### 5. Kesh versiyasini yangilash

```bash
cd "$P" && node scripts/versiya.js
```

### 6. Telegram tokenini tekshirish (serverning o'zidan)

```bash
cd "$P"
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | cut -d= -f2-)
[ -z "$TOKEN" ] && TOKEN=$(grep -oE "DEFAULT_TELEGRAM_BOT_TOKEN = '[^']+'" server/index.js | cut -d"'" -f2)
curl -s "https://api.telegram.org/bot$TOKEN/getMe"            # "ok":true bo'lishi kerak
curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo"   # "url":"" bo'lishi kerak
unset TOKEN
```

- `getMe` `ok:false` bersa, token noto'g'ri. Foydalanuvchiga ayt (tokenni chiqarmasdan).
- `getWebhookInfo`da `url` bo'sh bo'lmasa, bot boshqa joyda webhook bilan ishlatilmoqda va server kod ololmaydi (409). `deleteWebhook`ni **faqat foydalanuvchi ruxsati bilan** chaqir.
- Shu token bilan boshqa jarayon `getUpdates` qilmasligi kerak (boshqa PM2 jarayoni yoki boshqa server).

### 7. Qayta ishga tushirish

```bash
pm2 restart polat --update-env
sleep 3
pm2 logs polat --lines 40 --nostream
```

Logda kutiladigan qatorlar:

- `Migratsiya: 'customer_orders' jadvaliga 'customer_id' ustuni qo'shilmoqda...` (faqat birinchi marta)
- `Migratsiya: 'reservations' jadvaliga 'customer_id' ustuni qo'shilmoqda...`
- `Telegram bot @<username> ishga tushdi (mijoz kirishi)`
- `polat http://127.0.0.1:3213 manzilida ishga tushdi`

`Error`, `Cannot find module` yoki `409 Conflict` chiqsa, 9-qadamga o't (orqaga qaytarish) yoki muammoni hal qil.

### 8. Ishlayotganini tekshirish

```bash
H=http://127.0.0.1:3213
curl -s $H/api/ping                                             # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" $H/landing/            # 200
curl -s -o /dev/null -w "%{http_code}\n" $H/landing/account.html  # 200
curl -s -o /dev/null -w "%{http_code}\n" $H/landing/menu.html   # 200
curl -s -o /dev/null -w "%{http_code}\n" $H/login.html          # 200 (xodimlar kirishi buzilmagan)
curl -s $H/api/customer/auth/session                            # {"customer":null}
curl -s -o /dev/null -w "%{http_code}\n" $H/api/customer/orders # 401
curl -s $H/api/public/menu | head -c 200                        # menyu JSON
cd "$P" && node -e "
const db=require('better-sqlite3')('data/polat.db',{readonly:true});
console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'customer%'\").all().map(r=>r.name).join(', '));
console.log(db.prepare('PRAGMA integrity_check').get());
console.log('eski buyurtmalar soni:', db.prepare('SELECT COUNT(*) n FROM customer_orders').get().n);"
```

Haqiqiy domen orqali ham tekshir: `https://ziyofamily.com/landing/account.html` va `https://polatuz.duckdns.org/landing/account.html` 200 qaytarishi kerak.

`POST /api/customer/auth/start`ni haqiqiy raqam bilan **chaqirma**: u haqiqiy odamga Telegram xabari yuborishi mumkin. To'liq kirish sinovini foydalanuvchi o'z telefonida qiladi:

1. Saytda "Kirish" → raqam kiritiladi → "Telegram'ni ochish" → **Start** → "📱 Raqamni ulashish".
2. Kod keladi → saytga kiritiladi → ism yoziladi → hisob ochiladi.

### 9. Muammo bo'lsa — orqaga qaytarish

```bash
pm2 stop polat
cd "$P" && tar xzf ~/polat-kod-zaxira-$TS.tar.gz -C "$P"
# Bazani faqat migratsiya haqiqatan zarar yetkazgan bo'lsa qaytar (yangi ustun/jadvallar eski kodga xalaqit bermaydi):
# cp data/polat.db.bak-$TS data/polat.db && rm -f data/polat.db-wal data/polat.db-shm
pm2 start polat --update-env
```

### 10. Hisobot

Oxirida foydalanuvchiga qisqa hisobot ber (o'zbek tilida):

- qaysi fayllar to'g'ridan-to'g'ri almashtirildi va qaysilari qo'lda birlashtirildi (sababi bilan);
- zaxira fayllari qayerda turibdi;
- log natijasi (migratsiya va Telegram bot qatorlari);
- 8-qadam natijalari;
- foydalanuvchi o'zi qilishi kerak bo'lgan ish: telefonda kirish sinovi.

Agar `$P` git repo bo'lsa, o'zgarishlarni lokal commit qil (`git add -A && git commit -m "Mijoz hisobi (2026-11-01)"`). Lekin **ochiq repo'ga push qilma**: kodda bot tokeni bor.
