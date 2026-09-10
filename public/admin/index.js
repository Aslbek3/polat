// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
async function loadSummary() {
  try {
    const today = todayStr();
    const s = await api(`/admin/reports/summary?from=${today}&to=${today}`);
    document.getElementById('statRevenue').textContent = fmtMoney(s.revenue);
    document.getElementById('statExpenses').textContent = fmtMoney(s.expenses_total);
    document.getElementById('statNet').textContent = fmtMoney(s.net);
    document.getElementById('statOrders').textContent = s.orders_count;
  } catch (err) {
    toast(err.message, 'error');
  }
}

// renderList() — ../app.js'dagi umumiy ro'yxat yordamchisi (2026-09-10):
// eskirgan javobni tashlaydi, ma'lumot o'zgarmagan bo'lsa DOM'ga tegmaydi,
// xatoni bir joyda ko'rsatadi. Ilgari shu naqsh 18 ta faylda nusxalangan edi.
async function loadOccupied() {
  await renderList({
    box: 'occupiedTables',
    load: async () => (await api('/waiter/tables')).filter((t) => t.occupied),
    empty: "Hozir band stol yo'q.",
    render: (occupied) => occupied.map((t) => `
      <div class="card card-row">
        <div>
          <div class="card-title">${escapeHtml(t.name)}</div>
          <div class="card-sub">${t.item_count} taom</div>
        </div>
        <div class="card-title">${fmtMoney(t.total)}</div>
      </div>
    `).join(''),
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('index');
  loadSummary();
  loadOccupied();
});
