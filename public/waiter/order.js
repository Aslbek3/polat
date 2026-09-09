const params = new URLSearchParams(window.location.search);
const TABLE_ID = params.get('table');

let menuCategories = [];
let activeCategoryId = null;

// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
async function loadTableName() {
  try {
    const tables = await api('/waiter/tables');
    const t = tables.find((x) => String(x.id) === String(TABLE_ID));
    if (t) document.getElementById('tableTitle').textContent = t.name;
  } catch (e) { /* jim */ }
}

async function loadMenu() {
  menuCategories = await api('/waiter/menu');
  const tabs = document.getElementById('catTabs');
  if (menuCategories.length === 0) {
    tabs.innerHTML = '';
    document.getElementById('menuItems').innerHTML = '<p class="dim">Menyu hali bo\'sh.</p>';
    return;
  }
  if (!activeCategoryId) activeCategoryId = menuCategories[0].id;
  tabs.innerHTML = menuCategories.map((c) => `
    <button data-cat="${c.id}" class="${c.id === activeCategoryId ? 'active' : ''}">${escapeHtml(c.name)}</button>
  `).join('');
  tabs.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategoryId = Number(btn.dataset.cat);
      renderTabs();
      renderMenuItems();
    });
  });
  renderMenuItems();
}

function renderTabs() {
  document.querySelectorAll('#catTabs button').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.cat) === activeCategoryId);
  });
}

// Taom "turi" (variant, 2026-09-09) — asosiy taom har doim ko'rinadi, agar
// unga bog'liq turlari (masalan "Osh" -> "Qovurma osh", "To'y oshi") bo'lsa
// pastida "Turlari (N)" tugmasi chiqadi; bosilsa o'sha turlar ham (o'z narxi
// bilan, alohida buyurtma qilinadigan taom sifatida) ochiladi.
let expandedVariantIds = new Set();

function renderMenuItemRow(it) {
  return `
    <div class="menu-item-row${it.is_available ? '' : ' unavailable'}">
      <div class="mi-info" data-info="${it.id}">
        ${it.image_url ? `<img src="${escapeHtml(it.image_url)}" class="mi-image">` : ''}
        <div class="mi-name">${escapeHtml(it.name)}${it.volume ? ` <span class="mi-volume">(${escapeHtml(it.volume)})</span>` : ''}${it.is_available ? '' : ' <span class="badge low">Tugadi</span>'}</div>
        <div class="mi-price">${fmtMoney(it.price)}</div>
      </div>
      ${it.is_available ? `<button class="btn add" data-add="${it.id}">+</button>` : `<button class="btn add" disabled>—</button>`}
    </div>
  `;
}

function renderMenuItems() {
  const cat = menuCategories.find((c) => c.id === activeCategoryId);
  const box = document.getElementById('menuItems');
  if (!cat || cat.items.length === 0) {
    box.innerHTML = '<p class="dim">Bu bo\'limda taom yo\'q.</p>';
    return;
  }
  box.innerHTML = cat.items.map((it) => {
    const hasVariants = it.variants && it.variants.length > 0;
    const expanded = expandedVariantIds.has(it.id);
    let html = renderMenuItemRow(it);
    if (hasVariants) {
      html += `<button class="btn small menu-variants-toggle" data-toggle-variants="${it.id}">${expanded ? 'Turlarini yashirish' : `Turlari (${it.variants.length})`}</button>`;
      if (expanded) {
        html += `<div class="menu-item-variants-wrap">${it.variants.map((v) => renderMenuItemRow(v)).join('')}</div>`;
      }
    }
    return html;
  }).join('');
  box.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addItem(Number(btn.dataset.add)));
  });
  // Taom nomi/narxi ustiga (+ tugmasi emas) bosilsa — tavsifini ko'rsatadi.
  // Tavsifni admin panelida (Menyu > taomni tahrirlash > "Tavsif" maydoni) kiritadi.
  box.querySelectorAll('[data-info]').forEach((el) => {
    el.addEventListener('click', () => showItemInfo(Number(el.dataset.info)));
  });
  box.querySelectorAll('[data-toggle-variants]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.toggleVariants);
      if (expandedVariantIds.has(id)) expandedVariantIds.delete(id); else expandedVariantIds.add(id);
      renderMenuItems();
    });
  });
}

function findMenuItem(menuItemId) {
  const cat = menuCategories.find((c) => c.id === activeCategoryId);
  if (!cat) return null;
  for (const it of cat.items) {
    if (it.id === menuItemId) return it;
    const v = it.variants && it.variants.find((x) => x.id === menuItemId);
    if (v) return v;
  }
  return null;
}

function showItemInfo(menuItemId) {
  const item = findMenuItem(menuItemId);
  if (!item) return;
  const body = (item.description && item.description.trim())
    ? item.description.trim()
    : "Bu taom haqida hali ma'lumot kiritilmagan — administrator admin panelda (Menyu) qo'shishi kerak.";
  const title = item.volume ? `${item.name} (${item.volume})` : item.name;
  showInfoModal(title, body);
}

