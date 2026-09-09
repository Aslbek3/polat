const params = new URLSearchParams(window.location.search);
const TABLE_ID = params.get('table');

let menuCategories = [];
let activeCategoryId = null;

// So'rovlar navbati (2026-09-10).
// NEGA: har 8 soniyada `loadOrder()` poll qiladi, foydalanuvchi amali ("+",
// "−", taom qo'shish, "Oshxonaga yuborish") ham xuddi shu `renderOrder()`ni
// chaqiradi — javoblarning KELISH TARTIBI kafolatlanmagan. Poll GET yuborilgan,
// keyin afitsiant "+" bosgan, PATCH javobi kelib ekran 3 bo'lgan, so'ng ESKI
// poll javobi kelib ekranni yana 2 ga qaytarardi. Afitsiant "o'zgarmadi" deb
// yana bosardi — miqdor esa noto'g'ri oshib ketardi. Endi har so'rov o'z
// raqamini oladi; javob kelganda raqam eng oxirgisi bo'lmasa render qilinmaydi.
let reqSeq = 0;

// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
async function loadTableName() {
  try {
    const tables = await api('/waiter/tables');
    const t = tables.find((x) => String(x.id) === String(TABLE_ID));
    if (t) document.getElementById('tableTitle').textContent = t.name;
  } catch (e) { /* jim */ }
}

