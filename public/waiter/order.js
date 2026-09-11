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
// yana bosardi — miqdor esa noto'g'ri oshib ketardi.
//
// Bu navbat qo'lda `reqSeq` bilan yozilgan edi — 2026-09-10 da ../app.js'dagi
// umumiy renderList()ga o'tkazildi: u `orderLines` uchun o'z navbatini
// yuritadi, ya'ni har bir chizish (poll javobi HAM, POST/PATCH javobi HAM)
// navbatni oldinga suradi va undan oldin yo'lda qolgan javob TASHLANADI.
// Farq (yaxshi tomonga): ilgari navbat raqami so'rov YUBORILISHIDAN oldin
// olinardi, shu sabab "+" bosilgandan keyin tushgan poll PATCH javobini
// bekor qilardi — ya'ni yozuv natijasi o'rniga eskiroq GET ko'rinardi.
// Endi yozuv javobi (server tasdiqlagan ENG YANGI holat) ustun turadi va
// yo'ldagi poll tashlanadi.
//
// Yordamchi ustiga ikkita himoya qo'shadi: ma'lumot o'zgarmagan bo'lsa DOM'ga
// UMUMAN tegilmaydi (poll aynan `mousedown`/`mouseup` orasida "+" tugmasini
// DOM'dan olib tashlab, bosishni yutib qo'ymaydi) va poll xatosi ekrandagi
// buyurtmani o'chirmaydi.

// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
async function loadTableName() {
  try {
    const tables = await api('/waiter/tables');
    const t = tables.find((x) => String(x.id) === String(TABLE_ID));
    if (t) document.getElementById('tableTitle').textContent = t.name;
  } catch (e) { /* jim */ }
}

// Menyu yuklash — renderList() orqali (2026-09-10).
// Tarix: ilgari `await api('/waiter/menu')` himoyasiz turardi va bir marta
// chaqirilardi — tarmoq bir soniyaga uzilsa menyu ABADIY bo'sh qolardi.
// Endi xato holati va "Qayta urinish" renderList()dan keladi.
//
// X-19 (2026-09-10): menyu davriy (MENU_REFRESH_MS) yangilanadi. NEGA: 19:00
// da ochilgan ekran 21:00 da ham osh "bor" deb ko'rsatardi — admin uni
// "Tugadi" qilgan bo'lsa ham afitsiant mijozga "bor" derdi. renderList
// ma'lumot o'zgarmasa DOM'ga TEGMAYDI, ya'ni har daqiqalik so'rov scroll'ni
// ham, aynan shu payt bosilayotgan "+"ni ham buzmaydi; o'zgargan bo'lsa esa
// joriy bo'lim / qidiruv / ochilgan "Turlari" holati bilan qayta chiziladi.
const MENU_REFRESH_MS = 60000;
let menuSearchQuery = ''; // normalizeSearchText() qilingan (app.js)
let menuSearchCtl = null;
let menuTabsSig = null;

async function loadMenu(isPoll) {
  await renderList({
    box: 'menuBox',
    isPoll,
    load: () => api('/waiter/menu'),
    onData: (cats) => {
      menuCategories = Array.isArray(cats) ? cats : [];
      if (!menuCategories.some((c) => c.id === activeCategoryId)) {
        activeCategoryId = menuCategories.length ? menuCategories[0].id : null;
      }
      renderCatTabs();
    },
    empty: "Menyu hali bo'sh.",
    emptyHint: "Administrator admin panelda (Menyu) taom qo'shishi kerak.",
    render: menuItemsHtml,
    bind: bindMenuItems,
  });
}

