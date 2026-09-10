// Biznes vaqti (Toshkent, UTC+5) — sana chegaralari testlari (2026-09-10).
//
// Nima tekshiriladi: vaqt belgilari bazada UTC'da saqlanadi, lekin hisobotlar
// kunlarni TOSHKENT vaqti bo'yicha ajratishi kerak. Ilgari `date(ustun)` UTC
// kunini olardi — 11-sentabr 02:30 (Toshkent) = 10-sentabr 21:30Z sotuvi
// 10-sentabrga tushardi. Restoran 24/7 ishlaydi, ya'ni har kecha
// 00:00–05:00 oralig'idagi sotuvlar noto'g'ri kunga yozilardi.
//
// Uchala ekran BIR XIL kunni ko'rsatishi shart: admin "Hisobot" (summary),
// admin buyurtmalar ro'yxati va kassir "Statistika" — aks holda ular bir-biriga
// zid raqam ko'rsatadi.
const test = require('node:test');
const assert = require('node:assert');

const h = require('./helpers');
const bt = require('../server/businessTime');
const reports = require('../server/services/reports');
const manualBills = require('../server/services/manualBills');
const dashboard = require('../server/services/dashboard');

function closedOrderAt(closedAt, amount) {
  const user = h.createUser({ role: 'waiter' });
  const table = h.createTable();
  const info = h.db
    .prepare(
      `INSERT INTO orders (table_id, status, opened_by, opened_at, closed_by, closed_at, total_amount)
       VALUES (?, 'closed', ?, ?, ?, ?, ?)`
    )
    .run(table.id, user.id, closedAt, user.id, closedAt, amount);
  return info.lastInsertRowid;
}

function manualBillAt(createdAt, amount) {
  const user = h.createUser({ role: 'kassir' });
  manualBills.createManualBill([{ name: 'Choy', unit_price: amount, quantity: 1 }], user.id);
  const row = h.db.prepare('SELECT id FROM manual_bills ORDER BY id DESC LIMIT 1').get();
  h.db.prepare('UPDATE manual_bills SET created_at = ? WHERE id = ?').run(createdAt, row.id);
  return row.id;
}

// ──────────────────────────────────────────────────────────────────────────
// businessTime.js yordamchilari
// ──────────────────────────────────────────────────────────────────────────

test('businessTime: standart siljish Toshkent (+300 daqiqa)', () => {
  assert.strictEqual(bt.OFFSET_MINUTES, 300);
  assert.strictEqual(bt.sqlBusinessDate('o.closed_at'), "date(o.closed_at, '+300 minutes')");
});

test('businessTime: 19:00Z dan boshlab ertasi biznes kuni', () => {
  assert.strictEqual(bt.businessDateStr(new Date('2032-01-10T18:59:59.999Z')), '2032-01-10');
  assert.strictEqual(bt.businessDateStr(new Date('2032-01-10T19:00:00.000Z')), '2032-01-11');
});

test("businessTime: oy boshi Toshkent vaqtida o'tadi", () => {
  // 30-sentabr 20:00Z = 1-oktabr 01:00 Toshkent — "shu oy" allaqachon oktabr.
  assert.strictEqual(bt.businessMonthStartStr(new Date('2026-09-30T20:00:00.000Z')), '2026-10-01');
  assert.strictEqual(bt.businessMonthStartStr(new Date('2026-09-30T18:00:00.000Z')), '2026-09-01');
});

test('businessTime: addDaysStr oy/yil chegarasidan to\'g\'ri o\'tadi', () => {
  assert.strictEqual(bt.addDaysStr('2032-03-01', -1), '2032-02-29'); // kabisa yili
  assert.strictEqual(bt.addDaysStr('2031-12-31', 1), '2032-01-01');
});

test("businessTime: sqlBusinessDate xavfli ustun nomini rad etadi", () => {
  assert.throws(() => bt.sqlBusinessDate("x'); DROP TABLE users; --"));
  assert.throws(() => bt.sqlBusinessDate('a.b -- izoh'));
  // Oddiy ifoda (listOrders ishlatadi) ruxsat etiladi.
  assert.doesNotThrow(() => bt.sqlBusinessDate('COALESCE(o.closed_at, o.opened_at)'));
});

// ──────────────────────────────────────────────────────────────────────────
// Uchala ekran: yarim tundan keyingi sotuv TO'G'RI kunga tushadi
// ──────────────────────────────────────────────────────────────────────────

// 2032-02-15 21:30Z = 2032-02-16 02:30 Toshkent.
const NIGHT_UTC = '2032-02-15T21:30:00.000Z';
const PREV_DAY = '2032-02-15';
const BIZ_DAY = '2032-02-16';

test('yarim tundan keyingi sotuv — summary, buyurtmalar ro\'yxati va kassir statistikasi bir xil kun', () => {
  const orderId = closedOrderAt(NIGHT_UTC, 40000);
  const billId = manualBillAt(NIGHT_UTC, 15000);

  // Admin "Hisobot" — summary
  const today = reports.getSummary({ from: BIZ_DAY, to: BIZ_DAY });
  assert.strictEqual(today.revenue, 55000, "02:30 dagi sotuv 16-fevralga tegishli");
  assert.strictEqual(today.orders_count, 2);
  const prev = reports.getSummary({ from: PREV_DAY, to: PREV_DAY });
  assert.strictEqual(prev.revenue, 0, "15-fevralga (UTC kuni) tushmasligi kerak");

  // Admin buyurtmalar ro'yxati
  const list = reports.listOrders({ from: BIZ_DAY, to: BIZ_DAY });
  const keys = list.orders.map((o) => `${o.kind}:${o.id}`).sort();
  assert.deepStrictEqual(keys, [`manual:${billId}`, `table:${orderId}`].sort());
  assert.strictEqual(reports.listOrders({ from: PREV_DAY, to: PREV_DAY }).total_count, 0);

  // Kassir "Statistika"
  const bills = manualBills.listBills({ from: BIZ_DAY, to: BIZ_DAY });
  assert.strictEqual(bills.count, 2);
  assert.strictEqual(bills.total_amount, 55000);
  assert.strictEqual(manualBills.listBills({ from: PREV_DAY, to: PREV_DAY }).count, 0);
});

test("kun oxiri: 23:59 Toshkent (18:59Z) hali o'sha kun", () => {
  const DAY = '2032-03-20';
  closedOrderAt('2032-03-20T18:59:00.000Z', 7000);
  assert.strictEqual(reports.getSummary({ from: DAY, to: DAY }).revenue, 7000);
  assert.strictEqual(manualBills.listBills({ from: DAY, to: DAY }).total_amount, 7000);
});

test('dashboard: "bugun" va "kecha" biznes vaqti bo\'yicha', () => {
  // 2032-04-10 20:00Z = 11-aprel 01:00 Toshkent. Shu soatdagi sotuv "bugun"
  // (11-aprel) bo'lishi, 10-aprel kunduzgi sotuv esa "kecha" bo'lishi kerak.
  closedOrderAt('2032-04-10T19:30:00.000Z', 30000); // 11-aprel 00:30 Toshkent
  closedOrderAt('2032-04-10T08:00:00.000Z', 12000); // 10-aprel 13:00 Toshkent

  const d = dashboard.getDashboard(new Date('2032-04-10T20:00:00.000Z'));
  assert.strictEqual(d.today.revenue, 30000);
  assert.strictEqual(d.yesterday.revenue, 12000);
  assert.strictEqual(d.month.revenue, 42000, 'oy boshi (1-aprel) dan bugungacha');
});
