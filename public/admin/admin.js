// Admin sahifalari uchun umumiy yordamchilar (2026-09-10, UI/UX 2-to'lqin).
// ../app.js'dan KEYIN, sahifa skriptidan OLDIN ulanadi. Global scope
// umumiy — yangi nom qo'shishdan oldin `grep -rnw "<nom>" public/`.

// ── Forma modali: tasodifiy yopishdan himoya (A-19, A-20, A-21) ──────────
// NEGA: openDialog() Escape/fon bosilganda modalni DARHOL yopadi, "yopishdan
// oldin so'rash" imkoni yo'q. To'ldirilgan formani tasodifiy Escape yoki fon
// bosishi bilan yo'qotish oson edi (A-21). Shu sabab forma modallari
// closeOnEscape/closeOnBackdrop: false bilan ochiladi va bu ikki yo'l shu
// yerda ushlanadi: o'zgarish bo'lsa customConfirm() so'raladi.
const adminFormDialogs = new Map(); // .modal-backdrop -> { snapshot, isDirty }

// Maydonlar qiymatining "barmoq izi" (checkbox — checked).
function formValuesSnapshot(root) {
  return JSON.stringify(Array.from(root.querySelectorAll('input, select, textarea'))
    .map((n) => (n.type === 'checkbox' || n.type === 'radio' ? n.checked : n.value)));
}

// opts: { onClose(reason), initialFocus, isDirty() — qo'shimcha o'zgarish
// belgisi (masalan rasm olib tashlandi, input qiymatida ko'rinmaydi) }.
// Snapshot OCHILGAN paytda olinadi — forma to'ldirib bo'lingandan keyin chaqiring.
function openFormDialog(elOrId, opts = {}) {
  const el = resolveEl(elOrId);
  if (!el) return;
  if (!el.hasAttribute('data-form-guard')) {
    el.setAttribute('data-form-guard', '');
    el.addEventListener('click', (e) => {
      if (e.target === el && adminFormDialogs.has(el)) requestCloseFormDialog(el);
    });
  }
  adminFormDialogs.set(el, { snapshot: formValuesSnapshot(el), isDirty: opts.isDirty || null });
  clearFieldErrors(el);
  openDialog(el, {
    closeOnEscape: false,
    closeOnBackdrop: false,
    initialFocus: opts.initialFocus,
    onClose: (reason) => {
      adminFormDialogs.delete(el);
      if (opts.onClose) opts.onClose(reason);
    },
  });
}

function isFormDialogDirty(el) {
  const st = adminFormDialogs.get(el);
  if (!st) return false;
  return formValuesSnapshot(el) !== st.snapshot || Boolean(st.isDirty && st.isDirty());
}

// "Bekor" tugmasi, Escape va fon uchun. true — yopildi.
async function requestCloseFormDialog(elOrId) {
  const el = resolveEl(elOrId);
  if (!el || el.classList.contains('hidden')) return true;
  if (isFormDialogDirty(el)) {
    const ok = await customConfirm("Kiritilgan ma'lumot saqlanmaydi. Yopilsinmi?", {
      title: 'Forma yopilsinmi?', okText: 'Yopish', cancelText: 'Davom etish', danger: true,
    });
    if (!ok) return false;
  }
  closeDialog(el, 'cancel');
  return true;
}

// Escape: app.js tinglovchisi closeOnEscape=false bo'lganda preventDefault
// QILMAYDI — shu yerda ushlaymiz. Ustida customConfirm ochiq bo'lsa, app.js
// uni yopib preventDefault qiladi (defaultPrevented), biz tegmaymiz.
// Fokus tuzog'i fokusni ENG USTDAGI dialogda ushlaydi — ya'ni fokus shu
// modal ichida bo'lsa, u eng ustda.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
  for (const el of adminFormDialogs.keys()) {
    if (!el.classList.contains('hidden') && el.contains(document.activeElement)) {
      e.preventDefault();
      requestCloseFormDialog(el);
      return;
    }
  }
});

// ── Filtr chiplari (A-06, A-07, A-09) ─────────────────────────────────────
// datePresets() bilan bir xil ko'rinish (.chip-row/.chip, aria-pressed).
// options: [[key, label], ...]; initial — faqat belgilaydi, onChange'ni
// chaqirmaydi. Qaytaradi: { set(key, {silent}), get(), setLabel(key, text) }.
function chipGroup(containerOrId, { options, initial, onChange, label } = {}) {
  const container = resolveEl(containerOrId);
  let active = initial == null ? null : initial;
  if (!container) return { set() {}, get() { return active; }, setLabel() {} };
  const row = document.createElement('div');
  row.className = 'chip-row';
  row.setAttribute('role', 'group');
  if (label) row.setAttribute('aria-label', label);
  row.innerHTML = options.map(([key, text]) =>
    `<button type="button" class="chip" data-chip="${escapeHtml(key)}" aria-pressed="false">${escapeHtml(text)}</button>`).join('');
  container.appendChild(row);
  const mark = () => row.querySelectorAll('[data-chip]').forEach((b) => {
    const on = b.dataset.chip === active;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const ctrl = {
    set(key, opts = {}) {
      active = key;
      mark();
      if (!opts.silent && onChange) onChange(key);
    },
    get() { return active; },
    setLabel(key, text) {
      const b = row.querySelector(`[data-chip="${key}"]`);
      if (b && b.textContent !== text) b.textContent = text;
    },
  };
  row.addEventListener('click', (e) => {
    const b = e.target.closest('[data-chip]');
    if (b && b.dataset.chip !== active) ctrl.set(b.dataset.chip);
  });
  mark();
  return ctrl;
}

// URL'dagi ?nom=qiymat (bosh sahifadagi "E'tibor talab qiladi" havolalari
// filtrni oldindan tanlab ochadi: customer-orders.html?status=new va h.k.).
function pageParam(name) {
  try { return new URLSearchParams(window.location.search).get(name); } catch (e) { return null; }
}

// ── Davr nomi (A-11, A-12, A-28) ──────────────────────────────────────────
// "Bugun", "Kecha", "Oxirgi 7 kun", "Sentyabr", "01.09.2026 – 05.09.2026".
// NEGA: "Jami" va plitkalar QAYSI davrga tegishli ekani ekranda
// yozilmasdi — eski raqam yangi davrniki deb o'qilardi.
const UZ_MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

function fmtYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(ymd || '');
}

function periodLabel(from, to, presetKey) {
  if (presetKey === 'today') return `Bugun (${fmtYmd(from)})`;
  if (presetKey === 'yesterday') return `Kecha (${fmtYmd(from)})`;
  if (presetKey === 'week') return 'Oxirgi 7 kun';
  if ((presetKey === 'month' || presetKey === 'lastMonth') && from) {
    const [y, m] = from.split('-').map(Number);
    return `${UZ_MONTHS[m - 1]} ${y}`;
  }
  if (!from && !to) return 'Barcha vaqt';
  if (from && to && from === to) return fmtYmd(from);
  return `${from ? fmtYmd(from) : '…'} – ${to ? fmtYmd(to) : '…'}`;
}
