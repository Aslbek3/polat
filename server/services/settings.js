// Restoran sozlamalari (nomi, aloqa, yetkazib berish shartlari) — 2026-09-10.
//
// NEGA BU FAYL BOR (UI/UX tahlili L-29, A-*):
//   - `settings` jadvali (key/value) sxemada BOR edi va `server/migrate.js`
//     unga `restaurant_name`/`restaurant_phone`/`restaurant_address`ni
//     urug'lardi — lekin ularni HECH KIM O'QIMASDI: qiymat bazada "o'lik"
//     yotardi, adminda uni o'zgartiradigan joy ham yo'q edi.
//   - L-29 (🔴): landing'da mijoz "Yetkazib berish"ni tanlab, uning narxi,
//     vaqti, minimal summa va to'lov usulini BILMASDAN buyurtma yuborardi.
//     Bu ma'lumotni kodga qattiq yozish o'rniga admin o'zi boshqaradigan
//     sozlamaga aylantirildi.
//
// Ikki xil o'quvchi bor:
//   - getPublicSettings() — login SHART EMAS (landing). Faqat mijozga
//     ko'rsatish XAVFSIZ maydonlar, OQ RO'YXAT (whitelist) orqali: jadvalga
//     kelajakda boshqa (ichki/maxfiy) kalit qo'shilsa ham u bu yerdan
//     avtomatik chiqib ketmaydi.
//   - getAdminSettings()/updateSettings() — `ADMIN_MANAGE`.
// Hozircha ikkala to'plam bir xil; ular ATAYLAB alohida funksiya — admin
// uchun ichki sozlama qo'shilganda ochiq javobga o'z-o'zidan tushmasin.
//
// Saqlash: `settings.value` TEXT. Mantiqiy qiymat '1'/'0', son — butun son
// satri. Bazadagi qiymat buzilgan bo'lsa (qo'lda tahrir) — standart qiymat
// qaytadi, 500 emas.
//
// ⚠️ `restaurant_name` bazada "Po'lat" (migrate.js urug'i), brend esa
// "Ziyo Famliy" — bu ALOHIDA qaror, shu sabab bu yerda bazadagi qiymat
// o'zgartirilmaydi va hech qanday brend nomi "o'ylab topilmaydi": kalit
// yo'q bo'lsa bo'sh satr qaytadi (frontend bo'sh qiymatni yashiradi).
const { db } = require('../db');
const { ValidationError, parseAmount, parseText } = require('../validation');

// Har bir sozlama: turi, standart qiymati va tekshiruv qoidasi — YAGONA joy.
// Chegaralar "restoran uchun aqlga sig'adigan" darajada (validation.js
// falsafasi): haqiqiy ishni cheklamaydi, axlat ma'lumotni to'sadi.
const FIELDS = {
  restaurant_name: { type: 'text', default: '', field: 'Restoran nomi', max: 120, required: true },
  restaurant_phone: { type: 'text', default: '', field: 'Telefon', max: 30 },
  restaurant_address: { type: 'text', default: '', field: 'Manzil', max: 300 },
  delivery_enabled: { type: 'bool', default: true, field: 'Yetkazib berish' },
  delivery_fee: { type: 'amount', default: 0, field: 'Yetkazib berish narxi', max: 1_000_000 },
  delivery_min_order: { type: 'amount', default: 0, field: 'Minimal buyurtma summasi', max: 10_000_000 },
  delivery_time_text: { type: 'text', default: '', field: 'Yetkazib berish vaqti', max: 60 },
  payment_methods_text: { type: 'text', default: '', field: "To'lov usullari", max: 120 },
};

// Mijozga (landing, login'siz) ko'rsatiladigan kalitlar — oq ro'yxat.
const PUBLIC_KEYS = [
  'restaurant_name', 'restaurant_phone', 'restaurant_address',
  'delivery_enabled', 'delivery_fee', 'delivery_min_order',
  'delivery_time_text', 'payment_methods_text',
];

const ADMIN_KEYS = Object.keys(FIELDS);

// Bazadagi satrni turiga o'giradi. Buzilgan qiymat — standart.
function decode(key, raw) {
  const spec = FIELDS[key];
  if (raw === undefined || raw === null) return spec.default;
  if (spec.type === 'bool') {
    if (raw === '1') return true;
    if (raw === '0') return false;
    return spec.default;
  }
  if (spec.type === 'amount') {
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 0 ? n : spec.default;
  }
  return String(raw);
}

function encode(key, value) {
  const spec = FIELDS[key];
  if (spec.type === 'bool') return value ? '1' : '0';
  if (spec.type === 'amount') return String(value);
  return value;
}

// Mantiqiy qiymat: faqat aniq ko'rinishlar qabul qilinadi. `Boolean("false")`
// true bo'lgani uchun erkin o'girish xavfli — noaniq qiymat 400.
function parseBool(value, field) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  throw new ValidationError(`${field} qiymati noto'g'ri (true yoki false bo'lishi kerak)`);
}

function validate(key, value) {
  const spec = FIELDS[key];
  if (spec.type === 'bool') return parseBool(value, spec.field);
  if (spec.type === 'amount') {
    // null/'' — "kiritilmagan" = 0 (bepul / cheklovsiz). parseAmount
    // Number('') === 0 ni ham qabul qiladi, lekin aniqlik uchun alohida.
    if (value === null || value === '') return 0;
    return parseAmount(value, { field: spec.field, max: spec.max, allowZero: true });
  }
  // Matn: parseText bo'sh qiymatga null qaytaradi — bazada '' saqlanadi.
  return parseText(value, { field: spec.field, max: spec.max, required: Boolean(spec.required) }) || '';
}

function readAll() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return new Map(rows.map((r) => [r.key, r.value]));
}

function pick(keys) {
  const stored = readAll();
  const out = {};
  for (const key of keys) out[key] = decode(key, stored.get(key));
  return out;
}

function getPublicSettings() {
  return pick(PUBLIC_KEYS);
}

function getAdminSettings() {
  return pick(ADMIN_KEYS);
}

// Qisman yangilash: faqat yuborilgan (ma'lum) maydonlar o'zgaradi. Avval
// HAMMASI tekshiriladi, keyin bitta tranzaksiyada yoziladi — bitta maydon
// xato bo'lsa hech biri saqlanmaydi (yarim saqlangan forma bo'lmaydi).
// Noma'lum kalitlar e'tiborga olinmaydi (jadvalga erkin kalit yozib
// bo'lmaydi); birorta ham ma'lum maydon bo'lmasa — 400.
function updateSettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError("Sozlamalar noto'g'ri formatda yuborildi");
  }
  const updates = [];
  for (const key of ADMIN_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    updates.push([key, encode(key, validate(key, body[key]))]);
  }
  if (updates.length === 0) {
    throw new ValidationError("O'zgartirish uchun hech qanday sozlama yuborilmadi");
  }
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  db.transaction(() => {
    for (const [key, value] of updates) upsert.run(key, value);
  })();
  return getAdminSettings();
}

module.exports = {
  FIELDS,
  PUBLIC_KEYS,
  getPublicSettings,
  getAdminSettings,
  updateSettings,
};