// NEGA try/catch (2026-09-10): ilgari bu yerda `await api('/waiter/menu')`
// himoyasiz turardi va `loadMenu()` faqat bir marta (DOMContentLoaded'da)
// chaqirilardi. Tarmoq bir soniyaga uzilsa (mobil Wi-Fi) menyu ABADIY bo'sh
// qolardi — hech qanday xato xabari ham yo'q edi, afitsiant taom qo'sha
// olmasdi va sababini bilmasdi. Endi xato ko'rinadi va "Qayta urinish" bor.
async function loadMenu() {
  const tabs = document.getElementById('catTabs');
  const box = document.getElementById('menuItems');
  try {
    box.innerHTML = '<p class="dim">Menyu yuklanmoqda...</p>';
    menuCategories = await api('/waiter/menu');
  } catch (err) {
    tabs.innerHTML = '';
    box.innerHTML = `
      <p class="dim">Menyuni yuklab bo'lmadi: ${escapeHtml(err.message)}</p>
      <button class="btn small" id="menuRetryBtn">Qayta urinish</button>
    `;
    document.getElementById('menuRetryBtn').addEventListener('click', (e) => withBusy(e.currentTarget, loadMenu));
    return;
  }
  if (menuCategories.length === 0) {
    tabs.innerHTML = '';
    box.innerHTML = '<p class="dim">Menyu hali bo\'sh.</p>';
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
    // withBusy — tugma so'rov davomida bloklanadi (2026-09-10): ilgari "+"
    // ni tez ikki marta bosish ikkita POST yuborardi va taom ikki marta
    // qo'shilardi.
    btn.addEventListener('click', () => addItem(Number(btn.dataset.add), btn));
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

async function addItem(menuItemId, btn) {
  await withBusy(btn, async () => {
    const my = ++reqSeq;
    try {
      const view = await api(`/waiter/tables/${TABLE_ID}/items`, { method: 'POST', body: { menu_item_id: menuItemId, quantity: 1 } });
      if (my !== reqSeq) return;
      renderOrder(view);
      toast('Qo\'shildi');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ⚠️ YO'QOLGAN YANGILANISH (lost update) — 2026-09-10.
// NEGA bu yerda BLOKLASH shart: tugmalar render paytidagi miqdorni DOM'ga
// muzlatadi (`data-qty="${it.quantity}"`), so'rov esa ABSOLYUT qiymat
// (`quantity = currentQty + delta`) yuboradi. Miqdor 2 bo'lsa va afitsiant
// "+" ni tez ikki marta bossa, IKKALA klik ham eski `data-qty="2"` ni o'qib
// ikkalasi ham `quantity: 3` yuborardi — 2 marta bosildi, miqdor 3 bo'ldi.
// Shu sabab so'rov ketayotganda shu qatorning "+" va "−" tugmalari birga
// bloklanadi, javob kelgach esa DOM serverdan kelgan HAQIQIY qiymat bilan
// qayta chiziladi. Ikki afitsiant bitta stolda ishlagan holat (B miqdorni 5
// qildi, A eski ekrandan 3 yubordi) BU YERDA to'liq hal bo'lmaydi — uning
// yechimi server tomonidagi optimistik qulf, u alohida qilinadi.
async function changeQty(itemId, delta, currentQty, btn) {
  const nextQty = currentQty + delta;
  // Bitta qatordagi ikkinchi tugma (+/−) ham bloklanadi — aks holda "+" so'rovi
  // ketayotganda "−" bosilib xuddi shu eski `data-qty` dan hisoblanardi.
  const stepper = btn ? btn.closest('.qty-stepper') : null;
  const others = stepper ? Array.from(stepper.querySelectorAll('button')).filter((b) => b !== btn) : [];
  others.forEach((b) => { b.disabled = true; });
  try {
    await withBusy(btn, async () => {
      const my = ++reqSeq;
      try {
        let view;
        if (nextQty <= 0) {
          view = await api(`/waiter/items/${itemId}`, { method: 'DELETE' });
        } else {
          view = await api(`/waiter/items/${itemId}`, { method: 'PATCH', body: { quantity: nextQty } });
        }
        if (my !== reqSeq) return;
        renderOrder(view);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } finally {
    others.forEach((b) => { b.disabled = false; });
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
    // NEGA 'none' (2026-09-10): stol bo'sh bo'lsa "Hisob-kitob" tugmasi
    // ko'rinib turardi va bosilganda server `404 "Bu stolda ochiq buyurtma
    // yo'q"` qaytarardi — afitsiant nima noto'g'ri bo'lganini tushunmasdi.
    // Kassir ekranida (kassir/order.js) xuddi shu holat allaqachon
    // yashiriladi, endi afitsiantda ham shunday.
    closeBtn.style.display = 'none';
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
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.dec), -1, Number(btn.dataset.qty), btn));
  });
  box.querySelectorAll('[data-inc]').forEach((btn) => {
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.inc), 1, Number(btn.dataset.qty), btn));
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

async function sendToKitchen(btn) {
  await withBusy(btn, async () => {
    const my = ++reqSeq;
    try {
      const view = await api(`/waiter/tables/${TABLE_ID}/send`, { method: 'POST' });
      if (my !== reqSeq) return;
      renderOrder(view);
      toast('Oshxonaga yuborildi');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function loadOrder() {
  const my = ++reqSeq;
  try {
    const view = await api(`/waiter/tables/${TABLE_ID}/order`);
    // Eskirgan poll javobi — foydalanuvchi amalining yangi natijasini
    // ustidan yozib yubormasin (2026-09-10).
    if (my !== reqSeq) return;
    renderOrder(view);
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('sendBtn').addEventListener('click', (e) => sendToKitchen(e.currentTarget));

document.getElementById('closeBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const ok = await customConfirm("Stolni yopib, hisob-kitob qilasizmi? Bu amalni ortga qaytarib bo'lmaydi.");
  if (!ok) return;
  // withBusy — tasdiqdan keyin tugma bloklanadi (2026-09-10): ikki marta
  // bosilsa ikkinchi so'rov `404` beradi va MUVAFFAQIYATLI hisob-kitob
  // uchun qizil xato ko'rinardi.
  let redirecting = false;
  await withBusy(btn, async () => {
    try {
      // Chek endi shu yerda chop etilmaydi — printer administrator kompyuteriga
      // ulangan, shu sabab server bu yerda "chop etish kutilmoqda" navbatiga
      // qo'shadi (print_requests) va admin panelida ko'rinadi.
      await api(`/waiter/tables/${TABLE_ID}/close`, { method: 'POST' });
      redirecting = true;
      toast("Hisob-kitob yakunlandi — chek administratorga yuborildi.");
      setTimeout(() => { window.location.href = 'tables.html'; }, 900);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  // Muvaffaqiyatli yopilgandan keyin stollarga qaytishgacha ~0.9s bor —
  // shu oraliqda tugma yana bosilmasin (aks holda `404` xato toast'i).
  if (redirecting) btn.disabled = true;
});

document.getElementById('cancelOrderBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const ok = await customConfirm('Buyurtmada taom yo\'q. Stolni bo\'shatib, buyurtmani bekor qilasizmi? Chek chiqmaydi.');
  if (!ok) return;
  let redirecting = false;
  await withBusy(btn, async () => {
    try {
      await api(`/waiter/tables/${TABLE_ID}/cancel-order`, { method: 'POST' });
      redirecting = true;
      toast('Buyurtma bekor qilindi — stol bo\'shatildi.');
      setTimeout(() => { window.location.href = 'tables.html'; }, 900);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  if (redirecting) btn.disabled = true;
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
