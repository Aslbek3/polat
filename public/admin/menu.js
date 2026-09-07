let categories = [];
let items = [];
let editingCatId = null;
let editingItemId = null;
let itemModalCategoryId = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadAll() {
  const box = document.getElementById('categoryList');
  try {
    [categories, items] = await Promise.all([api('/admin/menu/categories'), api('/admin/menu/items')]);
    render();
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

function render() {
  const box = document.getElementById('categoryList');
  if (categories.length === 0) {
    box.innerHTML = '<p class="dim">Hali kategoriya yo\'q.</p>';
    return;
  }
  box.innerHTML = categories.map((c) => {
    const catItems = items.filter((it) => it.category_id === c.id);
    return `
      <div class="card">
        <div class="card-row">
          <div class="card-title">${escapeHtml(c.name)} ${c.is_active ? '' : '<span class="badge low">o\'chirilgan</span>'}</div>
          <div style="display:flex; gap:6px;">
            <button class="btn small" data-edit-cat="${c.id}">Tahrirlash</button>
            <button class="btn small danger" data-del-cat="${c.id}">O'chirish</button>
          </div>
        </div>
        <div class="mt-8">
          ${catItems.length === 0 ? '<p class="dim" style="font-size:13px;">Taom yo\'q</p>' : catItems.map((it) => `
            <div class="menu-item-row">
              <div>
                <div class="mi-name">${escapeHtml(it.name)} ${it.is_active ? '' : '<span class="badge low">o\'chirilgan</span>'}</div>
                <div class="mi-price">${fmtMoney(it.price)}</div>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <label style="display:flex; align-items:center; gap:4px; font-size:12px;">
                  <input type="checkbox" data-avail="${it.id}" ${it.is_available ? 'checked' : ''}> mavjud
                </label>
                <button class="btn small" data-edit-item="${it.id}">✎</button>
                <button class="btn small danger" data-del-item="${it.id}">🗑</button>
              </div>
            </div>
          `).join('')}
          <button class="btn small mt-8" data-add-item-cat="${c.id}">+ Taom qo'shish</button>
        </div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('[data-edit-cat]').forEach((b) => b.addEventListener('click', () => openCatModal(Number(b.dataset.editCat))));
  box.querySelectorAll('[data-del-cat]').forEach((b) => b.addEventListener('click', () => delCategory(Number(b.dataset.delCat))));
  box.querySelectorAll('[data-avail]').forEach((b) => b.addEventListener('change', () => toggleAvailability(Number(b.dataset.avail), b.checked)));
  box.querySelectorAll('[data-edit-item]').forEach((b) => b.addEventListener('click', () => openItemModal(null, Number(b.dataset.editItem))));
  box.querySelectorAll('[data-del-item]').forEach((b) => b.addEventListener('click', () => delItem(Number(b.dataset.delItem))));
  box.querySelectorAll('[data-add-item-cat]').forEach((b) => b.addEventListener('click', () => openItemModal(Number(b.dataset.addItemCat), null)));
}

// ---------------- Kategoriya modal ----------------

function openCatModal(id) {
  editingCatId = id;
  const cat = categories.find((c) => c.id === id);
  document.getElementById('catModalTitle').textContent = cat ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya';
  document.getElementById('catName').value = cat ? cat.name : '';
  document.getElementById('catSort').value = cat ? cat.sort_order : 0;
  document.getElementById('catModal').classList.remove('hidden');
}
function closeCatModal() { document.getElementById('catModal').classList.add('hidden'); editingCatId = null; }

document.getElementById('addCatBtn').addEventListener('click', () => openCatModal(null));
document.getElementById('catCancelBtn').addEventListener('click', closeCatModal);
document.getElementById('catSaveBtn').addEventListener('click', async () => {
  const name = document.getElementById('catName').value.trim();
  const sort_order = Number(document.getElementById('catSort').value) || 0;
  if (!name) return toast('Nomini kiriting', 'error');
  try {
    if (editingCatId) {
      await api(`/admin/menu/categories/${editingCatId}`, { method: 'PUT', body: { name, sort_order } });
    } else {
      await api('/admin/menu/categories', { method: 'POST', body: { name, sort_order } });
    }
    closeCatModal();
    toast('Saqlandi');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
});

async function delCategory(id) {
  if (!confirm("Kategoriyani o'chirasizmi? (unga tegishli taomlar ko'rinmay qoladi)")) return;
  try {
    await api(`/admin/menu/categories/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------------- Taom modal ----------------

function openItemModal(categoryId, itemId) {
  editingItemId = itemId;
  const item = itemId ? items.find((it) => it.id === itemId) : null;
  itemModalCategoryId = item ? item.category_id : categoryId;
  document.getElementById('itemModalTitle').textContent = item ? 'Taomni tahrirlash' : 'Yangi taom';
  document.getElementById('itemName').value = item ? item.name : '';
  document.getElementById('itemPrice').value = item ? item.price : '';
  document.getElementById('itemSort').value = item ? item.sort_order : 0;
  document.getElementById('itemModal').classList.remove('hidden');
}
function closeItemModal() { document.getElementById('itemModal').classList.add('hidden'); editingItemId = null; }

document.getElementById('itemCancelBtn').addEventListener('click', closeItemModal);
document.getElementById('itemSaveBtn').addEventListener('click', async () => {
  const name = document.getElementById('itemName').value.trim();
  const price = Number(document.getElementById('itemPrice').value);
  const sort_order = Number(document.getElementById('itemSort').value) || 0;
  if (!name) return toast('Nomini kiriting', 'error');
  if (!Number.isFinite(price) || price < 0) return toast("Narxni to'g'ri kiriting", 'error');
  try {
    if (editingItemId) {
      await api(`/admin/menu/items/${editingItemId}`, { method: 'PUT', body: { name, price, sort_order } });
    } else {
      await api('/admin/menu/items', { method: 'POST', body: { category_id: itemModalCategoryId, name, price, sort_order } });
    }
    closeItemModal();
    toast('Saqlandi');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
});

async function toggleAvailability(id, checked) {
  try {
    await api(`/admin/menu/items/${id}/availability`, { method: 'PATCH', body: { is_available: checked } });
  } catch (err) {
    toast(err.message, 'error');
    loadAll();
  }
}

async function delItem(id) {
  if (!confirm("Taomni o'chirasizmi?")) return;
  try {
    await api(`/admin/menu/items/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('menu');
  loadAll();
});
