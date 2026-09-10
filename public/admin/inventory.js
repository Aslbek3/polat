// Admin "Ombor". escapeHtml() / renderList() — ../app.js'dan;
// openFormDialog() / chipGroup() / pageParam() — admin.js'dan.
let inventoryItems = [];
let menuCategories = []; // "Menyuda ko'rsatish" select'i uchun
let editingInvId = null;
let adjustingInvId = null;
let invFilter = null; // chipGroup: 'all' | 'low'
let invQuery = '';

// "Kam qoldi" — server/services/inventory.js STOCK_OUT/STOCK_LOW bilan bir
// xil qoida (bosh sahifadagi ogohlantirish ham shunga tayanadi).
function isLowStock(it) {
  return it.quantity <= 0 || (it.low_stock_threshold > 0 && it.quantity <= it.low_stock_threshold);
}

function stockBadge(item) {
  if (item.quantity <= 0) return '<span class="badge low">Tugadi</span>';
  if (item.low_stock_threshold > 0 && item.quantity <= item.low_stock_threshold) {
    return '<span class="badge debt">Kam qoldi</span>';
  }
  return '<span class="badge ok">Yetarli</span>';
}

function renderInvCard(it) {
  const name = `${it.name}${it.volume ? ` (${it.volume})` : ''}`;
  return `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${escapeHtml(it.name)}${it.volume ? ` <span class="dim" style="font-weight:400;">(${escapeHtml(it.volume)})</span>` : ''}</div>
          <div class="card-sub">${Number(it.quantity)} ${escapeHtml(it.unit)} ${stockBadge(it)}</div>
          <div class="card-sub">
            Tan narxi: ${fmtMoney(it.cost_price)} · Sotuv narxi: ${fmtMoney(it.sale_price)}
            ${it.sale_price > 0 ? ` · Foyda: ${fmtMoney(it.sale_price - it.cost_price)}/${escapeHtml(it.unit)}` : ''}
          </div>
          ${it.linked_menu_items
            ? `<div class="card-sub">Bog'langan menyu: ${escapeHtml(it.linked_menu_items)}</div>`
            : '<div class="card-sub"><span class="badge low">Menyuda yo\'q</span> — tahrirlab bo\'limini tanlang</div>'}
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          <button type="button" class="btn small" data-in="${it.id}"><span aria-hidden="true">📥</span> Kirim</button>
          <button type="button" class="btn small" data-out="${it.id}"><span aria-hidden="true">📤</span> Chiqim</button>
          <button type="button" class="btn small" data-history="${it.id}"><span aria-hidden="true">📜</span> Tarix</button>
          <button type="button" class="btn icon" data-edit="${it.id}" aria-label="${escapeHtml(`«${name}» ni tahrirlash`)}" title="Tahrirlash">✎</button>
          <button type="button" class="btn icon danger" data-del="${it.id}" aria-label="${escapeHtml(`«${name}» ni o'chirish`)}" title="O'chirish">🗑</button>
        </div>
      </div>
    </div>`;
}

// Filtr ("faqat kam qolganlar") + qidiruv — mijoz tomonida (A-08, A-09).
// Server tartibi allaqachon to'g'ri: tugaganlar → kam qolganlar → qolganlari.
function renderInventoryHtml() {
  let rows = inventoryItems;
  if (invFilter && invFilter.get() === 'low') rows = rows.filter(isLowStock);
  if (invQuery) rows = rows.filter((it) => matchesSearch(`${it.name} ${it.volume || ''} ${it.linked_menu_items || ''}`, invQuery));
  if (rows.length === 0) {
    return `<div class="empty-state"><div>${invQuery ? `«${escapeHtml(invQuery)}» bo'yicha mahsulot topilmadi.` : "Kam qolgan mahsulot yo'q."}</div></div>`;
  }
  return rows.map(renderInvCard).join('');
}

// Tepada "⚠️ N ta mahsulot tugagan/kam qoldi" (A-09) va chip soni.
function updateLowStockUi() {
  const n = inventoryItems.filter(isLowStock).length;
  const banner = document.getElementById('lowStockBanner');
  const show = n > 0 && invFilter.get() !== 'low';
  const html = show
    ? `<div class="alert-list"><a class="alert-item danger" href="inventory.html?low=1" id="lowStockLink"><span class="alert-text">⚠️ ${n} ta mahsulot tugagan yoki kam qoldi — ko'rsatish</span><span class="alert-count">${n}</span></a></div>`
    : '';
  if (banner.innerHTML !== html) {
    banner.innerHTML = html;
    const link = document.getElementById('lowStockLink');
    if (link) link.addEventListener('click', (e) => { e.preventDefault(); invFilter.set('low'); });
  }
  invFilter.setLabel('low', n > 0 ? `Faqat kam qolganlar (${n})` : 'Faqat kam qolganlar');
}

