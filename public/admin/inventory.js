let inventoryItems = [];
let menuCategories = []; // "Menyuda ko'rsatish" select'i uchun (Menyu bo'limidagi kategoriyalar)
let editingInvId = null;
let adjustingInvId = null;

// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
async function loadAll() {
  const box = document.getElementById('inventoryList');
  try {
    [inventoryItems, menuCategories] = await Promise.all([
      api('/admin/inventory/items'),
      api('/admin/menu/categories').catch(() => []),
    ]);
    render();
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}

function stockBadge(item) {
  if (item.quantity <= 0) return `<span class="badge low">Tugadi</span>`;
  if (item.low_stock_threshold > 0 && item.quantity <= item.low_stock_threshold) {
    return `<span class="badge debt">Kam qoldi</span>`;
  }
  return `<span class="badge ok">Yetarli</span>`;
}

function render() {
  const box = document.getElementById('inventoryList');
  if (inventoryItems.length === 0) {
    box.innerHTML = '<p class="dim">Hali ombor mahsuloti yo\'q. Yuqoridagi tugma bilan qo\'shing (masalan: Suv, Salfetka).</p>';
    return;
  }
  box.innerHTML = inventoryItems.map((it) => `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${escapeHtml(it.name)}${it.volume ? ` <span class="dim" style="font-weight:400;">(${escapeHtml(it.volume)})</span>` : ''}</div>
          <div class="card-sub">${it.quantity} ${escapeHtml(it.unit)} ${stockBadge(it)}</div>
          <div class="dim" style="font-size:12px; margin-top:2px;">
            Tan narxi: ${fmtMoney(it.cost_price)} · Sotuv narxi: ${fmtMoney(it.sale_price)}
            ${it.sale_price > 0 ? ` · Foyda: ${fmtMoney(it.sale_price - it.cost_price)}/${escapeHtml(it.unit)}` : ''}
          </div>
          ${it.linked_menu_items
            ? `<div class="dim" style="font-size:12px; margin-top:4px;">Bog'langan menyu: ${escapeHtml(it.linked_menu_items)}</div>`
            : `<div style="font-size:12px; margin-top:4px;"><span class="badge low">Menyuda yo'q</span> — tahrirlab bo'limini tanlang</div>`}
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="btn small" data-in="${it.id}">📥 Kirim</button>
          <button class="btn small" data-out="${it.id}">📤 Chiqim</button>
          <button class="btn small" data-history="${it.id}">📜 Tarix</button>
          <button class="btn small" data-edit="${it.id}">✎</button>
          <button class="btn small danger" data-del="${it.id}">🗑</button>
        </div>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('[data-in]').forEach((b) => b.addEventListener('click', () => openAdjustModal(Number(b.dataset.in), 'in')));
  box.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', () => openAdjustModal(Number(b.dataset.out), 'out')));
  box.querySelectorAll('[data-history]').forEach((b) => b.addEventListener('click', () => openHistoryModal(Number(b.dataset.history))));
  box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openInvModal(Number(b.dataset.edit))));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delItem(Number(b.dataset.del))));
}

// ---------------- Mahsulot qo'shish/tahrirlash modali ----------------

