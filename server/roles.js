// Yagona rol ro'yxati manbasi (server tomonida) — ilgari 'admin'/'waiter'/
// 'chef'/'courier' ro'yxati auth.js (2 joy: areaRole ternary + homeForRole),
// index.js, db.js (CHECK constraint) va adminUsers.js (2 joy) da mustaqil
// qo'lda takrorlangan edi (2026-09-08'gacha "courier" qo'shilganda 6+ joyni
// qo'lda o'zgartirish kerak bo'lgan). Endi server tomonidagi shu 3 joy
// (auth.js, adminUsers.js, db.js'dagi CHECK) shu YAGONA ro'yxatdan o'qiydi —
// yangi rol qo'shilganda faqat shu yerga qo'shish kifoya.
//
// Client tomon (public/admin/waiters.js'dagi ROLE_LABEL/ROLE_BADGE,
// public/login.html'dagi redirect) ALOHIDA runtime (build tizimi yo'q,
// oddiy <script> fayllar) bo'lgani uchun bu ro'yxatni to'g'ridan-to'g'ri
// ulab bo'lmaydi — u yerlarda hamon qo'lda mos saqlash kerak (shu fayl
// ikkalasida ham izoh bilan ko'rsatilgan).
const ROLES = [
  { name: 'admin', homePath: '/admin/index.html' },
  { name: 'waiter', homePath: '/waiter/tables.html' },
  { name: 'chef', homePath: '/chef/kitchen.html' },
  { name: 'courier', homePath: '/courier/orders.html' },
  // 'kassir' (kassa/hisob-kitob) — 2026-09-09'da qo'shildi. Afitsiant bilan
  // bir xil huquqqa EGA EMAS: faqat stollarni ko'radi, hisob-kitob qilib
  // (stolni yopish) chek chiqaradi — taom qo'sha olmaydi/menyuni ko'rmaydi
  // (server/routes/kassirTables.js, public/kassir/*). Afitsiantning o'zi ham
  // hamon stolni yopa oladi (ikkalasi bir-birini almashtirmaydi, foydalanuvchi
  // so'rovi bilan ataylab shunday qoldirilgan).
  { name: 'kassir', homePath: '/kassir/tables.html' },
];

const ROLE_NAMES = ROLES.map((r) => r.name);

// Har bir rol o'zining "uy" sahifasiga ega — boshqa rol hududiga kirmoqchi
// bo'lganda shu yerga qaytariladi (server/auth.js requireAuth() shu yerdan
// oladi). Topilmasa (nazariy jihatdan bo'lmasligi kerak — role DB CHECK bilan
// cheklangan) afitsiant uyiga qaytaradi, avvalgi xulq-atvor bilan bir xil.
function homeForRole(role) {
  const found = ROLES.find((r) => r.name === role);
  return found ? found.homePath : '/waiter/tables.html';
}

module.exports = { ROLES, ROLE_NAMES, homeForRole };