// Bo'lim tablari. Ro'yxat (id + nom) o'zgarmagan bo'lsa tugmalar QAYTA
// YARATILMAYDI — faqat `.active` almashadi (onData har poll'da chaqiriladi;
// tabni bosayotgan barmoq ostidan tugma olib tashlanmasin).
function renderCatTabs() {
  const tabs = document.getElementById('catTabs');
  const sig = JSON.stringify(menuCategories.map((c) => [c.id, c.name]));
  if (sig !== menuTabsSig) {
    menuTabsSig = sig;
    tabs.innerHTML = menuCategories.map((c) => `
      <button type="button" data-cat="${c.id}">${escapeHtml(c.name)}</button>
    `).join('');
    tabs.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategoryId = Number(btn.dataset.cat);
        // Qidiruv paytida tab bosilsa — qidiruv tozalanadi va shu bo'lim
        // ochiladi (onFilter qayta chizadi).
        if (menuSearchQuery && menuSearchCtl) {
          menuSearchCtl.clear();
          return;
        }
        renderCatTabs();
        renderMenuItems();
      });
    });
  }
  // X-22: qidiruv paytida bironta bo'lim "tanlangan" ko'rinmaydi — natija
  // BARCHA bo'limlardan.
  tabs.querySelectorAll('button').forEach((btn) => {
    const on = !menuSearchQuery && Number(btn.dataset.cat) === activeCategoryId;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

// Taom "turi" (variant, 2026-09-09) — asosiy taom har doim ko'rinadi, agar
// unga bog'liq turlari (masalan "Osh" -> "Qovurma osh", "To'y oshi") bo'lsa
// pastida "Turlari (N)" tugmasi chiqadi; bosilsa o'sha turlar ham (o'z narxi
// bilan, alohida buyurtma qilinadigan taom sifatida) ochiladi.
let expandedVariantIds = new Set();

// D-H4 (2026-09-10): 30 ta bir xil "+" tugmasi ekran o'qiruvchida "plus,
// tugma" deb o'qilardi — qaysi taomga tegishli ekani aytilmasdi.
// D-H10: taom nomi/narxi (.mi-info) bosiladigan <div> edi — klaviatura bilan
// ochib bo'lmasdi; endi role="button" + tabindex, Enter/Space (bindMenuItems).
// D-H9: rasm bezak — nomi yonida matn bilan turibdi, shuning uchun alt="".
function renderMenuItemRow(it) {
  const label = escapeHtml(it.volume ? `${it.name} (${it.volume})` : it.name);
  return `
    <div class="menu-item-row${it.is_available ? '' : ' unavailable'}">
      <div class="mi-info" data-info="${it.id}" role="button" tabindex="0" aria-haspopup="dialog">
        ${it.image_url ? `<img src="${escapeHtml(it.image_url)}" class="mi-image" alt="">` : ''}
        <div class="mi-name">${escapeHtml(it.name)}${it.volume ? ` <span class="mi-volume">(${escapeHtml(it.volume)})</span>` : ''}${it.is_available ? '' : ' <span class="badge low">Tugadi</span>'}</div>
        <div class="mi-price">${fmtMoney(it.price)}</div>
      </div>
      ${it.is_available
        ? `<button type="button" class="btn add" data-add="${it.id}" aria-label="«${label}» qo'shish">+</button>`
        : `<button type="button" class="btn add" disabled aria-label="«${label}» tugagan">—</button>`}
    </div>
  `;
}

// Menyu qutisining ichi (renderList `render`i va bo'lim/qidiruv/"Turlari"
// o'zgarganda to'g'ridan-to'g'ri chizish uchun — ikkalasi ham shu yerdan).
// #menuItems (2 ustunli grid, style.css) shu yerda yaratiladi: bo'sh holat
// esa uning TASHQARISIDA — gridning bitta katagiga siqilib qolmasin.
function menuItemsHtml() {
  if (menuSearchQuery) {
    // X-22 (2026-09-10): qidiruv BARCHA bo'limlar va turlar (variant) bo'ylab,
    // apostrofga befarq ("lagmon" -> "Lag'mon", app.js matchesSearch()).
    const hits = [];
    menuCategories.forEach((c) => c.items.forEach((it) => {
      [it].concat(it.variants || []).forEach((x) => {
        if (matchesSearch(`${x.name} ${x.volume || ''}`, menuSearchQuery)) hits.push(x);
      });
    }));
    if (hits.length === 0) {
      const raw = document.getElementById('menuSearch').value.trim();
      return `<div class="empty-state"><div>«${escapeHtml(raw)}» bo'yicha taom topilmadi.</div>
        <div class="empty-hint">Boshqacha yozib ko'ring yoki qidiruvni tozalab bo'limdan tanlang.</div></div>`;
    }
    return `<div id="menuItems">${hits.map((x) => renderMenuItemRow(x)).join('')}</div>`;
  }
  const cat = menuCategories.find((c) => c.id === activeCategoryId);
  if (!cat || cat.items.length === 0) {
    return '<div class="empty-state"><div>Bu bo\'limda taom yo\'q.</div></div>';
  }
  return `<div id="menuItems">${cat.items.map((it) => {
    const hasVariants = it.variants && it.variants.length > 0;
    const expanded = expandedVariantIds.has(it.id);
    let html = renderMenuItemRow(it);
    if (hasVariants) {
      html += `<button type="button" class="btn small menu-variants-toggle" data-toggle-variants="${it.id}" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? 'Turlarini yashirish' : `Turlari (${it.variants.length})`}</button>`;
      if (expanded) {
        html += `<div class="menu-item-variants-wrap">${it.variants.map((v) => renderMenuItemRow(v)).join('')}</div>`;
      }
    }
    return html;
  }).join('')}</div>`;
}

function renderMenuItems() {
  const box = document.getElementById('menuBox');
  box.innerHTML = menuItemsHtml();
  bindMenuItems(box);
}

function bindMenuItems(box) {
  box.querySelectorAll('[data-add]').forEach((btn) => {
    // withBusy — tugma so'rov davomida bloklanadi (2026-09-10): ilgari "+"
    // ni tez ikki marta bosish ikkita POST yuborardi va taom ikki marta
    // qo'shilardi.
    btn.addEventListener('click', () => addItem(Number(btn.dataset.add), btn));
  });
  // Taom nomi/narxi ustiga (+ tugmasi emas) bosilsa — tavsifini ko'rsatadi.
  // Tavsifni admin panelida (Menyu > taomni tahrirlash > "Tavsif" maydoni) kiritadi.
  box.querySelectorAll('[data-info]').forEach((el) => {
    onActivate(el, () => showItemInfo(Number(el.dataset.info)));
  });
  box.querySelectorAll('[data-toggle-variants]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.toggleVariants);
      if (expandedVariantIds.has(id)) expandedVariantIds.delete(id); else expandedVariantIds.add(id);
      renderMenuItems();
    });
  });
}

