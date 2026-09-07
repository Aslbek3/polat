// Umumiy yordamchi funksiyalar — barcha sahifalarda ulanadi.
//
// API_BASE: bu ilova o'z domenida ildizda ("/") HAM, asosiy saytning
// /polat/ ostki yo'lida proksi qilingan holda HAM ishlashi kerak, shu
// sabab mutlaq "/api/..." emas, doim nisbiy yo'l ishlatiladi. admin/ va
// waiter/ papkalaridagi sahifalar ildizdan bir bosqich pastda bo'lgani
// uchun ular <script src="../app.js" data-api-base="../"></script>
// orqali "../" prefiksini uzatadi; ildizdagi sahifalar (login.html)
// prefikssiz ("") ishlaydi.
const API_BASE = (document.currentScript && document.currentScript.getAttribute('data-api-base')) || '';

async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (options.body !== undefined) opts.body = JSON.stringify(options.body);
  const res = await fetch(`${API_BASE}api${path}`, opts);
  if (res.status === 401) {
    window.location.href = `${API_BASE}login.html`;
    throw new Error('unauthorized');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* body yo'q bo'lishi mumkin */ }
  if (!res.ok) {
    const message = (data && data.error) || `Xatolik (${res.status})`;
    throw new Error(message);
  }
  return data;
}

function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('uz-UZ') + " so'm";
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let toastTimer = null;
function toast(message, type = 'ok', durationMs = 3000) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, durationMs);
}