function bindInventoryRows(box) {
  box.querySelectorAll('[data-in]').forEach((b) => b.addEventListener('click', () => openAdjustModal(Number(b.dataset.in), 'in')));
  box.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', () => openAdjustModal(Number(b.dataset.out), 'out')));
  box.querySelectorAll('[data-history]').forEach((b) => b.addEventListener('click', () => openHistoryModal(Number(b.dataset.history))));
  box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openInvModal(Number(b.dataset.edit))));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delItem(Number(b.dataset.del))));
}

// renderList(): o'zgarmagan ma'lumotda DOM'ga tegmaydi (tugmalar qayta
// yuklash paytida yo'qolib bosishni "yutmaydi").
async function loadAll() {
  await renderList({
    box: 'inventoryList',
    load: () => Promise.all([
      api('/admin/inventory/items'),
      api('/admin/menu/categories').catch(() => []),
    ]),
    onData: ([items, cats]) => { inventoryItems = items; menuCategories = cats; updateLowStockUi(); },
    isEmpty: () => inventoryItems.length === 0,
    empty: "Hali ombor mahsuloti yo'q.",
    emptyHint: "Yuqoridagi tugma bilan qo'shing (masalan: Suv, Salfetka).",
    render: renderInventoryHtml,
    bind: bindInventoryRows,
  });
}

