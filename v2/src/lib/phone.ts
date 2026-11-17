// O'zbekiston raqamini yagona "+998XXXXXXXXX" ko'rinishiga keltiradi.
// Eski tizimda bu funksiya 3 joyda alohida yozilgan edi — endi bitta.
// Qabul qiladi: "90 123 45 67", "901234567", "998901234567", "+998 (90) 123-45-67".
export function normalizeUzPhone(raw: unknown): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('998') && digits.length === 12) digits = digits.slice(3);
  if (digits.length !== 9) return null;
  return `+998${digits}`;
}

/** +998901234567 -> "+998 90 *** ** 67" */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)} ${phone.slice(4, 6)} *** ** ${phone.slice(-2)}`;
}
