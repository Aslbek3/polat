function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const STATUS_LABEL = { new: 'Yangi', confirmed: 'Tasdiqlangan', completed: 'Bajarildi', cancelled: 'Bekor qilingan' };
const STATUS_BADGE = { new: 'debt', confirmed: 'ok', completed: 'ok', cancelled: 'low' };
const FULFILLMENT_LABEL = { pickup: "Olib ketish", delivery: 'Yetkazib berish' };

async function loadOrders() {
  const box = document.getElementById('orderList');
  try {
    const rows = await api('/admin/customer-orders');
    if (rows.length === 0) {
      box.innerHTML = '<p class="dim">Hozircha buyurtma yo\'q.</p>';
      return;
    }
    box.innerHTML = rows.map((o) => `
      <div class="card">
        <div class="card-row">
          <div>
            <div class="card-title">${escapeHtml(o.full_name)} <span class="badge ${STATUS_BADGE[o.status]}">${STATUS_LABEL[o.status]}</span></div>
            <div class="card-sub">${FULFILLMENT_LABEL[o.fulfillment]} · ${fmtDateTime(o.created_at)}</div>
            <div class="card-sub"><a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>${o.address ? ' · ' + escapeHtml(o.address) : ''}</div>
            ${o.note ? `<div class="card-sub">${escapeHtml(o.note)}</div>` : ''}
          </div>
          <div class="card-title text-right">${fmtMoney(o.total_amount)}</div>
        </div>
        <div class="mt-8" style="border-top:1px dashed var(--border); padding-top:8px;">
          ${o.items.map((it) => `<div class="card-sub">${it.quantity} × ${escapeHtml(it.name_snapshot)} — ${fmtMoney(it.subtotal)}</div>`).join('')}
        </div>
        <div class="mt-8" style="display:flex; gap:6px; flex-wrap:wrap;">
          ${o.status !== 'confirmed' ? `<button class="btn small" data-act="confirmed" data-id="${o.id}">✅ Tasdiqlash</button>` : ''}
          ${o.status !== 'completed' ? `<button class="btn small" data-act="completed" data-id="${o.id}">🏁 Bajarildi</button>` : ''}
          ${o.status !== 'cancelled' ? `<button class="btn small" data-act="cancelled" data-id="${o.id}">❌ Bekor qilish</button>` : ''}
          <button class="btn small danger" data-del="${o.id}">🗑 O'chirish</button>
        </div>
      </div>
    `).join('');
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
});
