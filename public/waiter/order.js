const params = new URLSearchParams(window.location.search);
const TABLE_ID = params.get('table');

let menuCategories = [];
let activeCategoryId = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

function renderMenuItems() {
  const cat = menuCategories.find((c) => c.id === activeCategoryId);
  const box = document.getElementById('menuItems');
  if (!cat || cat.items.length === 0) {
    box.innerHTML = '<p class="dim">Bu bo\'limda taom yo\'q.</p>';
    return;
  }
  box.innerHTML = cat.items.map((it) => `
    <div class="menu-item-row">
      <div>
        <div class="mi-name">${escapeHtml(it.name)}</div>
        <div class="mi-price">${fmtMoney(it.price)}</div>
      </div>
      <button class="btn add" data-add="${it.id}">+</button>
    </div>
  `).join('');
  box.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addItem(Number(btn.dataset.add)));
  });
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
  if (!view || view.items.length === 0) {
    box.innerHTML = '<p class="dim">Hozircha buyurtma yo\'q — pastdagi menyudan taom tanlang.</p>';
    totalEl.textContent = fmtMoney(0);
    sendBtn.style.display = 'none';
    return;
  }
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
