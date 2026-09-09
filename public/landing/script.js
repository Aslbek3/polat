// Po'lat landing — header scroll holati, mobil menyu, dinamik menyu + savat + bron oynasi.

function fmtSom(n) {
  return Math.round(Number(n) || 0).toLocaleString('uz-UZ') + " so'm";
}

document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('siteHeader');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  const navClose = document.getElementById('navClose');

  // Header: scroll qilinganda qattiq fon
  const onScroll = () => {
    if (window.scrollY > 40) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobil hamburger menyu
  const closeNav = () => {
    navToggle.classList.remove('open');
    navLinks.classList.remove('open');
  };
  navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
  if (navClose) navClose.addEventListener('click', closeNav);
  navLinks.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', closeNav);
  });

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
  const successBox = document.getElementById('bookSuccess');
  const successText = document.getElementById('bookSuccessText');
  const successClose = document.getElementById('bookSuccessClose');
  const errorBox = document.getElementById('bkError');
  const submitBtn = document.getElementById('bkSubmit');
  const dateInput = document.getElementById('bkDate');
  const timeInput = document.getElementById('bkTime');

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
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    formWrap.classList.remove('hidden');
    successBox.classList.add('hidden');
    errorBox.textContent = '';
  }
  function closeBookModal() {
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-book]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openBookModal();
    });
  });
  modalClose.addEventListener('click', closeBookModal);
  successClose.addEventListener('click', closeBookModal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeBookModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.textContent = '';

    const full_name = document.getElementById('bkName').value.trim();
    const phone = document.getElementById('bkPhone').value.trim();
    const res_date = document.getElementById('bkDate').value;
    const res_time = document.getElementById('bkTime').value;
    const party_size = Number(document.getElementById('bkGuests').value);
    const note = document.getElementById('bkNote').value.trim();

    if (!full_name) return (errorBox.textContent = 'Ismingizni kiriting');
    if (!phone) return (errorBox.textContent = 'Telefon raqamingizni kiriting');
    if (!res_date || !res_time) return (errorBox.textContent = 'Sana va vaqtni tanlang');
    if (res_date < todayISO()) return (errorBox.textContent = "O'tgan sanaga bron qilib bo'lmaydi");
    if (res_date === todayISO() && res_time <= nowHHMM()) {
      return (errorBox.textContent = "Bugungi kun uchun o'tib ketgan vaqtni tanlab bo'lmaydi");
    }
    if (!Number.isFinite(party_size) || party_size <= 0) {
      return (errorBox.textContent = "Kishilar sonini to'g'ri kiriting");
    }

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

  const itemsById = {}; // menu_item_id -> DB'dan kelgan taom obyekti
  const cart = {}; // menu_item_id -> { item, qty }
  let lastMenuCategories = null; // qayta so'rovsiz qayta chizish uchun (Turlari tugmasi)
  let activeCatId = null;
  // Taom "turi" (variant, 2026-09-09) — asosiy taom har doim ko'rinadi, agar
  // unga bog'liq turlari bo'lsa pastida "Turlari (N)" tugmasi chiqadi;
  // bosilsa o'sha turlar ham (o'z narxi bilan, alohida savatga qo'shiladigan
  // to'liq taom sifatida) shu tugma ostida ochiladi.
  const expandedLandingItems = new Set();

  function renderMenuRow(it, isVariant) {
    return `
      <div class="menu-row${it.is_available ? '' : ' menu-row-unavailable'}${isVariant ? ' menu-row-variant' : ''}">
        ${it.image_url ? `<img src="${escapeHtml(it.image_url)}" class="menu-row-image" alt="">` : ''}
        <div class="menu-row-main">
          <h4>${escapeHtml(it.name)}${it.volume ? ` <span class="menu-row-volume">(${escapeHtml(it.volume)})</span>` : ''}${it.is_available ? '' : ' <span class="menu-row-badge">Tugadi</span>'}</h4>
          ${it.description ? `<p class="menu-row-desc">${escapeHtml(it.description)}</p>` : ''}
          <div class="menu-row-price">${fmtSom(it.price)}</div>
        </div>
        ${it.is_available ? `
          <div class="menu-qty" data-id="${it.id}">
            <button type="button" class="qty-dec" aria-label="Kamaytirish">&minus;</button>
            <span class="qty-val">${cart[it.id] ? cart[it.id].qty : 0}</span>
            <button type="button" class="qty-inc" aria-label="Qo'shish">+</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderMenu(categories) {
    if (categories) lastMenuCategories = categories;
    categories = lastMenuCategories;
    if (!categories || categories.length === 0) {
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
      .map((cat) => `<button class="menu-tab${cat.id === activeCatId ? ' active' : ''}" data-cat="${cat.id}">${escapeHtml(cat.name)}</button>`)
      .join('');

    menuPanelsEl.innerHTML = categories
      .map((cat) => `
        <div class="menu-panel${cat.id === activeCatId ? ' active' : ''}" data-panel="${cat.id}">
          <div class="menu-list">
            ${cat.items.map((it) => {
              const hasVariants = it.variants && it.variants.length > 0;
              const expanded = expandedLandingItems.has(it.id);
              let rowHtml = renderMenuRow(it, false);
              if (hasVariants) {
                rowHtml += `<button type="button" class="menu-variants-toggle" data-toggle-variants="${it.id}">${expanded ? 'Turlarini yashirish' : `Turlari (${it.variants.length})`}</button>`;
                if (expanded) rowHtml += it.variants.map((v) => renderMenuRow(v, true)).join('');
              }
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
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        panels.forEach((p) => p.classList.toggle('active', Number(p.dataset.panel) === activeCatId));
      });
    });
    menuPanelsEl.querySelectorAll('[data-toggle-variants]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.toggleVariants);
        if (expandedLandingItems.has(id)) expandedLandingItems.delete(id); else expandedLandingItems.add(id);
        renderMenu();
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Savat (qty tugmalari) ----
  menuPanelsEl.addEventListener('click', (e) => {
    const incBtn = e.target.closest('.qty-inc');
    const decBtn = e.target.closest('.qty-dec');
    if (!incBtn && !decBtn) return;
    const wrap = e.target.closest('.menu-qty');
    const id = Number(wrap.dataset.id);
    const item = itemsById[id];
    if (!item) return;

    const current = cart[id] ? cart[id].qty : 0;
    let next = current;
    if (incBtn) next = Math.min(current + 1, 50);
    if (decBtn) next = Math.max(current - 1, 0);

    if (next === 0) delete cart[id];
    else cart[id] = { item, qty: next };

    wrap.querySelector('.qty-val').textContent = next;
    updateCartBar();
  });

  const cartBar = document.getElementById('cartBar');
  const cartCountEl = document.getElementById('cartCount');
  const cartTotalEl = document.getElementById('cartTotal');
  const cartOpenBtn = document.getElementById('cartOpenBtn');

  function cartEntries() {
    return Object.values(cart);
  }

  function updateCartBar() {
    const entries = cartEntries();
    const count = entries.reduce((sum, e) => sum + e.qty, 0);
    const total = entries.reduce((sum, e) => sum + e.qty * e.item.price, 0);
    if (count > 0) {
      cartBar.classList.add('show');
      cartCountEl.textContent = `${count} ta taom`;
      cartTotalEl.textContent = fmtSom(total);
    } else {
      cartBar.classList.remove('show');
    }
  }

  function clearCart() {
    Object.keys(cart).forEach((k) => delete cart[k]);
    menuPanelsEl.querySelectorAll('.qty-val').forEach((el) => { el.textContent = '0'; });
    updateCartBar();
  }

  // ---- Buyurtma berish oynasi (checkout modal) ----
  const checkoutBackdrop = document.getElementById('checkoutBackdrop');
  const checkoutModalClose = document.getElementById('checkoutModalClose');
  const checkoutForm = document.getElementById('checkoutForm');
  const checkoutFormWrap = document.getElementById('checkoutFormWrap');
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
  const coLocationBtn = document.getElementById('coLocationBtn');
  const coLocationStatus = document.getElementById('coLocationStatus');

  let currentFulfillment = 'pickup';
  let capturedLocation = null; // { lat, lng } | null — mijoz "Joylashuvni yuborish"ni bossagina to'ldiriladi

  function resetLocation() {
    capturedLocation = null;
    coLocationStatus.textContent = '';
    coLocationStatus.className = 'location-status';
    coLocationBtn.disabled = false;
    coLocationBtn.innerHTML = '&#128205; Joylashuvni yuborish';
  }

  fulfillmentToggle.querySelectorAll('.fulfillment-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFulfillment = btn.dataset.fulfillment;
      fulfillmentToggle.querySelectorAll('.fulfillment-opt').forEach((b) => b.classList.toggle('active', b === btn));
      coAddressField.classList.toggle('hidden', currentFulfillment !== 'delivery');
    });
  });

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
        coLocationBtn.innerHTML = '&#128205; Joylashuvni yangilash';
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

  function renderCheckoutSummary() {
    const entries = cartEntries();
    const total = entries.reduce((sum, e) => sum + e.qty * e.item.price, 0);
    checkoutSummaryEl.innerHTML = entries
      .map((e) => `<div class="checkout-summary-row"><span>${escapeHtml(e.item.name)} &times; ${e.qty}</span><strong>${fmtSom(e.item.price * e.qty)}</strong></div>`)
      .join('') + `<div class="checkout-summary-total"><span>Jami</span><span class="amount">${fmtSom(total)}</span></div>`;
  }

  function openCheckoutModal() {
    if (cartEntries().length === 0) return;
    renderCheckoutSummary();
    checkoutBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    checkoutFormWrap.classList.remove('hidden');
    checkoutSuccess.classList.add('hidden');
    coError.textContent = '';
  }
  function closeCheckoutModal() {
    checkoutBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  cartOpenBtn.addEventListener('click', openCheckoutModal);
  checkoutModalClose.addEventListener('click', closeCheckoutModal);
  checkoutSuccessClose.addEventListener('click', closeCheckoutModal);
  checkoutBackdrop.addEventListener('click', (e) => {
    if (e.target === checkoutBackdrop) closeCheckoutModal();
  });

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    coError.textContent = '';

    const entries = cartEntries();
    if (entries.length === 0) return (coError.textContent = "Savat bo'sh");

    const full_name = coName.value.trim();
    const phone = coPhone.value.trim();
    const address = coAddress.value.trim();
    const note = coNote.value.trim();

    if (!full_name) return (coError.textContent = 'Ismingizni kiriting');
    if (!phone) return (coError.textContent = 'Telefon raqamingizni kiriting');
    if (currentFulfillment === 'delivery' && !address) {
      return (coError.textContent = 'Yetkazish manzilini kiriting');
    }

    coSubmit.disabled = true;
    coSubmit.textContent = 'Yuborilmoqda...';
    try {
      const items = entries.map((e) => ({ menu_item_id: e.item.id, quantity: e.qty }));
      const payload = { full_name, phone, fulfillment: currentFulfillment, address, note, items };
      if (currentFulfillment === 'delivery' && capturedLocation) {
        payload.location_lat = capturedLocation.lat;
        payload.location_lng = capturedLocation.lng;
      }
      const res = await fetch('../api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring");

      checkoutSuccessText.textContent = `Hurmatli ${full_name}, buyurtmangiz qabul qilindi. Tez orada siz bilan bog'lanamiz.`;
      checkoutFormWrap.classList.add('hidden');
      checkoutSuccess.classList.remove('hidden');
      checkoutForm.reset();
      currentFulfillment = 'pickup';
      fulfillmentToggle.querySelectorAll('.fulfillment-opt').forEach((b, i) => b.classList.toggle('active', i === 0));
      coAddressField.classList.add('hidden');
      resetLocation();
      clearCart();
    } catch (err) {
      coError.textContent = err.message || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring";
    } finally {
      coSubmit.disabled = false;
      coSubmit.textContent = 'Buyurtma berish';
    }
  });

  async function loadMenu() {
    try {
      const res = await fetch('../api/public/menu');
      const data = await res.json();
      renderMenu(data);
    } catch (err) {
      menuPanelsEl.innerHTML = '<p class="dim center">Menyuni yuklab bo\'lmadi. Sahifani yangilab ko\'ring.</p>';
    }
  }
  loadMenu();

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (backdrop.classList.contains('open')) closeBookModal();
    if (checkoutBackdrop.classList.contains('open')) closeCheckoutModal();
  });
});
