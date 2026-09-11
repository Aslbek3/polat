// Admin "Bronlar" (2026-09-10: A-05, A-06, A-14, A-23).
// escapeHtml() / renderList() — ../app.js'dan, chipGroup() — admin.js'dan.
const STATUS_LABEL = { new: 'Yangi', confirmed: 'Tasdiqlangan', cancelled: 'Bekor qilingan' };
const STATUS_BADGE = { new: 'debt', confirmed: 'ok', cancelled: 'low' };
const RES_POLL_MS = 30000;

// A-06: ilgari filtr yo'q edi va o'tgan bronlar ro'yxatda abadiy qolardi.
// Standart — "Kelgusi" (admin ro'yxatni "kim keladi?" savoli bilan ochadi).
// ?status=new (bosh sahifadagi "Tasdiqlanmagan bronlar" havolasi) ham
// "Kelgusi" bilan ochiladi: 2026-09-11 dan bosh sahifa faqat kelgusi
// tasdiqlanmagan bronlarni sanaydi (services/reservations.js countNew) —
// ro'yxat va son bir xil to'plamni ko'rsatsin.
const initialStatus = ['new', 'confirmed', 'cancelled'].includes(pageParam('status')) ? pageParam('status') : 'all';
let scopeChips = null;
let statusChips = null;

function isPastReservation(r) {
  return String(r.res_date) < todayStr();
}

async function loadReservations(isPoll) {
  const scope = scopeChips.get();
  const status = statusChips.get();
  const qs = new URLSearchParams({ scope });
  if (status !== 'all') qs.set('status', status);
  await renderList({
    box: 'reservationList',
    isPoll,
    // Filtr ham ma'lumot "barmoq izi"ga kiradi — ikkala filtrda ro'yxat bo'sh
    // bo'lsa ham bo'sh holat matni yangi filtrga moslashsin.
    load: async () => ({ key: qs.toString(), rows: await api(`/admin/reservations?${qs.toString()}`) }),
    isEmpty: (d) => d.rows.length === 0,
    empty: scope === 'past' ? "O'tgan bron yo'q." : scope === 'upcoming' ? "Kelgusi bron yo'q." : "Bron yo'q.",
    emptyHint: "Mijozlar landing sahifadagi «Stol bron qilish» oynasi orqali bron qiladi. Boshqa filtrni tanlab ko'ring.",
    render: (d) => d.rows.map((r) => {
      const past = isPastReservation(r);
      // O'tgan bron — vizual xira (.dim) va matnli belgi (rang yagona signal emas).
      return `
      <div class="card${past ? ' dim' : ''}">
        <div class="card-row">
          <div>
            <div class="card-title">${escapeHtml(r.full_name)} <span class="badge ${STATUS_BADGE[r.status] || ''}">${escapeHtml(STATUS_LABEL[r.status] || r.status)}</span>${past ? " <span class=\"badge\">o'tgan</span>" : ''}</div>
            <div class="card-sub">${escapeHtml(r.res_date)} · ${escapeHtml(r.res_time)} · ${Number(r.party_size)} kishi</div>
            <div class="card-sub"><a href="tel:${escapeHtml(r.phone)}">${escapeHtml(r.phone)}</a>${r.note ? ' · ' + escapeHtml(r.note) : ''}</div>
          </div>
        </div>
        <div class="mt-8" style="display:flex; gap:6px; flex-wrap:wrap;">
          ${r.status !== 'confirmed' ? `<button type="button" class="btn small" data-act="confirmed" data-id="${r.id}"><span aria-hidden="true">✅</span> Tasdiqlash</button>` : ''}
          ${r.status !== 'cancelled' ? `<button type="button" class="btn small" data-act="cancelled" data-id="${r.id}"><span aria-hidden="true">❌</span> Bekor qilish</button>` : ''}
          <button type="button" class="btn small danger" data-del="${r.id}"><span aria-hidden="true">🗑</span> O'chirish</button>
        </div>
      </div>`;
    }).join(''),
    bind: (box) => {
      box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => setStatus(Number(b.dataset.id), b.dataset.act))));
      box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => delReservation(Number(b.dataset.del)))));
    },
  });
}

async function setStatus(id, status) {
  // A-14: bekor qilish tasdiqlanadi — mijozga qo'ng'iroq qilinmasdan bron
  // tasodifan bekor bo'lmasin.
  if (status === 'cancelled'
      && !(await customConfirm('Bron bekor qilinsinmi? Mijozga xabar berishni unutmang.', { title: 'Bronni bekor qilish', okText: 'Ha, bekor qilish', cancelText: "Yo'q", danger: true }))) return;
  try {
    await api(`/admin/reservations/${id}`, { method: 'PUT', body: { status } });
    toast('Holat yangilandi');
    loadReservations();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delReservation(id) {
  if (!(await customConfirm("Bronni o'chirasizmi? Bu amalni ortga qaytarib bo'lmaydi.", { okText: "O'chirish", danger: true }))) return;
  try {
    await api(`/admin/reservations/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadReservations();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('reservations');
  scopeChips = chipGroup('scopeChips', {
    label: 'Sana bo\'yicha',
    options: [['upcoming', 'Kelgusi'], ['past', "O'tgan"], ['all', 'Hammasi']],
    initial: 'upcoming',
    onChange: () => loadReservations(),
  });
  statusChips = chipGroup('statusChips', {
    label: 'Holat bo\'yicha',
    options: [['all', 'Barcha holatlar'], ['new', 'Yangi'], ['confirmed', 'Tasdiqlangan'], ['cancelled', 'Bekor qilingan']],
    initial: initialStatus,
    onChange: () => loadReservations(),
  });
  loadReservations();
  // A-05: yangi bron kelsa sahifa o'zi yangilanadi.
  setInterval(() => { if (document.visibilityState !== 'hidden') loadReservations(true); }, RES_POLL_MS);
  onVisible(() => loadReservations(true));
});