function openInvModal(id) {
  editingInvId = id || null;
  const item = id ? inventoryItems.find((i) => i.id === id) : null;
  document.getElementById('invModalTitle').textContent = item ? 'Mahsulotni tahrirlash' : 'Yangi ombor mahsuloti';
  document.getElementById('invName').value = item ? item.name : '';
  document.getElementById('invVolume').value = item ? (item.volume || '') : '';
  document.getElementById('invUnit').value = item ? item.unit : 'dona';
  document.getElementById('invThreshold').value = item ? item.low_stock_threshold : 0;
  document.getElementById('invCost').value = item ? item.cost_price : 0;
  document.getElementById('invSale').value = item ? item.sale_price : 0;
  // Boshlang'ich qoldiq faqat YANGI mahsulot qo'shishda ko'rsatiladi — mavjud
  // mahsulotning qoldig'i "± Qoldiq" (kirim/chiqim, tarix bilan) orqali o'zgartiriladi,
  // to'g'ridan-to'g'ri tahrirlash orqali emas (aks holda harakat tarixi (inventory_movements)
  // bilan mos kelmay qolardi).
  const qtyField = document.getElementById('invQtyField');
  if (item) {
    qtyField.classList.add('hidden');
  } else {
    qtyField.classList.remove('hidden');
    document.getElementById('invQty').value = 0;
  }

  // "Menyuda ko'rsatish" select'i — mahsulot ALLAQACHON biror taomga bog'langan
  // bo'lsa yashiriladi (qayta tanlash yangi dublikat taom yaratib qo'ymasin;
  // server ham buni no-op qiladi, lekin UI'da ham chalkashtirmaslik uchun
  // yashirilgan yaxshi) — o'rniga qaysi taom(lar)ga bog'liqligi matn bilan
  // ko'rsatiladi. Bog'lanmagan bo'lsa — bo'lim tanlab, darhol menyuda
  // ko'rinadigan qilish mumkin.
  const menuCatField = document.getElementById('invMenuCategoryField');
  const linkedNote = document.getElementById('invLinkedNote');
  const isLinked = item && item.linked_menu_count > 0;
  if (isLinked) {
    menuCatField.classList.add('hidden');
    linkedNote.textContent = `Bog'langan menyu taomi: ${item.linked_menu_items}. O'zgartirish/qo'shimcha hajm qo'shish uchun Menyu bo'limiga o'ting.`;
  } else {
    menuCatField.classList.remove('hidden');
    linkedNote.textContent = '';
    const sel = document.getElementById('invMenuCategory');
    sel.innerHTML = ['<option value="">— Menyuda ko\'rsatilmasin (masalan salfetka) —</option>']
      .concat(menuCategories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`))
      .join('');
    sel.value = '';
  }

  document.getElementById('invModal').classList.remove('hidden');
}
function closeInvModal() { document.getElementById('invModal').classList.add('hidden'); editingInvId = null; }

document.getElementById('addItemBtn').addEventListener('click', () => openInvModal(null));
document.getElementById('invCancelBtn').addEventListener('click', closeInvModal);
// withBusy() — ikki marta bosishdan himoya (2026-09-10). Sekin tarmoqda
// ikkinchi bosish ikkinchi POST yuborib, omborda dublikat mahsulot yaratardi.
document.getElementById('invSaveBtn').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
  const name = document.getElementById('invName').value.trim();
  const volume = document.getElementById('invVolume').value.trim();
  const unit = document.getElementById('invUnit').value.trim() || 'dona';
  const low_stock_threshold = Number(document.getElementById('invThreshold').value) || 0;
  const cost_price = Number(document.getElementById('invCost').value) || 0;
  const sale_price = Number(document.getElementById('invSale').value) || 0;
  const menuCatVal = document.getElementById('invMenuCategory').value;
  const menu_category_id = menuCatVal ? Number(menuCatVal) : null;
  if (!name) return toast('Nomini kiriting', 'error');
  try {
    let result;
    if (editingInvId) {
      result = await api(`/admin/inventory/items/${editingInvId}`, { method: 'PUT', body: { name, unit, low_stock_threshold, cost_price, sale_price, volume, menu_category_id } });
    } else {
      const quantity = Number(document.getElementById('invQty').value) || 0;
      result = await api('/admin/inventory/items', { method: 'POST', body: { name, unit, quantity, low_stock_threshold, cost_price, sale_price, volume, menu_category_id } });
    }
    closeInvModal();
    // Mahsulot har doim saqlanadi, lekin "Menyuda ko'rsatish" bog'lash qismi
    // (masalan eskirgan kategoriya tanlangan bo'lsa) alohida muvaffaqiyatsiz
    // bo'lishi mumkin — shu holatda server _link_warning bilan ogohlantiradi
    // (2026-09-09'da qo'shildi, server/services/inventory.js'dagi izohga qarang).
    if (result && result._link_warning) {
      toast(`Mahsulot saqlandi, lekin menyuga bog'lashda xatolik: ${result._link_warning}`, 'error');
    } else {
      toast('Saqlandi');
    }
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}));

