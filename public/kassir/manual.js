// Kassir "Hisoblash" ekrani — 2026-09-09'da qo'shildi. Stol/menyuga bog'liq
// emas: kassir har bir qatorga taom nomi + narxi + miqdorini qo'lda kiritadi,
// jami shu sahifaning o'zida (client tomonda) jonli hisoblanadi, "Chek
// chiqarish" bosilganda server/routes/kassirBilling.js'dagi POST
// /kassir/manual-bills'ga yuboriladi (server QIYMATLARNI QAYTA TEKSHIRADI VA
// O'ZI HISOBLAYDI — mijozdan kelgan jamiga ishonilmaydi), qaytgan chek
// showReceiptModal() (../app.js'dan global, kind='manual') bilan darhol
// ko'rsatiladi/chop etiladi. escapeHtml()/fmtMoney()/toast()/customConfirm() —
// ../app.js'dan global.
const itemRowsEl = document.getElementById('itemRows');

// D-H2 (2026-09-10): yorliqlar inputga bog'lanmagan edi (`<label>` inputni
// o'ramaydi, `for` yo'q) — ekran o'qiruvchi uchala maydonni nomsiz o'qirdi,
// yorliqqa bosish fokus bermasdi. Qatorlar dinamik, shuning uchun har
// qatorga noyob raqam (manualRowSeq) — id'lar takrorlanmasin. Bu id'lar
// setFieldError()ga ham kerak (`<id>-error` xato matni shu bilan bog'lanadi).
let manualRowSeq = 0;

function rowTemplate() {
  const n = ++manualRowSeq;
  const row = document.createElement('div');
  row.className = 'item-row';
  // D-F3: tuzilma (nom .field, .field.price, .field.qty, .remove-item)
  // style.css'dagi ≤640px qoidasiga mos — nom to'liq qatorda, ostida
  // narx + miqdor + "×".
  row.innerHTML = `
    <div class="field"><label for="rowName${n}">Nomi</label><input type="text" id="rowName${n}" class="rowName" placeholder="Masalan: Osh"></div>
    <div class="field price"><label for="rowPrice${n}">Narx</label><input type="number" id="rowPrice${n}" class="rowPrice" min="0" inputmode="numeric" placeholder="0"></div>
    <div class="field qty"><label for="rowQty${n}">Miqdor</label><input type="number" id="rowQty${n}" class="rowQty" min="1" step="1" value="1" inputmode="numeric"></div>
    <button type="button" class="remove-item" aria-label="Qatorni o'chirish">×</button>
  `;
  return row;
}

function addRow() {
  itemRowsEl.appendChild(rowTemplate());
}

function removeRow(row) {
  row.remove();
  // Ro'yxat butunlay bo'shab qolmasin — doim kamida bitta qator turadi.
  if (itemRowsEl.children.length === 0) addRow();
  recalcTotal();
}

// Qator + uning DOM elementi (noto'g'ri qatorni vizual belgilash uchun kerak).
function readRowEntries() {
  return Array.from(itemRowsEl.querySelectorAll('.item-row')).map((row) => ({
    row,
    name: row.querySelector('.rowName').value.trim(),
    unit_price: Number(row.querySelector('.rowPrice').value),
    quantity: Number(row.querySelector('.rowQty').value),
  }));
}

// NEGA `Number.isInteger` (2026-09-10): server (services/manualBills.js)
// `!Number.isInteger(quantity)` bo'lsa so'rovni rad etadi, client esa faqat
// `Number.isFinite && > 0` ni tekshirardi. Kassir miqdorga `1.5` yozsa jami
// summa ekranda TO'G'RI ko'rinardi, "Chek chiqarish"da esa tushunarsiz xato
// chiqardi va qaysi qator aybdorligi ko'rinmasdi. Endi qoida ikkala tomonda
// bir xil, noto'g'ri qator esa qizil ramka bilan belgilanadi.
// (YUQORI chegaralar — MAX_QUANTITY/MAX_AMOUNT — server tomonida
// `server/validation.js`da turadi va o'z tushunarli xatosini qaytaradi;
// bu yerda takrorlanmaydi, aks holda ikki joyda ushlab turish kerak bo'lardi.)
function isValidPrice(unitPrice) {
  return Number.isFinite(unitPrice) && unitPrice > 0;
}
function isValidQty(quantity) {
  return Number.isSafeInteger(quantity) && quantity > 0;
}

