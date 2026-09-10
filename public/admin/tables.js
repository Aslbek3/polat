// Admin "Stollar". escapeHtml() / renderList() — ../app.js'dan;
// openFormDialog() / requestCloseFormDialog() — admin.js'dan.
let tables = [];
let editingId = null;

async function loadTables() {
  await renderList({
    box: 'tableList',
    load: () => api('/admin/tables'),
    onData: (rows) => { tables = rows; },
    empty: "Hali stol qo'shilmagan.",
    // A-23 (2026-09-10): bo'sh holat keyingi qadamni aytadi.
    emptyHint: "Yuqoridagi «+ Yangi stol» tugmasi bilan birinchi stolni qo'shing (masalan: 1-stol). Afitsiantlar faqat shu yerdagi stollarni ko'radi.",
    render: (rows) => rows.map((t) => `
      <div class="card card-row">
        <div class="card-title">${escapeHtml(t.name)} ${t.is_active ? '' : '<span class="badge low">o\'chirilgan</span>'}</div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn small" data-edit="${t.id}" aria-label="${escapeHtml(`«${t.name}» stolini tahrirlash`)}">Tahrirlash</button>
          <button type="button" class="btn small danger" data-del="${t.id}" aria-label="${escapeHtml(`«${t.name}» stolini o'chirish`)}">O'chirish</button>
        </div>
      </div>
    `).join(''),
    bind: (box) => {
      box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openTableModal(Number(b.dataset.edit))));
      box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delTable(Number(b.dataset.del))));
    },
  });
}

// ⚠️ 2026-09-10: ilgari `openModal`/`closeModal` deb nomlangan edi — global
// scope'da umumiy nom (app.js izohiga qarang), shuning uchun qayta nomlandi.
// A-19/A-20/A-21: openFormDialog() — role=dialog, fokus, Escape/fon bosilsa
// o'zgarish bo'lsa so'raydi.
function openTableModal(id) {
  editingId = id;
  const t = tables.find((x) => x.id === id);
  document.getElementById('modalTitle').textContent = t ? 'Stolni tahrirlash' : 'Yangi stol';
  document.getElementById('fName').value = t ? t.name : '';
  document.getElementById('fSort').value = t ? t.sort_order : 0;
  openFormDialog('modal', { onClose: () => { editingId = null; } });
}
function closeTableModal() { closeDialog('modal', 'saved'); }

document.getElementById('addBtn').addEventListener('click', () => openTableModal(null));
document.getElementById('cancelBtn').addEventListener('click', () => requestCloseFormDialog('modal'));
// withBusy() — ikki marta bosishdan himoya: ikkinchi POST dublikat stol yaratardi.
document.getElementById('tableForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveBtn');
  if (btn.disabled) return;
  clearFieldErrors('tableForm');
  const name = document.getElementById('fName').value.trim();
  const sort_order = Number(document.getElementById('fSort').value) || 0;
  if (!name) { setFieldError('fName', 'Stol nomini kiriting'); return; }
  withBusy(btn, async () => {
    try {
      if (editingId) {
        await api(`/admin/tables/${editingId}`, { method: 'PUT', body: { name, sort_order } });
      } else {
        await api('/admin/tables', { method: 'POST', body: { name, sort_order } });
      }
      closeTableModal();
      toast('Saqlandi');
      loadTables();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});

async function delTable(id) {
  const t = tables.find((x) => x.id === id);
  if (!(await customConfirm(`${t ? `«${t.name}»` : 'Stol'}ni o'chirasizmi?`, { okText: "O'chirish", danger: true }))) return;
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
