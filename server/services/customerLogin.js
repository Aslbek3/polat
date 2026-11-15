// Mijoz kirishi uchun bir martalik kodlar va Telegram deep-link tokenlari
// (2026-11-01, "Mijoz hisobi"). Telegram API'ga o'zi murojaat QILMAYDI —
// bu server/telegramBot.js ishi; bu fayl faqat baza mantiqi.
const crypto = require('crypto');
const { db, nowIso } = require('../db');

const CODE_TTL_MS = 5 * 60_000; // kod 5 daqiqa amal qiladi
const LINK_TTL_MS = 15 * 60_000; // t.me havolasi 15 daqiqa
const MAX_CODE_ATTEMPTS = 5; // bitta kodga 5 marta noto'g'ri urinish
const RESEND_COOLDOWN_MS = 60_000; // qayta kod yuborish oralig'i

let codeKey = crypto.randomBytes(32);

// index.js SESSION_SECRET bilan chaqiradi — restartdan keyin ham amaldagi
// kodlar ishlashda davom etishi uchun (aks holda tasodifiy kalit qoladi).
function configure({ secret }) {
  if (secret) codeKey = crypto.createHmac('sha256', secret).update('polat-customer-code-v1').digest();
}

// Saytdagi formadan "90 123 45 67", Telegram kontaktidan "998901234567" yoki
// "+998901234567" kelishi mumkin — hammasi "+998XXXXXXXXX"ga keltiriladi.
// Faqat O'zbekiston raqamlari (publicCustomerOrders.js bilan bir xil qoida).
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length === 12) digits = digits.slice(3);
  if (digits.length !== 9) return null;
  return `+998${digits}`;
}

function maskPhone(phone) {
  // +998901234567 -> +998 90 *** ** 67
  return `${phone.slice(0, 4)} ${phone.slice(4, 6)} *** ** ${phone.slice(-2)}`;
}

function hashCode(phone, code) {
  return crypto.createHmac('sha256', codeKey).update(`${phone}:${code}`).digest('hex');
}

function isoIn(ms) {
  return new Date(Date.now() + ms).toISOString();
}

// ---------- Telegram bog'lanishi ----------

function getTelegramChat(phone) {
  return db.prepare('SELECT * FROM customer_telegram WHERE phone = ?').get(phone) || null;
}

function saveTelegramChat(phone, chatId, tgUserId) {
  db.prepare(
    `INSERT INTO customer_telegram (phone, chat_id, tg_user_id, linked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(phone) DO UPDATE SET chat_id = excluded.chat_id, tg_user_id = excluded.tg_user_id, linked_at = excluded.linked_at`
  ).run(phone, chatId, tgUserId, nowIso());
}

function forgetTelegramChat(phone) {
  db.prepare('DELETE FROM customer_telegram WHERE phone = ?').run(phone);
}

// ---------- Deep-link tokenlari ----------

