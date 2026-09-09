// QZ Tray "Action Required" (imzosiz/anonim ulanish) oynasini butunlay
// yo'qotish uchun — QZ Tray har bir ulanish/chop etish so'rovini shu API orqali
// olingan ochiq sertifikat bilan tekshiradi va shu server imzolagan
// (server/qz-keys/private-key.pem) imzo bilan tasdiqlaydi. Sertifikat ochiq
// matn (maxfiy emas), lekin faqat shu server chop etish uchun kimga tegishli
// ekanini isbotlay olishi kerak, shu sabab imzolash endpoint'i chek chop
// etadigan rollar (admin, kassir) bilan cheklangan, '/api/qz' ostida —
// '/api/admin/*' EMAS (server/index.js'dagi izohga qarang: requireAuth()
// har qanday '/api/admin/*'ni avtomatik faqat 'admin'ga yopib qo'yardi).
//
// Bu ishlashi uchun admin kompyuteridagi QZ Tray'ga
// server/qz-keys/digital-certificate.txt matni "override.crt" nomi bilan QZ
// Tray o'rnatilgan papkaga qo'yilishi kerak (batafsil: polat/CLAUDE.md).
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { asyncRoute } = require('../routeUtils');

const router = express.Router();

const KEYS_DIR = path.join(__dirname, '..', 'qz-keys');
const CERT_PATH = path.join(KEYS_DIR, 'digital-certificate.txt');
const KEY_PATH = path.join(KEYS_DIR, 'private-key.pem');

// 2026-09-10: ilgari bu ikki fayl MODUL YUKLANISH paytida o'qilardi
// (`const privateKey = fs.readFileSync(...)`). `private-key.pem` esa
// `.gitignore`da — ya'ni repozitoriyni yangi mashinaga klonlab `npm start`
// qilinsa, server ENOENT bilan BUTUNLAY ko'tarilmasdi (PM2'da crash-loop),
// va xato QZ chop etishga aloqasi yo'q boshqa hamma narsani ham o'ldirardi.
// Endi kalit birinchi so'rovda, keraklicha (lazy) o'qiladi va keshlanadi:
// kalit bo'lmasa faqat shu ikki endpoint 503 qaytaradi, qolgan ilova ishlayveradi.
let cachedCert = null;
let cachedKey = null;

function readKeyFile(filePath, cache, label) {
  if (cache) return cache;
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    const message =
      `QZ ${label} topilmadi (${path.basename(filePath)}). Chek chop etish ` +
      "sozlanmagan — server/qz-keys/ papkasiga kalit qo'yilishi kerak.";
    throw Object.assign(new Error(message), { status: 503 });
  }
}

router.get('/certificate', asyncRoute((req, res) => {
  cachedCert = readKeyFile(CERT_PATH, cachedCert, 'sertifikati');
  res.json({ certificate: cachedCert });
}));

// QZ Tray klient tomondan (qz.security.setSignaturePromise) shu yerga
// imzolanishi kerak bo'lgan xom matnni ("toSign") yuboradi, biz uni xususiy
// kalit bilan RSA-SHA512 orqali imzolab, base64 ko'rinishda qaytaramiz.
// Klient tomonda ham `qz.security.setSignatureAlgorithm('SHA512')` bilan
// aynan shu algoritm o'rnatilgan bo'lishi shart (public/waiter/receipt.js).
// 2026-09-10: uzunlik chegarasi qo'shildi. Ilgari bu endpoint IXTIYORIY
// uzunlikdagi har qanday satrni server kaliti bilan imzolab berardi — ya'ni
// har qanday admin/kassir hisobi orqali cheksiz "imzolash orakuli" edi.
// QZ Tray yuboradigan haqiqiy `toSign` — qisqa JSON (odatda 200 belgidan
// kam), shu sabab 4 KB dan uzuni ataylab rad etiladi.
const MAX_SIGN_LENGTH = 4096;

router.post('/sign', asyncRoute((req, res) => {
  const toSign = req.body && req.body.request;
  if (typeof toSign !== 'string' || !toSign) {
    return res.status(400).json({ error: "'request' maydoni kerak" });
  }
  if (toSign.length > MAX_SIGN_LENGTH) {
    return res.status(400).json({ error: "'request' juda uzun" });
  }
  cachedKey = readKeyFile(KEY_PATH, cachedKey, 'xususiy kaliti');
  const signature = crypto.sign('sha512', Buffer.from(toSign, 'utf8'), cachedKey);
  res.json({ signature: signature.toString('base64') });
}));

module.exports = router;
