// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
const STATUS_LABEL = { new: 'Yangi', confirmed: 'Tasdiqlangan', completed: 'Bajarildi', cancelled: 'Bekor qilingan' };
const STATUS_BADGE = { new: 'debt', confirmed: 'ok', completed: 'ok', cancelled: 'low' };
const FULFILLMENT_LABEL = { pickup: "Olib ketish", delivery: 'Yetkazib berish' };

// "🖨 Chek" tugmasi bosilganda shu massivdan (id bo'yicha) topib
// openCustomerReceiptModal()ga uzatiladi — alohida "chek" API'si shart emas,
// items allaqachon shu yerda (GET /admin/customer-orders) yuklangan.
let orders = [];

async function loadOrders() {
  const box = document.getElementById('orderList');
  try {
    const rows = await api('/admin/customer-orders');
    orders = rows;
    if (rows.length === 0) {
      box.innerHTML = '<p class="dim">Hozircha buyurtma yo\'q.</p>';
      return;
    }
    box.innerHTML = rows.map((o) => {
      // Yetkazib berish buyurtmasi "tayyor" (status='completed') bo'lganda ham
      // dastavkachi hali yetkazmagan bo'lishi mumkin — shunday holatda "Bajarildi"
      // deyish CHALG'ITADI (admin buyurtma bilan hech narsa qilish shart emas deb
      // o'ylashi mumkin). Shu sabab yetkazib berish buyurtmalari uchun asosiy
      // status-belgisi delivered_at'ga qarab aniqlashtiriladi (2026-09-08 bug fix).
      let badgeCls = STATUS_BADGE[o.status];
      let badgeLabel = STATUS_LABEL[o.status];
      if (o.status === 'completed' && o.fulfillment === 'delivery') {
        if (o.delivered_at) {
          badgeCls = 'ok';
          badgeLabel = '✅ Yetkazildi';
        } else {
          badgeCls = 'debt';
          badgeLabel = '🚚 Yetkazilishi kutilmoqda';
        }
      }
      return `
      <div class="card">
        <div class="card-row">
          <div>
            <div class="card-title">${escapeHtml(o.full_name)} <span class="badge ${badgeCls}">${badgeLabel}</span></div>
            <div class="card-sub">${FULFILLMENT_LABEL[o.fulfillment]} · ${fmtDateTime(o.created_at)}</div>
            <div class="card-sub"><a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>${o.address ? ' · ' + escapeHtml(o.address) : ''}${o.location_lat != null && o.location_lng != null ? ` · <a href="https://www.google.com/maps?q=${o.location_lat},${o.location_lng}" target="_blank" rel="noopener">🗺 Xaritada ko'rish</a>` : ''}</div>
            ${o.note ? `<div class="card-sub">${escapeHtml(o.note)}</div>` : ''}
          </div>
          <div class="card-title text-right">${fmtMoney(o.total_amount)}</div>
        </div>
        <div class="mt-8" style="border-top:1px dashed var(--border); padding-top:8px;">
          ${o.items.map((it) => `<div class="card-sub">${it.quantity} × ${escapeHtml(it.name_snapshot)} — ${fmtMoney(it.subtotal)}</div>`).join('')}
        </div>
        <div class="mt-8" style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn small" data-print="${o.id}">🖨 Chek</button>
          ${o.status !== 'confirmed' ? `<button class="btn small" data-act="confirmed" data-id="${o.id}">✅ Tasdiqlash</button>` : ''}
          ${o.status !== 'completed' ? `<button class="btn small" data-act="completed" data-id="${o.id}">🏁 Bajarildi</button>` : ''}
          ${o.status !== 'cancelled' ? `<button class="btn small" data-act="cancelled" data-id="${o.id}">❌ Bekor qilish</button>` : ''}
          <button class="btn small danger" data-del="${o.id}">🗑 O'chirish</button>
        </div>
      </div>
    `;
    }).join('');
    box.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => {
      const order = orders.find((o) => o.id === Number(b.dataset.print));
      if (order) openCustomerReceiptModal(order);
    }));
    box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => setStatus(Number(b.dataset.id), b.dataset.act)));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delOrder(Number(b.dataset.del))));
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

async function setStatus(id, status) {
  try {
    await api(`/admin/customer-orders/${id}`, { method: 'PUT', body: { status } });
    toast('Holat yangilandi');
    loadOrders();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delOrder(id) {
  if (!confirm("Buyurtmani o'chirasizmi?")) return;
  try {
    await api(`/admin/customer-orders/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadOrders();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('customer-orders');
  loadOrders();
  // Ilgari faqat sahifa ochilganda bir marta yuklanardi — admin dastavka
  // holatini (masalan "Yetkazildi"ga o'zgarishini) ko'rish uchun qo'lda
  // yangilashga (F5) majbur edi. Oshpaz/dastavkachi ekranlari bilan bir xil
  // 15s avtomatik yangilanish qo'shildi (2026-09-08 bug fix).
  setInterval(loadOrders, 15000);
});