// Filtr/qidiruv o'zgarganda — tarmoqsiz qayta chizish.
function rerenderInventory() {
  updateLowStockUi();
  if (inventoryItems.length === 0) return;
  const box = document.getElementById('inventoryList');
  box.innerHTML = renderInventoryHtml();
  bindInventoryRows(box);
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
  // Boshlang'ich qoldiq faqat YANGI mahsulotda — mavjud mahsulot qoldig'i
  // kirim/chiqim (tarix bilan) orqali o'zgaradi, aks holda inventory_movements
  // bilan mos kelmay qolardi.
  const qtyField = document.getElementById('invQtyField');
  qtyField.classList.toggle('hidden', !!item);
  if (!item) document.getElementById('invQty').value = 0;

  // "Menyuda ko'rsatish" — mahsulot ALLAQACHON taomga bog'langan bo'lsa
  // yashiriladi (qayta tanlash dublikat taom yaratmasin).
  const menuCatField = document.getElementById('invMenuCategoryField');
  const linkedNote = document.getElementById('invLinkedNote');
  const isLinked = item && item.linked_menu_count > 0;
  menuCatField.classList.toggle('hidden', !!isLinked);
  if (isLinked) {
    linkedNote.textContent = `Bog'langan menyu taomi: ${item.linked_menu_items}. O'zgartirish/qo'shimcha hajm qo'shish uchun Menyu bo'limiga o'ting.`;
  } else {
    linkedNote.textContent = '';
    const sel = document.getElementById('invMenuCategory');
    sel.innerHTML = ['<option value="">— Menyuda ko\'rsatilmasin (masalan salfetka) —</option>']
      .concat(menuCategories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`))
      .join('');
    sel.value = '';
  }
  openFormDialog('invModal', { onClose: () => { editingInvId = null; } });
}

document.getElementById('addItemBtn').addEventListener('click', () => openInvModal(null));
document.getElementById('invCancelBtn').addEventListener('click', () => requestCloseFormDialog('invModal'));

// Manfiy bo'lmagan butun son; bo'sh — 0. Noto'g'ri bo'lsa maydonda xato
// (A-18) — ilgari server manfiy qiymatni jimgina 0 ga aylantirardi.
function readNonNegInt(id, message) {
  const el = document.getElementById(id);
  const raw = el.value.trim();
  const n = raw === '' ? 0 : Number(raw);
  if (!Number.isInteger(n) || n < 0) { setFieldError(el, message); return null; }
  return n;
}

// withBusy(): ikkinchi POST omborda dublikat mahsulot yaratardi.
document.getElementById('invForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('invSaveBtn');
  if (btn.disabled) return;
  clearFieldErrors('invForm');
  const name = document.getElementById('invName').value.trim();
  const volume = document.getElementById('invVolume').value.trim();
  const unit = document.getElementById('invUnit').value.trim() || 'dona';
  if (!name) setFieldError('invName', 'Mahsulot nomini kiriting');
  const low_stock_threshold = readNonNegInt('invThreshold', "0 yoki musbat butun son kiriting");
  const cost_price = readNonNegInt('invCost', "0 yoki musbat butun son kiriting (so'm)");
  const sale_price = readNonNegInt('invSale', "0 yoki musbat butun son kiriting (so'm)");
  const quantity = editingInvId ? 0 : readNonNegInt('invQty', "0 yoki musbat butun son kiriting");
  if (!name || [low_stock_threshold, cost_price, sale_price, quantity].includes(null)) return;
  const menuCatVal = document.getElementById('invMenuCategory').value;
  const menu_category_id = menuCatVal ? Number(menuCatVal) : null;
  withBusy(btn, async () => {
    try {
      let result;
      if (editingInvId) {
        result = await api(`/admin/inventory/items/${editingInvId}`, { method: 'PUT', body: { name, unit, low_stock_threshold, cost_price, sale_price, volume, menu_category_id } });
      } else {
        result = await api('/admin/inventory/items', { method: 'POST', body: { name, unit, quantity, low_stock_threshold, cost_price, sale_price, volume, menu_category_id } });
      }
      closeDialog('invModal', 'saved');
      // Mahsulot saqlanadi, lekin menyuga bog'lash alohida yiqilishi mumkin —
      // server _link_warning bilan ogohlantiradi (services/inventory.js).
      if (result && result._link_warning) {
        toast(`Mahsulot saqlandi, lekin menyuga bog'lashda xatolik: ${result._link_warning}`, 'error');
      } else {
        toast('Saqlandi');
      }
      loadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});

