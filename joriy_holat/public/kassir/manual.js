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

function rowTemplate() {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <div class="field"><label>Nomi</label><input type="text" class="rowName" placeholder="Masalan: Osh"></div>
    <div class="field price"><label>Narx</label><input type="number" class="rowPrice" min="0" inputmode="numeric" placeholder="0"></div>
    <div class="field qty"><label>Miqdor</label><input type="number" class="rowQty" min="1" step="1" value="1" inputmode="numeric"></div>
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

function readRows() {
  return Array.from(itemRowsEl.querySelectorAll('.item-row')).map((row) => ({
    name: row.querySelector('.rowName').value.trim(),
    unit_price: Number(row.querySelector('.rowPrice').value),
    quantity: Number(row.querySelector('.rowQty').value),
  }));
}

// Yetkazib berish narxi — MAJBURIY EMAS: checkbox (#deliveryPriceEnabled)
// belgilanmaguncha narx inputi o'chirilgan (disabled) turadi va "Jami"ga
// qo'shilmaydi; belgilangandan keyingina hisobga kiradi. Standart qiymat
// 5000 so'm (kassir o'zgartira oladi) (2026-09-27, foydalanuvchi so'rovi).
const DEFAULT_DELIVERY_PRICE = 5000;

function readDeliveryPrice() {
  if (!document.getElementById('deliveryPriceEnabled').checked) return 0;
  const raw = document.getElementById('deliveryPriceInput').value;
  const price = Number(raw);
  return Number.isFinite(price) && price >= 0 ? price : 0;
}

document.getElementById('deliveryPriceEnabled').addEventListener('change', (e) => {
  document.getElementById('deliveryPriceInput').disabled = !e.target.checked;
  recalcTotal();
});

function recalcTotal() {
  const itemsTotal = readRows().reduce((sum, it) => {
    if (!it.name || !Number.isFinite(it.unit_price) || !Number.isFinite(it.quantity)) return sum;
    if (it.unit_price <= 0 || it.quantity <= 0) return sum;
    return sum + it.unit_price * it.quantity;
  }, 0);
  document.getElementById('totalAmount').textContent = fmtMoney(itemsTotal + readDeliveryPrice());
}

function resetForm() {
  itemRowsEl.innerHTML = '';
  addRow();
  document.getElementById('customerPhoneInput').value = '';
  document.getElementById('billNoteInput').value = '';
  document.getElementById('deliveryPriceEnabled').checked = false;
  document.getElementById('deliveryPriceInput').value = String(DEFAULT_DELIVERY_PRICE);
  document.getElementById('deliveryPriceInput').disabled = true;
  recalcTotal();
}

itemRowsEl.addEventListener('input', recalcTotal);
document.getElementById('deliveryPriceInput').addEventListener('input', recalcTotal);
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
      <div class="modal menu-pick-modal">
        <div class="menu-pick-header">
          <h2>Menyudan tanlash</h2>
          <div class="menu-pick-selected" id="menuPickSelected"></div>
        </div>
        <div class="tabs" id="menuPickTabs"></div>
        <div id="menuPickItems" class="menu-pick-items"><p class="dim">Yuklanmoqda...</p></div>
        <div class="modal-actions">
          <button class="btn primary" id="menuPickClose">Yopish</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    // Modal yopilganda ochiq turgan "Turlari" panellari ham yopib qo'yiladi —
    // keyingi safar "📋 Menyu" bosilganda hammasi yopiq holatda boshlanadi
    // (2026-09-15, foydalanuvchi so'rovi).
    const finish = () => {
      el.classList.add('hidden');
      expandedKassirItems.clear();
    };
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
// o'sha turlar ham (o'z narxi bilan, alohida tanlanadigan) ochiladi. Kartochka
// render mantiqi ../menu-picker.js'da (afitsiantning buyurtma sahifasi bilan
// umumiy, 2026-09-15). Bir vaqtda faqat BITTA taomning turlari ochiq turadi
// (akkordeon) — yangisi ochilganda avvalgisi avtomatik yopiladi, va modal
// yopilganda (ensureMenuModal'dagi finish()) hammasi tozalanadi.
let expandedKassirItems = new Set();

function renderMenuPickItems() {
  const cat = menuCategories.find((c) => c.id === menuActiveCat);
  mpRenderGrid(document.getElementById('menuPickItems'), cat ? cat.items : [], expandedKassirItems, {
    onAdd: pickMenuItem,
    onRemove: decrementMenuItem,
    onInfo: showKassirItemInfo,
    onToggleVariants: (id) => {
      const wasOpen = expandedKassirItems.has(id);
      expandedKassirItems.clear();
      if (!wasOpen) expandedKassirItems.add(id);
      renderMenuPickItems();
    },
  }, getMenuPickQty);
}

// Bitta menyu taomi (yoki uning turi) "Qatorlar"da hozir nechta kiritilganini
// topadi — nomi+narxi bo'yicha moslashtiradi (pickMenuItem bilan bir xil
// mantiq, chunki qatorlarda menyu taomining id'si saqlanmaydi, faqat
// nomi/narxi/miqdori).
function findRowForMenuItem(item) {
  if (!item) return null;
  return Array.from(itemRowsEl.querySelectorAll('.item-row')).find((row) =>
    row.querySelector('.rowName').value.trim() === item.name
    && Number(row.querySelector('.rowPrice').value) === item.price
  ) || null;
}

// Kartochkadagi "− <son> +" stepper uchun — menyu taomining id'si bo'yicha
// hozirgi miqdorni qaytaradi (2026-09-26, foydalanuvchi so'rovi).
function getMenuPickQty(menuItemId) {
  const item = mpFindItem(menuCategories, menuActiveCat, menuItemId);
  const row = findRowForMenuItem(item);
  return row ? Number(row.querySelector('.rowQty').value) || 0 : 0;
}

// Modal ochiq turgan paytda tepada (sarlavha yonida, o'ng burchakda) hozircha
// tanlangan taomlarni ko'rsatib turadi — kassir modalni yopmasdan "nimalarni
// qo'shdim" deb tekshira oladi (2026-09-26, foydalanuvchi so'rovi).
function renderMenuPickSelected() {
  const el = document.getElementById('menuPickSelected');
  if (!el) return;
  const items = readRows().filter((it) => it.name && Number(it.quantity) > 0);
  el.innerHTML = items.map((it) => `<span class="menu-pick-chip">${escapeHtml(it.name)} <b>×${it.quantity}</b></span>`).join('');
}

function showKassirItemInfo(menuItemId) {
  const item = mpFindItem(menuCategories, menuActiveCat, menuItemId);
  if (!item) return;
  const body = (item.description && item.description.trim())
    ? item.description.trim()
    : "Bu taom haqida hali ma'lumot kiritilmagan.";
  const title = item.volume ? `${item.name} (${item.volume})` : item.name;
  showInfoModal(title, body);
}

function pickMenuItem(menuItemId) {
  const item = mpFindItem(menuCategories, menuActiveCat, menuItemId);
  if (!item) return;

  const existing = findRowForMenuItem(item);
  if (existing) {
    const qtyInput = existing.querySelector('.rowQty');
    qtyInput.value = String((Number(qtyInput.value) || 0) + 1);
  } else {
    const rows = Array.from(itemRowsEl.querySelectorAll('.item-row'));
    const emptyRow = rows.find((row) => !row.querySelector('.rowName').value.trim());
    const target = emptyRow || rowTemplate();
    if (!emptyRow) itemRowsEl.appendChild(target);
    target.querySelector('.rowName').value = item.name;
    target.querySelector('.rowPrice').value = item.price;
    target.querySelector('.rowQty').value = '1';
  }
  recalcTotal();
  renderMenuPickSelected();
  renderMenuPickItems();
}

// Kartochkadagi "−" tugmasi — miqdorni 1ga kamaytiradi, 0'ga tushsa qatorning
// o'zi olib tashlanadi (removeRow — kamida bitta bo'sh qator qoladi qoidasi
// bilan) (2026-09-26, foydalanuvchi so'rovi).
function decrementMenuItem(menuItemId) {
  const item = mpFindItem(menuCategories, menuActiveCat, menuItemId);
  const existing = findRowForMenuItem(item);
  if (!existing) return;

  const qtyInput = existing.querySelector('.rowQty');
  const nextQty = (Number(qtyInput.value) || 0) - 1;
  if (nextQty <= 0) {
    removeRow(existing);
  } else {
    qtyInput.value = String(nextQty);
    recalcTotal();
  }
  renderMenuPickSelected();
  renderMenuPickItems();
}

async function openMenuPicker() {
  const el = ensureMenuModal();
  el.classList.remove('hidden');
  renderMenuPickSelected();
  document.getElementById('menuPickItems').innerHTML = '<p class="dim">Yuklanmoqda...</p>';
  // Har safar ochilganda QAYTA so'raladi (kesh yo'q) — kassir sahifasi smena
  // davomida uzoq ochiq turadi, shu orada admin ombordan yangi taom qo'shishi/
  // bog'lashi mumkin; eski keshlangan ro'yxat bo'lsa yangi taom sahifa F5
  // qilinmaguncha ko'rinmay qolardi (2026-09-27, haqiqiy holat aniqlanib
  // tuzatildi). Tanlangan bo'lim (menuActiveCat) mavjud bo'lsa saqlanadi.
  try {
    menuCategories = await api('/kassir/menu');
    if (menuCategories.length === 0) {
      document.getElementById('menuPickItems').innerHTML = '<p class="dim">Menyu hali bo\'sh.</p>';
      return;
    }
    if (!menuCategories.some((c) => c.id === menuActiveCat)) {
      menuActiveCat = menuCategories[0].id;
    }
  } catch (err) {
    document.getElementById('menuPickItems').innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
    return;
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
  const items = readRows().filter((it) => it.name);
  if (items.length === 0) {
    toast("Kamida bitta taom kiriting", 'error');
    return;
  }
  const invalid = items.find((it) => !Number.isFinite(it.unit_price) || it.unit_price <= 0
    || !Number.isFinite(it.quantity) || it.quantity <= 0);
  if (invalid) {
    toast(`"${invalid.name}" uchun narx/miqdor noto'g'ri`, 'error');
    return;
  }

  const customerPhone = document.getElementById('customerPhoneInput').value.trim() || undefined;
  const note = document.getElementById('billNoteInput').value.trim() || undefined;
  const deliveryPrice = readDeliveryPrice();

  const btn = document.getElementById('createBtn');
  btn.disabled = true;
  try {
    const receipt = await api('/kassir/manual-bills', { method: 'POST', body: { items, customer_phone: customerPhone, note, delivery_price: deliveryPrice } });
    toast('Chek yaratildi.');
    // Chek chiqarilgandan keyin qatorlar ENDI avtomatik tozalanmaydi (2026-
    // 09-27, foydalanuvchi so'rovi) — kassir "Tozalash" tugmasini bosmaguncha
    // tanlangan mahsulotlar ekranda qoladi.
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
