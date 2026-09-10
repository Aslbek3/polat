// Ochiq (login SHART EMAS) restoran sozlamalari — landing sahifa uchun
// (2026-09-10, L-29: yetkazib berish narxi/vaqti/to'lov usuli mijozga
// ko'rsatilmasdi). server/index.js da `requireAuth`dan OLDIN ulanadi
// (`/api/public/menu` kabi). Faqat o'qish — yozuvchi yo'l yo'q, shu sabab
// rate-limit shart emas (menyu kabi).
//
// Qaysi maydonlar chiqishi — services/settings.js dagi OQ RO'YXAT
// (PUBLIC_KEYS) hal qiladi, bu yerda emas.
const express = require('express');
const { asyncRoute } = require('../routeUtils');
const settings = require('../services/settings');

const router = express.Router();

router.get('/', asyncRoute((req, res) => {
  res.json(settings.getPublicSettings());
}));

module.exports = router;
