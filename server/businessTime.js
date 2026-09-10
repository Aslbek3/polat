// Restoranning "biznes vaqti" — sana chegaralari qaysi soat mintaqasida
// hisoblanishini YAGONA joyda belgilaydi (2026-09-10).
//
// NEGA KERAK
// ──────────
// Barcha vaqt belgilari bazaga UTC ISO satr sifatida yoziladi
// (`new Date().toISOString()`). Hisobotlar esa ularni SQLite'ning `date()`
// funksiyasi bilan kunlarga ajratardi — `date('2026-09-10T21:30:00.000Z')`
// natijasi `2026-09-10`, ya'ni UTC kuni.
//
// Toshkent esa UTC+5. Natijada 11-sentabr kuni soat 02:30 da (Toshkent
// vaqti) yopilgan stol hisoboti 10-sentabrga tushardi:
//   - "Bugungi tushum" yarim tundan keyingi sotuvlarni ko'rmasdi;
//   - "Kechagi tushum" esa ularni o'ziga qo'shib olardi;
//   - admin hisoboti va brauzerdagi "bugun" (u Toshkent vaqtida) turli
//     kunlarni nazarda tutardi.
// Restoran 24/7 ishlaydi (CLAUDE.md), ya'ni bu har kecha takrorlanadigan
// xato edi — 00:00–05:00 orasidagi har bir sotuv noto'g'ri kunga yozilardi.
//
// Server soat mintaqasiga (`localtime`) tayanib bo'lmaydi: VPS'lar odatda
// UTC'da ishlaydi, shu sabab `date(col, 'localtime')` hech narsani tuzatmasdi.
// Buning o'rniga aniq siljish ishlatiladi. O'zbekistonda yozgi vaqt yo'q,
// shuning uchun doimiy +05:00 to'g'ri.
//
// SOZLASH: `.env` da `BUSINESS_TZ_OFFSET` (daqiqalarda, masalan `300` yoki
// `+300`; manfiy ham mumkin). Berilmasa Asia/Tashkent (+300).

const DEFAULT_OFFSET_MINUTES = 300; // Asia/Tashkent, UTC+5, yozgi vaqt yo'q

function parseOffset(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULT_OFFSET_MINUTES;
  const n = Number(String(raw).trim());
  // Yer yuzidagi eng katta siljishlar -12:00 .. +14:00 oralig'ida.
  if (!Number.isInteger(n) || n < -720 || n > 840) {
    throw new Error(`BUSINESS_TZ_OFFSET noto'g'ri: "${raw}" (daqiqalarda butun son kutiladi, masalan 300)`);
  }
  return n;
}

const OFFSET_MINUTES = parseOffset(process.env.BUSINESS_TZ_OFFSET);
const OFFSET_MS = OFFSET_MINUTES * 60_000;

// SQLite `date()` modifikatori. XAVFSIZ interpolatsiya: qiymat foydalanuvchi
// kiritmasi emas, yuqorida tekshirilgan BUTUN son.
const SQL_MODIFIER = `'${OFFSET_MINUTES >= 0 ? '+' : ''}${OFFSET_MINUTES} minutes'`;

// UTC vaqt belgisi saqlangan ustunni biznes kuni (YYYY-MM-DD) ga aylantiruvchi
// SQL ifoda. Masalan: sqlBusinessDate('o.closed_at')
//   -> "date(o.closed_at, '+300 minutes')"
// `column` — ATAYLAB kod ichidagi o'zgarmas nom yoki oddiy ifoda, masalan
// 'COALESCE(o.closed_at, o.opened_at)' (foydalanuvchi kiritmasi EMAS).
// Tekshiruv faqat nom/nuqta/vergul/qavs/bo'shliqqa ruxsat beradi — tirnoq,
// `;` yoki `--` kabi belgilar kirib qolsa darhol xato beradi.
function sqlBusinessDate(column) {
  if (!/^[A-Za-z_][A-Za-z0-9_., ()]*$/.test(column)) {
    throw new Error(`sqlBusinessDate: noto'g'ri ustun nomi "${column}"`);
  }
  return `date(${column}, ${SQL_MODIFIER})`;
}

// Berilgan vaqt (standart — hozir) biznes vaqtida qaysi kun ekani.
function businessDateStr(d = new Date()) {
  const shifted = new Date(d.getTime() + OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

// Biznes vaqtidagi joriy oyning 1-kuni (YYYY-MM-01).
function businessMonthStartStr(d = new Date()) {
  return `${businessDateStr(d).slice(0, 7)}-01`;
}

// YYYY-MM-DD satriga `days` kun qo'shadi (manfiy ham bo'ladi). Kalendar
// arifmetikasi UTC'da bajariladi — sana satri siljishsiz, shuning uchun
// yozgi vaqt yoki server mintaqasi ta'sir qilmaydi.
function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = {
  OFFSET_MINUTES,
  sqlBusinessDate,
  businessDateStr,
  businessMonthStartStr,
  addDaysStr,
};
