// Po'lat landing — header scroll holati, mobil menyu, dinamik menyu + savat + bron oynasi.
//
// Bu fayl ilovadan (public/app.js) BUTUNLAY mustaqil — o'z escapeHtml(),
// o'z yordamchilari bor. app.js ulanmaydi.

function fmtSom(n) {
  return Math.round(Number(n) || 0).toLocaleString('uz-UZ') + " so'm";
}

document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('siteHeader');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  const navClose = document.getElementById('navClose');

  // Bitta taomdan savatda ko'pi bilan nechta — server ham shu chegarani
  // tekshiradi (services/customerOrders.js: quantity > 50 -> xato).
  const MAX_QTY = 50;
  // NEGA (L-15, 2026-09-10): telefon tekshiruvi server bilan AYNAN BIR XIL
  // (≥7 raqam, ≤30 belgi — customerOrders.js / publicReservations.js).
  // Klient serverdan qat'iyroq bo'lsa, server qabul qiladigan raqamni
  // (masalan qisqa shahar raqami) mijoz yubora olmay qolardi.
  const PHONE_MIN_DIGITS = 7;
  const PHONE_MAX_LEN = 30;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ============ Umumiy: fokus, scroll qulfi, e'lonlar ============

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

  function isShown(el) {
    return !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function focusableIn(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => {
      // Radio guruhida Tab faqat tanlangan radioga tushadi — tuzoq chegarasini
      // hisoblashda tanlanmaganlarini tashlab ketamiz.
      if (el.type === 'radio' && !el.checked) return false;
      return isShown(el);
    });
  }

  // NEGA (L-34, 2026-09-10): fokus tuzog'i — ochiq modal (yoki mobil menyu)
  // ichida Tab/Shift+Tab aylanadi, orqadagi sahifaga chiqib ketmaydi.
  function trapTab(e, root) {
    const els = focusableIn(root);
    if (els.length === 0) { e.preventDefault(); return; }
    const first = els[0];
    const last = els[els.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !root.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  // NEGA (L-19, 2026-09-10): mobil menyu ochilganda orqadagi sahifa aylanib
  // ketardi. Menyu va ikkala modal bitta qulfni baham ko'radi — biri
  // yopilganda boshqasi hali ochiq bo'lsa qulf yechilmaydi.
  const openLayers = new Set();
  function setLayerOpen(name, open) {
    if (open) openLayers.add(name); else openLayers.delete(name);
    document.body.style.overflow = openLayers.size > 0 ? 'hidden' : '';
  }

  const liveRegion = document.getElementById('liveRegion');
  function announce(msg) {
    // Bir xil matn ketma-ket kelsa ham e'lon qilinishi uchun avval tozalaymiz.
    liveRegion.textContent = '';
    setTimeout(() => { liveRegion.textContent = msg; }, 30);
  }

  const toastEl = document.getElementById('siteToast');
  let toastTimer = null;
  function hideToast() {
    toastEl.classList.remove('show');
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  function showToast(msg) {
    toastEl.innerHTML = `<p>${escapeHtml(msg)}</p><button type="button" class="site-toast-close" aria-label="Xabarni yopish"><span aria-hidden="true">&times;</span></button>`;
    toastEl.classList.add('show');
    announce(msg);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 10000);
  }
  toastEl.addEventListener('click', (e) => {
    if (e.target.closest('.site-toast-close')) hideToast();
  });

  // Touch qurilmada modal ochilishi bilan inputga fokus berilsa, klaviatura
  // darhol chiqib savat xulosasini yopib qo'yadi — u yerda sarlavhaga
  // fokus beramiz (ekran o'qiruvchi baribir oyna nomini o'qiydi).
  const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  // NEGA (L-34, 2026-09-10): ikkala modal uchun umumiy boshqaruv — ochilganda
  // fokus ichkariga ko'chadi, yopilganda chaqirgan tugmaga qaytadi.
  function makeDialog(backdropEl, layerName) {
    const modal = backdropEl.querySelector('.book-modal');
    let returnFocus = null;
    const dialog = {
      modal,
      isOpen: () => backdropEl.classList.contains('open'),
      open(focusEl) {
        returnFocus = document.activeElement;
        backdropEl.classList.add('open');
        setLayerOpen(layerName, true);
        modal.scrollTop = 0;
        if (focusEl) focusEl.focus();
      },
      close() {
        if (!dialog.isOpen()) return;
        backdropEl.classList.remove('open');
        setLayerOpen(layerName, false);
        const target = returnFocus;
        returnFocus = null;
        if (!target || target === document.body) return;
        if (isShown(target)) target.focus();
        else {
          // Chaqirgan tugma endi yo'q (masalan buyurtmadan keyin savat paneli
          // yashirindi) — fokus sahifa boshiga emas, menyuga tushsin.
          const fallback = document.getElementById('menuTitle');
          if (fallback) fallback.focus({ preventScroll: true });
        }
      },
    };
    backdropEl.addEventListener('click', (e) => {
      if (e.target === backdropEl) dialog.close();
    });
    return dialog;
  }

  // ============ Header ============

  const onScroll = () => {
    if (window.scrollY > 40) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // ============ Mobil hamburger menyu ============
  // NEGA (L-39 + L-18 + L-19 + D-H7, 2026-09-10): aria-expanded, yagona
  // yopish tugmasi (#navClose), scroll qulfi, fokus menyu ichida aylanadi,
  // yopilgach gamburgerga qaytadi. Yopiq menyu CSS'da visibility:hidden.
  const isNavOpen = () => navLinks.classList.contains('open');

  function openNav() {
    navLinks.classList.add('open');
    header.classList.add('nav-open');
    navToggle.setAttribute('aria-expanded', 'true');
    setLayerOpen('nav', true);
    if (navClose) navClose.focus();
  }
  function closeNav(opts) {
    if (!isNavOpen()) return;
    navLinks.classList.remove('open');
    header.classList.remove('nav-open');
    navToggle.setAttribute('aria-expanded', 'false');
    setLayerOpen('nav', false);
    if (!opts || opts.restoreFocus !== false) navToggle.focus();
  }
  navToggle.addEventListener('click', () => {
    if (isNavOpen()) closeNav(); else openNav();
  });
  if (navClose) navClose.addEventListener('click', () => closeNav());
  navLinks.querySelectorAll('a').forEach((a) => {
    // Havola bosilganda brauzer o'zi fokus/scroll'ni nishonga ko'chiradi.
    a.addEventListener('click', () => closeNav({ restoreFocus: false }));
  });
  // Ekran kengayib desktop rejimiga o'tsa (planshetni burish) — ochiq qolgan
  // mobil menyu scroll qulfini ushlab qolmasin.
  const desktopMq = window.matchMedia ? window.matchMedia('(min-width: 1041px)') : null;
  if (desktopMq) {
    const onMq = (e) => { if (e.matches) closeNav({ restoreFocus: false }); };
    if (desktopMq.addEventListener) desktopMq.addEventListener('change', onMq);
    else if (desktopMq.addListener) desktopMq.addListener(onMq);
  }

  // ============ Maydon xatolari (L-14) ============
  // NEGA (L-14, 2026-09-10): xato endi aybdor maydon ostida chiqadi, maydon
  // aria-invalid + qizil ramka oladi, birinchi xatoli maydonga fokus beriladi.
  // Server xatolari (masalan rate-limit) avvalgidek forma ostidagi umumiy
  // #bkError / #coError (role="alert") ga yoziladi.

  function setFieldError(input, msg) {
    const errId = `${input.id}Err`;
    let err = document.getElementById(errId);
    if (!err) {
      err = document.createElement('p');
      err.className = 'field-error';
      err.id = errId;
      input.insertAdjacentElement('afterend', err);
    }
    err.textContent = msg;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errId);
  }
  function clearFieldError(input) {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    const err = document.getElementById(`${input.id}Err`);
    if (err) err.remove();
  }
  function clearFormErrors(formEl) {
    formEl.querySelectorAll('[aria-invalid="true"]').forEach(clearFieldError);
  }
  // errors: [{ input, msg }] — hammasini belgilaydi, birinchisiga fokus.
  function showFieldErrors(errors) {
    errors.forEach(({ input, msg }) => setFieldError(input, msg));
    if (errors.length > 0) errors[0].input.focus();
    return errors.length > 0;
  }
  function watchFieldErrors(formEl) {
    const onEdit = (e) => {
      if (e.target.getAttribute && e.target.getAttribute('aria-invalid') === 'true') clearFieldError(e.target);
    };
    formEl.addEventListener('input', onEdit);
    formEl.addEventListener('change', onEdit);
  }

  function phoneError(v) {
    if (!v) return 'Telefon raqamingizni kiriting';
    if (v.replace(/\D/g, '').length < PHONE_MIN_DIGITS) return "Telefon raqamini to'liq kiriting, masalan: +998 90 123 45 67";
    if (v.length > PHONE_MAX_LEN) return 'Telefon raqami juda uzun';
    return '';
  }

  function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Hozirgi vaqt "HH:MM" ko'rinishida — <input type="time"> qiymati bilan
  // to'g'ridan-to'g'ri (matn sifatida) solishtirish uchun mos.
  function nowHHMM() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ============ Stol bron qilish oynasi (modal) ============
  const backdrop = document.getElementById('bookBackdrop');
  const modalClose = document.getElementById('bookModalClose');
  const form = document.getElementById('bookForm');
  const formWrap = document.getElementById('bookFormWrap');
  const bookTitle = document.getElementById('bookTitle');
  const successBox = document.getElementById('bookSuccess');
  const successText = document.getElementById('bookSuccessText');
  const successClose = document.getElementById('bookSuccessClose');
  const errorBox = document.getElementById('bkError');
  const submitBtn = document.getElementById('bkSubmit');
  const bkName = document.getElementById('bkName');
  const bkPhone = document.getElementById('bkPhone');
  const dateInput = document.getElementById('bkDate');
  const timeInput = document.getElementById('bkTime');
  const bkGuests = document.getElementById('bkGuests');
  const bkNote = document.getElementById('bkNote');

  const bookDialog = makeDialog(backdrop, 'book');

  if (dateInput) dateInput.min = todayISO();

  // NEGA (2026-09-10): `dateInput.min` faqat O'TGAN SANANI to'sardi — bugungi
  // sana tanlanganda esa allaqachon o'tib ketgan soatni (masalan kechqurun
  // soat 21:00 da "bugun 09:00") bemalol yuborish mumkin edi. Bunday bron
  // qabul qilinardi va administrator paneliga "o'tmishdagi" bron sifatida
  // tushardi. Endi sana bugungi bo'lsa vaqt hozirgi vaqtdan keyin bo'lishi
  // shart (brauzer o'zi ham `min` orqali to'sadi, lekin yuborishdagi
  // tekshiruv asosiysi — `min` chetlab o'tilishi mumkin).
  function syncTimeMin() {
    if (!dateInput || !timeInput) return;
    if (dateInput.value === todayISO()) {
      timeInput.min = nowHHMM();
      if (timeInput.value && timeInput.value < timeInput.min) timeInput.value = '';
    } else {
      timeInput.removeAttribute('min');
    }
  }
  if (dateInput) dateInput.addEventListener('change', syncTimeMin);

  function openBookModal() {
    if (dateInput) dateInput.min = todayISO(); // yarim tunda sahifa ochiq qolgan bo'lishi mumkin
    syncTimeMin();
    formWrap.classList.remove('hidden');
    successBox.classList.add('hidden');
    errorBox.textContent = '';
    clearFormErrors(form);
    bookDialog.open(coarsePointer ? bookTitle : bkName);
  }

  document.querySelectorAll('[data-book]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openBookModal();
    });
  });
  modalClose.addEventListener('click', () => bookDialog.close());
  successClose.addEventListener('click', () => bookDialog.close());
  watchFieldErrors(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    clearFormErrors(form);

    const full_name = bkName.value.trim();
    const phone = bkPhone.value.trim();
    const res_date = dateInput.value;
    const res_time = timeInput.value;
    const party_size = Number(bkGuests.value);
    const note = bkNote.value.trim();

    const errors = [];
    if (!full_name) errors.push({ input: bkName, msg: 'Ismingizni kiriting' });
    const pErr = phoneError(phone);
    if (pErr) errors.push({ input: bkPhone, msg: pErr });
    if (!res_date) errors.push({ input: dateInput, msg: 'Sanani tanlang' });
    else if (res_date < todayISO()) errors.push({ input: dateInput, msg: "O'tgan sanaga bron qilib bo'lmaydi" });
    if (!res_time) errors.push({ input: timeInput, msg: 'Vaqtni tanlang' });
    else if (res_date === todayISO() && res_time <= nowHHMM()) {
      errors.push({ input: timeInput, msg: "Bugungi kun uchun o'tib ketgan vaqtni tanlab bo'lmaydi" });
    }
    if (!Number.isFinite(party_size) || party_size <= 0 || party_size > 50) {
      errors.push({ input: bkGuests, msg: "Kishilar sonini to'g'ri kiriting (1–50)" });
    }
    if (showFieldErrors(errors)) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Yuborilmoqda...';
    try {
      const res = await fetch('../api/public/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, phone, res_date, res_time, party_size, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring");

      successText.textContent = `Hurmatli ${full_name}, bron so'rovingiz qabul qilindi. Tez orada siz bilan bog'lanamiz.`;
      formWrap.classList.add('hidden');
      successBox.classList.remove('hidden');
      successBox.focus();
      form.reset();
      if (dateInput) dateInput.min = todayISO();
      syncTimeMin();
    } catch (err) {
      errorBox.textContent = err.message || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Bron qilish';
    }
  });

  // ============ Dinamik menyu (DB'dan) + savat/buyurtma ============
  const menuTabsEl = document.getElementById('menuTabs');
  const menuPanelsEl = document.getElementById('menuPanels');

  let itemsById = {}; // menu_item_id -> DB'dan kelgan taom obyekti (har yuklashda yangidan)
  // Map — qo'shilish tartibi saqlanadi (checkout xulosasi mijoz qo'shgan tartibda).
  const cart = new Map(); // menu_item_id -> { item, qty }
  let lastMenuCategories = null; // qayta so'rovsiz qayta chizish uchun (Turlari tugmasi)
  let activeCatId = null;
  // Taom "turi" (variant, 2026-09-09) — asosiy taom har doim ko'rinadi, agar
  // unga bog'liq turlari bo'lsa "Turlari (N)" tugmasi chiqadi; bosilsa o'sha
  // turlar ham (o'z narxi bilan, alohida savatga qo'shiladigan to'liq taom
  // sifatida) shu qator ostida ochiladi.
  const expandedLandingItems = new Set();

  // Rasm yo'q taom uchun placeholder harfi (L-21). Regex \p{L} ishlatilmadi —
  // eski brauzerda SyntaxError butun landing skriptini to'xtatib qo'yardi.
  function firstLetter(name) {
    for (const ch of String(name || '')) {
      if (ch.toLowerCase() !== ch.toUpperCase() || /[0-9]/.test(ch)) return ch.toUpperCase();
    }
    return '•';
  }

  function renderThumb(it) {
    const letter = escapeHtml(firstLetter(it.name));
    if (it.image_url) {
      return `<img src="${escapeHtml(it.image_url)}" class="menu-row-image" alt="" loading="lazy" data-initial="${letter}">`;
    }
    return `<span class="menu-row-thumb" aria-hidden="true">${letter}</span>`;
  }

  function qtyOf(id) {
    const entry = cart.get(id);
    return entry ? entry.qty : 0;
  }

  // NEGA (L-25, 2026-09-10): miqdor 0 da "−" ham ko'rinardi (ma'nosiz).
  // Endi 0 da faqat "+ Qo'shish", 1+ da "− N +". aria-label'da taom nomi
  // bor — 30 ta bir xil "+" tugmasi ekran o'qiruvchida farqlanadi.
  function qtyControlHtml(it) {
    const qty = qtyOf(it.id);
    const name = escapeHtml(it.name);
    if (qty === 0) {
      return `<button type="button" class="qty-add" data-act="inc" aria-label="${name} — savatga qo'shish"><span aria-hidden="true">+</span>Qo'shish</button>`;
    }
    return `
      <button type="button" class="qty-dec" data-act="dec" aria-label="${name} — bittaga kamaytirish">&minus;</button>
      <span class="qty-val">${qty}</span>
      <button type="button" class="qty-inc" data-act="inc" aria-label="${name} — bittaga ko'paytirish"${qty >= MAX_QTY ? ' disabled' : ''}>+</button>
    `;
  }

  // NEGA (L-23, 2026-09-10): turlari bor taomda asosiy qatorda faqat oddiy
  // variant narxi turardi — qimmatroq turlar yopiq tugma ortida bo'lib,
  // "35 000" butun taomning narxi deb o'qilardi. Endi yopiq holatda
  // "35 000 so'mdan" (asosiy + turlar ichidagi eng arzoni). Turlari
  // ochilganda har biri o'z narxi bilan ko'rinadi, shuning uchun asosiy
  // qator ham aniq narxiga qaytadi.
  function priceLabel(it, hasVariants, expanded) {
    if (!hasVariants || expanded) return fmtSom(it.price);
    const prices = [it, ...it.variants]
      .map((x) => Number(x.price))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (prices.length === 0) return fmtSom(it.price);
    return `${fmtSom(Math.min(...prices))}dan`;
  }

  function renderMenuRow(it, isVariant, extraHtml, priceText) {
    return `
      <div class="menu-row${it.is_available ? '' : ' menu-row-unavailable'}${isVariant ? ' menu-row-variant' : ''}">
        ${renderThumb(it)}
        <div class="menu-row-main">
          <h4>${escapeHtml(it.name)}${it.volume ? ` <span class="menu-row-volume">(${escapeHtml(it.volume)})</span>` : ''}${it.is_available ? '' : ' <span class="menu-row-badge">Tugadi</span>'}</h4>
          ${it.description ? `<p class="menu-row-desc">${escapeHtml(it.description)}</p>` : ''}
          <div class="menu-row-price">${priceText || fmtSom(it.price)}</div>
          ${extraHtml || ''}
        </div>
        ${it.is_available ? `<div class="menu-qty" data-id="${escapeHtml(it.id)}">${qtyControlHtml(it)}</div>` : ''}
      </div>
    `;
  }

  function renderMenu(categories) {
    if (categories) {
      lastMenuCategories = categories;
      // Yangi ma'lumot — eski taomlar (menyudan olib tashlanganlar) qolib
      // ketmasin, aks holda reconcileCart() ularni "hali bor" deb hisoblardi.
      itemsById = {};
    }
    categories = lastMenuCategories;
    if (!Array.isArray(categories) || categories.length === 0) {
      menuTabsEl.innerHTML = '';
      menuPanelsEl.innerHTML = '<p class="dim center">Hozircha menyu qo\'shilmagan. Tez orada yangilanadi.</p>';
      return;
    }
    if (!activeCatId || !categories.some((c) => c.id === activeCatId)) activeCatId = categories[0].id;

    categories.forEach((cat) => cat.items.forEach((it) => {
      itemsById[it.id] = it;
      if (it.variants) it.variants.forEach((v) => { itemsById[v.id] = v; });
    }));

    menuTabsEl.innerHTML = categories
      .map((cat) => `<button type="button" class="menu-tab${cat.id === activeCatId ? ' active' : ''}" data-cat="${escapeHtml(cat.id)}" aria-pressed="${cat.id === activeCatId ? 'true' : 'false'}">${escapeHtml(cat.name)}</button>`)
      .join('');

    menuPanelsEl.innerHTML = categories
      .map((cat) => `
        <div class="menu-panel${cat.id === activeCatId ? ' active' : ''}" data-panel="${escapeHtml(cat.id)}">
          <div class="menu-list">
            ${cat.items.map((it) => {
              const hasVariants = Array.isArray(it.variants) && it.variants.length > 0;
              const expanded = hasVariants && expandedLandingItems.has(it.id);
              const toggleHtml = hasVariants
                ? `<button type="button" class="menu-variants-toggle" data-toggle-variants="${escapeHtml(it.id)}" aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? 'Turlarini yashirish' : `Turlari (${it.variants.length})`}</button>`
                : '';
              let rowHtml = renderMenuRow(it, false, toggleHtml, priceLabel(it, hasVariants, expanded));
              if (expanded) rowHtml += it.variants.map((v) => renderMenuRow(v, true)).join('');
              return rowHtml;
            }).join('')}
          </div>
        </div>
      `).join('');

    const tabs = menuTabsEl.querySelectorAll('.menu-tab');
    const panels = menuPanelsEl.querySelectorAll('.menu-panel');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        activeCatId = Number(tab.dataset.cat);
        tabs.forEach((t) => {
          t.classList.toggle('active', t === tab);
          t.setAttribute('aria-pressed', t === tab ? 'true' : 'false');
        });
        panels.forEach((p) => p.classList.toggle('active', Number(p.dataset.panel) === activeCatId));
      });
    });
    menuPanelsEl.querySelectorAll('[data-toggle-variants]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.toggleVariants);
        if (expandedLandingItems.has(id)) expandedLandingItems.delete(id); else expandedLandingItems.add(id);
        renderMenu();
        // Qayta chizishda tugma yangi element bo'ladi — klaviatura fokusi yo'qolmasin.
        const again = menuPanelsEl.querySelector(`[data-toggle-variants="${id}"]`);
        if (again) again.focus();
      });
    });
  }

  // Server bergan rasm yuklanmasa (404, o'chirilgan fayl) — bo'sh quti
  // o'rniga o'sha placeholder harf (L-21). `error` bubble qilmaydi, shu
  // sabab capture fazasida tutamiz.
  menuPanelsEl.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || !img.classList || !img.classList.contains('menu-row-image')) return;
    const span = document.createElement('span');
    span.className = 'menu-row-thumb';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = img.dataset.initial || '•';
    img.replaceWith(span);
  }, true);

  // ---- Savat: saqlash (L-07) ----
  // NEGA (L-07, 2026-09-10): savat faqat xotirada edi — sahifa yangilansa,
  // orqaga bosilsa, qo'ng'iroq kelsa yoki "tel:" havola bosilsa nolga
  // tushardi. Server esa "sahifani yangilang" deb aynan savatni o'ldiradigan
  // maslahat berardi. Endi localStorage'da (id, miqdor, nom) saqlanadi.
  // Narx SAQLANMAYDI — tiklashda menyudan yangisi olinadi (server ham
  // narxni baribir o'zi hisoblaydi). localStorage ba'zi brauzerlarda
  // (Safari private, bloklangan cookie) murojaatda throw qiladi — hamma
  // joyda try/catch, xato bo'lsa savat shunchaki saqlanmaydi.
  const CART_KEY = 'zf_landing_cart_v1';
  // Restoran buyurtmasi — bir kunlik savat ertasiga kutilmagan "sovg'a" bo'lmasin.
  const CART_TTL_MS = 24 * 60 * 60 * 1000;

  function readStoredCart() {
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.items) || typeof data.savedAt !== 'number') return null;
      if (Date.now() - data.savedAt > CART_TTL_MS) {
        window.localStorage.removeItem(CART_KEY);
        return null;
      }
      return data.items
        .filter((x) => x && Number.isInteger(x.id) && Number.isInteger(x.qty) && x.qty > 0)
        .map((x) => ({ id: x.id, qty: Math.min(x.qty, MAX_QTY), name: typeof x.name === 'string' ? x.name.slice(0, 120) : '' }));
    } catch (_) {
      return null;
    }
  }

  // Menyu yuklanmaguncha saqlangan savat ustidan yozilmasin (menyu umuman
  // yuklanmasa ham — keyingi safar tiklanadi).
  let pendingSavedCart = readStoredCart();
  let cartHydrated = false;

  function persistCart() {
    if (!cartHydrated) return;
    try {
      if (cart.size === 0) {
        window.localStorage.removeItem(CART_KEY);
      } else {
        const items = Array.from(cart.values()).map((e) => ({ id: e.item.id, qty: e.qty, name: e.item.name }));
        window.localStorage.setItem(CART_KEY, JSON.stringify({ savedAt: Date.now(), items }));
      }
    } catch (_) { /* saqlab bo'lmadi — savat baribir sahifa ichida ishlaydi */ }
  }

  // Menyu (qayta) yuklangach: saqlangan savatni tiklaydi, narxlarni
  // yangilaydi, menyuda endi yo'q yoki "Tugadi" bo'lgan taomlarni chiqarib,
  // mijozga aytadi.
  function reconcileCart() {
    const removed = [];
    if (!cartHydrated) {
      (pendingSavedCart || []).forEach((saved) => {
        const item = itemsById[saved.id];
        if (item && item.is_available) cart.set(saved.id, { item, qty: saved.qty });
        else removed.push(item ? item.name : saved.name);
      });
      pendingSavedCart = null;
      cartHydrated = true;
    } else {
      cart.forEach((entry, id) => {
        const item = itemsById[id];
        if (item && item.is_available) entry.item = item;
        else { removed.push(entry.item.name); cart.delete(id); }
      });
    }
    persistCart();
    renderMenu(); // miqdor tugmalari savat bilan mos bo'lsin
    updateCartBar(false);
    if (checkoutDialog.isOpen()) renderCheckoutSummary();
    if (removed.length > 0) {
      const names = removed.filter(Boolean);
      showToast(names.length > 0
        ? `«${names.join('», «')}» endi mavjud emas — savatdan olib tashlandi.`
        : "Savatingizdagi ba'zi taomlar endi mavjud emas — savatdan olib tashlandi.");
    }
  }

  // ---- Savat: o'zgartirish (menyu va checkout uchun YAGONA yo'l) ----

  const cartBar = document.getElementById('cartBar');
  const cartBarInner = document.getElementById('cartBarInner');
  const cartCountEl = document.getElementById('cartCount');
  const cartTotalEl = document.getElementById('cartTotal');
  const cartOpenBtn = document.getElementById('cartOpenBtn');

  function cartEntries() {
    return Array.from(cart.values());
  }
  function cartTotals() {
    let count = 0;
    let total = 0;
    cart.forEach((e) => {
      count += e.qty;
      total += e.qty * (Number(e.item.price) || 0);
    });
    return { count, total };
  }

  let bumpTimer = null;
  function updateCartBar(bump) {
    const { count, total } = cartTotals();
    const show = count > 0;
    cartBar.classList.toggle('show', show);
    document.body.classList.toggle('has-cart', show);
    if (show) {
      // L-46: "N ta taom" edi — savatda suv va choy bo'lsa ham "taom" derdi.
      cartCountEl.textContent = `${count} ta`;
      cartTotalEl.textContent = fmtSom(total);
    }
    // L-26: qisqa vizual tasdiq (CSS: .bump; reduced-motion'da harakatsiz halqa).
    if (bump && show) {
      cartBarInner.classList.remove('bump');
      void cartBarInner.offsetWidth; // animatsiyani qayta boshlash uchun reflow
      cartBarInner.classList.add('bump');
      clearTimeout(bumpTimer);
      bumpTimer = setTimeout(() => cartBarInner.classList.remove('bump'), 600);
    }
    updateCheckoutState();
  }

  // Menyudagi shu taomning miqdor boshqaruvini qayta chizadi. Fokus shu
  // boshqaruv ichida bo'lsa — mos tugmaga qaytariladi ("+ Qo'shish" bosilib
  // stepper'ga aylanganda klaviatura foydalanuvchisi joyini yo'qotmasin).
  function syncMenuQty(id, act) {
    const qty = qtyOf(id);
    menuPanelsEl.querySelectorAll(`.menu-qty[data-id="${id}"]`).forEach((wrap) => {
      const item = itemsById[id];
      if (!item) return;
      const hadFocus = wrap.contains(document.activeElement);
      wrap.innerHTML = qtyControlHtml(item);
      if (!hadFocus) return;
      let target;
      if (qty === 0) target = wrap.querySelector('.qty-add');
      else if (act === 'dec') target = wrap.querySelector('.qty-dec');
      else target = wrap.querySelector('.qty-inc:not([disabled])') || wrap.querySelector('.qty-dec');
      if (target) target.focus();
    });
  }

  function changeQty(id, next, act) {
    const item = itemsById[id] || (cart.get(id) && cart.get(id).item);
    if (!item) return;
    const prev = qtyOf(id);
    next = Math.max(0, Math.min(MAX_QTY, next));
    if (next === prev) return;
    if (next === 0) cart.delete(id);
    else if (cart.has(id)) cart.get(id).qty = next;
    else cart.set(id, { item, qty: next });

    persistCart();
    syncMenuQty(id, act);
    updateCartBar(next > prev);
    if (checkoutDialog.isOpen()) renderCheckoutSummary();

    const { total } = cartTotals();
    announce(next === 0
      ? `${item.name} savatdan olib tashlandi. Jami ${fmtSom(total)}.`
      : `${item.name}: savatda ${next} ta. Jami ${fmtSom(total)}.`);
  }

  menuPanelsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.menu-qty button[data-act]');
    if (!btn) return;
    const wrap = btn.closest('.menu-qty');
    const id = Number(wrap.dataset.id);
    const act = btn.dataset.act;
    changeQty(id, qtyOf(id) + (act === 'inc' ? 1 : -1), act);
  });

  function clearCart() {
    cart.clear();
    persistCart();
    renderMenu();
    updateCartBar(false);
  }

  // ---- Sozlamalar (GET /api/public/settings) ----
  // NEGA (L-29 + aloqa, 2026-09-10): yetkazish narxi/vaqti/minimal summa/
  // to'lov usuli va aloqa ma'lumotlari admin sozlamalaridan olinadi.
  // Endpoint hali bo'lmasligi (404) yoki login ortida (401) bo'lishi mumkin
  // — u holda `publicSettings` null qoladi: aloqa bo'limida HTML'dagi
  // qiymatlar, checkout'da esa hozirgidek (shartlar blokisiz, "Yetkazib
  // berish" ko'rinib) ishlaydi. Har bir maydon alohida: bo'sh/0 bo'lsa
  // faqat o'sha qator ko'rsatilmaydi.
  let publicSettings = null;

  function cleanText(v, max) {
    return typeof v === 'string' ? v.trim().slice(0, max || 200) : '';
  }
  function positiveNumber(v) {
    if (typeof v !== 'number' && typeof v !== 'string') return 0;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function normalizeSettings(d) {
    return {
      phone: cleanText(d.restaurant_phone, 100),
      address: cleanText(d.restaurant_address, 300),
      deliveryEnabled: d.delivery_enabled !== false, // faqat aniq `false` yashiradi
      deliveryFee: positiveNumber(d.delivery_fee),
      minOrder: positiveNumber(d.delivery_min_order),
      timeText: cleanText(d.delivery_time_text),
      paymentText: cleanText(d.payment_methods_text),
    };
  }

  function telHref(p) {
    const plus = p.trim().startsWith('+') ? '+' : '';
    return `tel:${plus}${p.replace(/\D/g, '')}`;
  }

  // Aloqa bo'limi (16-band): qiymat bo'lsa almashtiriladi, bo'lmasa HTML qoladi.
  // DOM textContent orqali quriladi — innerHTML'ga server matni tushmaydi.
  function applyContactSettings() {
    const s = publicSettings;
    const addrEl = document.getElementById('contactAddress');
    const phonesEl = document.getElementById('contactPhones');
    const callBtn = document.getElementById('contactCallBtn');
    if (s.address && addrEl) addrEl.textContent = s.address;
    if (s.phone && phonesEl) {
      // Bir nechta raqam vergul/nuqta-vergul bilan yozilgan bo'lishi mumkin.
      const phones = s.phone.split(/[,;\n]+/).map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= PHONE_MIN_DIGITS);
      if (phones.length > 0) {
        phonesEl.textContent = '';
        phones.forEach((p, i) => {
          if (i > 0) phonesEl.appendChild(document.createElement('br'));
          const a = document.createElement('a');
          a.href = telHref(p);
          a.textContent = p;
          phonesEl.appendChild(a);
        });
        if (callBtn) callBtn.href = telHref(phones[0]);
      }
    }
  }

  async function loadSettings() {
    try {
      const res = await fetch('../api/public/settings', { headers: { Accept: 'application/json' } });
      if (!res.ok) return; // 404/401 — jim, standart holat qoladi
      const data = await res.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      publicSettings = normalizeSettings(data);
      applyContactSettings();
      applyDeliverySettings();
    } catch (_) { /* tarmoq/JSON xatosi — standart holat qoladi */ }
  }

  // ---- Buyurtma berish oynasi (checkout modal) ----
  const checkoutBackdrop = document.getElementById('checkoutBackdrop');
  const checkoutModalClose = document.getElementById('checkoutModalClose');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutFormWrap = document.getElementById('checkoutFormWrap');
  const checkoutTitle = document.getElementById('checkoutTitle');
  const checkoutSuccess = document.getElementById('checkoutSuccess');
  const checkoutSuccessText = document.getElementById('checkoutSuccessText');
  const checkoutSuccessClose = document.getElementById('checkoutSuccessClose');
  const checkoutSummaryEl = document.getElementById('checkoutSummary');
  const coError = document.getElementById('coError');
  const coSubmit = document.getElementById('coSubmit');
  const coName = document.getElementById('coName');
  const coPhone = document.getElementById('coPhone');
  const coAddress = document.getElementById('coAddress');
  const coAddressField = document.getElementById('coAddressField');
  const coNote = document.getElementById('coNote');
  const fulfillmentToggle = document.getElementById('fulfillmentToggle');
  const coDeliveryOpt = document.getElementById('coDeliveryOpt');
  const coDeliveryInfo = document.getElementById('coDeliveryInfo');
  const coMinWarning = document.getElementById('coMinWarning');
  const coLocationBtn = document.getElementById('coLocationBtn');
  const coLocationBtnText = document.getElementById('coLocationBtnText');
  const coLocationStatus = document.getElementById('coLocationStatus');

  const checkoutDialog = makeDialog(checkoutBackdrop, 'checkout');

  let currentFulfillment = 'pickup';
  let capturedLocation = null; // { lat, lng } | null — mijoz "Joylashuvni yuborish"ni bossagina to'ldiriladi
  let submittingOrder = false;

  function resetLocation() {
    capturedLocation = null;
    coLocationStatus.textContent = '';
    coLocationStatus.className = 'location-status';
    coLocationBtn.disabled = false;
    coLocationBtnText.textContent = 'Joylashuvni yuborish';
  }

  function setFulfillment(value) {
    currentFulfillment = value === 'delivery' ? 'delivery' : 'pickup';
    fulfillmentToggle.querySelectorAll('input[name="fulfillment"]').forEach((r) => {
      r.checked = r.value === currentFulfillment;
      r.closest('.fulfillment-opt').classList.toggle('active', r.checked);
    });
    coAddressField.classList.toggle('hidden', currentFulfillment !== 'delivery');
    if (currentFulfillment !== 'delivery') clearFieldError(coAddress);
    renderDeliveryInfo();
    if (checkoutDialog.isOpen()) renderCheckoutSummary();
    updateCheckoutState();
  }

  fulfillmentToggle.addEventListener('change', (e) => {
    if (e.target.name === 'fulfillment') setFulfillment(e.target.value);
  });

  function applyDeliverySettings() {
    const allowed = !publicSettings || publicSettings.deliveryEnabled;
    coDeliveryOpt.classList.toggle('hidden', !allowed);
    if (!allowed && currentFulfillment === 'delivery') setFulfillment('pickup');
    else {
      renderDeliveryInfo();
      if (checkoutDialog.isOpen()) renderCheckoutSummary();
      updateCheckoutState();
    }
  }

  // L-29: "Yetkazib berish" tanlanganda shartlar bloki. Qiymat yo'q/0 bo'lsa
  // o'sha qator chiqmaydi; birorta ham qator bo'lmasa blok butunlay yashirin.
  function renderDeliveryInfo() {
    const s = publicSettings;
    const rows = [];
    if (s) {
      if (s.deliveryFee > 0) rows.push(['Yetkazish narxi', fmtSom(s.deliveryFee)]);
      if (s.minOrder > 0) rows.push(['Minimal buyurtma', fmtSom(s.minOrder)]);
      if (s.timeText) rows.push(['Yetkazish vaqti', s.timeText]);
      if (s.paymentText) rows.push(["To'lov usuli", s.paymentText]);
    }
    const show = currentFulfillment === 'delivery' && rows.length > 0;
    coDeliveryInfo.classList.toggle('hidden', !show);
    coDeliveryInfo.innerHTML = show
      ? `<p class="delivery-info-title">Yetkazib berish shartlari</p><dl>${rows
        .map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>`
      : '';
  }

  function deliveryFee() {
    return currentFulfillment === 'delivery' && publicSettings ? publicSettings.deliveryFee : 0;
  }
  // Yetkazishda minimal summaga qancha yetmayapti (0 = yetadi yoki cheklov yo'q).
  function deliveryShortfall() {
    if (currentFulfillment !== 'delivery' || !publicSettings || !(publicSettings.minOrder > 0)) return 0;
    return Math.max(0, publicSettings.minOrder - cartTotals().total);
  }

  // "Buyurtma berish" tugmasi holati: savat bo'sh / minimal summa yetmaydi /
  // yuborilmoqda — bloklanadi. Ogohlantirish matni faqat o'zgarganda
  // yangilanadi (live region har bosishda qayta e'lon qilmasin).
  function updateCheckoutState() {
    const empty = cart.size === 0;
    const short = deliveryShortfall();
    const msg = short > 0 && !empty
      ? `Yetkazib berish uchun minimal buyurtma — ${fmtSom(publicSettings.minOrder)}. Yana ${fmtSom(short)}lik taom qo'shing yoki "Olib ketish"ni tanlang.`
      : '';
    if (coMinWarning.textContent !== msg) coMinWarning.textContent = msg;
    coSubmit.disabled = submittingOrder || empty || short > 0;
  }

  coLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      coLocationStatus.textContent = "Qurilma joylashuvni aniqlay olmaydi, manzilni qo'lda yozing";
      coLocationStatus.className = 'location-status err';
      return;
    }
    coLocationBtn.disabled = true;
    coLocationStatus.textContent = 'Joylashuv so\'ralmoqda...';
    coLocationStatus.className = 'location-status';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        capturedLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        coLocationStatus.textContent = '✓ Joylashuv qo\'shildi';
        coLocationStatus.className = 'location-status ok';
        coLocationBtnText.textContent = 'Joylashuvni yangilash';
        coLocationBtn.disabled = false;
      },
      (err) => {
        capturedLocation = null;
        coLocationStatus.textContent = err.code === err.PERMISSION_DENIED
          ? "Joylashuvga ruxsat berilmadi, manzilni qo'lda yozing"
          : "Joylashuvni aniqlab bo'lmadi, manzilni qo'lda yozing";
        coLocationStatus.className = 'location-status err';
        coLocationBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  // NEGA (L-06, 2026-09-10): xulosa endi faqat matn emas — har qatorda
  // − / + / × tugmalari; ular menyudagi bilan bir xil changeQty() orqali
  // ishlaydi, shuning uchun menyu qatorlari, savat paneli va xulosa doim
  // sinxron. Qayta chizishda fokus o'sha tugmaga (qator o'chsa — qo'shni
  // qatorga, savat bo'shasa — oyna sarlavhasiga) qaytariladi.
  function renderCheckoutSummary() {
    const active = document.activeElement;
    let keep = null;
    if (active && checkoutSummaryEl.contains(active) && active.dataset && active.dataset.id) {
      const rowsBefore = Array.from(checkoutSummaryEl.querySelectorAll('.co-row'));
      keep = { id: active.dataset.id, act: active.dataset.act, index: rowsBefore.indexOf(active.closest('.co-row')) };
    }

    const entries = cartEntries();
    const { total } = cartTotals();
    if (entries.length === 0) {
      checkoutSummaryEl.innerHTML = '<p class="co-empty">Savat bo\'sh. Menyudan taom tanlang.</p>';
    } else {
      const fee = deliveryFee();
      checkoutSummaryEl.innerHTML = entries.map((e) => {
        const id = escapeHtml(e.item.id);
        const name = escapeHtml(e.item.name);
        return `
          <div class="co-row">
            <div class="co-row-info">
              <span class="co-row-name">${name}</span>
              <span class="co-row-sum">${fmtSom(e.item.price * e.qty)}</span>
            </div>
            <div class="co-row-ctrl">
              <button type="button" class="co-btn" data-id="${id}" data-act="dec" aria-label="${name} — bittaga kamaytirish">&minus;</button>
              <span class="co-qty">${e.qty}</span>
              <button type="button" class="co-btn" data-id="${id}" data-act="inc" aria-label="${name} — bittaga ko'paytirish"${e.qty >= MAX_QTY ? ' disabled' : ''}>+</button>
              <button type="button" class="co-btn co-remove" data-id="${id}" data-act="remove" aria-label="${name} — savatdan olib tashlash">&times;</button>
            </div>
          </div>`;
      }).join('')
        + `<div class="checkout-summary-total"><span>Jami</span><span class="amount">${fmtSom(total)}</span></div>`
        // NEGA (L-29, 2026-09-10): yetkazish narxi "Jami"ga QO'SHILMAYDI —
        // server (customerOrders.createFromPublic) total_amount'ni faqat
        // taomlardan hisoblaydi va yetkazish narxini bilmaydi. Qo'shsak,
        // mijoz ko'rgan summa admin/kuryer ekranidagidan farq qilardi.
        // Shuning uchun alohida ma'lumot qatori sifatida ko'rsatiladi.
        + (fee > 0 ? `<p class="co-fee-note">+ yetkazish ${fmtSom(fee)}</p>` : '');
    }

    if (keep) {
      let target = checkoutSummaryEl.querySelector(`button[data-id="${keep.id}"][data-act="${keep.act}"]:not([disabled])`);
      if (!target) {
        const rows = checkoutSummaryEl.querySelectorAll('.co-row');
        if (rows.length > 0) {
          const row = rows[Math.min(Math.max(keep.index, 0), rows.length - 1)];
          target = row.querySelector('button:not([disabled])');
        }
      }
      (target || checkoutTitle).focus();
    }
  }

  checkoutSummaryEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const act = btn.dataset.act;
    const cur = qtyOf(id);
    const next = act === 'inc' ? cur + 1 : act === 'dec' ? cur - 1 : 0;
    changeQty(id, next, act);
  });

  function openCheckoutModal() {
    if (cart.size === 0) return;
    checkoutFormWrap.classList.remove('hidden');
    checkoutSuccess.classList.add('hidden');
    coError.textContent = '';
    clearFormErrors(checkoutForm);
    renderCheckoutSummary();
    renderDeliveryInfo();
    updateCheckoutState();
    checkoutDialog.open(coarsePointer ? checkoutTitle : coName);
  }

  cartOpenBtn.addEventListener('click', openCheckoutModal);
  checkoutModalClose.addEventListener('click', () => checkoutDialog.close());
  checkoutSuccessClose.addEventListener('click', () => checkoutDialog.close());
  watchFieldErrors(checkoutForm);

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    coError.textContent = '';
    clearFormErrors(checkoutForm);

    const entries = cartEntries();
    if (entries.length === 0) return (coError.textContent = "Savat bo'sh");
    if (deliveryShortfall() > 0) { updateCheckoutState(); return; }

    const full_name = coName.value.trim();
    const phone = coPhone.value.trim();
    const address = coAddress.value.trim();
    const note = coNote.value.trim();

    const errors = [];
    if (!full_name) errors.push({ input: coName, msg: 'Ismingizni kiriting' });
    const pErr = phoneError(phone);
    if (pErr) errors.push({ input: coPhone, msg: pErr });
    if (currentFulfillment === 'delivery' && !address) errors.push({ input: coAddress, msg: 'Yetkazish manzilini kiriting' });
    if (showFieldErrors(errors)) return;

    const fulfillment = currentFulfillment;
    const feeAtSubmit = deliveryFee();
    submittingOrder = true;
    updateCheckoutState();
    coSubmit.textContent = 'Yuborilmoqda...';
    try {
      const items = entries.map((en) => ({ menu_item_id: en.item.id, quantity: en.qty }));
      const payload = { full_name, phone, fulfillment, note, items };
      // NEGA (L-11, 2026-09-10): manzil faqat yetkazib berishda yuboriladi.
      // Ilgari mijoz avval "Yetkazib berish"da manzil yozib, keyin "Olib
      // ketish"ga qaytsa — yashirin maydon qiymati baribir ketardi va
      // pickup buyurtmasida admin/kuryer ekranida manzil chiqardi.
      if (fulfillment === 'delivery') {
        payload.address = address;
        if (capturedLocation) {
          payload.location_lat = capturedLocation.lat;
          payload.location_lng = capturedLocation.lng;
        }
      }
      const res = await fetch('../api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring";
        // Server "Menyudagi bir band endi mavjud emas, sahifani yangilang"
        // desa — sahifani yangilatmaymiz (savat saqlangan bo'lsa ham bu
        // ortiqcha qadam): menyuni qayta yuklab, savatni o'zimiz tozalaymiz.
        if (/mavjud emas/i.test(msg)) {
          await loadMenu();
          throw new Error("Savatingizdagi bir taom endi mavjud emas — savat yangilandi. Tekshirib, qayta yuboring.");
        }
        throw new Error(msg);
      }

      // NEGA (L-12, 2026-09-10): server { ok, id, total_amount } qaytaradi,
      // ilgari klient uni umuman ishlatmasdi — mijozda buyurtma raqami ham,
      // summa tasdig'i ham qolmasdi.
      const orderNo = data && data.id != null && /^\d+$/.test(String(data.id)) ? String(data.id) : '';
      const serverTotal = Number(data && data.total_amount);
      let text = orderNo ? `Buyurtma №${orderNo} qabul qilindi.` : 'Buyurtmangiz qabul qilindi.';
      if (Number.isFinite(serverTotal) && serverTotal > 0) text += ` Jami: ${fmtSom(serverTotal)}.`;
      if (fulfillment === 'delivery' && feeAtSubmit > 0) text += ` Yetkazish narxi alohida: ${fmtSom(feeAtSubmit)}.`;
      text += " Tez orada siz bilan bog'lanamiz.";
      checkoutSuccessText.textContent = text;

      checkoutFormWrap.classList.add('hidden');
      checkoutSuccess.classList.remove('hidden');
      checkoutSuccess.focus();
      checkoutForm.reset();
      setFulfillment('pickup');
      resetLocation();
      clearCart(); // L-07: saqlangan savat ham o'chadi
    } catch (err) {
      coError.textContent = err.message || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring";
    } finally {
      submittingOrder = false;
      coSubmit.textContent = 'Buyurtma berish';
      updateCheckoutState();
    }
  });

  async function loadMenu() {
    try {
      const res = await fetch('../api/public/menu');
      if (!res.ok) throw new Error('menu');
      const data = await res.json();
      renderMenu(Array.isArray(data) ? data : []);
      reconcileCart();
    } catch (err) {
      // Menyu kelmasa saqlangan savat tegilmaydi (cartHydrated=false —
      // persistCart() uni o'chirmaydi), keyingi yuklashda tiklanadi.
      if (!lastMenuCategories) {
        menuPanelsEl.innerHTML = '<p class="dim center">Menyuni yuklab bo\'lmadi. Sahifani yangilab ko\'ring.</p>';
      }
    }
  }
  loadMenu();
  loadSettings();

  document.addEventListener('keydown', (e) => {
    const openDialog = bookDialog.isOpen() ? bookDialog : (checkoutDialog.isOpen() ? checkoutDialog : null);
    if (e.key === 'Escape') {
      if (openDialog) openDialog.close();
      else if (isNavOpen()) closeNav();
      return;
    }
    if (e.key === 'Tab') {
      if (openDialog) trapTab(e, openDialog.modal);
      else if (isNavOpen()) trapTab(e, navLinks);
    }
  });
});
