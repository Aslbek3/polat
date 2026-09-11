let categories = [];
let items = [];
let inventoryItems = []; // Ombor mahsulotlari (taom modalidagi bog'lash select'i uchun)
let editingCatId = null;
let editingItemId = null;
let itemModalCategoryId = null;
// itemModalParentId — "+ Turi qo'shish" bilan ochilganda ota taom id'si
// (2026-09-09). Yangi ASOSIY taom qo'shilayotganda yoki mavjud taom
// tahrirlanayotganda null/mos qiymatga o'rnatiladi (openItemModal()ga qarang).
let itemModalParentId = null;
let currentImageUrl = null; // taom modalida hozir tanlangan rasm URL'i (ixtiyoriy, null bo'lishi mumkin)
// O'chirilgan (is_active=0) kategoriya/taomlar bo'limi ochiq/yopiqligi —
// standart holatda yopiq (2026-09-09'da qo'shildi, pastdagi izohga qarang).
let showInactive = false;
// Ombor ro'yxati (`GET /admin/inventory/items`) yuklanmay qoldimi (2026-09-10).
// NEGA: ilgari bu so'rovning xatosi `.catch(() => [])` bilan JIMGINA bo'sh
// massivga aylanardi — admin buni sezmasdi, keyin omborga bog'langan taomni
// tahrirlab "Saqlash" bosganda bog'lanish uzilib ketardi. Batafsil izoh
// renderInventorySelect() ustida.
let inventoryLoadFailed = false;
let inventoryLoadError = '';

// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).

// "Taomlar" -> "Taom", "Shirinliklar" -> "Shirinlik", "Ichimliklar" -> "Ichimlik"
// — "+ Taom qo'shish" tugmasi endi har bir kategoriyaning o'z nomi bilan
// boshlanadi ("+ Ichimlik qo'shish" va h.k.). Ko'plik qo'shimchasi ("-lar")
// bo'lsa olib tashlanadi, bo'lmasa (masalan "burger") nomi o'zgarishsiz
// ishlatiladi.
function singularizeCategoryName(name) {
  const n = String(name || '').trim();
  return /lar$/i.test(n) ? n.slice(0, -3) : n;
}

// ?include_inactive=1 — o'chirilgan (is_active=0) kategoriya/taomlarni ham
// olib kelamiz (2026-09-09'da qo'shildi). Ilgari GET har doim faqat faol
// qatorlarni qaytarardi va admin panelida ularni ko'rish/tiklashning HECH
// QANDAY yo'li yo'q edi — buyurtma tarixi tufayli hard-delete qilib
// bo'lmaydigan (shu sabab is_active=0 qilingan) kategoriya/taom adminning
// o'zi uchun ham abadiy "yo'qolgan" bo'lib qolardi. Endi pastdagi
// renderInactiveSection() shu qatorlarni alohida ko'rsatib, ♻️ Tiklash
// tugmasi bilan qayta faollashtirish imkonini beradi.
//
// renderList() — ../app.js'dagi umumiy ro'yxat yordamchisi (2026-09-10):
// eskirgan javobni tashlaydi, ma'lumot o'zgarmagan bo'lsa DOM'ga tegmaydi,
// xatoni bir joyda ko'rsatadi. Ilgari shu naqsh 18 ta faylda nusxalangan edi.
// `isEmpty: () => false` — "Hali kategoriya yo'q" holati renderMenuHtml()
// ichida (o'chirilganlar bo'limi bilan birga) hal qilinadi.
async function loadAll() {
  inventoryLoadFailed = false;
  inventoryLoadError = '';
  const data = await renderList({
    box: 'categoryList',
    load: () => Promise.all([
      api('/admin/menu/categories?include_inactive=1'),
      api('/admin/menu/items?include_inactive=1'),
      // Ombor bo'lmasa ham menyu ishlayversin — LEKIN xatoni jimgina yutmaymiz
      // (2026-09-10): bo'sh ro'yxat bilan davom etsak, tahrirlash modalidagi
      // select mos option topolmay bo'sh qolardi va "Saqlash" taomni ombordan
      // uzib yuborardi. Endi bayroq qo'yiladi va admin toast bilan ogohlantiriladi.
      api('/admin/inventory/items').catch((err) => {
        inventoryLoadFailed = true;
        inventoryLoadError = err.message;
        return [];
      }),
    ]),
    onData: ([cats, its, inv]) => { categories = cats; items = its; inventoryItems = inv; },
    isEmpty: () => false,
    render: renderMenuHtml,
    bind: bindMenuRows,
  });
  // `data` faqat so'rov muvaffaqiyatli bo'lganda (ro'yxat qayta chizilmagan,
  // ya'ni o'zgarmagan holatda ham) qaytadi — xatoda `undefined`.
  if (data && inventoryLoadFailed) {
    toast(`Ombor ro'yxati yuklanmadi (${inventoryLoadError}). Taomni tahrirlashda ombor bog'lanishini o'zgartirmang.`, 'error');
  }
}

