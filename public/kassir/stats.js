// Kassir "Statistika" ekrani — 2026-09-09'da qo'shildi. Ikkala yopilgan-hisob
// manbasini (dine-in stol hisob-kitobi + qo'lda "Hisoblash" cheki) birlashtirib
// ko'rsatadigan server/routes/kassirBilling.js'dagi GET /kassir/bills'dan
// o'qiydi. Har bir qatorga bosilsa, o'sha chek qayta ochiladi (showReceiptModal
// — ../app.js'dan global, "Chekni chop etish" tugmasi bilan qayta ham chop
// etish mumkin). escapeHtml()/fmtMoney()/fmtDateTime()/todayStr() — ../app.js'dan.
const KIND_ICON = { table: '🪑', manual: '🧮' };

async function openBillReceipt(kind, id) {
  try {
    const view = kind === 'manual'
      ? await api(`/kassir/manual-bills/${id}/receipt`)
      : await api(`/kassir/orders/${id}/receipt`);
    showReceiptModal(view);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// renderList() — ../app.js'dagi umumiy ro'yxat yordamchisi (2026-09-10):
// eskirgan javobni tashlaydi ("Ko'rsatish" ikki marta bosilsa sekinrog'i
// yangisining ustidan yozmaydi), ma'lumot o'zgarmagan bo'lsa DOM'ga tegmaydi,
// xatoni bir joyda ko'rsatadi. `onData` — yuqoridagi ikki ko'rsatkich
// (soni/jami) ro'yxatdan tashqarida, shu sabab alohida yangilanadi.
async function loadBills() {
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  await renderList({
    box: 'billList',
    load: () => api(`/kassir/bills${qs.toString() ? '?' + qs.toString() : ''}`),
    onData: (data) => {
      document.getElementById('statCount').textContent = String(data.count);
      document.getElementById('statTotal').textContent = fmtMoney(data.total_amount);
      // 2026-09-10 (A-22 naqshi): server ro'yxatni eng yangi 300 ta bilan
      // cheklaydi (manualBills.js BILLS_LIMIT), soni/jami esa BUTUN oraliq
      // bo'yicha. Ilgari "Yopilgan hisoblar: 412" ostida jimgina 300 ta karta
      // turardi — kassir qolgan 112 tasini ro'yxatdan qidirib topolmasdi.
      const note = document.getElementById('billLimitNote');
      const cut = data.count > data.bills.length;
      note.textContent = cut
        ? `Oxirgi ${data.bills.length} tasi ko'rsatilmoqda (jami ${data.count}). Qolganlarini ko'rish uchun davrni qisqartiring.`
        : '';
      note.classList.toggle('hidden', !cut);
    },
    isEmpty: (data) => data.bills.length === 0,
    empty: 'Bu oraliqda yopilgan hisob topilmadi.',
    // D-H10 (2026-09-10): bosiladigan <div> — klaviatura bilan ochib
    // bo'lmasdi. Endi role="button" + tabindex + Enter/Space (bind'da,
    // app.js onActivate). Kursor — style.css `.card[role="button"]`.
    render: (data) => data.bills.map((b) => `
      <div class="card card-row" data-kind="${escapeHtml(b.kind)}" data-id="${b.id}" role="button" tabindex="0" aria-haspopup="dialog">
        <div>
          <div class="card-title">${KIND_ICON[b.kind] || ''} ${escapeHtml(b.label)}</div>
          <div class="card-sub">${fmtDateTime(b.at)}${b.by_name ? ' · ' + escapeHtml(b.by_name) : ''}</div>
        </div>
        <div class="card-title">${fmtMoney(b.total_amount)}</div>
      </div>
    `).join(''),
    bind: (box) => {
      box.querySelectorAll('[data-kind]').forEach((row) => {
        onActivate(row, () => openBillReceipt(row.dataset.kind, Number(row.dataset.id)));
      });
    },
  });
}

// 2026-09-10 (A-11 naqshi): "Bu oy" hisobotini ochish uchun mobil `date`
// tanlagichda 6–8 teginish kerak edi — endi bitta chip. Sana qo'lda
// o'zgartirilsa chip tanlovi olib tashlanadi (ko'rsatilayotgan davr chip
// nomiga mos kelmay qolmasin).
let billPresets = null;

function setBillRange({ from, to }) {
  document.getElementById('filterFrom').value = from;
  document.getElementById('filterTo').value = to;
  loadBills();
}

document.getElementById('filterBtn').addEventListener('click', loadBills);
['filterFrom', 'filterTo'].forEach((id) => {
  document.getElementById(id).addEventListener('change', () => { if (billPresets) billPresets.set(null); });
});

document.addEventListener('DOMContentLoaded', () => {
  initNav('stats');
  billPresets = datePresets('billPresets', { onChange: setBillRange, initial: 'today' });
  const range = billPresets.get() || { from: todayStr(), to: todayStr() };
  document.getElementById('filterFrom').value = range.from;
  document.getElementById('filterTo').value = range.to;
  loadBills();
});
