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
      if (status >= 500) {
        console.error(err);
        res.status(status).json({ error: "Server xatosi, birozdan so'ng qayta urinib ko'ring" });
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
function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || 'unknown';
    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: message || "Juda ko'p so'rov yuborildi, birozdan so'ng qayta urinib ko'ring" });
    }
    // Xotira cheksiz o'smasligi uchun eskirgan yozuvlarni tasodifiy tozalab turamiz.
    if (hits.size > 5000) {
      for (const [key, val] of hits) {
        if (val.resetAt <= now) hits.delete(key);
      }
    }
    next();
  };
}

module.exports = { asyncRoute, createRateLimiter };