// X-22 (2026-09-10): BARCHA bo'limlardan qidiriladi — qidiruv natijasida
// boshqa bo'limdagi taom ham chiqadi (ilgari faqat faol bo'lim).
function findMenuItem(menuItemId) {
  for (const cat of menuCategories) {
    for (const it of cat.items) {
      if (it.id === menuItemId) return it;
      const v = it.variants && it.variants.find((x) => x.id === menuItemId);
      if (v) return v;
    }
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
    try {
      const view = await api(`/waiter/tables/${TABLE_ID}/items`, { method: 'POST', body: { menu_item_id: menuItemId, quantity: 1 } });
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
  await applyItemQty(itemId, currentQty + delta, btn);
}

// Qatorning miqdorini ABSOLYUT qiymatga o'rnatadi (0 va undan kam — qator
// bekor qilinadi). "+"/"−" (changeQty) ham, tez tanlash oynasi (X-05) ham
// shu yagona yo'l orqali — bloklash qoidasi ikki joyda takrorlanmasin.
async function applyItemQty(itemId, nextQty, btn) {
  // Bitta qatordagi boshqa tugmalar (+/−/miqdor) ham bloklanadi — aks holda
  // "+" so'rovi ketayotganda "−" bosilib xuddi shu eski `data-qty` dan hisoblanardi.
  const stepper = btn ? btn.closest('.qty-stepper') : null;
  const others = stepper ? Array.from(stepper.querySelectorAll('button')).filter((b) => b !== btn) : [];
  others.forEach((b) => { b.disabled = true; });
  try {
    await withBusy(btn, async () => {
      try {
        let view;
        if (nextQty <= 0) {
          view = await api(`/waiter/items/${itemId}`, { method: 'DELETE' });
        } else {
          view = await api(`/waiter/items/${itemId}`, { method: 'PATCH', body: { quantity: nextQty } });
        }
        renderOrder(view);
        // 2026-09-11: oshxonaga YUBORILGAN qatorga miqdor qo'shilsa, server
        // qo'shimchani alohida "Yuborilmagan" qator qiladi (services/orders.js
        // updateOrderItemQuantity izohi) — bu qatorning raqami o'zgarmaydi.
        // Afitsiant "+" ishlamadi deb qayta bosmasin: nima bo'lganini aytamiz.
        const row = nextQty > 0 && view && view.items.find((x) => x.id === itemId);
        if (row && row.quantity !== nextQty) {
          toast(`Qo'shimcha ${nextQty - row.quantity} ta alohida qator bo'ldi — uni oshxonaga yuboring.`);
        }
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } finally {
    others.forEach((b) => { b.disabled = false; });
  }
}

// ── X-05 (2026-09-10): miqdorni tez tanlash ───────────────────────────────
// NEGA: 12 kishilik to'y stoliga "Osh ×12" = 11 marta "+" = 11 ta HTTP so'rovi
// (sekin Wi-Fi'da ~20 soniya), har bosish oldingisi tugashini kutadi (yuqoridagi
// bloklash). Endi qatordagi miqdor raqamiga bosilsa kichik oyna: tayyor
// chiplar yoki istalgan son — BITTA PATCH so'rovi, xuddi shu applyItemQty()
// orqali (bloklash va renderList navbati o'zgarmaydi).
const QTY_PRESETS = [1, 2, 3, 5, 10];
let qtyPickerTarget = null; // { itemId, current, btn }

function ensureQtyPicker() {
  let el = document.getElementById('qtyPickModal');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'qtyPickModal';
  el.className = 'modal-backdrop hidden';
  el.innerHTML = `
    <div class="modal">
      <h2 id="qtyPickTitle">Miqdor</h2>
      <div class="chip-row" id="qtyPickChips" role="group" aria-label="Tayyor miqdorlar">
        ${QTY_PRESETS.map((n) => `<button type="button" class="chip" data-qty-preset="${n}" aria-pressed="false">${n}</button>`).join('')}
      </div>
      <form id="qtyPickForm" class="form-grid" novalidate>
        <div class="field">
          <label for="qtyPickInput">Boshqa son</label>
          <input type="number" id="qtyPickInput" min="1" step="1" inputmode="numeric" enterkeyhint="done">
        </div>
      </form>
      <div class="modal-actions">
        <button type="button" class="btn" id="qtyPickCancel">Bekor</button>
        <button type="submit" class="btn primary" form="qtyPickForm">Saqlash</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector('#qtyPickCancel').addEventListener('click', () => closeDialog(el, 'cancel'));
  el.querySelector('#qtyPickChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-qty-preset]');
    if (chip) submitQtyPick(Number(chip.dataset.qtyPreset));
  });
  el.querySelector('#qtyPickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = el.querySelector('#qtyPickInput');
    const qty = Number(input.value);
    // Yuqori chegara (1000) serverda (validation.js MAX_QUANTITY) — o'z
    // tushunarli xatosini qaytaradi, bu yerda takrorlanmaydi.
    if (!Number.isSafeInteger(qty) || qty < 1) {
      setFieldError(input, "1 yoki undan katta butun son kiriting");
      return;
    }
    submitQtyPick(qty);
  });
  return el;
}

function openQtyPicker(btn) {
  const el = ensureQtyPicker();
  const current = Number(btn.dataset.qty);
  qtyPickerTarget = { itemId: Number(btn.dataset.qtyPick), current, btn };
  el.querySelector('#qtyPickTitle').textContent = `«${btn.dataset.name}» — miqdor`;
  el.querySelectorAll('[data-qty-preset]').forEach((c) => {
    const on = Number(c.dataset.qtyPreset) === current;
    c.classList.toggle('active', on);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const input = el.querySelector('#qtyPickInput');
  clearFieldErrors(el);
  input.value = String(current);
  openDialog(el, { onClose: () => { qtyPickerTarget = null; } });
}

async function submitQtyPick(qty) {
  const target = qtyPickerTarget;
  closeDialog('qtyPickModal', 'ok'); // onClose qtyPickerTarget'ni tozalaydi
  if (!target || qty === target.current) return;
  // Tugma renderList qayta chizganda DOM'dan tushib qolgan bo'lishi mumkin —
  // unda shu qatorning hozirgi tugmasi olinadi (bloklash to'g'ri ishlasin).
  const btn = document.contains(target.btn)
    ? target.btn
    : document.querySelector(`[data-qty-pick="${target.itemId}"]`);
  await applyItemQty(target.itemId, qty, btn);
}

// Buyurtma qatorlari #orderLines ichida, lekin jami summa va uchta tugma
// undan TASHQARIDA — shu sabab renderList()ning ikki qo'li ishlatiladi:
// `render` faqat quti ichini beradi, quti tashqarisidagi boshqaruvlar esa
// `onData` da yangilanadi (ma'lumot o'zgarmagan, ya'ni quti qayta
// chizilmagan holatda ham bir xil qiymatga qo'yiladi — bu zararsiz).
function orderLinesHtml(view) {
  if (!view) {
    return '<p class="dim">Hozircha buyurtma yo\'q — pastdagi menyudan taom tanlang.</p>';
  }
  if (view.items.length === 0) {
    // Buyurtma ochiq turibdi, lekin qo'shilgan taomlarning hammasi bekor qilingan.
    // closeTable() bunday holatda kamida bitta faol taom talab qilib rad etadi
    // (bo'sh chek chiqmasin uchun) — shu sabab stolni bo'shatishning yagona yo'li
    // "Bekor qilish" (cancel-order) bo'ladi, "Hisob-kitob" bu holatda yashiriladi.
    return '<p class="dim">Barcha taomlar bekor qilindi. Stolni bo\'shatish uchun "Bekor qilish" tugmasini bosing.</p>';
  }
  return view.items.map((it) => {
    const name = escapeHtml(it.name_snapshot);
    return `
    <div class="order-line">
      <div>
        <div class="ol-name">${name} ${orderLineStatusHtml(it)}</div>
        <div class="ol-meta">${escapeHtml(it.added_by_name)} · ${fmtMoney(it.unit_price)}/dona</div>
      </div>
      <div class="qty-stepper">
        <button type="button" data-dec="${it.id}" data-qty="${it.quantity}" aria-label="«${name}» miqdorini kamaytirish">−</button>
        <button type="button" class="qty-val" data-qty-pick="${it.id}" data-qty="${it.quantity}" data-name="${name}" aria-haspopup="dialog" aria-label="«${name}»: ${it.quantity} ta. Miqdorni tanlash">${it.quantity}</button>
        <button type="button" data-inc="${it.id}" data-qty="${it.quantity}" aria-label="«${name}» miqdorini oshirish">+</button>
      </div>
      <div class="ol-subtotal">${fmtMoney(it.subtotal)}</div>
    </div>
  `;
  }).join('');
}

// X-07 (2026-09-10): qator holati — ilgari faqat "Kutilmoqda" (yuborilmagan)
// va HECH NARSA edi, ya'ni "oshxonada tayyorlanmoqda" bilan "TAYYOR" bir xil
// ko'rinardi va afitsiant oshxonaga borib so'rardi (`ready_at` javobda bor
// edi, ishlatilmasdi). Endi uch holat:
//   yuborilmagan  — "Yuborilmagan" (sariq; "Kutilmoqda" oshxonani kutish deb
//                   o'qilardi — tayyorlanayotgan taom bilan adashardi);
//   oshxonada     — "⏱ 12 daq" (yuborilganidan beri; 15/25 daqiqada rang
//                   o'zgaradi, matnni refreshElapsed() o'zi yangilaydi);
//   tayyor        — "✅ Tayyor" (.status-ready).
function orderLineStatusHtml(it) {
  if (!it.sent_at) return '<span class="badge debt">Yuborilmagan</span>';
  if (it.ready_at) return '<span class="status-ready">✅ Tayyor</span>';
  return `<span class="sr-only">Oshxonada:</span>${waitBadgeHtml(it.sent_at)}`;
}

// Quti TASHQARISIDAGI boshqaruvlar: jami summa, "Oshxonaga yuborish",
// "Hisob-kitob", "Bekor qilish".
function applyOrderControls(view) {
  const totalEl = document.getElementById('totalAmount');
  const sendBtn = document.getElementById('sendBtn');
  const closeBtn = document.getElementById('closeBtn');
  const cancelOrderBtn = document.getElementById('cancelOrderBtn');

  // Ko'rinish `.hidden` klassi bilan (inline style.display emas — X-28).
  const show = (btn, on) => btn.classList.toggle('hidden', !on);

  if (!view) {
    totalEl.textContent = fmtMoney(0);
    show(sendBtn, false);
    // NEGA yashirin (2026-09-10): stol bo'sh bo'lsa "Hisob-kitob" tugmasi
    // ko'rinib turardi va bosilganda server `404 "Bu stolda ochiq buyurtma
    // yo'q"` qaytarardi — afitsiant nima noto'g'ri bo'lganini tushunmasdi.
    // Kassir ekranida (kassir/order.js) xuddi shu holat allaqachon
    // yashiriladi, endi afitsiantda ham shunday.
    show(closeBtn, false);
    show(cancelOrderBtn, false);
    return;
  }

  if (view.items.length === 0) {
    totalEl.textContent = fmtMoney(0);
    show(sendBtn, false);
    show(closeBtn, false);
    show(cancelOrderBtn, true);
    return;
  }

  totalEl.textContent = fmtMoney(view.total);
  show(cancelOrderBtn, false);

  // X-14 (2026-09-10): pastki panelda BIR VAQTDA FAQAT BITTA amal.
  // Hali oshpazga yuborilmagan (sent_at yo'q) taom bo'lsa — "Oshxonaga
  // yuborish" (shular soni bilan), "Hisob-kitob" yashirin; hammasi
  // yuborilgach — faqat "Hisob-kitob". NEGA: "xavfli tugmalar birga
  // ko'rinmaydi" tamoyili (UI-UX-TAHLIL 3.2) saqlanadi — barmoq zonasidagi
  // tugma doim "keyingi to'g'ri qadam", stolni yopadigan amal esa oshxonaga
  // yuborilmagan taom qolganda bosilmaydi (ilgari yuborishni unutib stolni
  // yopish mumkin edi — o'sha taom hech qachon tayyorlanmasdi).
  const pendingCount = view.items.filter((it) => !it.sent_at).length;
  if (pendingCount > 0) {
    sendBtn.textContent = `🍽️ Oshxonaga yuborish (${pendingCount})`;
    show(sendBtn, true);
    show(closeBtn, false);
  } else {
    show(sendBtn, false);
    show(closeBtn, true);
  }
}

function bindOrderLines(box) {
  box.querySelectorAll('[data-dec]').forEach((btn) => {
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.dec), -1, Number(btn.dataset.qty), btn));
  });
  box.querySelectorAll('[data-inc]').forEach((btn) => {
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.inc), 1, Number(btn.dataset.qty), btn));
  });
  box.querySelectorAll('[data-qty-pick]').forEach((btn) => {
    btn.addEventListener('click', () => openQtyPicker(btn));
  });
}

