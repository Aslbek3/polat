import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacHex(key: string | Buffer, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

/** Doimiy vaqtli taqqoslash (uzunlik farq qilsa ham xavfsiz false). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
