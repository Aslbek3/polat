// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
const STATUS_LABEL = { new: 'Yangi', confirmed: 'Tasdiqlangan', completed: 'Tayyor' };
const STATUS_BADGE = { new: 'debt', confirmed: 'ok', completed: 'ok' };

// So'rovlar navbati (2026-09-10).
// NEGA: ro'yxat har 15 soniyada avtomatik yangilanadi, "🚚 Yetkazildi" ham
// xuddi shu ro'yxatni qayta yuklaydi — javoblarning kelish tartibi
// kafolatlanmagan. Eski poll javobi kechikib kelsa, allaqachon yetkazilgan
// buyurtmani yana "Yetkazildi" tugmasi bilan chizib qo'yardi va dastavkachi
// qayta bosardi (natijada `400 "allaqachon yetkazilgan"` xato toast'i).
//
// Navbat qo'lda `reqSeq` hisoblagichi bilan yozilgan edi — 2026-09-10 da
// ../app.js'dagi umumiy renderList()ga o'tkazildi. Yordamchi yana ikkita
// himoyani beradi: fon xatosida ro'yxat O'CHIRILMAYDI (dastavkachi mobil
// internetda ishlaydi, uzilish odatiy hol) va ma'lumot o'zgarmagan bo'lsa
// DOM'ga tegilmaydi — poll "🚚 Yetkazildi" bosilayotgan payt tugmani
// DOM'dan olib tashlab, bosishni yutib qo'ymaydi.
async function loadOrders(isPoll) {
  await renderList({
    box: 'deliveryOrders',
    isPoll,
    load: () => api('/courier/orders'),
    empty: "Hozircha yetkazib berish buyurtmasi yo'q.",
    render: (rows) => rows.map((o) => {
      const delivered = !!o.delivered_at;
      const mapsLink = (o.location_lat != null && o.location_lng != null)
        ? `<a class="btn small light block" href="https://www.google.com/maps?q=${escapeHtml(o.location_lat)},${escapeHtml(o.location_lng)}" target="_blank" rel="noopener">🗺 Xaritada ko'rish</a>`
        : '';
      let actionHtml;
      if (delivered) {
        actionHtml = `<span class="badge ok">✅ Yetkazildi &middot; ${fmtDateTime(o.delivered_at)}</span>`;
      } else if (o.status === 'completed') {
        actionHtml = `<button class="btn small primary block" data-deliver="${o.id}" data-name="${escapeHtml(o.full_name)}">🚚 Yetkazildi</button>`;
      } else {
        actionHtml = '<span class="dim">Oshxonada tayyorlanmoqda...</span>';
      }
      // Xaritada ko'rish + Yetkazildi — pastda, yonma-yon 2 ustunli qator
      // (lokatsiya bo'lmasa faqat amal ustuni to'liq kenglikda ko'rinadi).
      // X-08 (2026-09-10): oraliq 8px edi — mototsikl ustida bir qo'lda
      // "Xarita" o'rniga qaytarib bo'lmaydigan "Yetkazildi" bosilib ketardi.
      // Endi 24px (ikkala tugma .btn.small — 44px).
      const bottomRow = mapsLink
        ? `<div class="mt-8" style="display:flex; gap:24px;">
             <div style="flex:1;">${mapsLink}</div>
             <div style="flex:1; display:flex; align-items:center; justify-content:center;">${actionHtml}</div>
           </div>`
        : `<div class="mt-8">${actionHtml}</div>`;
      // 2026-09-10: buyurtma qancha vaqtdan beri kutayotgani ("⏱ 12 daq") —
      // soatning o'zi ("20:15") shoshib turgan dastavkachiga hisoblashni
      // qoldirardi. waitBadgeHtml() — fmtElapsed() emas: renderList ma'lumot
      // o'zgarmasa qayta chizmaydi, badge matnini esa refreshElapsed() (app.js)
      // har 30 soniyada o'zi yangilaydi. Yetkazilgan buyurtmada kerak emas.
      return `
      <div class="card"${delivered ? ' style="opacity:0.6;"' : ''}>
        <div class="card-row">
          <div>
            <div class="card-title">${escapeHtml(o.full_name)} <span class="badge ${STATUS_BADGE[o.status] || 'ok'}">${STATUS_LABEL[o.status] || escapeHtml(o.status)}</span></div>
            <div class="card-sub">${fmtDateTime(o.created_at)}${delivered ? '' : ` ${waitBadgeHtml(o.created_at)}`}</div>
          </div>
          <div class="card-title text-right">${fmtMoney(o.total_amount)}</div>
        </div>
        <div class="mt-8">
          <div class="card-sub"><a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a></div>
          ${o.address ? `<div class="card-sub">${escapeHtml(o.address)}</div>` : ''}
          ${o.note ? `<div class="card-sub">📝 ${escapeHtml(o.note)}</div>` : ''}
          ${deliveryChargeHtml(o)}
        </div>
        <div class="mt-8" style="border-top:1px dashed var(--border); padding-top:8px;">
          ${o.items.map((it) => `<div class="card-sub">${it.quantity} × ${escapeHtml(it.name_snapshot)}</div>`).join('')}
        </div>
        ${bottomRow}
      </div>
    `;
    }).join(''),
    bind: (box) => {
      box.querySelectorAll('[data-deliver]').forEach((b) => b.addEventListener('click', () => markDelivered(Number(b.dataset.deliver), b)));
    },
  });
}

// withBusy (2026-09-10) — NEGA: dastavkachi telefonda "🚚 Yetkazildi" ni ikki
// marta bosardi (birinchi bosishga hech qanday javob ko'rinmagani uchun),
// ikkinchi so'rov esa `400 "allaqachon yetkazilgan"` qaytarardi — ya'ni
// MUVAFFAQIYATLI amal uchun qizil xato toast'i chiqardi.
//
// X-08 (2026-09-10): endi tasdiqlanadi — orqaga qaytarish yo'li yo'q, tugma
// esa "Xarita" yonida. Tasdiqlash oynasida mijoz ismi bor: dastavkachi
// qo'lida bir nechta buyurtma bo'lsa noto'g'ri kartani bosganini ko'radi.
async function markDelivered(id, btn) {
  const who = btn && btn.dataset.name ? `«${btn.dataset.name}» buyurtmasi` : 'Buyurtma';
  const ok = await customConfirm(
    `${who} yetkazildi deb belgilansinmi? Bu amalni ortga qaytarib bo'lmaydi.`,
    { title: 'Yetkazildi', okText: '🚚 Yetkazildi' }
  );
  if (!ok) return;
  await withBusy(btn, async () => {
    try {
      await api(`/courier/orders/${id}/deliver`, { method: 'PUT' });
      toast('Yetkazildi deb belgilandi');
      loadOrders();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadOrders();
  // isPoll=true — fon xatosida ro'yxat o'chirilmasin (renderList() izohiga qarang).
  setInterval(() => loadOrders(true), 15000); // 15 soniyada avtomatik yangilanadi
  // X-24 (2026-09-10): telefon qulflanib qaytganda darhol yangilanadi.
  onVisible(() => {
    loadOrders(true);
    pollDeliveryAlerts();
  });
});
