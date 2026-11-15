// SMS orqali tasdiqlash kodi (2026-11-01) — Telegram'i yo'q mijozlar uchun
// ZAXIRA usul. Provayder: Eskiz.uz (notify.eskiz.uz API). Tashqi dependency
// yo'q — Node'ning o'zidagi fetch().
//
// .env:
//   ESKIZ_EMAIL / ESKIZ_PASSWORD — my.eskiz.uz kabinetidagi login. Ikkalasi
//     bo'lmasa SMS o'chiq (sayt "SMS orqali" tugmasini ko'rsatmaydi).
//   ESKIZ_FROM — yuboruvchi nomi (tasdiqlangan alfa-nom). Bo'sh = "4546"
//     (Eskiz umumiy raqami).
//   SMS_CODE_TEMPLATE — operatorlarda TASDIQLANGAN shablon bilan HARFMA-HARF
//     bir xil bo'lishi SHART, {code} o'rniga kod qo'yiladi. Aks holda SMS
//     bloklanadi yoki qimmat ("shablonsiz") narxda hisoblanadi.
//
// Eskiz API: POST /api/auth/login (email, password) -> data.token (30 kun);
// POST /api/message/sms/send (mobile_phone, message, from) Bearer token bilan.
// Token keshlanadi, 401 kelsa bir marta qayta login qilinadi.
const DEFAULT_TEMPLATE = 'Ziyo Family: kirish kodingiz {code}. Kodni hech kimga bermang.';

function createSmsSender({ email, password, from, template, baseUrl } = {}) {
  const enabled = Boolean(email && password);
  const base = (baseUrl || 'https://notify.eskiz.uz').replace(/\/$/, '');
  const text = template || DEFAULT_TEMPLATE;
  let token = null;

  async function login() {
    const form = new URLSearchParams({ email, password });
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    const t = data && data.data && data.data.token;
    if (!res.ok || !t) throw new Error(`Eskiz login xatosi: ${res.status} ${data.message || ''}`.trim());
    token = t;
    return token;
  }

  async function sendOnce(phone, message) {
    if (!token) await login();
    const form = new URLSearchParams({
      mobile_phone: phone.replace(/\D/g, ''), // 998901234567
      message,
      from: from || '4546',
    });
    return fetch(`${base}/api/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  }

  // phone: "+998XXXXXXXXX". Muvaffaqiyatsiz bo'lsa xato otadi (route 502 qaytaradi).
  async function sendCode(phone, code) {
    if (!enabled) throw new Error('SMS sozlanmagan');
    const message = text.replace('{code}', code);
    let res = await sendOnce(phone, message);
    if (res.status === 401) {
      token = null;
      res = await sendOnce(phone, message);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === 'error') {
      throw new Error(`Eskiz SMS xatosi: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
    }
    return data;
  }

  return { enabled, sendCode };
}

module.exports = { createSmsSender, DEFAULT_TEMPLATE };
