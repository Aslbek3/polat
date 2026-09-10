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
    },
    isEmpty: (data) => data.bills.length === 0,
    empty: 'Bu oraliqda yopilgan hisob topilmadi.',
    render: (data) => data.bills.map((b) => `
      <div class="card card-row" data-kind="${b.kind}" data-id="${b.id}" style="cursor:pointer;">
        <div>
          <div class="card-title">${KIND_ICON[b.kind] || ''} ${escapeHtml(b.label)}</div>
          <div class="card-sub">${fmtDateTime(b.at)}${b.by_name ? ' · ' + escapeHtml(b.by_name) : ''}</div>
        </div>
        <div class="card-title">${fmtMoney(b.total_amount)}</div>
      </div>
    `).join(''),
    bind: (box) => {
      box.querySelectorAll('[data-kind]').forEach((row) => {
        row.addEventListener('click', () => openBillReceipt(row.dataset.kind, Number(row.dataset.id)));
      });
    },
  });
}

document.getElementById('filterBtn').addEventListener('click', loadBills);

document.addEventListener('DOMContentLoaded', () => {
  initNav('stats');
  const today = todayStr();
  document.getElementById('filterFrom').value = today;
  document.getElementById('filterTo').value = today;
  loadBills();
});
