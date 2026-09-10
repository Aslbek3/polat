// Admin "Sozlamalar" (2026-09-10, L-29 uchun yangi sahifa).
// GET/PUT /api/admin/settings — PUT qisman, lekin forma hammasini yuboradi;
// server bitta maydon xato bo'lsa hech birini saqlamaydi (400 {error}).
// Mijoz sayti shu qiymatlarni GET /api/public/settings dan o'qiydi.

// Maydon -> input id va server xato matnidagi nomi (services/settings.js
// FIELDS[].field). Server xatosi shu nom bilan boshlanadi — maydonga
// bog'lash uchun (A-18: toast emas, maydon ostida).
const SETTINGS_FIELDS = [
  { key: 'restaurant_name', id: 'sName', label: 'Restoran nomi', type: 'text', required: true },
  { key: 'restaurant_phone', id: 'sPhone', label: 'Telefon', type: 'text' },
  { key: 'restaurant_address', id: 'sAddress', label: 'Manzil', type: 'text' },
  { key: 'delivery_enabled', id: 'sDeliveryEnabled', label: 'Yetkazib berish', type: 'bool' },
  { key: 'delivery_fee', id: 'sFee', label: 'Yetkazib berish narxi', type: 'amount', max: 1000000 },
  { key: 'delivery_min_order', id: 'sMinOrder', label: 'Minimal buyurtma summasi', type: 'amount', max: 10000000 },
  { key: 'delivery_time_text', id: 'sTime', label: 'Yetkazib berish vaqti', type: 'text' },
  { key: 'payment_methods_text', id: 'sPayment', label: "To'lov usullari", type: 'text' },
];

let settingsSnapshot = null; // saqlanmagan o'zgarish bormi — beforeunload uchun

function fillSettingsForm(s) {
  SETTINGS_FIELDS.forEach((f) => {
    const el = document.getElementById(f.id);
    if (f.type === 'bool') el.checked = Boolean(s[f.key]);
    else el.value = s[f.key] == null ? '' : String(s[f.key]);
  });
  settingsSnapshot = formValuesSnapshot(document.getElementById('settingsForm'));
}

// Mijoz tomonidagi tekshiruv. Qaytaradi: body yoki null (xato maydonda).
function readSettingsForm() {
  clearFieldErrors('settingsForm');
  const body = {};
  let ok = true;
  SETTINGS_FIELDS.forEach((f) => {
    const el = document.getElementById(f.id);
    if (f.type === 'bool') { body[f.key] = el.checked; return; }
    const raw = el.value.trim();
    if (f.type === 'amount') {
      const n = raw === '' ? 0 : Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > f.max) {
        setFieldError(el, `0 dan ${fmtMoney(f.max)} gacha butun son kiriting`);
        ok = false;
        return;
      }
      body[f.key] = n;
      return;
    }
    if (f.required && !raw) {
      setFieldError(el, 'Bu maydon majburiy');
      ok = false;
      return;
    }
    body[f.key] = raw;
  });
  return ok ? body : null;
}

// Server xatosini tegishli maydonga qo'yadi; topilmasa — toast.
// Eng uzun nom birinchi: "Yetkazib berish" boshqa ikki nomning prefiksi.
function showSettingsServerError(message) {
  const f = SETTINGS_FIELDS.slice().sort((a, b) => b.label.length - a.label.length)
    .find((x) => message.startsWith(x.label));
  if (f) setFieldError(f.id, message);
  else toast(message, 'error');
}

async function loadSettingsForm() {
  const btn = document.getElementById('settingsSaveBtn');
  try {
    fillSettingsForm(await api('/admin/settings'));
    btn.disabled = false;
  } catch (err) {
    toast(`Sozlamalar yuklanmadi: ${err.message}`, 'error');
  }
}

document.getElementById('settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('settingsSaveBtn');
  if (btn.disabled) return;
  const body = readSettingsForm();
  if (!body) return;
  withBusy(btn, async () => {
    try {
      fillSettingsForm(await api('/admin/settings', { method: 'PUT', body }));
      // app.js chek uchun sozlamalarni keshlaydi — shu sahifada chek
      // ochilsa yangi telefon/manzil chiqsin.
      settingsCache = null;
      settingsPromise = null;
      toast('Saqlandi');
    } catch (err) {
      showSettingsServerError(err.message);
    }
  });
});

// Saqlanmagan o'zgarish bilan sahifadan chiqib ketishdan himoya (A-21 ruhida).
window.addEventListener('beforeunload', (e) => {
  if (settingsSnapshot === null) return;
  if (formValuesSnapshot(document.getElementById('settingsForm')) !== settingsSnapshot) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initNav('settings');
  loadSettingsForm();
});
