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

  // Holat filtri (2026-09-10). NEGA: server `status` parametrida 'open',
  // 'closed' va (2026-09-10 dan) 'cancelled'ni qo'llab-quvvatlaydi, bu yerda
  // esa 'closed' QATTIQ yozib qo'yilgan edi va tanlash imkoni yo'q edi —
  // natijada admin bekor qilingan stol buyurtmalarini hisobotda umuman
  // ko'ra olmasdi (ular "yo'qolgan"dek tuyulardi).
  const STATUS_TITLE = {
    closed: 'Yopilgan buyurtmalar',
    open: 'Ochiq buyurtmalar',
    cancelled: 'Bekor qilingan buyurtmalar',
    '': 'Barcha buyurtmalar',
  };
  const status = document.getElementById('filterStatus').value;
  document.getElementById('orderListTitle').textContent = STATUS_TITLE[status] || 'Buyurtmalar';

  const box = document.getElementById('orderList');
  try {
    const qs2 = new URLSearchParams(qs);
    if (status) qs2.set('status', status);
    const orders = await api(`/admin/reports/orders?${qs2.toString()}`);
    if (orders.length === 0) {
      box.innerHTML = '<p class="dim">Buyurtma topilmadi.</p>';
      return;
    }
    box.innerHTML = orders.map((o) => `
      <div class="card card-row">
        <div>
          <div class="card-title">${escapeHtml(o.table_name)} — ${fmtMoney(o.total_amount)} <span class="badge ${o.status === 'closed' ? 'ok' : o.status === 'cancelled' ? 'low' : 'debt'}">${escapeHtml(orderStatusLabel(o.status))}</span></div>
          <div class="card-sub">${fmtDateTime(o.closed_at || o.opened_at)} · ${escapeHtml(o.closed_by_name || o.opened_by_name || '')}</div>
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
// Holat tanlanishi bilan darhol qayta yuklanadi — "Ko'rsatish"ni qayta
// bosish shart emas (2026-09-10).
document.getElementById('filterStatus').addEventListener('change', loadReport);

document.addEventListener('DOMContentLoaded', () => {
  initNav('reports');
  const today = todayStr();
  document.getElementById('filterFrom').value = today;
  document.getElementById('filterTo').value = today;
  loadReport();
});
