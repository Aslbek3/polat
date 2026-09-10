const { logger, requestContext } = require('./logger');

// Har bir route handler shu bilan o'raladi — better-sqlite3 sinxron ishlagani
// uchun oddiy try/catch yetarli (async/await shart emas). Xizmat qatlamidagi
// xatoliklar (OrderError va shunga o'xshash, `status` maydoni bilan) to'g'ri
// HTTP kod bilan JSON qaytaradi (bu xabarlar ataylab yozilgan, mijozga
// ko'rsatish uchun xavfsiz). Kutilmagan (500) xatolar esa to'liq holda faqat
// serverga logga yoziladi — mijozga ichki tafsilot (masalan real xato matni,
// fayl yo'llari) chiqib ketmasligi uchun umumiy xabar qaytariladi.
function asyncRoute(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (err) {
      const status = err.status || 500;
      // 2026-09-10: `status` ATAYLAB qo'yilgan 5xx xatolar endi o'z
      // xabarini saqlaydi. Ilgari har qanday >=500 umumiy "Server xatosi"
      // ga aylanardi va bu `adminQz.js` dagi 503 ni ham yutardi — u yerdagi
      // xabar ("QZ kaliti topilmadi, server/qz-keys/ ga qo'ying") ataylab
      // adminga mo'ljallangan va lazy-load o'zgarishining butun maqsadi
      // shu edi. `err.status` YO'Q xatolar (kutilmagan qulashlar) esa
      // avvalgidek yashiriladi — ichki tafsilot mijozga chiqmasligi kerak.
      const isDeliberate = Boolean(err.status);
      if (status >= 500) {
        // 2026-09-10: structured log — endi xato QAYSI so'rovda, KIM
        // tomonidan va qaysi yo'lda yuz berganini ko'rsatadi. Ilgari
        // shunchaki `console.error(err)` edi va PM2 logida bir vaqtda
        // kelgan so'rovlarning stack-trace'lari aralashib ketardi.
        logger.error(err.message || 'Kutilmagan xato', {
          ...requestContext(req),
          status,
          stack: err.stack,
        });
      }
      if (status >= 500 && !isDeliberate) {
        // Ichki tafsilot mijozga chiqmasligi kerak — u faqat logda.
        // `reqId` esa beriladi: foydalanuvchi shu kodni aytsa, logdan
        // aynan o'sha so'rovni topish mumkin.
        res.status(status).json({
          error: "Server xatosi, birozdan so'ng qayta urinib ko'ring",
          request_id: req.id,
        });
        return;
      }
      res.status(status).json({ error: err.message || 'Xatolik yuz berdi' });
    }
  };
}

// Oddiy IP-asosli rate-limiter — tashqi dependency shart emas (loyihada
// allaqachon bor narsalarga mos, savdo-hisob/asosiy ilova naqshi). Ochiq
// (login shart emas) /api/public/* endpointlar uchun — skript bilan
// minglab soxta buyurtma/bron yuborib bazani "iflos" qilishning yoki
// serverni ortiqcha yuklashning oldini olish uchun (2026-09-04 tekshiruvda
// topilgan kamchilik). `req.ip` `TRUST_PROXY=1` bo'lgani uchun asosiy
// ilovaning nginx orqali yuborgan haqiqiy mijoz IP'sini ko'rsatadi.
// Xotirada saqlanadi (bitta process, cluster emas) — restart bo'lsa
// hisoblagich tozalanadi, bu qabul qilinadi.
// 2026-09-10: `keyFn` qo'shildi. Ilgari kalit har doim `req.ip` edi — bu
// login himoyasi uchun YETARLI EMAS: hujumchi IP almashtirib (proksi/botnet)
// cheklovni butunlay aylanib o'tadi. Endi login uchun IKKI qatlam qo'yiladi
// (server/index.js): IP bo'yicha (hajmli hujumga qarshi) VA hisob nomi
// bo'yicha (bitta parolni tanlashga qarshi — IP almashtirish yordam bermaydi).
//
// `skipSuccessful: true` — faqat MUVAFFAQIYATSIZ urinishlar sanaladi
// (javob 4xx/5xx bo'lsa). Shunday bo'lmasa oddiy foydalanuvchi kun davomida
// bir necha marta kirib chiqsa ham cheklovga urilardi.
function createRateLimiter({ windowMs, max, message, keyFn, skipSuccessful = false }) {
  const hits = new Map(); // kalit -> { count, resetAt }
  let lastSweep = Date.now();

  // Eskirgan yozuvlarni davriy tozalash. Ilgari bu faqat `hits.size > 5000`
  // bo'lganda ishlardi — ya'ni xotira avval 5000 yozuvgacha o'sib, keyin HAR
  // so'rovda to'liq skanerlanardi. Endi vaqt bo'yicha, bir oynada bir marta.
  function sweep(now) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, val] of hits) {
      if (val.resetAt <= now) hits.delete(key);
    }
  }

  return (req, res, next) => {
    const now = Date.now();
    sweep(now);

    const key = keyFn ? keyFn(req) : (req.ip || 'unknown');
    // keyFn null qaytarsa (masalan login nomi yuborilmagan) — cheklamaymiz,
    // bunday so'rovni baribir validatsiya 400 bilan rad etadi.
    if (key == null) return next();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || "Juda ko'p so'rov yuborildi, birozdan so'ng qayta urinib ko'ring",
      });
    }

    if (skipSuccessful) {
      // Hisoblagichni javob tayyor bo'lgandan keyin, faqat muvaffaqiyatsiz
      // bo'lsa oshiramiz.
      res.on('finish', () => {
        if (res.statusCode >= 400) entry.count += 1;
      });
    } else {
      entry.count += 1;
    }

    next();
  };
}

module.exports = { asyncRoute, createRateLimiter };
