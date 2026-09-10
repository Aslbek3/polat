// renderList() — ../app.js'dagi umumiy ro'yxat yordamchisi (2026-09-10).
// NEGA bu ekranda muhim: stollar har 10 soniyada qayta yuklanadi va ilgari
// har safar SHARTSIZ qayta chizilardi. Bir o'tkinchi tarmoq uzilishi butun
// stol setkasini "Xatolik (500)" bilan almashtirardi, qayta chizish esa
// afitsiantning aynan shu paytdagi bosishini "yutib" qo'yishi mumkin edi.
// Endi: fon xatosida setka o'z joyida qoladi (faqat toast), ma'lumot
// o'zgarmagan bo'lsa DOM'ga umuman tegilmaydi.
async function loadTables(isPoll) {
  await renderList({
    box: 'tableGrid',
    isPoll,
    load: () => api('/waiter/tables'),
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

// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
document.addEventListener('DOMContentLoaded', () => {
  loadTables();
  // Boshqa afitsiant shu stolga buyurtma qo'shsa ham ko'rinishi uchun tez-tez yangilanadi.
  // isPoll=true — xato bo'lsa setka o'chirilmasin (renderList() izohiga qarang).
  setInterval(() => loadTables(true), 10000);
  // X-24 (2026-09-10): ekranga qaytilganda (telefon qulfdan ochilganda,
  // buyurtma sahifasidan "orqaga" bilan bfcache'dan qaytilganda) stollar va
  // "Tayyor" xabarlari darhol yangilanadi — eski band/bo'sh holat ko'rinmasin.
  onVisible(() => {
    loadTables(true);
    pollWaiterNotifications();
  });
});