// 2026-09-10: inline `style.borderColor` (markInput) o'rniga app.js'dagi
// setFieldError() — qizil ramka + maydon OSTIDA sababi yozilgan matn +
// aria-invalid. Ilgari faqat ramka qizarardi, sababi esa 3–6 soniyalik
// toast'da edi: uzun ro'yxatda kassir qaysi qator va nima noto'g'ri ekanini
// toast yo'qolguncha topishga ulgurmasdi.
const PRICE_ERROR = "Narx 0 dan katta bo'lsin";
function qtyErrorText(quantity) {
  return Number.isFinite(quantity) && !Number.isInteger(quantity)
    ? "Butun son bo'lsin"
    : "1 yoki undan katta bo'lsin";
}

function recalcTotal() {
  const total = readRowEntries().reduce((sum, it) => {
    const priceInput = it.row.querySelector('.rowPrice');
    const qtyInput = it.row.querySelector('.rowQty');
    // Yozib turgan paytda bo'sh maydon "xato" deb belgilanmaydi — faqat
    // to'ldirilgan, lekin qoidaga to'g'ri kelmaydigan qiymat belgilanadi.
    // `focus: false` — yozib turgan kassirning fokusini tortib olmaslik uchun.
    const priceBad = priceInput.value !== '' && !isValidPrice(it.unit_price);
    const qtyBad = qtyInput.value !== '' && !isValidQty(it.quantity);
    setFieldError(priceInput, priceBad ? PRICE_ERROR : '', { focus: false });
    setFieldError(qtyInput, qtyBad ? qtyErrorText(it.quantity) : '', { focus: false });
    if (!it.name || !isValidPrice(it.unit_price) || !isValidQty(it.quantity)) return sum;
    return sum + it.unit_price * it.quantity;
  }, 0);
  document.getElementById('totalAmount').textContent = fmtMoney(total);
}

function resetForm() {
  itemRowsEl.innerHTML = '';
  addRow();
  recalcTotal();
}

itemRowsEl.addEventListener('input', recalcTotal);
itemRowsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-item');
  if (btn) removeRow(btn.closest('.item-row'));
});

document.getElementById('addRowBtn').addEventListener('click', addRow);

// ---------------- "📋 Menyu" — menyudan tanlab qator to'ldirish ----------------
// 2026-09-09'da qo'shildi: GET /kassir/menu'dan (server/routes/kassirMenu.js,
// afitsiantnikiga o'xshash, faqat o'qish) kategoriya+taomlarni olib, bosilgan
// taomni bo'sh qatorga (yoki xuddi shu nom/narxdagi qatorga miqdorini +1
// qilib) yozadi — nomi/narxini qo'lda terish shart bo'lmasin.
let menuCategories = [];
let menuActiveCat = null;