function createLink(phone) {
  const token = crypto.randomBytes(18).toString('base64url'); // 24 belgi, Telegram /start limiti 64
  db.prepare(
    'INSERT INTO customer_login_links (token, phone, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(token, phone, isoIn(LINK_TTL_MS), nowIso());
  return token;
}

function getLink(token) {
  if (typeof token !== 'string' || token.length > 64) return null;
  return db.prepare('SELECT * FROM customer_login_links WHERE token = ?').get(token) || null;
}

function attachChatToLink(token, chatId) {
  db.prepare('UPDATE customer_login_links SET chat_id = ?, error = NULL WHERE token = ?').run(chatId, token);
}

// Bot kontakt olganda: shu chat bilan bog'langan, muddati o'tmagan, hali
// tasdiqlanmagan ENG OXIRGI havola.
function findPendingLinkByChat(chatId) {
  return db.prepare(
    `SELECT * FROM customer_login_links
     WHERE chat_id = ? AND linked_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`
  ).get(chatId, nowIso()) || null;
}

function markLinkLinked(token) {
  db.prepare('UPDATE customer_login_links SET linked_at = ?, error = NULL WHERE token = ?').run(nowIso(), token);
}

function markLinkError(token, error) {
  db.prepare('UPDATE customer_login_links SET error = ? WHERE token = ?').run(error, token);
}

// ---------- Kodlar ----------

function secondsUntilResend(phone) {
  const last = db.prepare(
    'SELECT created_at FROM customer_login_codes WHERE phone = ? ORDER BY id DESC LIMIT 1'
  ).get(phone);
  if (!last) return 0;
  const wait = Date.parse(last.created_at) + RESEND_COOLDOWN_MS - Date.now();
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

// Yangi kod yaratadi (eski ishlatilmagan kodlar bekor bo'ladi) va OCHIQ
// matnni qaytaradi — faqat Telegram xabariga qo'yish uchun, bazaga xesh yoziladi.
function issueCode(phone, channel = 'telegram') {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const ts = nowIso();
  db.transaction(() => {
    db.prepare('UPDATE customer_login_codes SET used_at = ? WHERE phone = ? AND used_at IS NULL').run(ts, phone);
    db.prepare(
      'INSERT INTO customer_login_codes (phone, code_hash, channel, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(phone, hashCode(phone, code), channel, isoIn(CODE_TTL_MS), ts);
  })();
  return code;
}

// { ok: true } yoki { ok: false, error } — xato matni mijozga ko'rsatiladi.
function verifyCode(phone, code) {
  const row = db.prepare(
    `SELECT * FROM customer_login_codes WHERE phone = ? AND used_at IS NULL
     ORDER BY id DESC LIMIT 1`
  ).get(phone);
  if (!row) return { ok: false, error: "Kod topilmadi. Yangi kod so'rang" };
  if (row.expires_at <= nowIso()) return { ok: false, error: "Kodning muddati tugadi. Yangi kod so'rang" };
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    return { ok: false, error: "Urinishlar soni tugadi. Yangi kod so'rang" };
  }
  const given = Buffer.from(hashCode(phone, String(code)));
  const expected = Buffer.from(row.code_hash);
  const match = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!match) {
    db.prepare('UPDATE customer_login_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    const left = MAX_CODE_ATTEMPTS - row.attempts - 1;
    return { ok: false, error: left > 0 ? `Kod noto'g'ri. Yana ${left} ta urinish qoldi` : "Kod noto'g'ri. Yangi kod so'rang" };
  }
  db.prepare('UPDATE customer_login_codes SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
  return { ok: true };
}

// SMS pullik — oxirgi 24 soatda yuborilgan SMS kodlar soni (raqam bo'yicha
// yoki, phone berilmasa, butun sayt bo'yicha). Kunlik limitlar uchun.
function smsCountLast24h(phone) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const row = phone
    ? db.prepare("SELECT COUNT(*) AS n FROM customer_login_codes WHERE channel = 'sms' AND phone = ? AND created_at > ?").get(phone, since)
    : db.prepare("SELECT COUNT(*) AS n FROM customer_login_codes WHERE channel = 'sms' AND created_at > ?").get(since);
  return row.n;
}

// Muddati o'tgan yozuvlarni tozalash (telegramBot.js soatiga bir chaqiradi).
function cleanup() {
  // Kodlar 2 kun saqlanadi (SMS 24 soatlik limitini to'g'ri sanash uchun).
  const twoDaysAgo = new Date(Date.now() - 48 * 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  db.prepare('DELETE FROM customer_login_codes WHERE created_at < ?').run(twoDaysAgo);
  db.prepare('DELETE FROM customer_login_links WHERE created_at < ?').run(dayAgo);
}

module.exports = {
  configure,
  normalizePhone,
  maskPhone,
  getTelegramChat,
  saveTelegramChat,
  forgetTelegramChat,
  createLink,
  getLink,
  attachChatToLink,
  findPendingLinkByChat,
  markLinkLinked,
  markLinkError,
  secondsUntilResend,
  issueCode,
  verifyCode,
  smsCountLast24h,
  cleanup,
  CODE_TTL_MS,
};
