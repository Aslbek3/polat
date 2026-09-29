let tables = [];
let editingId = null;

// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
async function loadTables() {
  const box = document.getElementById('tableList');
  try {
    tables = await api('/admin/tables');
    if (tables.length === 0) {
      box.innerHTML = '<p class="dim">Hali stol qo\'shilmagan.</p>';
      return;
    }
    box.innerHTML = tables.map((t) => `
      <div class="card card-row">
        <div class="card-title">${escapeHtml(t.name)} ${t.is_active ? '' : '<span class="badge low">o\'chirilgan</span>'}</div>
        <div style="display:flex; gap:6px;">
          <button class="btn small" data-edit="${t.id}">Tahrirlash</button>
          <button class="btn small danger" data-del="${t.id}">O'chirish</button>
        </div>
      </div>
    `).join('');
    box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openModal(Number(b.dataset.edit))));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delTable(Number(b.dataset.del))));
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

function openModal(id) {
  editingId = id;
  const t = tables.find((x) => x.id === id);
  document.getElementById('modalTitle').textContent = t ? 'Stolni tahrirlash' : 'Yangi stol';
  document.getElementById('fName').value = t ? t.name : '';
  document.getElementById('fSort').value = t ? t.sort_order : 0;
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); editingId = null; }

document.getElementById('addBtn').addEventListener('click', () => openModal(null));
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', async () => {
  const name = document.getElementById('fName').value.trim();
  const sort_order = Number(document.getElementById('fSort').value) || 0;
  if (!name) return toast('Nomini kiriting', 'error');
  try {
    if (editingId) {
      await api(`/admin/tables/${editingId}`, { method: 'PUT', body: { name, sort_order } });
    } else {
      await api('/admin/tables', { method: 'POST', body: { name, sort_order } });
    }
    closeModal();
    toast('Saqlandi');
    loadTables();
  } catch (err) {
    toast(err.message, 'error');
  }
});

async function delTable(id) {
  if (!confirm("Stolni o'chirasizmi?")) return;
  try {
    await api(`/admin/tables/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadTables();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('tables');
  loadTables();
});
