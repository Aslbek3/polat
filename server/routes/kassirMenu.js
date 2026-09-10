// Kassir "Hisoblash" ekranidagi "📋 Menyu" tugmasi uchun — 2026-09-09'da
// qo'shildi (foydalanuvchi so'rovi: qo'lda hisoblashda taom nomi/narxini
// qayta-qayta yozmasdan, menyudan tanlab qo'ya olsin). Afitsiant menyusi
// (server/routes/waiterMenu.js) bilan AYNAN bir xil ma'lumot kerak, lekin
// ATAYLAB alohida route fayli — kassir hududi (requireRole(['admin','kassir']))
// va afitsiant hududi turli ruxsat darajasida; umumiy bitta router
// ikkalasiga ulansa, kelajakda birining hududini o'zgartirganda ikkinchisiga
// bilmasdan ta'sir qilish xavfi bor.
//
// Ma'lumot yig'ish mantig'i esa takrorlanmaydi — u server/services/
// menuQuery.js'da umumiy (2026-09-10).
//
// MUHIM: bu kassirning "taom qo'sha olmaydi" degan asl qoidasini
// (2026-09-09 (2)dagi kassir roli qo'shilishi) BUZMAYDI — o'sha qoida
// STOL/BUYURTMA oqimiga oid edi (server/routes/kassirTables.js, hamon
// o'zgarishsiz, taom qo'shish endpointi yo'q). Bu yerdagi menyu FAQAT
// qo'lda hisoblash (manual_bills) uchun ma'lumot manbai — faqat o'qish.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const menuQuery = require('../services/menuQuery');

const router = express.Router();

router.get('/menu', asyncRoute((req, res) => {
  res.json(menuQuery.staffMenu());
}));

module.exports = router;
