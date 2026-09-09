// Kirish qiymatlarini tekshirish uchun umumiy yordamchilar (2026-09-10).
//
// NEGA KERAK: loyiha bo'ylab raqamlar faqat `Number.isFinite(x) && x > 0`
// bilan tekshirilardi — YUQORI CHEGARA hech qayerda yo'q edi. Bu ikkita
// tasdiqlangan buzilishga olib kelardi:
//
//   1) Afitsiant `{"quantity": 9007199254740991}` yuborsa `subtotal` ~9.0e19
//      bo'lib `orders.total_amount` ga yozilardi. Yopilgan buyurtmani
//      tuzatish yoki o'chirish uchun ILOVADA HECH QANDAY YO'L YO'Q — admin
//      "Hisobot" va kassir "Statistika" abadiy axlat ko'rsatardi.
//   2) Kassir `{"unit_price": 1e308, "quantity": 2}` yuborsa `subtotal`
//      `Infinity` bo'lardi. SQLite uni saqlaydi, `SUM()` ham `Infinity`
//      qaytaradi, `JSON.stringify(Infinity)` esa `null` — ya'ni
//      `/api/admin/reports/summary` doimo `revenue: null` qaytarardi.
//
// Xuddi shunday, ochiq (login shart emas) endpointlarda matn maydonlariga
// uzunlik chegarasi yo'q edi: bitta IP daqiqasiga 5 ta so'rov (limiter) x
// ~1 MB `note` = ~7 GB/kun SQLite o'sishi.
//
// Chegaralar ATAYLAB "restoran uchun aqlga sig'adigan" darajada — texnik
// maksimum emas. Haqiqiy ish oqimini cheklamaydi, lekin axlat ma'lumot
// bazaga tushishini butunlay to'sadi.

class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Bitta chekdagi/buyurtmadagi bitta taom miqdori.
const MAX_QUANTITY = 1000;
// So'mdagi narx/summa. 100 mln so'm — bitta taom uchun ham, bitta xarajat
// uchun ham yetarlicha katta, lekin Number.MAX_SAFE_INTEGER'dan uzoq.
const MAX_AMOUNT = 100_000_000;

// Butun, musbat va oqilona chegara ichidagi miqdor.
function parseQuantity(value, { field = 'Miqdor', max = MAX_QUANTITY } = {}) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new ValidationError(`${field} noto'g'ri`);
  }
  if (n > max) {
    throw new ValidationError(`${field} juda katta (ko'pi bilan ${max})`);
  }
  return n;
}

// Butun, manfiy bo'lmagan pul summasi (so'm — kasr tiyin yo'q).
// `allowZero` — narx uchun 0 odatda xato, xarajat uchun ham; lekin tan narx
// kiritilmagan bo'lsa 0 bo'lishi normal.
function parseAmount(value, { field = 'Summa', max = MAX_AMOUNT, allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`${field} noto'g'ri`);
  const rounded = Math.round(n);
  if (!Number.isSafeInteger(rounded)) throw new ValidationError(`${field} noto'g'ri`);
  if (allowZero ? rounded < 0 : rounded <= 0) {
    throw new ValidationError(`${field} noto'g'ri`);
  }
  if (rounded > max) {
    throw new ValidationError(`${field} juda katta (ko'pi bilan ${max.toLocaleString('uz-UZ')})`);
  }
  return rounded;
}

// Matn maydoni: trim qilinadi, uzunligi cheklanadi.
// Bo'sh natija `null` qaytaradi (ixtiyoriy maydonlar uchun qulay).
function parseText(value, { field = 'Matn', max = 500, required = false } = {}) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    if (required) throw new ValidationError(`${field} kiritilishi shart`);
    return null;
  }
  if (text.length > max) {
    throw new ValidationError(`${field} juda uzun (ko'pi bilan ${max} belgi)`);
  }
  return text;
}

// YYYY-MM-DD. NEGA QAT'IY: `adminExpenses` bu qiymatni SATR sifatida
// solishtiradi (`expense_date >= ?`), `adminReports` esa `date()` bilan
// normallashtiradi. Format erkin bo'lsa (masalan "10.09.2026") xarajat
// hech qanday sanali filtrga tushmaydi, lekin filtrsiz jamiga kiradi —
// natijada "Hisobot" sahifasi filtr bilan va filtrsiz TURLI sof foyda
// ko'rsatadi va sabab hech qayerda ko'rinmaydi.
function parseDate(value, { field = 'Sana', required = true } = {}) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    if (required) throw new ValidationError(`${field} kiritilishi shart`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ValidationError(`${field} noto'g'ri formatda (YYYY-MM-DD bo'lishi kerak)`);
  }
  // Kalendarda haqiqatan mavjudligini tekshiramiz (2026-02-31 kabi emas).
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) {
    throw new ValidationError(`${field} mavjud emas`);
  }
  return text;
}

module.exports = {
  ValidationError,
  MAX_QUANTITY,
  MAX_AMOUNT,
  parseQuantity,
  parseAmount,
  parseText,
  parseDate,
};
