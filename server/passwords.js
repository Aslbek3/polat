// Parollarni xesh qilish — qo'shimcha tashqi dependency shart emas, Node
// core `crypto.scryptSync`dan foydalaniladi (memory-hard, brute-force'ga chidamli).
const crypto = require('crypto');

const KEYLEN = 64;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN).toString('hex');
  return { salt, hash };
}

function verifyPassword(plain, salt, hash) {
  if (!plain || !salt || !hash) return false;
  const computed = crypto.scryptSync(String(plain), salt, KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

module.exports = { hashPassword, verifyPassword };
