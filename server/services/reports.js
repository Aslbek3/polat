// Admin hisobotlari (daromad / tan narx / xarajat / sof foyda) —
// 2026-09-10 arxitektura refaktori.
//
// NEGA BU FAYL BOR: loyiha qoidasi bo'yicha route fayllari bazaga bevosita
// murojaat qilmaydi — barcha SQL `server/services/` da to'planadi.
// `routes/adminReports.js` bu qoidani buzardi, va bu yerdagi so'rovlar
// oddiy SELECT emas: ular pul hisobining YAGONA manbai (qaysi jadvallar
// daromadga kiradi, tan narx qayerdan olinadi). Shu bilim HTTP qatlamida
// emas, servisda turishi kerak — kelajakda boshqa ekran (masalan kassir
// statistikasi yoki eksport) xuddi shu raqamlarni qayta yozmasligi uchun.
const { db } = require('../db');
const { sqlBusinessDate, businessDateStr } = require('../businessTime');

// Buyurtma ro'yxatida ruxsat etilgan holatlar — bundan tashqarisi
// (masalan `?status=hack`) e'tiborga olinmaydi, filtr umuman qo'llanmaydi.
const ORDER_STATUSES = ['open', 'closed', 'cancelled'];

// Buyurtmalar ro'yxatining yuqori chegarasi: better-sqlite3 sinxron
// ishlagani uchun cheklovsiz ro'yxat butun serverni bloklab qo'yishi mumkin.
const ORDERS_LIMIT = 200;

function dateRange(query = {}) {
  const from = query.from ? String(query.from).trim() : null;
  const to = query.to ? String(query.to).trim() : null;
  return { from, to };
}

// "Bugun" — BIZNES vaqti bo'yicha YYYY-MM-DD (2026-09-10).
// Dashboard, bronlar ro'yxati va shu fayldagi sana filtrlari BITTA ma'noda
// "bugun"ni ishlatishi uchun. Nomi eski (`localDateStr`) — boshqa servislar
// shu nom bilan chaqiradi.
//
// ⚠️ ILGARI bu SERVER lokal vaqtini qaytarardi (`getFullYear/getDate`),
// SQL filtrlari esa `date(ustun)` bilan UTC kunini olardi — ya'ni ikki xil
// soat mintaqasi aralashgan edi. VPS UTC'da ishlaganda Toshkentdagi (UTC+5)
// 00:00–05:00 orasidagi har bir sotuv OLDINGI kunga yozilardi; restoran
// 24/7 ishlagani uchun bu har kecha takrorlanardi. Endi ikkalasi ham
// `server/businessTime.js` dagi yagona siljishni ishlatadi.
function localDateStr(d = new Date()) {
  return businessDateStr(d);
}

