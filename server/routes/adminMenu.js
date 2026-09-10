const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { asyncRoute } = require('../routeUtils');
const menu = require('../services/menu');

const router = express.Router();

// Bu fayl endi faqat HTTP qatlami: kirishni olish (`req.params`/`req.query`/
// `req.body`), `services/menu.js` ni chaqirish va javobni qaytarish. Bazaga
// bevosita murojaat va menyu qoidalari (ombor bilan bog'lanish,
// "turlar", soft-delete) servisda — `server/services/menu.js` boshidagi
// izohga qarang.
//
// ISTISNO: rasm YUKLASH (multer) va yuklangan faylni diskdan TOZALASH shu
// yerda qoladi — bu ma'lumot kirishi emas, HTTP/fayl tizimi ishi. Servis
// faqat "qaysi eski rasm endi kerak emas" (`removedImageUrl`) deb aytadi.

// ---------------- Taom rasmlari (ixtiyoriy — majburiy emas) ----------------
// public/uploads/menu/ — server/index.js'dagi express.static(public/) orqali
// to'g'ridan-to'g'ri "/uploads/menu/<fayl>" manzilida ochiladi, alohida route
// shart emas. Fayl nomi tasodifiy (crypto) — mijoz/admin original nomni
// ko'rmaydi, to'qnashuv ehtimoli yo'q.
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'menu');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_EXT[file.mimetype] || path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — taom rasmi uchun yetarli
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXT[file.mimetype]) return cb(new Error('Faqat rasm fayli (jpg/png/webp/gif) yuklash mumkin'));
    cb(null, true);
  },
});

// Eski rasm faylini xavfsiz o'chiradi — faqat bizning UPLOAD_DIR ichidagi
// "/uploads/menu/<nom>" ko'rinishidagi qiymatlarga tegadi (tashqi URL yoki
// boshqa yo'l bo'lsa hech narsa qilmaydi), xato bo'lsa ham (fayl allaqachon
// yo'q va h.k.) butun so'rovni yiqitmaydi.
function deleteOldImageIfLocal(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/menu/')) return;
  const filename = path.basename(imageUrl);
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!filePath.startsWith(UPLOAD_DIR)) return; // path traversal himoyasi
  fs.unlink(filePath, () => {}); // xato bo'lsa ham jim — asosiy amalga ta'sir qilmasin
}

router.post('/upload-image', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Rasm yuklashda xatolik' });
    if (!req.file) return res.status(400).json({ error: 'Rasm tanlanmagan' });
    res.json({ url: `/uploads/menu/${req.file.filename}` });
  });
});

// ---------------- Kategoriyalar ----------------

router.get('/categories', asyncRoute((req, res) => {
  res.json(menu.listCategories({ includeInactive: req.query.include_inactive === '1' }));
}));

router.post('/categories', asyncRoute((req, res) => {
  res.json(menu.createCategory(req.body));
}));

router.put('/categories/:id', asyncRoute((req, res) => {
  res.json(menu.updateCategory(req.params.id, req.body));
}));

router.delete('/categories/:id', asyncRoute((req, res) => {
  res.json(menu.deleteCategory(req.params.id));
}));

// ---------------- Taomlar ----------------

router.get('/items', asyncRoute((req, res) => {
  res.json(menu.listItems({
    categoryId: req.query.category_id,
    includeInactive: req.query.include_inactive === '1',
  }));
}));

router.post('/items', asyncRoute((req, res) => {
  res.json(menu.createItem(req.body));
}));

router.put('/items/:id', asyncRoute((req, res) => {
  const { item, removedImageUrl } = menu.updateItem(req.params.id, req.body);
  if (removedImageUrl) deleteOldImageIfLocal(removedImageUrl);
  res.json(item);
}));

router.patch('/items/:id/availability', asyncRoute((req, res) => {
  res.json(menu.setAvailability(req.params.id, req.body?.is_available));
}));

router.delete('/items/:id', asyncRoute((req, res) => {
  const { removedImageUrl } = menu.deleteItem(req.params.id);
  if (removedImageUrl) deleteOldImageIfLocal(removedImageUrl);
  res.json({ ok: true });
}));

module.exports = router;
