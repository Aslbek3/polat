// Po'lat landing — header scroll holati, mobil menyu, dinamik menyu + savat + bron oynasi.

function fmtSom(n) {
  return Math.round(Number(n) || 0).toLocaleString('uz-UZ') + " so'm";
}

document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('siteHeader');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  // Header: scroll qilinganda qattiq fon
  const onScroll = () => {
    if (window.scrollY > 40) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobil hamburger menyu
  navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      navToggle.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });

  function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

  if (dateInput) dateInput.min = todayISO();

  function openBookModal() {
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
    } catch (err) {
      errorBox.textContent = err.message || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Bron qilish';
    }
  });

  // ============ Dinamik menyu (DB'dan) — faqat ma'lumot uchun ============
  const menuTabsEl = document.getElementById('menuTabs');
  const menuPanelsEl = document.getElementById('menuPanels');

  function renderMenu(categories) {
    if (!categories || categories.length === 0) {
      menuTabsEl.innerHTML = '';
      menuPanelsEl.innerHTML = '<p class="dim center">Hozircha menyu qo\'shilmagan. Tez orada yangilanadi.</p>';
      return;
    }

    menuTabsEl.innerHTML = categories
      .map((cat, i) => `<button class="menu-tab${i === 0 ? ' active' : ''}" data-cat="${cat.id}">${escapeHtml(cat.name)}</button>`)
      .join('');

    menuPanelsEl.innerHTML = categories
      .map((cat, i) => `
        <div class="menu-panel${i === 0 ? ' active' : ''}" data-panel="${cat.id}">
          <div class="menu-list">
            ${cat.items.map((it) => `
              <div class="menu-row">
                <div class="menu-row-main">
                  <h4>${escapeHtml(it.name)}</h4>
                  <div class="menu-row-price">${fmtSom(it.price)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

    const tabs = menuTabsEl.querySelectorAll('.menu-tab');
    const panels = menuPanelsEl.querySelectorAll('.menu-panel');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const cat = tab.dataset.cat;
        tabs.forEach((t) => t.classList.toggle('active', t === tab));
        panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === cat));
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

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
  });
});