function getSummary(query) {
  const { from, to } = dateRange(query);

  // Daromad — ikkala buyurtma manbasi BIRGALIKDA hisoblanadi (2026-09-09'da
  // tuzatildi, ilgari faqat dine-in `orders` hisobga olinardi, landing orqali
  // kelgan olib ketish/yetkazib berish buyurtmalari — `customer_orders` —
  // butunlay tashqarida qolib, hisobot real daromadni kamroq ko'rsatardi):
  //  - dine-in `orders`: status='closed' (hisob-kitob yopilgan), sana closed_at.
  //  - landing `customer_orders`: status='completed' (buyurtma bajarilgan),
  //    sana sifatida created_at ishlatiladi — bu jadvalda alohida "bajarilgan
  //    vaqt" ustuni yo'q (faqat created_at bor), shu sabab taxminiy sana.
  //  - kassirning `manual_bills` cheklari (2026-09-10'da QO'SHILDI). NEGA:
  //    ilgari uchinchi manba butunlay unutilgan edi — kassir "Hisoblash"
  //    bo'limi orqali chiqargan har bir chek admin hisobotidan yo'qolar,
  //    natijada admin "Hisobot" sahifasi va kassir "Statistika" sahifasi
  //    turli tushum ko'rsatardi. Bu jadvalda status yo'q (chek yaratilishining
  //    o'zi = to'lov qilingan), sana maydoni — created_at. Bu cheklar
  //    `orders_count`ga ham kiradi: ular ham haqiqiy sotuv hodisasi.
  //    Eslatma: qo'lda chek qatorlari menyuga bog'lanmagani uchun (`manual_bill_items`
  //    da `menu_item_id` yo'q) ularning tan narxi (COGS) hisoblanmaydi.
  let revenueSql = `
    SELECT COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS orders_count FROM (
      SELECT total_amount, closed_at AS revenue_date FROM orders WHERE status = 'closed'
      UNION ALL
      SELECT total_amount, created_at AS revenue_date FROM customer_orders WHERE status = 'completed'
      UNION ALL
      SELECT total_amount, created_at AS revenue_date FROM manual_bills
    ) combined WHERE 1=1
  `;
  // Sana filtri BIZNES vaqti bo'yicha (2026-09-10) — `server/businessTime.js`
  // izohiga qarang. Ilgari `date(revenue_date)` UTC kunini olardi.
  const revenueParams = [];
  revenueSql = appendDateFilter(revenueSql, revenueParams, 'revenue_date', { from, to });
  const revenueRow = db.prepare(revenueSql).get(...revenueParams);

  // `expense_date` ATAYLAB siljitilmaydi: u UTC vaqt belgisi emas, xarajat
  // kiritilganda tanlangan oddiy YYYY-MM-DD satr (allaqachon biznes kuni).
  let expenseSql = 'SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE 1=1';
  const expenseParams = [];
  if (from) { expenseSql += ' AND expense_date >= ?'; expenseParams.push(from); }
  if (to) { expenseSql += ' AND expense_date <= ?'; expenseParams.push(to); }
  const expenseRow = db.prepare(expenseSql).get(...expenseParams);

  // Sotilgan taomlarning tan narxi (COGS — cost of goods sold): har bir
  // yopilgan/bajarilgan buyurtma qatorini (bekor qilinmagan, active) tan
  // narxiga ko'paytirib yig'indisi — ikkala buyurtma manbasi birgalikda
  // (yuqoridagi daromad bilan bir xil sabab).
  //
  // 2026-09-10: tan narx endi SOTUV PAYTIDAGI nusxadan
  // (`cost_price_snapshot`) olinadi, `menu_items`dan JONLI EMAS. Ilgari admin
  // taomning tan narxini o'zgartirsa, ALLAQACHON YOPILGAN o'tgan oylarning
  // "Sof foyda"si ham qayta hisoblanib o'zgarib ketardi — bir xil hisobotni
  // ikki marta ochib ikki xil raqam ko'rish mumkin edi. Sotuv narxi
  // (`unit_price`) allaqachon nusxa edi, tan narx esa emas — shu
  // nomuvofiqlik yopildi (schema.sql'dagi izohga qarang).
  //
  // COALESCE(...snapshot, mi.cost_price) — migratsiyadan oldin yaratilgan
  // va nusxasi to'ldirilmagan (masalan taomi o'chirilgan) yozuvlar uchun
  // eski xulq saqlanadi; shu sabab menu_items JOIN olib tashlanmagan, faqat
  // LEFT JOIN qilingan.
  let cogsSql = `
    SELECT COALESCE(SUM(qty * COALESCE(cost_price, 0)), 0) AS cogs FROM (
      SELECT oi.quantity AS qty,
             COALESCE(oi.cost_price_snapshot, mi.cost_price) AS cost_price,
             o.closed_at AS cogs_date
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      WHERE o.status = 'closed' AND oi.status = 'active'
      UNION ALL
      SELECT coi.quantity AS qty,
             COALESCE(coi.cost_price_snapshot, mi.cost_price) AS cost_price,
             co.created_at AS cogs_date
      FROM customer_order_items coi
      JOIN customer_orders co ON co.id = coi.customer_order_id
      LEFT JOIN menu_items mi ON mi.id = coi.menu_item_id
      WHERE co.status = 'completed'
    ) combined WHERE 1=1
  `;
  const cogsParams = [];
  cogsSql = appendDateFilter(cogsSql, cogsParams, 'cogs_date', { from, to });
  const cogsRow = db.prepare(cogsSql).get(...cogsParams);

  return {
    revenue: revenueRow.revenue,
    orders_count: revenueRow.orders_count,
    expenses_total: expenseRow.total,
    cost_of_goods: cogsRow.cogs,
    net: revenueRow.revenue - cogsRow.cogs - expenseRow.total,
  };
}

// UTC vaqt belgisi saqlangan ustun bo'yicha sana filtri — YAGONA joy.
// getSummary() (daromad, tan narx) va listOrders() (ro'yxat) AYNAN shu
// funksiyadan o'tadi, shuning uchun ro'yxat va jami bir xil kunlarga
// kesiladi. `kassir /bills` ham (services/manualBills.js) shu qoidani
// ishlatadi — ikki ekran bir xil kunni ko'rsatadi.
//
// 2026-09-10: `date(ustun)` -> `date(ustun, '+300 minutes')` (biznes vaqti).
// `from`/`to` o'zgarmaydi — ular brauzerdan kelgan, allaqachon Toshkent
// vaqtidagi YYYY-MM-DD.
function appendDateFilter(sql, params, column, { from, to }) {
  let out = sql;
  const day = sqlBusinessDate(column);
  if (from) { out += ` AND ${day} >= date(?)`; params.push(from); }
  if (to) { out += ` AND ${day} <= date(?)`; params.push(to); }
  return out;
}

