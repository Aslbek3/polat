// Ziyo Famliy — mijoz hisobi sahifasi (2026-11-01). Mustaqil modul:
// app.js'ni ham, script.js'ni ham ulamaydi (landing qoidasi). API:
//   /api/customer/auth/*  — kirish (Telegram kod)
//   /api/customer/*       — profil, manzillar, buyurtmalar, bronlar
(function () {
  'use strict';

  const API = '../api/customer';
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtSom(n) {
    return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
  }
  function fmtPhone(p) {
    const d = String(p || '').replace(/\D/g, '').slice(-9);
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }
  const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'];
  // Bazada UTC ISO — Toshkent (UTC+5) bo'yicha ko'rsatamiz.
  function fmtDateTime(iso) {
    const d = new Date(Date.parse(iso) + 5 * 3600_000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }

  async function api(path, options = {}) {
    const opts = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(API + path, opts);
    } catch (e) {
      const err = new Error("Internet aloqasi yo'q. Qayta urinib ko'ring");
      err.status = 0;
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  let toastTimer = null;
  function toast(msg, isError) {
    const el = $('accToast');
    el.textContent = msg;
    el.classList.toggle('err', !!isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || 'Kuting…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  // Kirgandan keyin qaytish manzili (?next=menu.html) — faqat shu papkadagi
  // oddiy .html sahifa (ochiq redirect bo'lmasin).
  function nextUrl() {
    const n = new URLSearchParams(location.search).get('next');
    return n && /^[a-z0-9-]+\.html(#[\w-]*)?$/i.test(n) ? n : null;
  }

  // ================= Header (mobil menyu) =================
  function setupHeader() {
    const navToggle = $('navToggle');
    const navLinks = $('navLinks');
    const navClose = $('navClose');
    const close = () => { navToggle.classList.remove('open'); navLinks.classList.remove('open'); document.body.style.overflow = ''; };
    navToggle.addEventListener('click', () => {
      const open = !navLinks.classList.contains('open');
      navToggle.classList.toggle('open', open);
      navLinks.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    navClose.addEventListener('click', close);
    navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  }
  function setHeaderAccount(customer) {
    document.querySelectorAll('[data-account-link]').forEach((a) => {
      const label = a.querySelector('[data-account-label]');
      a.classList.toggle('is-logged', !!customer);
      if (label) label.textContent = customer ? (customer.full_name ? customer.full_name.split(' ')[0] : 'Hisobim') : 'Kirish';
    });
  }

  // ================= Holat =================
  const state = {
    customer: null,
    addresses: [],
    phone: '', // +998XXXXXXXXX (kirish jarayonida)
    linkToken: null,
    channel: 'telegram', // kod qaysi kanal orqali keladi: 'telegram' | 'sms'
    pollTimer: null,
    resendTimer: null,
  };

  function show(id) {
    ['accLoading', 'accAuth', 'accDash'].forEach((x) => $(x).classList.toggle('hidden', x !== id));
  }
  function showStep(id) {
    ['stepPhone', 'stepLink', 'stepCode', 'stepName'].forEach((x) => $(x).classList.toggle('hidden', x !== id));
    const focusMap = { stepPhone: 'phoneInput', stepCode: 'codeInput', stepName: 'nameInput' };
    if (focusMap[id]) setTimeout(() => $(focusMap[id]).focus(), 60);
  }

  // ================= KIRISH =================
  function stopPolling() {
    clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  function startResendCountdown(seconds) {
    const btn = $('codeResend');
    clearInterval(state.resendTimer);
    let left = seconds;
    const tick = () => {
      if (left <= 0) {
        clearInterval(state.resendTimer);
        btn.disabled = false;
        btn.textContent = 'Kodni qayta yuborish';
        return;
      }
      btn.disabled = true;
      btn.textContent = `Qayta yuborish (${left} s)`;
      left -= 1;
    };
    tick();
    state.resendTimer = setInterval(tick, 1000);
  }

  function goToCode(maskedPhone) {
    stopPolling();
    $('codeVia').textContent = state.channel === 'sms' ? 'SMS orqali' : 'Telegram botimiz';
    $('codePhone').textContent = maskedPhone || fmtPhone(state.phone);
    $('codeInput').value = '';
    $('codeError').textContent = '';
    showStep('stepCode');
    startResendCountdown(60);
  }

  async function requestCode(fromResend) {
    const errorEl = fromResend ? $('codeError') : $('phoneError');
    errorEl.textContent = '';
    const btn = fromResend ? $('codeResend') : $('phoneSubmit');
    if (fromResend) {
      clearInterval(state.resendTimer);
      btn.disabled = true;
      btn.textContent = 'Yuborilmoqda…';
    } else {
      setBusy(btn, true, 'Yuborilmoqda…');
    }
    let resendHandled = false;
    try {
      // Qayta yuborishda kod avval qaysi kanal orqali kelgan bo'lsa, o'sha orqali.
      const path = fromResend && state.channel === 'sms' ? '/auth/start-sms' : '/auth/start';
      if (!fromResend) state.channel = 'telegram';
      const data = await api(path, { method: 'POST', body: { phone: state.phone } });
      if (data.step === 'code') {
        goToCode(data.phone_masked);
        resendHandled = true;
        if (fromResend) toast(state.channel === 'sms' ? 'Yangi kod SMS orqali yuborildi' : 'Yangi kod Telegram’ga yuborildi');
      } else {
        state.linkToken = data.token;
        $('linkBotBtn').href = data.bot_url;
        $('linkBotName').textContent = data.bot_username ? '@' + data.bot_username : 'botimizni';
        $('linkError').textContent = '';
        $('linkSmsWrap').classList.toggle('hidden', !data.sms_available);
        $('linkStatus').classList.remove('hidden');
        showStep('stepLink');
        pollLink();
      }
    } catch (err) {
      if (err.status === 429 && err.data && err.data.step === 'code') {
        // Kod allaqachon yuborilgan — kod oynasiga o'tamiz, qolgan vaqt bilan.
        goToCode();
        startResendCountdown(err.data.retry_after || 60);
        resendHandled = true;
        return;
      }
      (fromResend ? $('codeError') : errorEl).textContent = err.message;
    } finally {
      if (!fromResend) setBusy(btn, false);
      else if (!resendHandled) startResendCountdown(5);
    }
  }

  async function pollLink() {
    stopPolling();
    if (!state.linkToken) return;
    try {
      const data = await fetch(`${API}/auth/link-status?token=${encodeURIComponent(state.linkToken)}`, { credentials: 'same-origin' })
        .then((r) => r.json());
      if (data.status === 'linked') { goToCode(data.phone_masked); return; }
      if (data.status === 'phone_mismatch') {
        $('linkError').textContent = "Telegram'dagi raqamingiz saytda kiritilganidan boshqa. Orqaga qaytib, Telegram raqamingizni kiriting.";
      } else if (data.status === 'expired') {
        $('linkError').textContent = "Havolaning muddati tugadi. Orqaga qaytib, qayta urinib ko'ring.";
        $('linkStatus').classList.add('hidden');
        return;
      } else if (data.status === 'opened') {
        $('linkStatus').querySelector('span:last-child').textContent = 'Bot ochildi — endi «📱 Raqamni ulashish» tugmasini bosing…';
      }
    } catch (e) { /* tarmoq uzilishi — keyingi urinishda */ }
    state.pollTimer = setTimeout(pollLink, document.hidden ? 4000 : 2000);
  }

  function setupAuth() {
    const phoneInput = $('phoneInput');
    phoneInput.addEventListener('input', () => {
      const d = phoneInput.value.replace(/\D/g, '').replace(/^998(?=\d{9})/, '').slice(0, 9);
      phoneInput.value = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
    });

    $('stepPhone').addEventListener('submit', (e) => {
      e.preventDefault();
      const digits = phoneInput.value.replace(/\D/g, '');
      if (digits.length !== 9) {
        $('phoneError').textContent = "Raqamni to'liq kiriting: 9 ta raqam";
        phoneInput.focus();
        return;
      }
      state.phone = '+998' + digits;
      requestCode(false);
    });

    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => {
      stopPolling();
      clearInterval(state.resendTimer);
      state.linkToken = null;
      showStep('stepPhone');
    }));

    $('linkHaveCode').addEventListener('click', () => goToCode());

    // Telegram'i yo'q mijoz — kod SMS orqali (pullik, server limitlar qo'yadi).
    $('linkSmsBtn').addEventListener('click', async () => {
      const btn = $('linkSmsBtn');
      $('linkError').textContent = '';
      btn.disabled = true;
      try {
        const data = await api('/auth/start-sms', { method: 'POST', body: { phone: state.phone } });
        state.channel = 'sms';
        goToCode(data.phone_masked);
      } catch (err) {
        if (err.status === 429 && err.data && err.data.via === 'sms') {
          state.channel = 'sms';
          goToCode();
          startResendCountdown(err.data.retry_after || 60);
        } else {
          $('linkError').textContent = err.message;
        }
      } finally {
        btn.disabled = false;
      }
    });
    $('codeResend').addEventListener('click', () => requestCode(true));

    const codeInput = $('codeInput');
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
      if (codeInput.value.length === 6) $('stepCode').requestSubmit();
    });

    $('stepCode').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = codeInput.value.trim();
      $('codeError').textContent = '';
      if (code.length !== 6) { $('codeError').textContent = 'Kod 6 ta raqamdan iborat'; return; }
      const btn = $('codeSubmit');
      if (btn.disabled) return;
      setBusy(btn, true, 'Tekshirilmoqda…');
      try {
        const data = await api('/auth/verify', { method: 'POST', body: { phone: state.phone, code } });
        clearInterval(state.resendTimer);
        state.customer = data.customer;
        setHeaderAccount(state.customer);
        if (data.is_new) {
          showStep('stepName');
        } else {
          afterLogin();
        }
      } catch (err) {
        $('codeError').textContent = err.message;
        codeInput.select();
      } finally {
        setBusy(btn, false);
      }
    });

    $('stepName').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('nameInput').value.trim();
      $('nameError').textContent = '';
      if (name.length < 2) { $('nameError').textContent = 'Ismingizni kiriting'; return; }
      const btn = $('nameSubmit');
      setBusy(btn, true, 'Saqlanmoqda…');
      try {
        const data = await api('/me', { method: 'PUT', body: { full_name: name } });
        state.customer = data.customer;
        afterLogin();
      } catch (err) {
        $('nameError').textContent = err.message;
      } finally {
        setBusy(btn, false);
      }
    });
  }

  function afterLogin() {
    const next = nextUrl();
    if (next) { location.href = next; return; }
    openDashboard();
  }

  // ================= HISOB =================
  const TABS = ['orders', 'reservations', 'addresses', 'profile'];
  let activeTab = 'orders';

  function openDashboard() {
    const c = state.customer;
    setHeaderAccount(c);
    $('dashName').textContent = c.full_name || 'Hisobim';
    $('dashPhone').textContent = fmtPhone(c.phone);
    $('dashAvatar').textContent = (c.full_name || '☺').trim().charAt(0).toUpperCase();
    $('profName').value = c.full_name || '';
    $('profPhone').value = fmtPhone(c.phone);
    show('accDash');
    const fromHash = location.hash.replace('#', '');
    selectTab(TABS.includes(fromHash) ? fromHash : 'orders');
  }

  function selectTab(tab) {
    activeTab = tab;
    document.querySelectorAll('#accTabs button').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
    if (history.replaceState) history.replaceState(null, '', '#' + tab);
    if (tab === 'orders') loadOrders();
    if (tab === 'reservations') loadReservations();
    if (tab === 'addresses') loadAddresses();
  }

  function handleAuthLost(err) {
    if (err && err.status === 401) {
      state.customer = null;
      setHeaderAccount(null);
      show('accAuth');
      showStep('stepPhone');
      toast('Sessiya tugadi, qayta kiring', true);
      return true;
    }
    return false;
  }

  function emptyHtml(icon, text, ctaHref, ctaText) {
    return `<div class="acc-card acc-empty"><div class="acc-empty-ic">${icon}</div><p>${text}</p>` +
      (ctaHref ? `<a class="btn-solid" href="${ctaHref}">${ctaText}</a>` : '') + '</div>';
  }
  function loadingHtml() {
    return '<div class="acc-loading" style="padding:40px 0"><span class="acc-spinner"></span></div>';
  }

  // ---- Buyurtmalar ----
  async function loadOrders() {
    const list = $('ordersList');
    if (!list.dataset.loaded) list.innerHTML = loadingHtml();
    try {
      const { orders } = await api('/orders');
      list.dataset.loaded = '1';
      if (!orders.length) {
        list.innerHTML = emptyHtml('🍽️', "Hali buyurtma bermagansiz. Hisobga kirgan holda bergan buyurtmalaringiz shu yerda ko'rinadi.", 'menu.html', 'Menyuni ochish');
        return;
      }
      list.innerHTML = orders.map((o) => {
        const lines = o.items.map((it) =>
          `<div class="acc-order-line"><span>${it.quantity} × ${escapeHtml(it.name)}</span><span>${fmtSom(it.subtotal)}</span></div>`
        ).join('');
        const feeLine = o.delivery_fee
          ? `<div class="acc-order-line"><span>Yetkazib berish</span><span>${fmtSom(o.delivery_fee)}</span></div>` : '';
        const kind = o.fulfillment === 'delivery' ? '🚚 Yetkazib berish' : '🛍️ Olib ketish';
        const addr = o.fulfillment === 'delivery' && o.address
          ? `<div class="acc-order-addr">📍 ${escapeHtml(o.address)}</div>` : '';
        return `<article class="acc-card">
          <div class="acc-order-top">
            <div><div class="acc-order-no">Buyurtma #${o.id}</div>
              <div class="acc-order-meta">${fmtDateTime(o.created_at)} · ${kind}</div></div>
            <span class="acc-badge ${escapeHtml(o.stage)}">${escapeHtml(o.stage_label)}</span>
          </div>
          <div class="acc-order-items">${lines}${feeLine}</div>
          ${addr}
          <div class="acc-order-total"><span>Jami</span><span>${fmtSom(o.total_amount)}</span></div>
        </article>`;
      }).join('');
    } catch (err) {
      if (handleAuthLost(err)) return;
      list.innerHTML = emptyHtml('⚠️', escapeHtml(err.message));
    }
  }

  // ---- Bronlar ----
  const RES_STATUS = {
    new: { cls: 'new', label: 'Ko‘rib chiqilmoqda' },
    confirmed: { cls: 'done', label: 'Tasdiqlandi' },
    cancelled: { cls: 'cancelled', label: 'Bekor qilindi' },
  };
  async function loadReservations() {
    const list = $('resList');
    if (!list.dataset.loaded) list.innerHTML = loadingHtml();
    try {
      const { reservations } = await api('/reservations');
      list.dataset.loaded = '1';
      if (!reservations.length) {
        list.innerHTML = emptyHtml('🪑', "Hali stol bron qilmagansiz.", 'index.html?bron=1', 'Stol bron qilish');
        return;
      }
      list.innerHTML = reservations.map((r) => {
        const [y, m, d] = r.res_date.split('-').map(Number);
        const st = RES_STATUS[r.status] || RES_STATUS.new;
        const note = r.note ? ` · ${escapeHtml(r.note)}` : '';
        return `<article class="acc-card acc-res">
          <div class="acc-res-date"><b>${d}</b><small>${MONTHS[m - 1]}</small></div>
          <div class="acc-res-body">
            <div class="acc-res-title">${escapeHtml(r.res_time)} · ${r.party_size} kishi</div>
            <div class="acc-res-sub">${y}-yil${note}</div>
          </div>
          <div class="acc-res-side">
            <span class="acc-badge ${st.cls}">${st.label}</span>
            ${r.can_cancel ? `<button type="button" class="acc-link-btn" data-cancel-res="${r.id}">Bekor qilish</button>` : ''}
          </div>
        </article>`;
      }).join('');
    } catch (err) {
      if (handleAuthLost(err)) return;
      list.innerHTML = emptyHtml('⚠️', escapeHtml(err.message));
    }
  }

  // ---- Manzillar ----
  const addrForm = { editingId: null, label: 'Uy', loc: null };

  function renderAddresses() {
    const list = $('addrList');
    if (!state.addresses.length) {
      list.innerHTML = $('addrForm').classList.contains('hidden')
        ? emptyHtml('📍', "Saqlangan manzil yo'q. Manzil qo'shsangiz, yetkazib berish buyurtmasida bir bosishda tanlanadi.")
        : '';
      return;
    }
    list.innerHTML = state.addresses.map((a) => {
      const icon = a.label === 'Uy' ? '🏠' : a.label === 'Ish' ? '💼' : '📍';
      const title = a.label ? escapeHtml(a.label) : 'Manzil';
      const geo = a.location_lat != null ? ' · <span title="Xaritadagi nuqta saqlangan">🛰️ GPS</span>' : '';
      return `<article class="acc-card acc-addr">
        <div class="acc-addr-ic">${icon}</div>
        <div class="acc-addr-body">
          <div class="acc-addr-title">${title}${a.is_default ? '<span class="acc-pill-default">Asosiy</span>' : ''}</div>
          <div class="acc-addr-text">${escapeHtml(a.address)}${geo}</div>
          <div class="acc-addr-actions">
            <button type="button" class="acc-link-btn" data-edit-addr="${a.id}">Tahrirlash</button>
            ${a.is_default ? '' : `<button type="button" class="acc-link-btn" data-default-addr="${a.id}">Asosiy qilish</button>`}
            <button type="button" class="acc-link-btn muted" data-del-addr="${a.id}">O‘chirish</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  async function loadAddresses() {
    try {
      const data = await api('/addresses');
      state.addresses = data.addresses;
      renderAddresses();
    } catch (err) {
      if (handleAuthLost(err)) return;
      $('addrList').innerHTML = emptyHtml('⚠️', escapeHtml(err.message));
    }
  }

  function setAddrLabel(label) {
    addrForm.label = label;
    $('addrLabelChips').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.label === label));
  }
  function setAddrLoc(loc) {
    addrForm.loc = loc;
    const btn = $('addrLocBtn');
    btn.classList.toggle('done', !!loc);
    btn.querySelector('span').textContent = loc ? 'Joylashuv qo‘shildi ✓' : 'Joriy joylashuvni qo‘shish';
  }
  function openAddrForm(addr) {
    addrForm.editingId = addr ? addr.id : null;
    $('addrFormTitle').textContent = addr ? 'Manzilni tahrirlash' : 'Yangi manzil';
    setAddrLabel(addr ? (addr.label === 'Uy' || addr.label === 'Ish' ? addr.label : '') : 'Uy');
    $('addrText').value = addr ? addr.address : '';
    $('addrDefault').checked = addr ? !!addr.is_default : state.addresses.length === 0;
    setAddrLoc(addr && addr.location_lat != null ? { lat: addr.location_lat, lng: addr.location_lng } : null);
    $('addrError').textContent = '';
    $('addrForm').classList.remove('hidden');
    renderAddresses();
    $('addrText').focus();
  }
  function closeAddrForm() {
    $('addrForm').classList.add('hidden');
    renderAddresses();
  }

  function setupDashboard() {
    $('accTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) selectTab(b.dataset.tab);
    });
    $('ordersRefresh').addEventListener('click', loadOrders);

    $('resList').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cancel-res]');
      if (!b) return;
      if (!confirm('Bronni bekor qilasizmi?')) return;
      b.disabled = true;
      try {
        await api(`/reservations/${b.dataset.cancelRes}/cancel`, { method: 'POST' });
        toast('Bron bekor qilindi');
        loadReservations();
      } catch (err) {
        if (!handleAuthLost(err)) toast(err.message, true);
        b.disabled = false;
      }
    });

    // Manzillar
    $('addrAddBtn').addEventListener('click', () => openAddrForm(null));
    $('addrCancel').addEventListener('click', closeAddrForm);
    $('addrLabelChips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-label]');
      if (b) setAddrLabel(b.dataset.label);
    });
    $('addrLocBtn').addEventListener('click', () => {
      if (addrForm.loc) { setAddrLoc(null); return; }
      if (!navigator.geolocation) { $('addrError').textContent = 'Qurilma joylashuvni aniqlay olmaydi'; return; }
      const btn = $('addrLocBtn');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Aniqlanmoqda…';
      navigator.geolocation.getCurrentPosition(
        (pos) => { btn.disabled = false; setAddrLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => { btn.disabled = false; setAddrLoc(null); $('addrError').textContent = 'Joylashuvga ruxsat berilmadi — manzil matni yetarli'; },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
    $('addrForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('addrError').textContent = '';
      const address = $('addrText').value.trim();
      if (address.length < 5) { $('addrError').textContent = "Manzilni to'liq kiriting (kamida 5 belgi)"; return; }
      const body = {
        label: addrForm.label,
        address,
        is_default: $('addrDefault').checked,
        location_lat: addrForm.loc ? addrForm.loc.lat : null,
        location_lng: addrForm.loc ? addrForm.loc.lng : null,
      };
      const btn = $('addrSave');
      setBusy(btn, true, 'Saqlanmoqda…');
      try {
        const data = addrForm.editingId
          ? await api(`/addresses/${addrForm.editingId}`, { method: 'PUT', body })
          : await api('/addresses', { method: 'POST', body });
        state.addresses = data.addresses;
        closeAddrForm();
        toast(data.duplicate ? 'Bu manzil allaqachon saqlangan' : 'Manzil saqlandi');
      } catch (err) {
        if (!handleAuthLost(err)) $('addrError').textContent = err.message;
      } finally {
        setBusy(btn, false);
      }
    });
    $('addrList').addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit-addr]');
      const del = e.target.closest('[data-del-addr]');
      const def = e.target.closest('[data-default-addr]');
      try {
        if (edit) {
          openAddrForm(state.addresses.find((a) => a.id === Number(edit.dataset.editAddr)));
        } else if (del) {
          if (!confirm("Manzilni o'chirasizmi?")) return;
          const data = await api(`/addresses/${del.dataset.delAddr}`, { method: 'DELETE' });
          state.addresses = data.addresses;
          renderAddresses();
          toast("Manzil o'chirildi");
        } else if (def) {
          const a = state.addresses.find((x) => x.id === Number(def.dataset.defaultAddr));
          const data = await api(`/addresses/${a.id}`, {
            method: 'PUT',
            body: { label: a.label, address: a.address, location_lat: a.location_lat, location_lng: a.location_lng, is_default: true },
          });
          state.addresses = data.addresses;
          renderAddresses();
        }
      } catch (err) {
        if (!handleAuthLost(err)) toast(err.message, true);
      }
    });

    // Profil
    $('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('profError').textContent = '';
      const btn = $('profSave');
      setBusy(btn, true, 'Saqlanmoqda…');
      try {
        const data = await api('/me', { method: 'PUT', body: { full_name: $('profName').value } });
        state.customer = data.customer;
        openDashboard();
        selectTab('profile');
        toast('Profil saqlandi');
      } catch (err) {
        if (!handleAuthLost(err)) $('profError').textContent = err.message;
      } finally {
        setBusy(btn, false);
      }
    });

    async function doLogout(all) {
      if (all && !confirm('Barcha qurilmalardagi (shu jumladan shu) sessiyalar yopiladi. Davom etasizmi?')) return;
      try {
        if (all) await api('/logout-all', { method: 'POST' });
        else await api('/auth/logout', { method: 'POST' });
      } catch (e) { /* baribir chiqamiz */ }
      state.customer = null;
      setHeaderAccount(null);
      ['ordersList', 'resList'].forEach((id) => { delete $(id).dataset.loaded; $(id).innerHTML = ''; });
      $('phoneInput').value = '';
      show('accAuth');
      showStep('stepPhone');
      if (history.replaceState) history.replaceState(null, '', location.pathname);
      toast(all ? 'Barcha qurilmalardan chiqildi' : 'Hisobdan chiqdingiz');
    }
    $('logoutBtn').addEventListener('click', () => doLogout(false));
    $('logoutAllBtn').addEventListener('click', () => doLogout(true));
  }

  // ================= Boshlash =================
  async function init() {
    setupHeader();
    setupAuth();
    setupDashboard();
    try {
      const data = await api('/auth/session');
      if (data.customer) {
        state.customer = data.customer;
        state.addresses = data.addresses || [];
        if (!data.customer.full_name) {
          setHeaderAccount(data.customer);
          show('accAuth');
          showStep('stepName');
        } else {
          openDashboard();
        }
        return;
      }
    } catch (e) { /* tarmoq xatosi — kirish oynasini ko'rsatamiz */ }
    show('accAuth');
    showStep('stepPhone');
  }

  document.addEventListener('DOMContentLoaded', init);
  // Shu sahifada turib "account.html#orders" kabi havola bosilsa — tabni almashtiramiz.
  window.addEventListener('hashchange', () => {
    const tab = location.hash.replace('#', '');
    if (state.customer && TABS.includes(tab) && tab !== activeTab && !$('accDash').classList.contains('hidden')) selectTab(tab);
  });
})();
