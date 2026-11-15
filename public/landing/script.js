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

  // Mobil hamburger menyu — menyu ochiq turganda orqadagi sahifa skroll
  // bo'lmasin (aks holda `position:fixed` panel orqadagi kontent bilan
  // ustma-ust/g'alati holatda ko'rinib qolardi, ayniqsa Android Chrome'da).
  // Bron oynasidagi (`openBookModal`/`closeBookModal`) bilan bir xil naqsh.
  const openNav = () => {
    navToggle.classList.add('open');
    navLinks.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  const closeNav = () => {
    navToggle.classList.remove('open');
    navLinks.classList.remove('open');
    document.body.style.overflow = '';
  };
  navToggle.addEventListener('click', () => {
    if (navLinks.classList.contains('open')) closeNav();
    else openNav();
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
      // Takroriy-yuborish himoyasi (2026-10-10): bitta so'rov uchun bitta
      // marta generatsiya qilinadi — tugma ikki marta bosilsa yoki tarmoq
      // qayta so'rov yuborsa, server ikkinchi marta yangi bron yaratmaydi.
      const idempotency_key = crypto.randomUUID();
      const res = await fetch('../api/public/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, phone, res_date, res_time, party_size, note, idempotency_key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring");

      successText.textContent = `Hurmatli ${full_name}, bron so'rovingiz qabul qilindi. Tez orada siz bilan bog'lanamiz.` +
        (window.zfCustomer ? " Bron holatini \"Hisobim → Bronlar\" bo'limida kuzatishingiz mumkin." : '');
      formWrap.classList.add('hidden');
      successBox.classList.remove('hidden');
      form.reset();
      if (dateInput) dateInput.min = todayISO();
      // Hisobga kirgan mijozda keyingi bron uchun ism/telefon qayta to'ldiriladi.
      if (window.zfCustomer) {
        const c = window.zfCustomer;
        const d = c.phone.replace(/\D/g, '').slice(-9);
        if (c.full_name) document.getElementById('bkName').value = c.full_name;
        document.getElementById('bkPhone').value = `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
      }
    } catch (err) {
      errorBox.textContent = err.message || "Xatolik yuz berdi, birozdan so'ng qayta urinib ko'ring";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Bron qilish';
    }
  });


  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (backdrop.classList.contains('open')) closeBookModal();
  });

  // ============ Mijoz hisobi (2026-11-01) ============
  // Header'dagi "Kirish" havolasi login qilgan mijozda uning ismiga
  // almashadi; bron oynasidagi ism/telefon avtomatik to'ldiriladi (bron
  // server tomonda ham cookie orqali hisobga bog'lanadi). /session login
  // qilmaganda ham 200 qaytaradi — konsolda 401 chiqmaydi.
  fetch('../api/customer/auth/session', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : { customer: null }))
    .then((data) => {
      const customer = data && data.customer;
      window.zfCustomer = customer || null;
      document.querySelectorAll('[data-account-link]').forEach((a) => {
        const label = a.querySelector('[data-account-label]');
        a.classList.toggle('is-logged', !!customer);
        if (label) label.textContent = customer ? (customer.full_name ? customer.full_name.split(' ')[0] : 'Hisobim') : 'Kirish';
      });
      if (customer) {
        const nameEl = document.getElementById('bkName');
        const phoneEl = document.getElementById('bkPhone');
        if (nameEl && !nameEl.value && customer.full_name) nameEl.value = customer.full_name;
        if (phoneEl && !phoneEl.value) {
          const d = customer.phone.replace(/\D/g, '').slice(-9);
          phoneEl.value = `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
        }
      }
    })
    .catch(() => { /* tarmoq xatosi — header "Kirish"ligicha qoladi */ });

  // Hisob sahifasidan "Stol bron qilish" -> index.html?bron=1
  if (new URLSearchParams(location.search).get('bron') === '1') {
    openBookModal();
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
  }
});