// Brauzerning standart (ekranga mos kelmaydigan, "<sayt> says" ko'rinishidagi)
// window.confirm() o'rniga ilova dizayniga mos custom oyna — mavjud
// .modal-backdrop/.modal/.modal-actions CSS naqshidan (admin/tables.html va
// h.k.dagi qo'lda yozilgan modallar bilan bir xil) DOM'ga dinamik qo'shiladi,
// shuning uchun har bir HTML sahifaga alohida qo'shish shart emas.
// Promise qaytaradi: OK bosilsa true, Bekor/orqa fon bosilsa false.
function ensureConfirmModal() {
  let el = document.getElementById('customConfirmModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'customConfirmModal';
    el.className = 'modal-backdrop hidden';
    el.innerHTML = `
      <div class="modal">
        <h2>Tasdiqlash</h2>
        <p id="customConfirmMsg" class="dim"></p>
        <div class="modal-actions">
          <button class="btn" id="customConfirmCancel">Bekor</button>
          <button class="btn primary" id="customConfirmOk">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  }
  return el;
}

function customConfirm(message) {
  return new Promise((resolve) => {
    const el = ensureConfirmModal();
    el.querySelector('#customConfirmMsg').textContent = message;
    el.classList.remove('hidden');
    const okBtn = el.querySelector('#customConfirmOk');
    const cancelBtn = el.querySelector('#customConfirmCancel');
    const finish = (result) => {
      el.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      el.removeEventListener('click', onBackdrop);
      resolve(result);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onBackdrop = (e) => { if (e.target === el) finish(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    el.addEventListener('click', onBackdrop);
  });
}

function initNav(activePage) {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.page === activePage) a.classList.add('active');
  });
}

function initLogout() {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch (e) { /* baribir yo'naltiramiz */ }
    // login.html emas — mijozlar uchun ochiq landing sahifasiga qaytariladi
    // (xodim sifatida qayta kirish landing header'idagi "Xodim kirishi" orqali).
    window.location.href = `${API_BASE}landing/`;
  });
}

// Oshpaz dine-in taomni "🏁 Tayyor" deb belgilaganda (public/chef/kitchen.js)
// server "notifications" jadvaliga yozadi (server/routes/chefKitchen.js);
// AFITSIANT sahifalari shu yerda 10s'da poll qilib doimiy kartochka ko'rsatadi —
// oddiy toast emas, chunki "Qabul qildim" tugmasi bosilmaguncha ekrandan
// yo'qolmasligi kerak. Bosilgach server kim (ism) va qachon tasdiqlaganini
// yozadi, karta "✅ <Ism> qabul qildi" holatiga o'tadi (server ~30s grace-oyna
// bilan buni boshqa afitsiantlarning ekraniga ham yuboradi, keyin tushib qoladi).
// Faqat /waiter/ ostidagi sahifalarda ishlaydi (admin/chef/login/landing
// sahifalarida keraksiz so'rov yubormaslik uchun).
function escapeHtmlNotif(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ensureNotifList() {
  let el = document.getElementById('notifList');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notifList';
    el.className = 'notif-list';
    const topbar = document.querySelector('.topbar');
    if (topbar && topbar.parentNode) {
      topbar.insertAdjacentElement('afterend', el);
    } else {
      document.body.insertBefore(el, document.body.firstChild);
    }
  }
  return el;
}

function renderWaiterNotifications(rows) {
  const box = ensureNotifList();
  if (!rows || rows.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = rows.map((n) => `
    <div class="notif-card ${n.acknowledged_at ? 'done' : ''}">
      <span class="notif-msg">${escapeHtmlNotif(n.message)}</span>
      ${n.acknowledged_at
        ? `<span class="notif-ack">✅ ${escapeHtmlNotif(n.acknowledged_by_name || '')} qabul qildi</span>`
        : `<button class="btn small primary" data-ack="${n.id}">Qabul qildim</button>`}
    </div>
  `).join('');
  box.querySelectorAll('[data-ack]').forEach((btn) => {
    btn.addEventListener('click', () => acknowledgeWaiterNotification(Number(btn.dataset.ack)));
  });
}

async function acknowledgeWaiterNotification(id) {
  try {
    await api(`/waiter/notifications/${id}/acknowledge`, { method: 'POST' });
    pollWaiterNotifications();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function pollWaiterNotifications() {
  try {
    const rows = await api('/waiter/notifications/unread');
    renderWaiterNotifications(rows);
  } catch (e) { /* keyingi tsiklda qayta urinadi */ }
}

function initWaiterNotifications() {
  if (!window.location.pathname.includes('/waiter/')) return;
  pollWaiterNotifications();
  setInterval(pollWaiterNotifications, 10000);
}

// ---------------- Admin: chop etish kutilayotgan cheklar ----------------
// Afitsiant stolni yopganda (hisob-kitob) chek endi o'zida chop etilmaydi —
// termal printer faqat administrator kompyuteriga ulangani uchun server
// print_requests navbatiga yozadi (server/services/orders.js closeTable()).
// Bu yerda xuddi shu afitsiant-bildirishnoma naqshi (yuqorida) takrorlanadi,
// faqat /admin/ sahifalarida ishlaydi va "Chekni chop etish" tugmasi
// receipt.html'ni (QZ Tray orqali chop etadigan sahifa) yangi tabda ochadi.
function renderPrintRequests(rows) {
  const box = ensureNotifList();
  if (!rows || rows.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = rows.map((r) => `
    <div class="notif-card">
      <span class="notif-msg">${escapeHtmlNotif(r.table_name)} — hisob-kitob qilindi (${fmtMoney(r.total_amount)})</span>
      <a class="btn small primary" href="../waiter/receipt.html?order=${r.order_id}" target="_blank" data-print-req="${r.id}">Chekni chop etish</a>
    </div>
  `).join('');
  box.querySelectorAll('[data-print-req]').forEach((link) => {
    link.addEventListener('click', () => markPrintRequestPrinted(Number(link.dataset.printReq)));
  });
}

async function markPrintRequestPrinted(id) {
  try {
    await api(`/admin/print-requests/${id}/printed`, { method: 'POST' });
    pollPrintRequests();
  } catch (e) { /* jim — keyingi tsiklda ro'yxat baribir yangilanadi */ }
}

async function pollPrintRequests() {
  try {
    const rows = await api('/admin/print-requests/unread');
    renderPrintRequests(rows);
  } catch (e) { /* keyingi tsiklda qayta urinadi */ }
}

function initAdminPrintRequests() {
  if (!window.location.pathname.includes('/admin/')) return;
  pollPrintRequests();
  setInterval(pollPrintRequests, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
  initLogout();
  initWaiterNotifications();
  initAdminPrintRequests();
});