async function delItem(id) {
  const item = inventoryItems.find((i) => i.id === id);
  const label = item ? item.name : 'mahsulot';
  const ok = await customConfirm(`"${label}"ni o'chirasizmi? Unga bog'langan menyu taomlari uzilib, qo'lda boshqariladigan bo'lib qoladi.`, { okText: "O'chirish", danger: true });
  if (!ok) return;
  try {
    await api(`/admin/inventory/items/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------------- Kirim/chiqim modali ----------------
// Admin FAQAT musbat son kiritadi — ishora (+/-) avtomatik (3.3-bo'lim).
// A-25 (2026-09-10): yorliq mahsulot BIRLIGI bilan ("Necha litr keldi?"),
// ilgari har doim "dona" deyilardi.
let adjustMode = 'in';

function openAdjustModal(id, mode) {
  const item = inventoryItems.find((i) => i.id === id);
  if (!item) return;
  adjustingInvId = id;
  adjustMode = mode;
  const unit = item.unit || 'dona';
  document.getElementById('adjustModalTitle').textContent = `${item.name} — ${mode === 'in' ? 'Kirim' : 'Chiqim'}`;
  document.getElementById('adjustQtyLabel').textContent = mode === 'in' ? `Necha ${unit} keldi?` : `Necha ${unit} ketdi?`;
  document.getElementById('adjustCurrentQty').textContent = `Hozirgi qoldiq: ${item.quantity} ${unit}`;
  document.getElementById('adjustDelta').value = '';
  document.getElementById('adjustDelta').placeholder = mode === 'in' ? 'masalan: 24' : 'masalan: 3';
  document.getElementById('adjustNote').value = '';
  document.getElementById('adjustSaveBtn').textContent = mode === 'in' ? 'Kirim qilish' : 'Chiqim qilish';
  openFormDialog('adjustModal', { onClose: () => { adjustingInvId = null; } });
}

document.getElementById('adjustCancelBtn').addEventListener('click', () => requestCloseFormDialog('adjustModal'));
// ⚠️ withBusy() bu yerda ENG MUHIM: bu POST idempotent EMAS — ikki marta
// bosilsa miqdor IKKI MARTA qo'shilardi.
document.getElementById('adjustForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('adjustSaveBtn');
  if (btn.disabled) return;
  clearFieldErrors('adjustForm');
  const qty = Number(document.getElementById('adjustDelta').value);
  const note = document.getElementById('adjustNote').value.trim();
  if (!Number.isInteger(qty) || qty <= 0) {
    setFieldError('adjustDelta', "Musbat butun son kiriting (masalan 24)");
    return;
  }
  const delta = adjustMode === 'in' ? qty : -qty;
  withBusy(btn, async () => {
    try {
      await api(`/admin/inventory/items/${adjustingInvId}/adjust`, { method: 'POST', body: { delta, note } });
      closeDialog('adjustModal', 'saved');
      toast('Saqlandi');
      loadAll();
    } catch (err) {
      // Masalan "Yetarli qoldiq yo'q (hozir: 2 dona)" — miqdor maydoniga tegishli.
      setFieldError('adjustDelta', err.message);
    }
  });
});

// ---------------- Tarix ----------------

const MOVEMENT_LABELS = {
  restock: 'Kirim',
  adjustment: 'Chiqim / tuzatish',
  order: 'Buyurtma orqali sarflandi',
  return: 'Bekor qilingan buyurtma qaytardi',
};

async function openHistoryModal(id) {
  const item = inventoryItems.find((i) => i.id === id);
  document.getElementById('historyModalTitle').textContent = item ? `${item.name} — tarix` : 'Tarix';
  const box = document.getElementById('historyList');
  box.innerHTML = '<p class="dim">Yuklanmoqda...</p>';
  // Faqat o'qish oynasi — Escape/fon darhol yopadi (openDialog standarti).
  openDialog('historyModal', { initialFocus: '#historyCloseBtn' });
  // ⚠️ `dedupe: false` SHART: "Yuklanmoqda..." qo'lda yozildi — dedupe
  // yoqiq bo'lsa ikkinchi ochilishda oyna abadiy "Yuklanmoqda..." qolardi.
  await renderList({
    box,
    dedupe: false,
    load: () => api(`/admin/inventory/items/${id}/movements`),
    empty: "Hali hech qanday harakat yo'q.",
    render: (rows) => rows.map((r) => {
      const sign = r.delta > 0 ? '+' : '';
      const cls = r.delta > 0 ? 'ok' : 'low';
      const label = MOVEMENT_LABELS[r.reason] || r.reason;
      return `
        <div class="card-row" style="padding:8px 0; border-bottom:1px solid var(--border);">
          <div>
            <div>${escapeHtml(label)}${r.note ? ` — ${escapeHtml(r.note)}` : ''}</div>
            <div class="card-sub">${fmtDateTime(r.created_at)}${r.created_by_name ? ` · ${escapeHtml(r.created_by_name)}` : ''}</div>
          </div>
          <div class="badge ${cls}">${sign}${Number(r.delta)} ${item ? escapeHtml(item.unit) : ''}</div>
        </div>`;
    }).join(''),
  });
}
document.getElementById('historyCloseBtn').addEventListener('click', () => closeDialog('historyModal', 'close'));

document.addEventListener('DOMContentLoaded', () => {
  initNav('inventory');
  invFilter = chipGroup('invFilterChips', {
    label: 'Filtr',
    options: [['all', 'Hammasi'], ['low', 'Faqat kam qolganlar']],
    initial: pageParam('low') === '1' ? 'low' : 'all',
    onChange: rerenderInventory,
  });
  attachSearch('invSearch', { onFilter: (q) => { invQuery = q; rerenderInventory(); } });
  loadAll();
});
