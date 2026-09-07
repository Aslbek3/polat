function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

async function loadOccupied() {
  const box = document.getElementById('occupiedTables');
  try {
    const tables = await api('/waiter/tables');
    const occupied = tables.filter((t) => t.occupied);
    if (occupied.length === 0) {
      box.innerHTML = '<p class="dim">Hozir band stol yo\'q.</p>';
      return;
    }
    box.innerHTML = occupied.map((t) => `
      <div class="card card-row">
        <div>
          <div class="card-title">${escapeHtml(t.name)}</div>
          <div class="card-sub">${t.item_count} taom</div>
        </div>
        <div class="card-title">${fmtMoney(t.total)}</div>
      </div>
    `).join('');
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('index');
  loadSummary();
  loadOccupied();
});
