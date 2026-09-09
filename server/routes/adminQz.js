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

const publicCertificate = fs.readFileSync(CERT_PATH, 'utf8');
const privateKey = fs.readFileSync(KEY_PATH, 'utf8');

router.get('/certificate', asyncRoute((req, res) => {
  res.json({ certificate: publicCertificate });
}));

// QZ Tray klient tomondan (qz.security.setSignaturePromise) shu yerga
// imzolanishi kerak bo'lgan xom matnni ("toSign") yuboradi, biz uni xususiy
// kalit bilan RSA-SHA512 orqali imzolab, base64 ko'rinishda qaytaramiz.
// Klient tomonda ham `qz.security.setSignatureAlgorithm('SHA512')` bilan
// aynan shu algoritm o'rnatilgan bo'lishi shart (public/waiter/receipt.js).
router.post('/sign', asyncRoute((req, res) => {
  const toSign = req.body && req.body.request;
  if (typeof toSign !== 'string' || !toSign) {
    return res.status(400).json({ error: "'request' maydoni kerak" });
  }
  const signature = crypto.sign('sha512', Buffer.from(toSign, 'utf8'), privateKey);
  res.json({ signature: signature.toString('base64') });
}));

module.exports = router;