// `isEmpty: () => false` — bo'sh holatlar (buyurtma yo'q / hamma taom bekor
// qilingan) har biri O'Z matni va O'Z tugma holatiga ega, shu sabab
// renderList()ning standart "bo'sh ro'yxat" tarmog'i ishlatilmaydi.
function orderRenderOptions(extra) {
  return Object.assign({
    box: 'orderLines',
    isEmpty: () => false,
    onData: applyOrderControls,
    render: orderLinesHtml,
    bind: bindOrderLines,
  }, extra);
}

// Allaqachon olingan ko'rinishni (POST/PATCH javobi) so'rovsiz chizadi.
// renderList() `load` bo'lmasa `await` qilmaydi — ya'ni DOM shu yerda
// SINXRON yangilanadi, avvalgi renderOrder() kabi.
function renderOrder(view) {
  renderList(orderRenderOptions({ data: view }));
}

async function sendToKitchen(btn) {
  await withBusy(btn, async () => {
    try {
      const view = await api(`/waiter/tables/${TABLE_ID}/send`, { method: 'POST' });
      renderOrder(view);
      toast('Oshxonaga yuborildi');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// `isPoll: true` — bu ekranda xato HAR DOIM faqat toast bo'lgan (buyurtma
// qatorlari o'rniga xato matni CHIQMAGAN), shu xulq saqlab qolindi; ustiga
// endi bir xil xato har 8 soniyada qayta toast qilinmaydi.
async function loadOrder() {
  await renderList(orderRenderOptions({
    isPoll: true,
    load: () => api(`/waiter/tables/${TABLE_ID}/order`),
  }));
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
      // Masalan 409: boshqa afitsiant hozirgina yuborilmagan taom qo'shgan —
      // ekran darhol yangilanib "Oshxonaga yuborish" tugmasi chiqsin.
      loadOrder();
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
  setInterval(() => loadMenu(true), MENU_REFRESH_MS); // X-19
  menuSearchCtl = attachSearch('menuSearch', {
    onFilter: (q) => {
      menuSearchQuery = q;
      renderCatTabs();
      // Menyu hali yuklanmagan / xato holatida qutiga tegilmaydi.
      if (menuCategories.length) renderMenuItems();
    },
  });
  // X-24 (2026-09-10): telefon qulflanib yoki boshqa ilovadan qaytilganda
  // setInterval'lar to'xtab turgan bo'ladi — buyurtma, menyu va "Tayyor"
  // xabarlari darhol yangilanadi (8/60/10 soniya kutmasdan).
  onVisible(() => {
    loadOrder();
    loadMenu(true);
    pollWaiterNotifications();
  });
});
