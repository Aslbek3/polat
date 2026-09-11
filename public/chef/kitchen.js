// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).

// So'rovlar navbati (2026-09-10) — ikkita ro'yxat uchun alohida hisoblagich.
// NEGA: sahifa har 15 soniyada avtomatik yangilanadi, oshpazning amali
// ("🏁 Tayyor", "✅ Tasdiqlash") ham xuddi shu ro'yxatni qayta yuklaydi —
// javoblarning kelish tartibi kafolatlanmagan. Eski poll javobi kechikib
// kelsa, u yangi holatning ustidan yozib, taomni yana "tayyor emas" qilib
// ko'rsatardi; oshpaz "bosilmadi shekilli" deb qayta bosardi.
//
// Bu navbat qo'lda `tablesSeq`/`onlineSeq` hisoblagichlari bilan yozilgan edi —
// 2026-09-10 da ../app.js'dagi umumiy renderList()ga o'tkazildi (u har bir
// `box` uchun o'z navbatini yuritadi). Yordamchi qo'shimcha ikkita himoyani
// ham beradi: fon xatosida ro'yxat O'CHIRILMAYDI (faqat toast) va ma'lumot
// o'zgarmagan bo'lsa DOM'ga tegilmaydi — ya'ni poll aynan "🏁 Tayyor"
// bosilayotgan payt tugmani DOM'dan olib tashlab, bosishni yutib qo'ymaydi.
// X-01 (2026-09-10): kartadagi kutish vaqti — faqat HALI TAYYOR BO'LMAGAN
// taomlar bo'yicha (oshpaz hammasini tayyorlab bo'lgan stol qizarib
// turmasin). 2026-09-11: bu qiymat endi serverdan — `t.oldest_sent_at`
// (services/kitchen.js) aynan shu qoida bilan hisoblanadi va TARTIB ham
// shunga ko'ra. Ilgari bu yerda alohida hisoblanardi, server esa tayyor
// taomni ham qo'shib tartiblardi: rang to'g'ri, tartib noto'g'ri edi.
// Tartib serverniki (FIFO) — bu yerda QAYTA TARTIBLANMAYDI.

