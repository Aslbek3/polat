// Admin bosh sahifasi — "ertalabki brifing" (2026-09-10, UI/UX tahlili
// A-03, A-04, A-05, A-09).
//
// NEGA BU FAYL BOR: bosh sahifa faqat "bugun"ni ko'rsatardi — ertalab 9:00 da
// tushum 0, band stol yo'q, ekran deyarli bo'sh (A-03). Kecha bilan
// taqqoslash, shu oy jami, tugayotgan mahsulotlar, yangi buyurtma va bronlar
// soni — hech biri yo'q edi; ega ularni bilish uchun 4 ta sahifani aylanib
// chiqishi kerak edi. Yangi bron kelganini esa hech kim bilmasdi (A-05).
// Endi bularning hammasi BITTA so'rovda qaytadi — frontend uni poll qiladi
// (A-04: bosh sahifa ilgari umuman yangilanmasdi).
//
// ⚠️ BU YERDA YANGI HISOB-KITOB YO'Q. Pul raqamlari `reports.getSummary()`
// orqali olinadi — "Hisobot" sahifasi bilan AYNAN bir xil manbalar, bir xil
// sana qoidasi. Nusxa ko'chirish ikki ekranda ikki xil tushum ko'rsatishga
// olib kelardi (A-01, A-02 aynan shunday xatolar edi). Qolgan hisoblagichlar
// ham tegishli servisdan olinadi.
//
// "Bugun" — server lokal sanasi (`reports.localDateStr`), ya'ni avval
// brauzer `todayStr()` bilan yuborgan `from=to=bugun` bilan bir xil.
const reports = require('./reports');
const inventory = require('./inventory');
const customerOrders = require('./customerOrders');
const reservations = require('./reservations');

// getSummary() maydon nomlari -> dashboard shartnomasi nomlari.
// (`expenses_total` -> `expenses`; qolganlari o'zgarishsiz.)
function periodSummary(from, to) {
  const s = reports.getSummary({ from, to });
  return {
    revenue: s.revenue,
    expenses: s.expenses_total,
    cost_of_goods: s.cost_of_goods,
    net: s.net,
    orders_count: s.orders_count,
  };
}

// `now` — faqat testlar uchun (sanani qotirish).
function getDashboard(now = new Date()) {
  const today = reports.localDateStr(now);
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = reports.localDateStr(yesterdayDate);
  const monthStart = reports.localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));

  return {
    today: periodSummary(today, today),
    yesterday: periodSummary(yesterday, yesterday),
    month: periodSummary(monthStart, today),
    low_stock: inventory.listLowStock(),
    new_customer_orders: customerOrders.countByStatus('new'),
    today_reservations: reservations.countForDate(today),
    new_reservations: reservations.countNew(),
  };
}

module.exports = { getDashboard };
