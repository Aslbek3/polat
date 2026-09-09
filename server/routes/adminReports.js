const express = require('express');
const { db } = require('../db');
const { getReceipt } = require('../services/orders');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

function dateRange(query) {
  const from = query.from ? String(query.from).trim() : null;
  const to = query.to ? String(query.to).trim() : null;
  return { from, to };
}

router.get('/summary', asyncRoute((req, res) => {
  const { from, to } = dateRange(req.query);

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
  const revenueParams = [];
  if (from) { revenueSql += ' AND date(revenue_date) >= date(?)'; revenueParams.push(from); }
  if (to) { revenueSql += ' AND date(revenue_date) <= date(?)'; revenueParams.push(to); }
  const revenueRow = db.prepare(revenueSql).get(...revenueParams);

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
  if (from) { cogsSql += ' AND date(cogs_date) >= date(?)'; cogsParams.push(from); }
  if (to) { cogsSql += ' AND date(cogs_date) <= date(?)'; cogsParams.push(to); }
  const cogsRow = db.prepare(cogsSql).get(...cogsParams);

  res.json({
    revenue: revenueRow.revenue,
    orders_count: revenueRow.orders_count,
    expenses_total: expenseRow.total,
    cost_of_goods: cogsRow.cogs,
    net: revenueRow.revenue - cogsRow.cogs - expenseRow.total,
  });
}));

router.get('/orders', asyncRoute((req, res) => {
  const { from, to } = dateRange(req.query);
  const status = req.query.status && ['open', 'closed', 'cancelled'].includes(req.query.status) ? req.query.status : null;
  let sql = `
    SELECT o.id, o.status, o.total_amount, o.opened_at, o.closed_at, t.name AS table_name,
           COALESCE(ou.full_name, ou.username) AS opened_by_name,
           COALESCE(cu.full_name, cu.username) AS closed_by_name
    FROM orders o
    JOIN tables t ON t.id = o.table_id
    JOIN users ou ON ou.id = o.opened_by
    LEFT JOIN users cu ON cu.id = o.closed_by
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  if (from) { sql += ' AND date(COALESCE(o.closed_at, o.opened_at)) >= date(?)'; params.push(from); }
  if (to) { sql += ' AND date(COALESCE(o.closed_at, o.opened_at)) <= date(?)'; params.push(to); }
  sql += ' ORDER BY o.id DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
}));

router.get('/orders/:id/receipt', asyncRoute((req, res) => {
  res.json(getReceipt(req.params.id));
}));

module.exports = router;
