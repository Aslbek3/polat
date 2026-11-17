// scrypt (Node core) — eski tizimdagi (server/passwords.js) xeshlar bilan
// TO'LIQ MOS: salt = 16 bayt hex, kalit uzunligi 64, xesh hex. Shu sabab
// SQLite'dan ko'chirilgan xodimlar parolini o'zgartirmasdan kira oladi.
// Farqi: asinxron (event loop'ni bloklamaydi).
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

export const MIN_PASSWORD_LENGTH = 6;

export async function hashPassword(plain: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(plain, salt, KEYLEN)).toString('hex');
  return { salt, hash };
}

export async function verifyPassword(plain: string, salt: string, hash: string): Promise<boolean> {
  if (!plain || !salt || !hash) return false;
  const computed = await scryptAsync(plain, salt, KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

// Login topilmaganda ham bir xil vaqt sarflash uchun (foydalanuvchi nomini
// javob vaqtidan taxmin qilib bo'lmasin).
const DUMMY = { salt: '0'.repeat(32), hash: '0'.repeat(128) };
export async function burnPasswordCheck(plain: string): Promise<void> {
  await verifyPassword(plain || 'x', DUMMY.salt, DUMMY.hash);
}
