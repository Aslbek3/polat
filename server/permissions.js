// Imkoniyat (capability) asosidagi ruxsat tizimi — 2026-09-10 (3-bosqich).
//
// NEGA BU FAYL BOR
// ────────────────
// Ilgari ruxsat ikki xil, bir-biriga bog'liq bo'lmagan mexanizm bilan
// boshqarilardi:
//   1. `server/auth.js` requireAuth() — URL PREFIKSINI rol nomi bilan
//      solishtirardi (`req.path.startsWith('/api/' + rol)`);
//   2. `server/index.js` da har mount'ga qo'lda yozilgan
//      `requireRole(['admin','kassir'])`.
//
// Birinchisi mo'rt ekani amalda isbotlandi:
//   - u bir marta shoshilinch tuzatishga majbur qilgan edi (`/api/admin/qz`
//     -> `/api/qz`, chunki kassir "admin" emas edi — server/index.js dagi
//     izohga qarang);
//   - 2026-09-10 auditida esa undan ham yomoni topildi: Express'da
//     `case sensitive routing` standart holatda o'chiq bo'lgani uchun
//     `/api/WAITER/...` prefiks tekshiruvidan butunlay o'tib ketardi va
//     dastavkachi stol yopa olardi.
//
// Ikkinchisi ishonchli, lekin ROL NOMLARIGA qattiq bog'langan: yangi rol
// qo'shilganda yoki mavjud rolga bitta qo'shimcha huquq berilganda
// `index.js` dagi o'nlab qatorni qo'lda ko'rib chiqishga to'g'ri keladi.
//
// Endi ruxsat ROL NOMIGA emas, IMKONIYATGA bog'lanadi. "Kim chek chop eta
// oladi?" degan savolga javob bitta joyda — pastdagi jadvalda.
//
// YANGI ROL QO'SHISH: `server/roles.js` ga qo'shing va bu yerdagi jadvalga
// uning imkoniyatlarini yozing. `index.js` ga TEGISH SHART EMAS.

const { ROLE_NAMES } = require('./roles');

// Barcha imkoniyatlar — YAGONA ro'yxat. Nomlash: `<soha>.<amal>`.
const CAPABILITIES = {
  // Stollar va dine-in buyurtmalar
  TABLES_VIEW: 'tables.view',          // stollar ro'yxatini va buyurtmani ko'rish
  ORDERS_WRITE: 'orders.write',        // taom qo'shish/miqdor o'zgartirish/oshxonaga yuborish
  ORDERS_CLOSE: 'orders.close',        // hisob-kitob qilib stolni yopish
  // Menyu
  MENU_VIEW: 'menu.view',              // xodim uchun menyu ro'yxati
  MENU_MANAGE: 'menu.manage',          // menyu/kategoriya/ombor boshqaruvi
  // Oshxona
  KITCHEN_VIEW: 'kitchen.view',
  KITCHEN_WRITE: 'kitchen.write',      // "tayyor" belgilash, onlayn buyurtma holati
  // Yetkazib berish
  DELIVERY_VIEW: 'delivery.view',
  DELIVERY_WRITE: 'delivery.write',    // "yetkazildi" belgilash
  DELIVERY_ALERTS: 'delivery.alerts',  // yangi yetkazib berish bildirishnomasi
  // Kassa
  BILLING_WRITE: 'billing.write',      // qo'lda chek chiqarish
  BILLING_VIEW: 'billing.view',        // hisoblar ro'yxati/statistika
  // Chek chop etish (QZ Tray imzolash)
  RECEIPT_PRINT: 'receipt.print',
  // Afitsiant bildirishnomalari ("taom tayyor")
  WAITER_ALERTS: 'waiter.alerts',
  // Ma'muriy
  ADMIN_MANAGE: 'admin.manage',        // xodimlar, stollar, xarajat, bron, hisobot
};

const C = CAPABILITIES;

// Rol -> imkoniyatlar. `admin` ataylab HAMMASIGA ega (loyihaning mavjud
// qoidasi: "admin hammasiga kira oladi").
const ROLE_CAPABILITIES = {
  admin: Object.values(C),

  // ⚠️ RECEIPT_PRINT afitsiantda ATAYLAB YO'Q — bu hozirgi xulqni aynan
  // saqlaydi (`/api/qz` ilgari `requireRole(['admin','kassir'])` edi).
  // Afitsiantning FAOL oqimida chek chop etish yo'q: stol yopilgach u
  // `tables.html`ga qaytariladi, chekni esa admin (chop etish navbati)
  // yoki kassir chiqaradi.
  // ESLATMA: `public/waiter/receipt.js` QZ'ni chaqiradi, lekin
  // `waiter/receipt.html` ga butun loyihada BIRORTA HAVOLA yo'q (2026-09-10
  // auditida aniqlangan) — u eski, o'lik sahifa. Agar kelajakda afitsiant
  // ham chek chiqaradigan bo'lsa, shu ro'yxatga C.RECEIPT_PRINT qo'shish
  // kifoya — index.js o'zgarmaydi.
  waiter: [
    C.TABLES_VIEW, C.ORDERS_WRITE, C.ORDERS_CLOSE,
    C.MENU_VIEW, C.WAITER_ALERTS,
  ],

  chef: [
    C.KITCHEN_VIEW, C.KITCHEN_WRITE, C.DELIVERY_ALERTS,
  ],

  courier: [
    C.DELIVERY_VIEW, C.DELIVERY_WRITE, C.DELIVERY_ALERTS,
  ],

  // Kassir ATAYLAB taom qo'sha olmaydi (ORDERS_WRITE yo'q) — bu 2026-09-09
  // da foydalanuvchi so'rovi bilan aniq belgilangan qoida. Lekin stolni
  // yopib chek chiqara oladi.
  kassir: [
    C.TABLES_VIEW, C.ORDERS_CLOSE, C.MENU_VIEW,
    C.BILLING_WRITE, C.BILLING_VIEW, C.RECEIPT_PRINT,
  ],
};

// Ishga tushishda tekshiramiz: roles.js dagi HAR BIR rol uchun yozuv
// bo'lishi shart. Yangi rol qo'shib bu yerni unutish — jimgina "hech
// narsaga ruxsati yo'q" roliga olib kelardi, shu sabab darhol xato beramiz.
for (const role of ROLE_NAMES) {
  if (!ROLE_CAPABILITIES[role]) {
    throw new Error(
      `server/permissions.js: '${role}' roli uchun imkoniyatlar ro'yxati yo'q. ` +
      "server/roles.js ga rol qo'shilganda bu yerga ham qo'shilishi shart."
    );
  }
}

const CAPABILITY_SETS = Object.fromEntries(
  Object.entries(ROLE_CAPABILITIES).map(([role, caps]) => [role, new Set(caps)])
);

function can(user, capability) {
  if (!user || !user.role) return false;
  const set = CAPABILITY_SETS[user.role];
  return Boolean(set && set.has(capability));
}

// Express middleware. Bir nechta imkoniyat berilsa — ULARDAN BIRI yetarli.
function requireCapability(...capabilities) {
  if (capabilities.length === 0) {
    throw new Error('requireCapability() kamida bitta imkoniyat talab qiladi');
  }
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (capabilities.some((cap) => can(req.user, cap))) return next();
    return res.status(403).json({ error: 'forbidden' });
  };
}

module.exports = { CAPABILITIES, ROLE_CAPABILITIES, can, requireCapability };