async function delItem(id) {
  const item = inventoryItems.find((i) => i.id === id);
  const label = item ? item.name : 'mahsulot';
  const ok = await customConfirm(`"${label}"ni o'chirasizmi? Unga bog'langan menyu taomlari uzilib, qo'lda boshqariladigan bo'lib qoladi.`);
  if (!ok) return;
  try {
    await api(`/admin/inventory/items/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------------- Kirim/chiqim (qoldiqni o'zgartirish) modali ----------------
// mode: 'in' = kirim (mahsulot keldi — doim musbat son so'raladi, "Necha dona
// keldi?"), 'out' = chiqim (buzildi/isrof bo'ldi va h.k. — "Necha dona ketdi?").
// Ikkalasida ham admin FAQAT musbat son kiritadi — ishora (+/-) ichkarida
// avtomatik qo'yiladi, shu bilan "manfiy son kiritish kerakmi?" degan
// chalkashlik butunlay yo'qoladi.
let adjustMode = 'in';

function openAdjustModal(id, mode) {
  adjustingInvId = id;
  adjustMode = mode;
  const item = inventoryItems.find((i) => i.id === id);
  if (!item) return;
  const modeLabel = mode === 'in' ? 'Kirim' : 'Chiqim';
  document.getElementById('adjustModalTitle').textContent = `${item.name} — ${modeLabel}`;
  document.getElementById('adjustQtyLabel').textContent = mode === 'in' ? 'Necha dona keldi?' : 'Necha dona ketdi?';
  document.getElementById('adjustCurrentQty').textContent = `Hozirgi qoldiq: ${item.quantity} ${item.unit}`;
  document.getElementById('adjustDelta').value = '';
  document.getElementById('adjustDelta').placeholder = mode === 'in' ? 'masalan: 24' : 'masalan: 3';
  document.getElementById('adjustNote').value = '';
  document.getElementById('adjustSaveBtn').textContent = mode === 'in' ? 'Kirim qilish' : 'Chiqim qilish';
  document.getElementById('adjustModal').classList.remove('hidden');
}
function closeAdjustModal() { document.getElementById('adjustModal').classList.add('hidden'); adjustingInvId = null; }

document.getElementById('adjustCancelBtn').addEventListener('click', closeAdjustModal);
// ⚠️ withBusy() bu yerda ENG MUHIM (2026-09-10): bu POST idempotent EMAS.
// Sekin tarmoqda "Kirim qilish" ikki marta bosilsa omborga miqdor IKKI MARTA
// qo'shilardi va `inventory_movements`ga ikkita yozuv tushardi — qoldiq
// haqiqatdan uzilib, sababini keyin topib bo'lmasdi.
document.getElementById('adjustSaveBtn').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
  const qty = Number(document.getElementById('adjustDelta').value);
  const note = document.getElementById('adjustNote').value.trim();
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
    return toast("Miqdorni to'g'ri kiriting (masalan 24)", 'error');
  }
  const delta = adjustMode === 'in' ? qty : -qty;
  try {
    await api(`/admin/inventory/items/${adjustingInvId}/adjust`, { method: 'POST', body: { delta, note } });
    closeAdjustModal();
    toast('Saqlandi');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}));

// ---------------- Tarix (har bir kirim/chiqim harakati) ----------------

const MOVEMENT_LABELS = {
  restock: 'Kirim',
  adjustment: 'Chiqim / tuzatish',
  order: 'Buyurtma orqali sarflandi',
  return: "Bekor qilingan buyurtma qaytardi",
};

async function openHistoryModal(id) {
  const item = inventoryItems.find((i) => i.id === id);
  document.getElementById('historyModalTitle').textContent = item ? `${item.name} — tarix` : 'Tarix';
  const box = document.getElementById('historyList');
  box.innerHTML = '<p class="dim">Yuklanmoqda...</p>';
  document.getElementById('historyModal').classList.remove('hidden');
  try {
    const rows = await api(`/admin/inventory/items/${id}/movements`);
    if (rows.length === 0) {
      box.innerHTML = '<p class="dim">Hali hech qanday harakat yo\'q.</p>';
      return;
    }
    box.innerHTML = rows.map((r) => {
      const sign = r.delta > 0 ? '+' : '';
      const cls = r.delta > 0 ? 'ok' : 'low';
      const label = MOVEMENT_LABELS[r.reason] || r.reason;
      return `
        <div class="card-row" style="padding:8px 0; border-bottom:1px solid var(--border);">
          <div>
            <div>${escapeHtml(label)}${r.note ? ` — ${escapeHtml(r.note)}` : ''}</div>
            <div class="dim" style="font-size:12px;">${fmtDateTime(r.created_at)}${r.created_by_name ? ` · ${escapeHtml(r.created_by_name)}` : ''}</div>
          </div>
          <div class="badge ${cls}">${sign}${r.delta} ${item ? escapeHtml(item.unit) : ''}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
}
document.getElementById('historyCloseBtn').addEventListener('click', () => {
  document.getElementById('historyModal').classList.add('hidden');
});
document.getElementById('historyModal').addEventListener('click', (e) => {
  if (e.target.id === 'historyModal') document.getElementById('historyModal').classList.add('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
  initNav('inventory');
  loadAll();
});
