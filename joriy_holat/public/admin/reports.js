// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
async function loadReport() {
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const query = qs.toString() ? '?' + qs.toString() : '';

  try {
    const summary = await api(`/admin/reports/summary${query}`);
    document.getElementById('statRevenue').textContent = fmtMoney(summary.revenue);
    document.getElementById('statExpenses').textContent = fmtMoney(summary.expenses_total);
    document.getElementById('statNet').textContent = fmtMoney(summary.net);
    document.getElementById('statOrders').textContent = summary.orders_count;
  } catch (err) {
    toast(err.message, 'error');
  }

  const box = document.getElementById('orderList');
  try {
    const qs2 = new URLSearchParams(qs);
    qs2.set('status', 'closed');
    const orders = await api(`/admin/reports/orders?${qs2.toString()}`);
    if (orders.length === 0) {
      box.innerHTML = '<p class="dim">Yopilgan buyurtma topilmadi.</p>';
      return;
    }
    box.innerHTML = orders.map((o) => `
      <div class="card card-row">
        <div>
          <div class="card-title">${escapeHtml(o.table_name)} — ${fmtMoney(o.total_amount)}</div>
          <div class="card-sub">${fmtDateTime(o.closed_at)} · ${escapeHtml(o.closed_by_name || '')}</div>
        </div>
        <button class="btn small" data-order-id="${o.id}">Chek</button>
      </div>
    `).join('');
    box.querySelectorAll('[data-order-id]').forEach((btn) => {
      btn.addEventListener('click', () => openReceiptByOrderId(Number(btn.dataset.orderId)));
    });
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('filterBtn').addEventListener('click', loadReport);

document.addEventListener('DOMContentLoaded', () => {
  initNav('reports');
  const today = todayStr();
  document.getElementById('filterFrom').value = today;
  document.getElementById('filterTo').value = today;
  loadReport();
});