// Hisobot ekranidagi buyurtmalar ro'yxati.
//
// ⚠️ 2026-09-10 (A-02, A-22): ilgari bu ro'yxat FAQAT stol (`orders`)
// jadvalidan o'qirdi, `getSummary()` esa daromadni UCH manbadan (stol +
// landing `completed` + kassir `manual_bills`) yig'ardi. Natijada ekranda
// "2 ta buyurtma, 75 000" yozilib, pastda bitta karta turardi — ega raqamni
// ro'yxat bilan solishtira olmasdi (kassir `stats.html`da buni qila olardi,
// ega esa yo'q). Endi `kassirBilling.js` `/bills` naqshi qo'llanadi: manbalar
// bitta UNION ALL so'roviga birlashtiriladi va shu so'rov ikki marta
// ishlatiladi — ko'rsatiladigan ro'yxat (LIMIT) va CHEKLOVSIZ jami son
// (`total_count`, route uni `X-Total-Count` sarlavhasiga qo'yadi).
//
// Qaysi manba qachon kiradi:
//   - `status` berilmagan (yoki noma'lum qiymat) — stolning BARCHA holatlari
//     (avvalgidek) + summary hisoblaydigan landing/qo'lda cheklar;
//   - `status=closed` — summary'ning daromadiga kiradigan AYNAN o'sha 3 manba
//     (yopilgan stol + bajarilgan landing + qo'lda chek);
//   - `status=open|cancelled` — faqat stol buyurtmalari (landing/qo'lda chekda
//     bunday holat yo'q), xulq avvalgidek.
//
// Sana: stol — `COALESCE(closed_at, opened_at)` (yopilmagan buyurtma ochilgan
// kuniga tegishli); landing va qo'lda chek — `created_at` (summary bilan bir
// xil: landing jadvalida alohida "bajarilgan vaqt" ustuni yo'q). Shu sabab
// landing/qo'lda chek uchun `opened_at = closed_at = created_at`.
//
// `id` faqat O'Z `kind`i ichida noyob (stol #5 va qo'lda chek #5 bo'lishi
// mumkin) — frontend chekni `kind` bo'yicha ochishi SHART.
// `table_name` — ESKI frontend uchun moslik maydoni (`label` bilan bir xil);
// yangi kod `label`ni ishlatsin.
function listOrders(query) {
  const range = dateRange(query);
  const rawStatus = query && query.status;
  const status = rawStatus && ORDER_STATUSES.includes(rawStatus) ? rawStatus : null;
  const includeOtherSources = status === null || status === 'closed';

  const params = [];
  let tableSql = `
    SELECT o.id AS id, 'table' AS kind, t.name AS label, o.status AS status,
           o.total_amount AS total_amount, o.opened_at AS opened_at, o.closed_at AS closed_at,
           COALESCE(ou.full_name, ou.username) AS opened_by_name,
           COALESCE(cu.full_name, cu.username) AS closed_by_name,
           COALESCE(o.closed_at, o.opened_at) AS sort_at
    FROM orders o
    JOIN tables t ON t.id = o.table_id
    LEFT JOIN users ou ON ou.id = o.opened_by
    LEFT JOIN users cu ON cu.id = o.closed_by
    WHERE 1=1
  `;
  if (status) { tableSql += ' AND o.status = ?'; params.push(status); }
  tableSql = appendDateFilter(tableSql, params, 'COALESCE(o.closed_at, o.opened_at)', range);

  let unionSql = tableSql;
  if (includeOtherSources) {
    const onlineSql = appendDateFilter(`
      SELECT co.id AS id, 'online' AS kind, 'Onlayn: ' || co.full_name AS label, co.status AS status,
             co.total_amount AS total_amount, co.created_at AS opened_at, co.created_at AS closed_at,
             NULL AS opened_by_name, NULL AS closed_by_name,
             co.created_at AS sort_at
      FROM customer_orders co
      WHERE co.status = 'completed'
    `, params, 'co.created_at', range);

    // Qo'lda chekda holat yo'q — uning yaratilishining o'zi to'lov (summary
    // izohiga qarang), shuning uchun ro'yxatda 'closed' sifatida ko'rinadi.
    const manualSql = appendDateFilter(`
      SELECT mb.id AS id, 'manual' AS kind, 'Qo''lda chek' AS label, 'closed' AS status,
             mb.total_amount AS total_amount, mb.created_at AS opened_at, mb.created_at AS closed_at,
             COALESCE(u.full_name, u.username) AS opened_by_name,
             COALESCE(u.full_name, u.username) AS closed_by_name,
             mb.created_at AS sort_at
      FROM manual_bills mb
      LEFT JOIN users u ON u.id = mb.created_by
      WHERE 1=1
    `, params, 'mb.created_at', range);

    unionSql = `${tableSql} UNION ALL ${onlineSql} UNION ALL ${manualSql}`;
  }

  const rows = db
    .prepare(`SELECT * FROM (${unionSql}) r ORDER BY r.sort_at DESC, r.id DESC LIMIT ${ORDERS_LIMIT}`)
    .all(...params);
  const { cnt } = db.prepare(`SELECT COUNT(*) AS cnt FROM (${unionSql}) r`).get(...params);

  const orders = rows.map(({ sort_at: _sortAt, ...row }) => ({ ...row, table_name: row.label }));
  return { orders, total_count: cnt };
}

module.exports = {
  ORDER_STATUSES,
  ORDERS_LIMIT,
  localDateStr,
  dateRange,
  appendDateFilter,
  getSummary,
  listOrders,
};