async function addItem(menuItemId) {
  try {
    const view = await api(`/waiter/tables/${TABLE_ID}/items`, { method: 'POST', body: { menu_item_id: menuItemId, quantity: 1 } });
    renderOrder(view);
    toast('Qo\'shildi');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function changeQty(itemId, delta, currentQty) {
  const nextQty = currentQty + delta;
  try {
    let view;
    if (nextQty <= 0) {
      view = await api(`/waiter/items/${itemId}`, { method: 'DELETE' });
    } else {
      view = await api(`/waiter/items/${itemId}`, { method: 'PATCH', body: { quantity: nextQty } });
    }
    renderOrder(view);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderOrder(view) {
  const box = document.getElementById('orderLines');
  const totalEl = document.getElementById('totalAmount');
  const sendBtn = document.getElementById('sendBtn');
  const closeBtn = document.getElementById('closeBtn');
  const cancelOrderBtn = document.getElementById('cancelOrderBtn');

  if (!view) {
    box.innerHTML = '<p class="dim">Hozircha buyurtma yo\'q — pastdagi menyudan taom tanlang.</p>';
    totalEl.textContent = fmtMoney(0);
    sendBtn.style.display = 'none';
    closeBtn.style.display = '';
    cancelOrderBtn.style.display = 'none';
    return;
  }

  if (view.items.length === 0) {
    // Buyurtma ochiq turibdi, lekin qo'shilgan taomlarning hammasi bekor qilingan.
    // closeTable() bunday holatda kamida bitta faol taom talab qilib rad etadi
    // (bo'sh chek chiqmasin uchun) — shu sabab stolni bo'shatishning yagona yo'li
    // "Bekor qilish" (cancel-order) bo'ladi, "Hisob-kitob" bu holatda yashiriladi.
    box.innerHTML = '<p class="dim">Barcha taomlar bekor qilindi. Stolni bo\'shatish uchun "Bekor qilish" tugmasini bosing.</p>';
    totalEl.textContent = fmtMoney(0);
    sendBtn.style.display = 'none';
    closeBtn.style.display = 'none';
    cancelOrderBtn.style.display = '';
    return;
  }

  closeBtn.style.display = '';
  cancelOrderBtn.style.display = 'none';
  box.innerHTML = view.items.map((it) => `
    <div class="order-line">
      <div>
        <div class="ol-name">${escapeHtml(it.name_snapshot)} ${it.sent_at ? '' : '<span class="badge debt">Kutilmoqda</span>'}</div>
        <div class="ol-meta">${escapeHtml(it.added_by_name)} · ${fmtMoney(it.unit_price)}/dona</div>
      </div>
      <div class="qty-stepper">
        <button data-dec="${it.id}" data-qty="${it.quantity}">−</button>
        <span class="qty-val">${it.quantity}</span>
        <button data-inc="${it.id}" data-qty="${it.quantity}">+</button>
      </div>
      <div class="ol-subtotal">${fmtMoney(it.subtotal)}</div>
    </div>
  `).join('');
  totalEl.textContent = fmtMoney(view.total);

  box.querySelectorAll('[data-dec]').forEach((btn) => {
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.dec), -1, Number(btn.dataset.qty)));
  });
  box.querySelectorAll('[data-inc]').forEach((btn) => {
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.inc), 1, Number(btn.dataset.qty)));
  });

  // Hali oshpazga yuborilmagan (sent_at yo'q) taomlar bo'lsa — "Oshxonaga yuborish"
  // tugmasi shular sonini ko'rsatib chiqadi, aks holda yashiriladi.
  const pendingCount = view.items.filter((it) => !it.sent_at).length;
  if (pendingCount > 0) {
    sendBtn.textContent = `🍽️ Oshxonaga yuborish (${pendingCount})`;
    sendBtn.style.display = '';
  } else {
    sendBtn.style.display = 'none';
  }
}

async function sendToKitchen() {
  try {
    const view = await api(`/waiter/tables/${TABLE_ID}/send`, { method: 'POST' });
    renderOrder(view);
    toast('Oshxonaga yuborildi');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadOrder() {
  try {
    const view = await api(`/waiter/tables/${TABLE_ID}/order`);
    renderOrder(view);
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('sendBtn').addEventListener('click', sendToKitchen);

document.getElementById('closeBtn').addEventListener('click', async () => {
  const ok = await customConfirm("Stolni yopib, hisob-kitob qilasizmi? Bu amalni ortga qaytarib bo'lmaydi.");
  if (!ok) return;
  try {
    // Chek endi shu yerda chop etilmaydi — printer administrator kompyuteriga
    // ulangan, shu sabab server bu yerda "chop etish kutilmoqda" navbatiga
    // qo'shadi (print_requests) va admin panelida ko'rinadi.
    await api(`/waiter/tables/${TABLE_ID}/close`, { method: 'POST' });
    toast("Hisob-kitob yakunlandi — chek administratorga yuborildi.");
    setTimeout(() => { window.location.href = 'tables.html'; }, 900);
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('cancelOrderBtn').addEventListener('click', async () => {
  const ok = await customConfirm('Buyurtmada taom yo\'q. Stolni bo\'shatib, buyurtmani bekor qilasizmi? Chek chiqmaydi.');
  if (!ok) return;
  try {
    await api(`/waiter/tables/${TABLE_ID}/cancel-order`, { method: 'POST' });
    toast('Buyurtma bekor qilindi — stol bo\'shatildi.');
    setTimeout(() => { window.location.href = 'tables.html'; }, 900);
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (!TABLE_ID) {
    window.location.href = 'tables.html';
    return;
  }
  loadTableName();
  loadMenu();
  loadOrder();
  setInterval(loadOrder, 8000);
});
