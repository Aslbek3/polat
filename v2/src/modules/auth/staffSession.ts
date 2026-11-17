// Xodim sessiyasi cookie'si (`polat_session`).
//
// Yangi format: "s.<userId>.<sessionVersion>.<hmac>" — kalit SESSION_SECRET'dan
// hosil qilinadi. Har so'rovda bazadagi `users.session_version` bilan
// solishtiriladi: parol almashsa, xodim o'chirilsa, rol o'zgarsa yoki
// "barcha qurilmalardan chiqish" bosilsa versiya oshadi va eski cookie'lar
// DARHOL ishlamay qoladi (eski tizimdagi 🟡 ochiq muammo).
//
// Eski format "<userId>.<hmac>" (server/auth.js) ham qabul qilinadi — v2'ga
// o'tishda xodimlar qayta login qilishi shart bo'lmasin. Lekin faqat
// versiya hali 1 bo'lsa (ya'ni hech qachon bekor qilinmagan) va birinchi
// so'rovdayoq yangi formatga almashtiriladi.
import { createHmac } from 'node:crypto';
import { hmacHex, safeEqual } from '../../lib/crypto.js';

export const STAFF_COOKIE = 'polat_session';
export const STAFF_SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 kun

export interface ParsedStaffCookie {
  userId: number;
  version: number;
  legacy: boolean;
}

export function createStaffSessionCodec(sessionSecret: string) {
  const key = createHmac('sha256', sessionSecret).update('polat-staff-session-v2').digest();

  function encode(userId: number, version: number): string {
    const value = `s.${userId}.${version}`;
    return `${value}.${hmacHex(key, value)}`;
  }

  function decode(raw: string | undefined): ParsedStaffCookie | null {
    if (!raw) return null;
    const idx = raw.lastIndexOf('.');
    if (idx < 0) return null;
    const value = raw.slice(0, idx);
    const sig = raw.slice(idx + 1);

    if (value.startsWith('s.')) {
      if (!safeEqual(sig, hmacHex(key, value))) return null;
      const [, idStr, verStr] = value.split('.');
      const userId = Number(idStr);
      const version = Number(verStr);
      if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(version)) return null;
      return { userId, version, legacy: false };
    }
    // Eski format: qiymat — faqat ID, imzo to'g'ridan-to'g'ri SESSION_SECRET bilan.
    if (/^\d+$/.test(value) && safeEqual(sig, hmacHex(sessionSecret, value))) {
      return { userId: Number(value), version: 1, legacy: true };
    }
    return null;
  }

  return { encode, decode };
}

export type StaffSessionCodec = ReturnType<typeof createStaffSessionCodec>;
