// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).

// So'rovlar navbati (2026-09-10) — ikkita ro'yxat uchun alohida hisoblagich.
// NEGA: sahifa har 15 soniyada avtomatik yangilanadi, oshpazning amali
// ("🏁 Tayyor", "✅ Tasdiqlash") ham xuddi shu ro'yxatni qayta yuklaydi —
// javoblarning kelish tartibi kafolatlanmagan. Eski poll javobi kechikib
// kelsa, u yangi holatning ustidan yozib, taomni yana "tayyor emas" qilib
// ko'rsatardi; oshpaz "bosilmadi shekilli" deb qayta bosardi.
let tablesSeq = 0;
let onlineSeq = 0;

async function loadTables() {
  const box = document.getElementById('tableOrders');
  const my = ++tablesSeq;
  try {
    const rows = await api('/chef/tables');
    if (my !== tablesSeq) return; // eskirgan javob — render qilinmaydi
    const occupied = rows.filter((t) => t.occupied);
    if (occupied.length === 0) {
      box.innerHTML = '<p class="dim">Hozircha band stol yo\'q.</p>';
      return;
    }
    box.innerHTML = occupied.map((t) => `
      <div class="card">
        <div class="card-title">${escapeHtml(t.name)}</div>
        <div class="mt-8">
          ${(t.items && t.items.length)
            ? t.items.map((it) => `
              <div class="card-row mt-4">
                <div class="card-sub">${it.quantity} × ${escapeHtml(it.name_snapshot)} — ${fmtMoney(it.unit_price)}</div>
                <button class="btn small ${it.ready_at ? 'primary' : ''}" data-ready="${it.id}" data-val="${it.ready_at ? '0' : '1'}">${it.ready_at ? '✅ Tayyor' : '🏁 Tayyor'}</button>
              </div>
            `).join('')
            // NEGA bu matn o'zgardi (2026-09-10): stol band, afitsiant taom
            // qo'shgan bo'lishi mumkin — lekin oshpaz ekraniga faqat
            // OSHXONAGA YUBORILGAN (sent_at) taomlar keladi. "Hali taom
            // qo'shilmagan" chalg'itardi (oshpaz afitsiantga "sizda taom
            // yo'q" derdi); to'g'risi — hali yuborilmagan.
            : '<div class="card-sub">Hali oshxonaga yuborilmagan</div>'}
        </div>
      </div>
    `).join('');
    // withBusy (2026-09-10) — so'rov davomida tugma bloklanadi: ikki marta
    // bosilsa ikkinchi so'rov keraksiz va oshpaz holatni "orqaga" qaytarib
    // yuborishi mumkin edi.
    box.querySelectorAll('[data-ready]').forEach((b) => b.addEventListener('click', () => toggleItemReady(Number(b.dataset.ready), b.dataset.val === '1', b)));
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

async function toggleItemReady(id, ready, btn) {
  await withBusy(btn, async () => {
    try {
      await api(`/chef/items/${id}/ready`, { method: 'PUT', body: { ready } });
      loadTables();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

const STATUS_LABEL = { new: 'Yangi', confirmed: 'Tasdiqlangan' };
// Oshpaz taomni tayyorlab bo'lgach kimga berilishini bilishi kerak — mijoz
// o'zi olib ketadimi (pickup) yoki dastavkachi keladimi (delivery). Ilgari bu
// yerda umuman ko'rsatilmagan edi (2026-09-08'da topilgan/tuzatilgan bug —
// oshpaz yetkazib berish buyurtmasini olib ketishdan farqlay olmasdi).
const FULFILLMENT_LABEL = { pickup: "Olib ketish", delivery: 'Yetkazib berish' };

async function loadOnlineOrders() {
  const box = document.getElementById('onlineOrders');
  const my = ++onlineSeq;
  try {
    const rows = await api('/chef/orders');
    if (my !== onlineSeq) return; // eskirgan javob — render qilinmaydi
    if (rows.length === 0) {
      box.innerHTML = '<p class="dim">Hozircha onlayn buyurtma yo\'q.</p>';
      return;
    }
    box.innerHTML = rows.map((o) => `
      <div class="card">
        <div class="card-row">
          <div class="card-title">${escapeHtml(o.full_name)} <span class="badge ${o.fulfillment === 'delivery' ? 'debt' : 'ok'}">${FULFILLMENT_LABEL[o.fulfillment] || o.fulfillment}</span> <span class="badge ${o.status === 'confirmed' ? 'ok' : 'debt'}">${STATUS_LABEL[o.status] || o.status}</span></div>
        </div>
        <div class="card-sub">${fmtDateTime(o.created_at)}</div>
        <div class="mt-8">
          ${o.items.map((it) => `<div class="card-sub">${it.quantity} × ${escapeHtml(it.name_snapshot)}</div>`).join('')}
        </div>
        <div class="mt-8" style="display:flex; gap:6px; flex-wrap:wrap;">
          ${o.status !== 'confirmed' ? `<button class="btn small" data-act="confirmed" data-id="${o.id}">✅ Tasdiqlash</button>` : ''}
          <button class="btn small primary" data-act="completed" data-id="${o.id}">🏁 Tayyor</button>
        </div>
      </div>
    `).join('');
    box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => setStatus(Number(b.dataset.id), b.dataset.act, b)));
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

// withBusy (2026-09-10) — "✅ Tasdiqlash"/"🏁 Tayyor" so'rov davomida
// bloklanadi: ikki marta bosilsa ikkinchi so'rov ortiqcha edi va oshpaz
// muvaffaqiyatli amaldan keyin xato toast'ini ko'rishi mumkin edi.
async function setStatus(id, status, btn) {
  await withBusy(btn, async () => {
    try {
      await api(`/chef/orders/${id}/status`, { method: 'PUT', body: { status } });
      toast('Holat yangilandi');
      loadOnlineOrders();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function loadAll() {
  loadTables();
  loadOnlineOrders();
}

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  setInterval(loadAll, 15000); // 15 soniyada avtomatik yangilanadi
});