// Bitta taom qatorini chizadi — asosiy taom UCHUN HAM, "turi" (variant) UCHUN
// HAM bir xil ko'rinish (variant biroz kichikroq/chekinib chiqadi,
// isVariant=true bo'lganda). 2026-09-09'da "turi" funksiyasi qo'shilganda
// avvalgi inline shablon shu funksiyaga chiqarildi (nested render uchun).
// D-H3 / D-H9 (2026-09-10): ✎ va 🗑 — .btn.icon (44×44) + aria-label taom
// nomi bilan (ekran o'qiruvchi 30 ta bir xil "tugma"ni o'qimasin); rasm —
// bezak (nom yonida yozilgan), shuning uchun alt="".
function renderItemRow(it, c, isVariant) {
  const label = `${it.name}${it.volume ? ` (${it.volume})` : ''}`;
  return `
    <div class="menu-item-row${isVariant ? ' menu-item-variant' : ''}">
      <div style="display:flex; align-items:center; gap:10px;">
        ${it.image_url ? `<img src="${escapeHtml(it.image_url)}" alt="" style="width:40px; height:40px; object-fit:cover; border-radius:var(--radius-sm); flex-shrink:0;">` : ''}
        <div>
          <div class="mi-name">${escapeHtml(it.name)}${it.volume ? ` <span class="dim" style="font-weight:400;">(${escapeHtml(it.volume)})</span>` : ''}</div>
          <div class="mi-price">${fmtMoney(it.price)}${it.cost_price != null ? ` <span class="dim" style="font-size:12px; font-weight:400;">(tan narxi ${fmtMoney(it.cost_price)}, foyda ${fmtMoney(it.price - it.cost_price)})</span>` : ''}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        ${it.inventory_item_id
          ? `<span class="badge ${it.inventory_quantity > 0 ? 'ok' : 'low'}">📦 ${escapeHtml(it.inventory_name || '')}${it.inventory_volume ? ` (${escapeHtml(it.inventory_volume)})` : ''}: ${it.inventory_quantity} ${escapeHtml(it.inventory_unit || '')}</span>`
          : c.require_inventory_link
            ? `<span class="badge low" title="Bu bo'lim faqat ombor bilan bog'langan taomlarni ko'rsatadi — bog'lanmaguncha mijoz/afitsiant menyusida yashirin">🚫 Yashirin (ombor yo'q)</span>`
            : `<label class="inline-check" style="font-size:12px;">
                 <input type="checkbox" data-avail="${it.id}" aria-label="${escapeHtml(`«${label}» mavjud`)}" ${it.is_available ? 'checked' : ''}> mavjud
               </label>`}
        <button type="button" class="btn icon" data-edit-item="${it.id}" aria-label="${escapeHtml(`«${label}» ni tahrirlash`)}" title="Tahrirlash">✎</button>
        <button type="button" class="btn icon danger" data-del-item="${it.id}" aria-label="${escapeHtml(`«${label}» ni o'chirish`)}" title="O'chirish">🗑</button>
      </div>
    </div>
  `;
}

// Qidiruv so'rovi (A-08, 2026-09-10) — attachSearch() normallashtirgan matn.
let menuQuery = '';

const itemSearchText = (it) => `${it.name} ${it.volume || ''}`;

// A-23 (2026-09-10): bo'sh holat — nima qilish kerakligini aytadi.
// A-08: qidiruvda kategoriya nomi mos kelsa — butun bo'lim, aks holda faqat
// mos taomlar (yoki mos "turi" bor taomlar) ko'rinadi.
function renderMenuHtml() {
  const activeCategories = categories.filter((c) => c.is_active);
  if (activeCategories.length === 0 && categories.length === 0) {
    return `<div class="empty-state"><div>Hali kategoriya yo'q.</div>
      <div class="empty-hint">Avval yuqoridagi «+ Yangi kategoriya» tugmasi bilan bo'lim qo'shing (masalan: Taomlar, Ichimliklar), keyin unga taom qo'shing.</div></div>`;
  }
  const q = menuQuery;
  const cards = activeCategories.map((c) => {
    const catMatch = !q || matchesSearch(c.name, q);
    // Faqat ASOSIY taomlar (parent_item_id yo'q) bo'limda to'g'ridan-to'g'ri,
    // "turi" (variant) — ichma-ich ro'yxatda (2026-09-09).
    const catItems = items.filter((it) => it.category_id === c.id && it.is_active && !it.parent_item_id);
    const shown = catItems.map((it) => {
      const allVariants = items.filter((v) => v.parent_item_id === it.id && v.is_active);
      const itemMatch = catMatch || matchesSearch(itemSearchText(it), q);
      const variants = itemMatch ? allVariants : allVariants.filter((v) => matchesSearch(itemSearchText(v), q));
      return itemMatch || variants.length ? { it, variants } : null;
    }).filter(Boolean);
    if (q && !catMatch && shown.length === 0) return '';
    // D-H11: bo'lim nomi — haqiqiy sarlavha (<h2>).
    return `
      <div class="card">
        <div class="card-row">
          <h2 class="card-title">${escapeHtml(c.name)}${c.require_inventory_link ? ' <span class="badge ok">📦 Faqat ombor</span>' : ''}</h2>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn small" data-edit-cat="${c.id}" aria-label="${escapeHtml(`«${c.name}» bo'limini tahrirlash`)}">Tahrirlash</button>
            <button type="button" class="btn small danger" data-del-cat="${c.id}" aria-label="${escapeHtml(`«${c.name}» bo'limini o'chirish`)}">O'chirish</button>
          </div>
        </div>
        <div class="mt-8">
          ${shown.length === 0 ? `<p class="card-sub">Bu bo'limda hali taom yo'q — pastdagi tugma bilan qo'shing.</p>` : shown.map(({ it, variants }) => renderItemRow(it, c, false) + `
              <div class="menu-item-variants">
                ${variants.map((v) => renderItemRow(v, c, true)).join('')}
                <button type="button" class="btn small" data-add-variant="${it.id}" aria-label="${escapeHtml(`«${it.name}» uchun tur qo'shish`)}">+ Turi qo'shish</button>
              </div>
            `).join('')}
          <button type="button" class="btn small mt-8" data-add-item-cat="${c.id}">+ ${escapeHtml(singularizeCategoryName(c.name))} qo'shish</button>
        </div>
      </div>
    `;
  }).filter(Boolean);

  let catsHtml;
  if (activeCategories.length === 0) {
    catsHtml = `<div class="empty-state"><div>Hali faol kategoriya yo'q.</div>
      <div class="empty-hint">Yangi bo'lim qo'shing yoki pastdagi «O'chirilganlar»dan tiklang.</div></div>`;
  } else if (cards.length === 0) {
    catsHtml = `<div class="empty-state"><div>«${escapeHtml(q)}» bo'yicha taom yoki kategoriya topilmadi.</div></div>`;
  } else {
    catsHtml = cards.join('');
  }
  return catsHtml + renderInactiveSection();
}

// "🗑 O'chirilganlar → Ko'rsatish" tugmasi ro'yxatni SERVERGA murojaat
// qilmasdan qayta chizadi (faqat `showInactive` o'zgaradi) — shu sabab
// renderList()dan tashqarida turadigan mahalliy qayta chizish kerak.
function render() {
  const box = document.getElementById('categoryList');
  box.innerHTML = renderMenuHtml();
  bindMenuRows(box);
}

function bindMenuRows(box) {
  box.querySelectorAll('[data-edit-cat]').forEach((b) => b.addEventListener('click', () => openCatModal(Number(b.dataset.editCat))));
  box.querySelectorAll('[data-del-cat]').forEach((b) => b.addEventListener('click', () => delCategory(Number(b.dataset.delCat))));
  box.querySelectorAll('[data-avail]').forEach((b) => b.addEventListener('change', () => toggleAvailability(Number(b.dataset.avail), b.checked)));
  box.querySelectorAll('[data-edit-item]').forEach((b) => b.addEventListener('click', () => openItemModal(null, Number(b.dataset.editItem))));
  box.querySelectorAll('[data-del-item]').forEach((b) => b.addEventListener('click', () => delItem(Number(b.dataset.delItem))));
  box.querySelectorAll('[data-add-item-cat]').forEach((b) => b.addEventListener('click', () => openItemModal(Number(b.dataset.addItemCat), null)));
  box.querySelectorAll('[data-add-variant]').forEach((b) => b.addEventListener('click', () => openItemModal(null, null, Number(b.dataset.addVariant))));
  const toggleBtn = document.getElementById('toggleInactiveBtn');
  if (toggleBtn) toggleBtn.addEventListener('click', () => { showInactive = !showInactive; render(); });
  box.querySelectorAll('[data-restore-cat]').forEach((b) => b.addEventListener('click', () => restoreCategory(Number(b.dataset.restoreCat))));
  box.querySelectorAll('[data-restore-item]').forEach((b) => b.addEventListener('click', () => restoreItem(Number(b.dataset.restoreItem))));
}

// O'chirilgan (is_active=0) kategoriya/taomlar — standart holatda yig'ilgan
// (faqat soni ko'rsatiladi), "Ko'rsatish" bosilsa ochilib, har biri uchun
// ♻️ Tiklash tugmasi chiqadi (2026-09-09'da qo'shildi — GET /categories va
// GET /items o'chirilganlarni butunlay yashirgani uchun, ilgari bunday
// qatorni admin panelidan qayta tiklashning HECH QANDAY yo'li yo'q edi).
function renderInactiveSection() {
  const inactiveCats = categories.filter((c) => !c.is_active && matchesSearch(c.name, menuQuery));
  const inactiveItems = items.filter((it) => !it.is_active && matchesSearch(itemSearchText(it), menuQuery));
  if (inactiveCats.length === 0 && inactiveItems.length === 0) return '';
  return `
    <div class="card" style="margin-top:16px;">
      <div class="card-row">
        <div class="card-title dim">🗑 O'chirilganlar (${inactiveCats.length + inactiveItems.length})</div>
        <button type="button" class="btn small" id="toggleInactiveBtn" aria-expanded="${showInactive ? 'true' : 'false'}">${showInactive ? 'Yashirish' : "Ko'rsatish"}</button>
      </div>
      ${showInactive ? `
        <div class="mt-8">
          ${inactiveCats.map((c) => `
            <div class="menu-item-row">
              <div class="mi-name dim">${escapeHtml(c.name)} <span class="dim" style="font-size:12px;">(bo'lim)</span></div>
              <button type="button" class="btn small" data-restore-cat="${c.id}" aria-label="${escapeHtml(`«${c.name}» bo'limini tiklash`)}"><span aria-hidden="true">♻️</span> Tiklash</button>
            </div>
          `).join('')}
          ${inactiveItems.map((it) => `
            <div class="menu-item-row">
              <div class="mi-name dim">${escapeHtml(it.name)}</div>
              <button type="button" class="btn small" data-restore-item="${it.id}" aria-label="${escapeHtml(`«${it.name}» ni tiklash`)}"><span aria-hidden="true">♻️</span> Tiklash</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

async function restoreCategory(id) {
  try {
    await api(`/admin/menu/categories/${id}`, { method: 'PUT', body: { is_active: true } });
    toast('Tiklandi');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function restoreItem(id) {
  try {
    await api(`/admin/menu/items/${id}`, { method: 'PUT', body: { is_active: true } });
    toast('Tiklandi');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------------- Kategoriya modal ----------------

function openCatModal(id) {
  editingCatId = id;
  const cat = categories.find((c) => c.id === id);
  document.getElementById('catModalTitle').textContent = cat ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya';
  document.getElementById('catName').value = cat ? cat.name : '';
  document.getElementById('catSort').value = cat ? cat.sort_order : 0;
  document.getElementById('catRequireInventory').checked = cat ? !!cat.require_inventory_link : false;
  // A-19/A-20/A-21 (2026-09-10): openFormDialog() — role=dialog, fokus,
  // Escape/fon bosilsa o'zgarish bo'lsa so'raydi (admin.js).
  openFormDialog('catModal', { onClose: () => { editingCatId = null; } });
}
function closeCatModal() { closeDialog('catModal', 'saved'); }

document.getElementById('addCatBtn').addEventListener('click', () => openCatModal(null));
document.getElementById('catCancelBtn').addEventListener('click', () => requestCloseFormDialog('catModal'));
// withBusy() — ikki marta bosishdan himoya: ikkinchi POST dublikat
// kategoriya yaratardi. <form> submit — Enter ham saqlaydi (A-19);
// xato — maydon ostida (A-18).
document.getElementById('catForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('catSaveBtn');
  if (btn.disabled) return;
  clearFieldErrors('catForm');
  const name = document.getElementById('catName').value.trim();
  const sort_order = Number(document.getElementById('catSort').value) || 0;
  const require_inventory_link = document.getElementById('catRequireInventory').checked;
  if (!name) { setFieldError('catName', 'Kategoriya nomini kiriting'); return; }
  withBusy(btn, async () => {
    try {
      if (editingCatId) {
        await api(`/admin/menu/categories/${editingCatId}`, { method: 'PUT', body: { name, sort_order, require_inventory_link } });
      } else {
        await api('/admin/menu/categories', { method: 'POST', body: { name, sort_order, require_inventory_link } });
      }
      closeCatModal();
      toast('Saqlandi');
      loadAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});

async function delCategory(id) {
  const cat = categories.find((c) => c.id === id);
  if (!(await customConfirm(`${cat ? `«${cat.name}»` : 'Kategoriya'} o'chirilsinmi? Unga tegishli taomlar menyuda ko'rinmay qoladi (keyin «O'chirilganlar»dan tiklash mumkin).`, { okText: "O'chirish", danger: true }))) return;
  try {
    await api(`/admin/menu/categories/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------------- Taom modal ----------------

// parentId — "+ Turi qo'shish" tugmasi bosilganda beriladi (2026-09-09):
// itemId=null, parentId=<ota taom id'si> bo'lsa yangi VARIANT qo'shiladi
// (kategoriya avtomatik ota taomnikidan olinadi, foydalanuvchi tanlamaydi).
// Mavjud taom tahrirlanayotganda (itemId berilgan) uning parent_item_id'si
// o'zgarishsiz saqlanadi — bu modal orqali variant boshqa taomga "ko'chirilmaydi".
let itemModalSession = 0; // rasm yuklash javobini to'g'ri modalga bog'lash uchun

function openItemModal(categoryId, itemId, parentId) {
  itemModalSession += 1;
  // Oldingi ochilishdagi yuklash tugamay qolgan bo'lsa ham tugma ochiq tursin.
  document.getElementById('itemSaveBtn').disabled = false;
  editingItemId = itemId;
  const item = itemId ? items.find((it) => it.id === itemId) : null;
  const parentItem = (!item && parentId) ? items.find((it) => it.id === parentId) : null;
  itemModalParentId = item ? (item.parent_item_id || null) : (parentItem ? parentItem.id : null);
  itemModalCategoryId = item ? item.category_id : (parentItem ? parentItem.category_id : categoryId);
  // Sarlavha ham "+ Ichimlik qo'shish" tugmasi bilan bir xil mantiqda —
  // kategoriya nomiga moslab chiqadi ("Yangi Ichimlik", "Ichimlikni tahrirlash").
  const cat = categories.find((c) => c.id === itemModalCategoryId);
  const catLabel = cat ? singularizeCategoryName(cat.name) : 'Taom';
  const parentHintEl = document.getElementById('itemParentHint');
  if (parentItem) {
    document.getElementById('itemModalTitle').textContent = `"${parentItem.name}" uchun yangi tur`;
    parentHintEl.textContent = `Bu — "${parentItem.name}" taomining bir turi. Mijoz/afitsiant uni "${parentItem.name}" ustidagi "Turlari" tugmasi bosilganda ko'radi.`;
    parentHintEl.classList.remove('hidden');
  } else {
    document.getElementById('itemModalTitle').textContent = item ? `${catLabel}ni tahrirlash` : `Yangi ${catLabel}`;
    parentHintEl.classList.add('hidden');
    parentHintEl.textContent = '';
  }
  document.getElementById('itemName').value = item ? item.name : '';
  document.getElementById('itemVolume').value = item ? (item.volume || '') : '';
  document.getElementById('itemCostPrice').value = item && item.cost_price != null ? item.cost_price : '';
  document.getElementById('itemPrice').value = item ? item.price : '';
  document.getElementById('itemSort').value = item ? item.sort_order : 0;
  document.getElementById('itemDescription').value = item ? (item.description || '') : '';
  renderInventorySelect(item ? item.inventory_item_id : null);
  document.getElementById('itemImageFile').value = '';
  document.getElementById('itemImageStatus').textContent = '';
  currentImageUrl = item ? (item.image_url || null) : null;
  updateImagePreview();
  // A-19/A-20/A-21 (2026-09-10). Rasm URL'i input qiymatida ko'rinmaydi
  // ("Rasmni olib tashlash" faqat o'zgaruvchini o'zgartiradi) — isDirty.
  const openedImageUrl = currentImageUrl;
  openFormDialog('itemModal', {
    isDirty: () => currentImageUrl !== openedImageUrl,
    onClose: () => { editingItemId = null; itemModalParentId = null; },
  });
}
function closeItemModal() { closeDialog('itemModal', 'saved'); }

// Taom modalidagi "Ombor mahsuloti bilan bog'lash" select'ini har safar ochilganda
// joriy ombor ro'yxati bilan to'ldiradi (faol mahsulotlar + hozir tanlangan bo'lsa
// o'chirilgan bo'lsa ham ko'rinishi uchun).
//
// ⚠️ 2026-09-10: yuqoridagi va'da ("tanlangan bo'lsa ... ko'rinishi uchun")
// kod tomonidan BAJARILMAYOTGAN edi. Agar `selectedId` `inventoryItems`da
// bo'lmasa (ombor so'rovi 500 qaytardi yoki mahsulot o'chirilgan), brauzer
// `sel.value`ni jimgina `''` qilardi; keyin "Saqlash" `inventory_item_id: null`
// yuborib bog'lanishni HAQIQATAN uzardi — admin faqat taom NOMINI tuzatmoqchi
// bo'lgan bo'lsa ham qoldiq kuzatuvi to'xtardi va hech qanday ogohlantirish
// bo'lmasdi. Endi bunday holatda sun'iy `<option>` qo'shib, tanlangan holda
// qoldiramiz — saqlashda bog'lanish o'z joyida qoladi.
function renderInventorySelect(selectedId) {
  const sel = document.getElementById('itemInventory');
  const options = ['<option value="">— Bog\'lanmagan (mavjudlik qo\'lda boshqariladi) —</option>']
    .concat(inventoryItems.map((inv) => `<option value="${inv.id}">${escapeHtml(inv.name)}${inv.volume ? ` (${escapeHtml(inv.volume)})` : ''} — ${inv.quantity} ${escapeHtml(inv.unit)}</option>`));

  const selId = selectedId != null && selectedId !== '' ? Number(selectedId) : null;
  const isMissing = selId != null && !inventoryItems.some((inv) => Number(inv.id) === selId);
  if (isMissing) {
    // Taom ro'yxatidagi qator ombor nomini ham olib keladi (inventory_name) —
    // shundan foydalanamiz, bo'lmasa id bilan ko'rsatamiz.
    const item = editingItemId ? items.find((it) => it.id === editingItemId) : null;
    const label = item && item.inventory_name
      ? `${item.inventory_name}${item.inventory_volume ? ` (${item.inventory_volume})` : ''}`
      : `#${selId}`;
    options.push(`<option value="${selId}">📦 ${escapeHtml(label)} — ro'yxat yuklanmadi, bog'lanish saqlanadi</option>`);
  }

  sel.innerHTML = options.join('');
  sel.value = selId != null ? String(selId) : '';
  applyInventoryPriceLock();
}

// Ombor mahsuloti tanlangan bo'lsa — narx VA tan narx maydonlari O'ZI KIRITILMAYDI,
// ombordagi sotuv/tan narxidan avtomatik to'ldirilib "readonly" qilinadi (server ham
// buni mustaqil kafolatlaydi — adminMenu.js, mijoz/admin yuborgan narxga ishonmaydi).
// Bog'lanish uzilsa (bo'sh tanlansa) — ikkala maydon ham yana qo'lda tahrirlanadigan bo'ladi.
function applyInventoryPriceLock() {
  const sel = document.getElementById('itemInventory');
  const priceInput = document.getElementById('itemPrice');
  const hint = document.getElementById('itemPriceHint');
  const costInput = document.getElementById('itemCostPrice');
  const costHint = document.getElementById('itemCostPriceHint');
  const invId = sel.value ? Number(sel.value) : null;
  const inv = invId ? inventoryItems.find((i) => i.id === invId) : null;
  if (inv) {
    priceInput.value = inv.sale_price;
    priceInput.readOnly = true;
    hint.textContent = `Narx "${inv.name}" ombor mahsulotining sotuv narxidan avtomatik olinadi (o'zgartirish uchun Ombor bo'limiga o'ting).`;
    costInput.value = inv.cost_price != null ? inv.cost_price : '';
    costInput.readOnly = true;
    costHint.textContent = `Tan narx "${inv.name}" ombor mahsulotidan avtomatik olinadi (o'zgartirish uchun Ombor bo'limiga o'ting).`;
  } else if (invId) {
    // Bog'lanish BOR, lekin ombor mahsuloti ro'yxatda topilmadi (ombor so'rovi
    // yiqilgan — renderInventorySelect()dagi sun'iy option) (2026-09-10).
    // Narx maydonlarini ochib qo'ysak, admin ularni qo'lda o'zgartirib
    // saqlashi mumkin edi — server baribir ombor narxini qo'yadi va admin
    // "narx saqlanmadi" deb o'ylardi. Shu sabab qulflangan holda qoldiramiz.
    priceInput.readOnly = true;
    hint.textContent = "Narx ombor mahsulotidan olinadi (ro'yxat hozir yuklanmadi).";
    costInput.readOnly = true;
    costHint.textContent = "Tan narx ombor mahsulotidan olinadi (ro'yxat hozir yuklanmadi).";
  } else {
    priceInput.readOnly = false;
    hint.textContent = '';
    costInput.readOnly = false;
    costHint.textContent = '';
  }
}
document.getElementById('itemInventory').addEventListener('change', applyInventoryPriceLock);

function updateImagePreview() {
  const img = document.getElementById('itemImagePreview');
  if (currentImageUrl) {
    img.src = currentImageUrl;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    img.removeAttribute('src');
  }
}

document.getElementById('itemCancelBtn').addEventListener('click', () => requestCloseFormDialog('itemModal'));

// Rasm — MAJBURIY EMAS: fayl tanlangan zahoti (Saqlash bosilishidan oldin)
// alohida (multipart, oddiy JSON api() orqali emas) so'rov bilan yuklanadi,
// natijada kelgan URL keyin taom saqlanganda yuboriladi.
//
// ⚠️ Yuklash davomida "Saqlash" tugmasi BLOKLANADI (2026-09-10). NEGA: bu
// handler async, "Saqlash" esa `currentImageUrl`ni o'qiydi va yuklash
// tugashini KUTMAYDI. Rasmni tanlab darhol "Saqlash" bosilsa taom rasmsiz
// saqlanardi, modal yopilardi, ekranda esa "Yuklanmoqda..." osilib qolardi —
// admin rasm qo'ygan deb o'ylab qolardi.
//
// 2026-09-11: `itemModalSession` — yuklash tugaguncha modal yopilib, BOSHQA
// taom uchun qayta ochilgan bo'lsa (sekin tarmoq), kechikkan javob o'sha
// ikkinchi taomga rasm qo'yib yubormasin va uning "Saqlash" tugmasini
// vaqtidan oldin yoqmasin. Har ochilishda raqam oshadi (openItemModal).
document.getElementById('itemImageFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const session = itemModalSession;
  const statusEl = document.getElementById('itemImageStatus');
  const saveBtn = document.getElementById('itemSaveBtn');
  statusEl.textContent = 'Yuklanmoqda...';
  saveBtn.disabled = true;
  try {
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${API_BASE}api/admin/menu/upload-image`, { method: 'POST', body: form, credentials: 'same-origin' });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || 'Rasm yuklashda xatolik');
    if (session !== itemModalSession) return;
    currentImageUrl = data.url;
    updateImagePreview();
    statusEl.textContent = 'Rasm yuklandi.';
  } catch (err) {
    if (session !== itemModalSession) return;
    statusEl.textContent = '';
    e.target.value = '';
    setFieldError(e.target, err.message, { focus: false }); // A-18
  } finally {
    if (session === itemModalSession) saveBtn.disabled = false;
  }
});

document.getElementById('itemImageRemoveBtn').addEventListener('click', () => {
  currentImageUrl = null;
  document.getElementById('itemImageFile').value = '';
  document.getElementById('itemImageStatus').textContent = '';
  updateImagePreview();
});

// <form> submit (A-19: Enter ham saqlaydi; rasm yuklanayotganda "Saqlash"
// disabled — Enter bilan ham yuborilmaydi). A-18: xatolar maydon ostida.
document.getElementById('itemForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('itemSaveBtn');
  if (btn.disabled) return;
  clearFieldErrors('itemForm');
  const name = document.getElementById('itemName').value.trim();
  const priceRaw = document.getElementById('itemPrice').value.trim();
  const costRaw = document.getElementById('itemCostPrice').value.trim();
  const price = Number(priceRaw);
  const cost = costRaw === '' ? null : Number(costRaw);
  let bad = false;
  if (!name) { setFieldError('itemName', 'Taom nomini kiriting'); bad = true; }
  if (priceRaw === '' || !Number.isFinite(price) || price < 0) { setFieldError('itemPrice', "Sotuv narxini kiriting (0 yoki musbat son)"); bad = true; }
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) { setFieldError('itemCostPrice', "Tan narx 0 yoki musbat son bo'lsin"); bad = true; }
  if (bad) return;
  withBusy(btn, saveItem);
});

async function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  const volume = document.getElementById('itemVolume').value.trim();
  const costPriceRaw = document.getElementById('itemCostPrice').value.trim();
  const cost_price = costPriceRaw === '' ? null : Number(costPriceRaw);
  const price = Number(document.getElementById('itemPrice').value);
  const sort_order = Number(document.getElementById('itemSort').value) || 0;
  const description = document.getElementById('itemDescription').value.trim();
  const image_url = currentImageUrl || '';
  const inventorySelectVal = document.getElementById('itemInventory').value;
  const inventory_item_id = inventorySelectVal ? Number(inventorySelectVal) : null;
  try {
    if (editingItemId) {
      await api(`/admin/menu/items/${editingItemId}`, { method: 'PUT', body: { name, price, cost_price, sort_order, description, image_url, volume, inventory_item_id } });
    } else {
      await api('/admin/menu/items', { method: 'POST', body: { category_id: itemModalCategoryId, name, price, cost_price, sort_order, description, image_url, volume, inventory_item_id, parent_item_id: itemModalParentId } });
    }
    closeItemModal();
    toast('Saqlandi');
    loadAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ⚠️ Muvaffaqiyatdan keyin XOTIRADAGI `items` massivini ham yangilaymiz
// (2026-09-10). NEGA: ilgari faqat serverga so'rov ketardi, `items` esa eski
// qiymat bilan qolardi. Keyingi har qanday render() (masalan "🗑 O'chirilganlar
// → Ko'rsatish" bosilganda) belgini ESKI holatida qayta chizardi — admin
// "saqlanmabdi" deb qayta bosardi va taom haqiqatan ham teskari holatga
// o'tib ketardi, ya'ni foydalanuvchi amali jimgina bekor bo'lardi.
async function toggleAvailability(id, checked) {
  try {
    await api(`/admin/menu/items/${id}/availability`, { method: 'PATCH', body: { is_available: checked } });
    const it = items.find((i) => i.id === id);
    if (it) it.is_available = checked ? 1 : 0;
  } catch (err) {
    toast(err.message, 'error');
    loadAll();
  }
}

async function delItem(id) {
  // customConfirm() — brauzerning standart confirm() o'rniga (2026-09-10).
  const it = items.find((i) => i.id === id);
  if (!(await customConfirm(`${it ? `«${it.name}»` : 'Taom'} o'chirilsinmi?`, { okText: "O'chirish", danger: true }))) return;
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
  // A-08: qidiruv — tarmoqsiz, mahalliy render() (renderMenuHtml joriy
  // `menuQuery`ni o'qiydi, keyingi loadAll() ham shu filtr bilan chizadi).
  attachSearch('menuSearch', { onFilter: (q) => { menuQuery = q; if (categories.length) render(); } });
  loadAll();
});