function ensureMenuModal() {
  let el = document.getElementById('menuPickModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'menuPickModal';
    el.className = 'modal-backdrop hidden';
    el.innerHTML = `
      <div class="modal">
        <h2>Menyudan tanlash</h2>
        <div class="tabs" id="menuPickTabs"></div>
        <div id="menuPickItems" style="max-height:50vh; overflow-y:auto;"><p class="dim">Yuklanmoqda...</p></div>
        <div class="modal-actions">
          <button type="button" class="btn primary" id="menuPickClose">Yopish</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    const finish = () => el.classList.add('hidden');
    el.querySelector('#menuPickClose').addEventListener('click', finish);
    el.addEventListener('click', (e) => { if (e.target === el) finish(); });
  }
  return el;
}

function renderMenuPickTabs() {
  const tabs = document.getElementById('menuPickTabs');
  tabs.innerHTML = menuCategories.map((c) => `
    <button type="button" data-cat="${c.id}" class="${c.id === menuActiveCat ? 'active' : ''}">${escapeHtml(c.name)}</button>
  `).join('');
  tabs.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      menuActiveCat = Number(btn.dataset.cat);
      renderMenuPickTabs();
      renderMenuPickItems();
    });
  });
}

// Taom "turi" (variant, 2026-09-09) — asosiy taom har doim ko'rinadi, agar
// unga bog'liq turlari bo'lsa pastida "Turlari (N)" tugmasi chiqadi, bosilsa
// o'sha turlar ham (o'z narxi bilan, alohida tanlanadigan) ochiladi.
let expandedKassirItems = new Set();

// D-H4 / D-H9 (2026-09-10): "+" tugmasida taom nomi (aria-label), rasm
// bezak (alt="" — nomi yonida matn bilan turibdi).
function renderMenuPickItemRow(it) {
  const label = escapeHtml(it.volume ? `${it.name} (${it.volume})` : it.name);
  return `
    <div class="menu-item-row${it.is_available ? '' : ' unavailable'}">
      <div class="mi-info">
        ${it.image_url ? `<img src="${escapeHtml(it.image_url)}" alt="" style="width:32px; height:32px; object-fit:cover; border-radius:var(--radius-sm); margin-right:8px;">` : ''}
        <div class="mi-name">${escapeHtml(it.name)}${it.volume ? ` <span class="mi-volume">(${escapeHtml(it.volume)})</span>` : ''}${it.is_available ? '' : ' <span class="badge low">Tugadi</span>'}</div>
        <div class="mi-price">${fmtMoney(it.price)}</div>
      </div>
      ${it.is_available
        ? `<button type="button" class="btn add" data-pick="${it.id}" aria-label="«${label}» qo'shish">+</button>`
        : `<button type="button" class="btn add" disabled aria-label="«${label}» tugagan">—</button>`}
    </div>
  `;
}

function renderMenuPickItems() {
  const box = document.getElementById('menuPickItems');
  const cat = menuCategories.find((c) => c.id === menuActiveCat);
  if (!cat || cat.items.length === 0) {
    box.innerHTML = '<p class="dim">Bu bo\'limda taom yo\'q.</p>';
    return;
  }
  box.innerHTML = cat.items.map((it) => {
    const hasVariants = it.variants && it.variants.length > 0;
    const expanded = expandedKassirItems.has(it.id);
    return renderMenuPickItemRow(it) + (hasVariants ? `
      <button type="button" class="btn small" data-toggle-variants="${it.id}" style="margin:2px 0 8px 12px;">${expanded ? 'Turlarini yashirish' : `Turlari (${it.variants.length})`}</button>
      ${expanded ? `<div style="margin-left:12px;">${it.variants.map((v) => renderMenuPickItemRow(v)).join('')}</div>` : ''}
    ` : '');
  }).join('');
  box.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => pickMenuItem(Number(btn.dataset.pick)));
  });
  box.querySelectorAll('[data-toggle-variants]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.toggleVariants);
      if (expandedKassirItems.has(id)) expandedKassirItems.delete(id); else expandedKassirItems.add(id);
      renderMenuPickItems();
    });
  });
}

function findMenuPickItem(menuItemId) {
  const cat = menuCategories.find((c) => c.id === menuActiveCat);
  if (!cat) return null;
  for (const it of cat.items) {
    if (it.id === menuItemId) return it;
    const v = it.variants && it.variants.find((x) => x.id === menuItemId);
    if (v) return v;
  }
  return null;
}

function pickMenuItem(menuItemId) {
  const item = findMenuPickItem(menuItemId);
  if (!item) return;

  const rows = Array.from(itemRowsEl.querySelectorAll('.item-row'));
  const existing = rows.find((row) =>
    row.querySelector('.rowName').value.trim() === item.name
    && Number(row.querySelector('.rowPrice').value) === item.price
  );
  if (existing) {
    const qtyInput = existing.querySelector('.rowQty');
    qtyInput.value = String((Number(qtyInput.value) || 0) + 1);
  } else {
    const emptyRow = rows.find((row) => !row.querySelector('.rowName').value.trim());
    const target = emptyRow || rowTemplate();
    if (!emptyRow) itemRowsEl.appendChild(target);
    target.querySelector('.rowName').value = item.name;
    target.querySelector('.rowPrice').value = item.price;
    target.querySelector('.rowQty').value = '1';
  }
  recalcTotal();
  toast(`"${item.name}" qo'shildi`);
}

async function openMenuPicker() {
  const el = ensureMenuModal();
  // D-H6 (2026-09-10): openDialog() (app.js) — role="dialog", Escape, fokus
  // tuzog'i va yopilganda fokus "📋 Menyu" tugmasiga qaytadi. Mavjud
  // `finish()` (classList.add('hidden')) bilan yopish ham to'g'ri ishlaydi.
  openDialog(el);
  if (menuCategories.length === 0) {
    try {
      menuCategories = await api('/kassir/menu');
      if (menuCategories.length === 0) {
        document.getElementById('menuPickItems').innerHTML = '<p class="dim">Menyu hali bo\'sh.</p>';
        return;
      }
      menuActiveCat = menuCategories[0].id;
    } catch (err) {
      document.getElementById('menuPickItems').innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
      return;
    }
  }
  renderMenuPickTabs();
  renderMenuPickItems();
}

document.getElementById('menuBtn').addEventListener('click', openMenuPicker);

document.getElementById('clearBtn').addEventListener('click', async () => {
  const ok = await customConfirm("Kiritilgan qatorlarni tozalaysizmi?");
  if (!ok) return;
  resetForm();
});

document.getElementById('createBtn').addEventListener('click', async () => {
  // Bo'sh (nomi yo'q) qatorlarni tashlab, faqat to'ldirilganlarini yuboramiz —
  // odatda oxirgi qator bo'sh qoladi (kassir "+ Qator qo'shish"ni ehtiyot
  // uchun bosib qo'ygan bo'lishi mumkin).
  // 2026-09-10: xatolar setFieldError() bilan har bir aybdor MAYDON ostida
  // (hammasi birdaniga, faqat birinchisi emas); fokus va scroll birinchi
  // xato maydonga — app.js o'zi qiladi.
  clearFieldErrors(itemRowsEl);
  const all = readRowEntries();
  // Nomi yo'q, lekin narxi yozilgan qator — ilgari JIMGINA tashlab
  // yuborilardi va chek undan kam summaga chiqardi (kassir nomni yozishni
  // unutgan). Endi bu xato sifatida ko'rsatiladi.
  const nameless = all.filter((it) => !it.name && it.row.querySelector('.rowPrice').value !== '');
  nameless.forEach((it) => setFieldError(it.row.querySelector('.rowName'), 'Taom nomini kiriting'));
  const entries = all.filter((it) => it.name);
  if (entries.length === 0 && nameless.length === 0) {
    setFieldError(all[0].row.querySelector('.rowName'), 'Kamida bitta taom kiriting');
    return;
  }
  let hasError = nameless.length > 0;
  entries.forEach((it) => {
    if (!isValidPrice(it.unit_price)) {
      setFieldError(it.row.querySelector('.rowPrice'), PRICE_ERROR);
      hasError = true;
    }
    if (!isValidQty(it.quantity)) {
      setFieldError(it.row.querySelector('.rowQty'), qtyErrorText(it.quantity));
      hasError = true;
    }
  });
  if (hasError) return;
  const items = entries.map(({ name, unit_price, quantity }) => ({ name, unit_price, quantity }));

  const btn = document.getElementById('createBtn');
  btn.disabled = true;
  try {
    const receipt = await api('/kassir/manual-bills', { method: 'POST', body: { items } });
    toast('Chek yaratildi.');
    resetForm();
    showReceiptModal(receipt);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initNav('manual');
  resetForm();
});
