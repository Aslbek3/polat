// Kassir "Stollar" ekrani — afitsiantning tables.js bilan bir xil ko'rinish/
// naqsh, faqat /api/kassir/tables'dan o'qiydi va bosilganda order.html (kassir
// papkasidagi, taom qo'shish tugmasisiz) sahifasiga o'tadi.
// escapeHtml() — ../app.js'dan global.
// renderList() — ../app.js'dagi umumiy ro'yxat yordamchisi (2026-09-10),
// afitsiantning tables.js'i bilan bir xil: fon yangilanishi xatosida setka
// o'chirilmaydi (faqat toast), ma'lumot o'zgarmagan bo'lsa DOM'ga tegilmaydi.
async function loadTables(isPoll) {
  await renderList({
    box: 'tableGrid',
    isPoll,
    load: () => api('/kassir/tables'),
    empty: "Hali stollar qo'shilmagan. Admin bilan bog'laning.",
    render: (tables) => tables.map((t) => `
      <a class="table-tile ${t.occupied ? 'occupied' : 'free'}" href="order.html?table=${t.id}">
        <div class="t-name">${escapeHtml(t.name)}</div>
        <div class="t-status">${t.occupied ? `Band · ${t.item_count} taom` : "Bo'sh"}</div>
        ${t.occupied ? `<div class="t-total">${fmtMoney(t.total)}</div>` : ''}
      </a>
    `).join(''),
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('tables');
  loadTables();
  setInterval(() => loadTables(true), 10000);
});
