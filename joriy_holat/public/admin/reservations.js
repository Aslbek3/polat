// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
const STATUS_LABEL = { new: 'Yangi', confirmed: 'Tasdiqlangan', cancelled: 'Bekor qilingan' };
const STATUS_BADGE = { new: 'debt', confirmed: 'ok', cancelled: 'low' };

async function loadReservations() {
  const box = document.getElementById('reservationList');
  try {
    const rows = await api('/admin/reservations');
    if (rows.length === 0) {
      box.innerHTML = '<p class="dim">Hozircha bron so\'rovlari yo\'q.</p>';
      return;
    }
    box.innerHTML = rows.map((r) => `
      <div class="card">
        <div class="card-row">
          <div>
            <div class="card-title">${escapeHtml(r.full_name)} <span class="badge ${STATUS_BADGE[r.status]}">${STATUS_LABEL[r.status]}</span></div>
            <div class="card-sub">${escapeHtml(r.res_date)} · ${escapeHtml(r.res_time)} · ${r.party_size} kishi</div>
            <div class="card-sub"><a href="tel:${escapeHtml(r.phone)}">${escapeHtml(r.phone)}</a>${r.note ? ' · ' + escapeHtml(r.note) : ''}</div>
          </div>
        </div>
        <div class="mt-8" style="display:flex; gap:6px; flex-wrap:wrap;">
          ${r.status !== 'confirmed' ? `<button class="btn small" data-act="confirmed" data-id="${r.id}">✅ Tasdiqlash</button>` : ''}
          ${r.status !== 'cancelled' ? `<button class="btn small" data-act="cancelled" data-id="${r.id}">❌ Bekor qilish</button>` : ''}
          <button class="btn small danger" data-del="${r.id}">🗑 O'chirish</button>
        </div>
      </div>
    `).join('');
    box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => setStatus(Number(b.dataset.id), b.dataset.act)));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delReservation(Number(b.dataset.del))));
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

async function setStatus(id, status) {
  try {
    await api(`/admin/reservations/${id}`, { method: 'PUT', body: { status } });
    toast('Holat yangilandi');
    loadReservations();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delReservation(id) {
  if (!confirm("Bronni o'chirasizmi?")) return;
  try {
    await api(`/admin/reservations/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadReservations();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('reservations');
  loadReservations();
});
