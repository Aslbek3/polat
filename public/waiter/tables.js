async function loadTables() {
  const grid = document.getElementById('tableGrid');
  try {
    const tables = await api('/waiter/tables');
    if (tables.length === 0) {
      grid.innerHTML = '<p class="dim">Hali stollar qo\'shilmagan. Admin bilan bog\'laning.</p>';
      return;
    }
    grid.innerHTML = tables.map((t) => `
      <a class="table-tile ${t.occupied ? 'occupied' : 'free'}" href="order.html?table=${t.id}">
        <div class="t-name">${escapeHtml(t.name)}</div>
        <div class="t-status">${t.occupied ? `Band · ${t.item_count} taom` : "Bo'sh"}</div>
        ${t.occupied ? `<div class="t-total">${fmtMoney(t.total)}</div>` : ''}
      </a>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('DOMContentLoaded', () => {
  loadTables();
  // Boshqa afitsiant shu stolga buyurtma qo'shsa ham ko'rinishi uchun tez-tez yangilanadi.
  setInterval(loadTables, 10000);
});
