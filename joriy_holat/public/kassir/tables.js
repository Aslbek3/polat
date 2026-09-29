// Kassir "Stollar" ekrani — afitsiantning tables.js bilan bir xil ko'rinish/
// naqsh, faqat /api/kassir/tables'dan o'qiydi va bosilganda order.html (kassir
// papkasidagi, taom qo'shish tugmasisiz) sahifasiga o'tadi.
// escapeHtml() — ../app.js'dan global.
async function loadTables() {
  const grid = document.getElementById('tableGrid');
  try {
    const tables = await api('/kassir/tables');
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

document.addEventListener('DOMContentLoaded', () => {
  initNav('tables');
  loadTables();
  setInterval(loadTables, 10000);
});