async function loadTables(isPoll) {
  await renderList({
    box: 'tableOrders',
    isPoll,
    load: async () => (await api('/chef/tables')).filter((t) => t.occupied),
    empty: "Hozircha band stol yo'q.",
    // X-01: `data-wait-card` — refreshElapsed() (app.js) kartaga 15 daqiqada
    // .wait-warn, 25 da .wait-danger beradi va har 30 soniyada yangilaydi
    // (renderList ma'lumot o'zgarmasa qayta chizmaydi, shu sabab vaqt matni
    // shu yerda qotib qolmasligi uchun faqat waitBadgeHtml() ishlatiladi).
    // X-30 (2026-09-10): narx olib tashlandi — oshpazga kerak emas, tor
    // planshet ekranida taom nomini siqib qo'yardi.
    render: (occupied) => occupied.map((t) => {
      const pendingSince = t.oldest_sent_at;
      return `
      <div class="card"${pendingSince ? ' data-wait-card' : ''}>
        <div class="card-row">
          <div class="card-title">${escapeHtml(t.name)}</div>
          ${pendingSince ? waitBadgeHtml(pendingSince) : ''}
        </div>
        <div class="mt-8">
          ${(t.items && t.items.length)
            ? t.items.map((it) => `
              <div class="card-row mt-4">
                <div class="card-sub">${it.quantity} × ${escapeHtml(it.name_snapshot)} ${it.ready_at ? '' : waitBadgeHtml(it.sent_at)}</div>
                <button class="btn small ${it.ready_at ? 'primary' : ''}" data-ready="${it.id}" data-val="${it.ready_at ? '0' : '1'}" aria-pressed="${it.ready_at ? 'true' : 'false'}" aria-label="«${escapeHtml(it.name_snapshot)}» tayyor">${it.ready_at ? '✅ Tayyor' : '🏁 Tayyor'}</button>
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
    `;
    }).join(''),
    // withBusy (2026-09-10) — so'rov davomida tugma bloklanadi: ikki marta
    // bosilsa ikkinchi so'rov keraksiz va oshpaz holatni "orqaga" qaytarib
    // yuborishi mumkin edi.
    bind: (box) => {
      box.querySelectorAll('[data-ready]').forEach((b) => b.addEventListener('click', () => toggleItemReady(Number(b.dataset.ready), b.dataset.val === '1', b)));
    },
  });
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

// X-09 (2026-09-10): "Tasdiqlash" va "Tayyor" orasi 6px edi — zararsiz
// "Tasdiqlash" o'rniga qaytarib bo'lmaydigan "Tayyor" bosilib ketardi. Endi
// ular kartaning ikki chetida (space-between, kamida 24px).
// X-01: onlayn buyurtmada ham kutish vaqti (mijoz buyurtma bergan paytdan) —
// stol kartalari bilan bir xil 15/25 daqiqalik rang.
// 2026-09-10: mijoz izohi (`note`, "achchiqsiz" va h.k.) server oshpazga
// ATAYLAB yuboradi (services/kitchen.js CHEF_ORDER_FIELDS), lekin chizilmasdi.
async function loadOnlineOrders(isPoll) {
  await renderList({
    box: 'onlineOrders',
    isPoll,
    load: () => api('/chef/orders'),
    empty: "Hozircha onlayn buyurtma yo'q.",
    render: (rows) => rows.map((o) => `
      <div class="card" data-wait-card>
        <div class="card-row">
          <div class="card-title">${escapeHtml(o.full_name)} <span class="badge ${o.fulfillment === 'delivery' ? 'debt' : 'ok'}">${FULFILLMENT_LABEL[o.fulfillment] || escapeHtml(o.fulfillment)}</span> <span class="badge ${o.status === 'confirmed' ? 'ok' : 'debt'}">${STATUS_LABEL[o.status] || escapeHtml(o.status)}</span></div>
        </div>
        <div class="card-sub">${fmtDateTime(o.created_at)} ${waitBadgeHtml(o.created_at)}</div>
        <div class="mt-8">
          ${o.items.map((it) => `<div class="card-sub">${it.quantity} × ${escapeHtml(it.name_snapshot)}</div>`).join('')}
          ${o.note ? `<div class="card-sub">📝 ${escapeHtml(o.note)}</div>` : ''}
        </div>
        <div class="mt-8" style="display:flex; gap:24px; flex-wrap:wrap; justify-content:space-between;">
          ${o.status !== 'confirmed' ? `<button class="btn small" data-act="confirmed" data-id="${o.id}">✅ Tasdiqlash</button>` : ''}
          <button class="btn small primary" data-act="completed" data-id="${o.id}" data-name="${escapeHtml(o.full_name)}">🏁 Tayyor</button>
        </div>
      </div>
    `).join(''),
    bind: (box) => {
      box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => setStatus(Number(b.dataset.id), b.dataset.act, b)));
    },
  });
}

// withBusy (2026-09-10) — "✅ Tasdiqlash"/"🏁 Tayyor" so'rov davomida
// bloklanadi: ikki marta bosilsa ikkinchi so'rov ortiqcha edi va oshpaz
// muvaffaqiyatli amaldan keyin xato toast'ini ko'rishi mumkin edi.
//
// X-09 (2026-09-10): "🏁 Tayyor" endi tasdiqlanadi. NEGA: bosilishi bilan
// buyurtma oshpaz ekranidan BUTUNLAY yo'qoladi va kuryerga signal ketadi —
// oshpaz uni qayta topa olmaydi, orqaga qaytarish yo'li yo'q. "Tasdiqlash"
// esa qaytariladigan va zararsiz — u tasdiqsiz qoladi.
async function setStatus(id, status, btn) {
  if (status === 'completed') {
    const who = btn && btn.dataset.name ? `«${btn.dataset.name}» buyurtmasi` : 'Buyurtma';
    const ok = await customConfirm(
      `${who} tayyor deb belgilansinmi? U oshxona ekranidan yo'qoladi va ortga qaytarib bo'lmaydi.`,
      { title: 'Buyurtma tayyor', okText: '🏁 Tayyor' }
    );
    if (!ok) return;
  }
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

function loadAll(isPoll) {
  loadTables(isPoll);
  loadOnlineOrders(isPoll);
}

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  // isPoll=true — fon xatosida ro'yxatlar o'chirilmasin (renderList() izohiga qarang).
  setInterval(() => loadAll(true), 15000); // 15 soniyada avtomatik yangilanadi
  // X-24 (2026-09-10): planshet uxlab qolsa setInterval to'xtaydi — qaytganda
  // 15 soniya eski ro'yxatni ko'rsatmay darhol yangilanadi.
  onVisible(() => {
    loadAll(true);
    pollDeliveryAlerts();
  });
});
