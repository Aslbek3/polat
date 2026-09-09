// Umumiy yordamchi funksiyalar — barcha sahifalarda ulanadi (public/landing/
// bundan mustaqin — login shart bo'lmagan mijoz sahifasi, o'zining alohida
// script.js'ini ishlatadi, app.js'ni ulamaydi).
//
// API_BASE: nisbiy yo'l ishlatiladi (mutlaq "/api/..." emas) — admin/ va
// waiter/ papkalaridagi sahifalar ildizdan bir bosqich pastda bo'lgani
// uchun ular <script src="../app.js" data-api-base="../"></script>
// orqali "../" prefiksini uzatadi; ildizdagi sahifalar (login.html)
// prefikssiz ("") ishlaydi. ESKATMA (2026-09-09'da tuzatildi): bu izohda
// ilgari "asosiy saytning /polat/ ostki yo'lida proksi qilingan holda ham
// ishlashi kerak" deyilgan edi — bu ESKIRGAN edi, o'sha proksi allaqachon
// olib tashlangan, polat endi mustaqil polatuz.duckdns.org subdomenida
// ishlaydi (root CLAUDE.md'ga qarang). Nisbiy yo'l yondashuvi baribir
// to'g'ri/kerakli (admin/waiter sahifalari ildizdan pastda joylashgani
// sababli), shu sabab kodning o'zi o'zgarishsiz qoldi — faqat izohdagi
// noto'g'ri sabab tuzatildi.
const API_BASE = (document.currentScript && document.currentScript.getAttribute('data-api-base')) || '';

// Barcha sahifalarda ishlatiladigan umumiy HTML-escape — ilgari 15 xil
// faylda (admin/waiter/chef/courier sahifalarining har birida) mustaqil,
// bayt-baytiga bir xil nusxada takrorlangan edi (2026-09-09'da shu yagona
// nusxaga birlashtirildi — har bir sahifa app.js'ni <script> orqali
// ulagani uchun bu funksiya global qilib qoladi, boshqa fayllar qayta
// e'lon qilishi shart emas). public/landing/script.js BUNDAN MUSTASNO —
// u app.js'ni ulamaydi (login shart emas mijoz sahifasi), shu sabab
// o'zining mustaqil nusxasini saqlab qoladi.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

// Bitta tugmali ("Yopish") umumiy ma'lumot oynasi — customConfirm bilan bir xil
// .modal-backdrop naqshidan foydalanadi. Afitsiant menyusida taom ustiga
// (+ tugmasi emas) bosilganda shu taom haqidagi tavsifni ko'rsatish uchun
// ishlatiladi (public/waiter/order.js, showItemInfo()).
function ensureInfoModal() {
  let el = document.getElementById('customInfoModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'customInfoModal';
    el.className = 'modal-backdrop hidden';
    el.innerHTML = `
      <div class="modal">
        <h2 id="customInfoTitle"></h2>
        <p id="customInfoBody" class="dim" style="white-space:pre-wrap;"></p>
        <div class="modal-actions">
          <button class="btn primary" id="customInfoClose">Yopish</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  }
  return el;
}

function showInfoModal(title, body) {
  const el = ensureInfoModal();
  el.querySelector('#customInfoTitle').textContent = title;
  el.querySelector('#customInfoBody').textContent = body;
  el.classList.remove('hidden');
  const closeBtn = el.querySelector('#customInfoClose');
  const finish = () => {
    el.classList.add('hidden');
    closeBtn.removeEventListener('click', finish);
    el.removeEventListener('click', onBackdrop);
  };
  const onBackdrop = (e) => { if (e.target === el) finish(); };
  closeBtn.addEventListener('click', finish);
  el.addEventListener('click', onBackdrop);
}

// ---------------- Chekni yangi oyna/tab OCHMASDAN chop etish (modal) ----------------
// Avval "Chekni chop etish" har bosilganda /waiter/receipt.html'ni target="_blank"
// bilan yangi tabda ochardi — bir nechta chek kelsa, tab ustiga tab ko'payib
// borardi. Endi hech qanday navigatsiya/yangi oyna yo'q: chek ma'lumoti fetch
// qilinib, shu (admin) sahifaning o'zida umumiy .modal-backdrop naqshida
// ko'rsatiladi; QZ Tray kutubxonasi esa har admin sahifasida oldindan emas,
// faqat chek birinchi marta chop etilayotganda "lazy" yuklanadi.
let qzScriptPromise = null;
function loadQzTray() {
  if (typeof qz !== 'undefined') return Promise.resolve();
  if (qzScriptPromise) return qzScriptPromise;
  qzScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('QZ Tray kutubxonasi yuklanmadi (internet aloqasini tekshiring).'));
    document.head.appendChild(script);
  });
  return qzScriptPromise;
}

let qzSecuritySetUp = false;
function setupQzSecurity() {
  if (qzSecuritySetUp) return;
  qzSecuritySetUp = true;
  qz.security.setCertificatePromise((resolve, reject) => {
    api('/admin/qz/certificate').then((data) => resolve(data.certificate)).catch(reject);
  });
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    api('/admin/qz/sign', { method: 'POST', body: { request: toSign } })
      .then((data) => resolve(data.signature))
      .catch(reject);
  });
}

const RECEIPT_PRINTER_NAME = 'Kassa-Printer';

// Chap va o'ng matnni bitta qatorga (belgilangan kenglikda) tekislaydi —
// termal printerda ustunlar (nom ... narx) to'g'ri qatorga tushishi uchun.
function padReceiptLine(left, right, width = 42) {
  left = String(left);
  right = String(right);
  const space = width - left.length - right.length;
  if (space < 1) {
    left = left.slice(0, Math.max(0, width - right.length - 1));
    return `${left} ${right}`;
  }
  return left + ' '.repeat(space) + right;
}

// Chekni ESC/POS xom (raw) buyruqlar ketma-ketligiga aylantiradi.
function buildEscPosReceipt(view) {
  const WIDTH = 42;
  const activeItems = view.items.filter((it) => it.status === 'active');
  const data = [];
  data.push('\x1B\x40');
  data.push('\x1B\x61\x01');
  data.push('\x1B\x21\x30');
  data.push("Ziyo Famliy restorani\n");
  data.push('\x1B\x21\x00');
  data.push(`${view.order.table_name}\n`);
  data.push(`${fmtDateTime(view.order.closed_at || view.order.opened_at)}\n`);
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x61\x00');
  activeItems.forEach((it) => {
    const name = `${it.name_snapshot} x${it.quantity}`;
    data.push(padReceiptLine(name, fmtMoney(it.subtotal), WIDTH) + '\n');
  });
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x21\x30');
  data.push(padReceiptLine('JAMI', fmtMoney(view.total), WIDTH) + '\n');
  data.push('\x1B\x21\x00');
  data.push('\x1B\x61\x01');
  data.push('Xaridingiz uchun rahmat!\n');
  data.push('\n\n\n');
  data.push('\x1D\x56\x41\x00');
  return data;
}

function ensureReceiptModal() {
  let el = document.getElementById('receiptModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'receiptModal';
    el.className = 'modal-backdrop hidden';
    el.innerHTML = `
      <div class="modal">
        <div id="receiptModalBox" class="receipt"><p class="dim">Yuklanmoqda...</p></div>
        <div class="modal-actions">
          <button class="btn" id="receiptModalClose">Yopish</button>
          <button class="btn primary" id="receiptModalPrint">Chekni chop etish</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  }
  return el;
}

function renderReceiptBox(view) {
  if (view.kind === 'customer') return renderCustomerReceiptBox(view);
  if (view.kind === 'manual') return renderManualReceiptBox(view);
  const box = document.getElementById('receiptModalBox');
  const activeItems = view.items.filter((it) => it.status === 'active');
  box.innerHTML = `
    <h2>Ziyo Famliy restorani</h2>
    <div class="r-sub">${escapeHtml(view.order.table_name)} · ${fmtDateTime(view.order.closed_at || view.order.opened_at)}</div>
    <hr>
    <table>
      ${activeItems.map((it) => `
        <tr>
          <td>${escapeHtml(it.name_snapshot)} × ${it.quantity}</td>
          <td class="text-right">${fmtMoney(it.subtotal)}</td>
        </tr>
      `).join('')}
      <tr class="r-total-row">
        <td>Jami</td>
        <td class="text-right">${fmtMoney(view.total)}</td>
      </tr>
    </table>
    <hr>
    <div class="dim" style="font-size:12px;">
      ${view.order.opened_by_name ? `Ochdi: ${escapeHtml(view.order.opened_by_name)}<br>` : ''}
      ${view.order.closed_by_name ? `Yopdi: ${escapeHtml(view.order.closed_by_name)}<br>` : ''}
      Holat: ${view.order.status === 'closed' ? 'Yopilgan' : 'Ochiq'}
    </div>
  `;
}

// Landing sahifadan kelgan (login shart emas) mijoz buyurtmasi (customer_orders)
// uchun chek — dine-in `orders`dan farqli, stol/afitsiant emas, mijoz
// ismi/telefoni/manzili bor (2026-09-08, admin "Buyurtmalar" sahifasidagi
// "🖨 Chek" tugmasi orqali, public/admin/customer-orders.js). Bir xil modal/QZ
// Tray infratuzilmasi (ensureReceiptModal/printReceiptView) ishlatiladi,
// faqat render/ESC-POS qurish funksiyasi `view.kind === 'customer'` bo'yicha
// ajratiladi.
function renderCustomerReceiptBox(view) {
  const box = document.getElementById('receiptModalBox');
  box.innerHTML = `
    <h2>Ziyo Famliy restorani</h2>
    <div class="r-sub">${escapeHtml(view.order.heading)} · ${fmtDateTime(view.order.created_at)}</div>
    <hr>
    <table>
      ${view.items.map((it) => `
        <tr>
          <td>${escapeHtml(it.name_snapshot)} × ${it.quantity}</td>
          <td class="text-right">${fmtMoney(it.subtotal)}</td>
        </tr>
      `).join('')}
      <tr class="r-total-row">
        <td>Jami</td>
        <td class="text-right">${fmtMoney(view.total)}</td>
      </tr>
    </table>
    <hr>
    <div class="dim" style="font-size:12px;">
      ${view.order.phone ? `Tel: ${escapeHtml(view.order.phone)}<br>` : ''}
      ${view.order.address ? `Manzil: ${escapeHtml(view.order.address)}<br>` : ''}
      ${view.order.note ? `Izoh: ${escapeHtml(view.order.note)}<br>` : ''}
    </div>
  `;
}

// Kassir "Hisoblash" (qo'lda kiritilgan, stol/menyuga bog'liq bo'lmagan chek)
// uchun — 2026-09-09, server/services/manualBills.js'dagi `kind: 'manual'`
// view'iga mos. renderCustomerReceiptBox/buildEscPosReceiptCustomer bilan bir
// xil naqsh, faqat telefon/manzil o'rniga "Hisobladi: <kassir>" ko'rsatiladi.
function renderManualReceiptBox(view) {
  const box = document.getElementById('receiptModalBox');
  box.innerHTML = `
    <h2>Ziyo Famliy restorani</h2>
    <div class="r-sub">${escapeHtml(view.order.heading)} · ${fmtDateTime(view.order.created_at)}</div>
    <hr>
    <table>
      ${view.items.map((it) => `
        <tr>
          <td>${escapeHtml(it.name_snapshot)} × ${it.quantity}</td>
          <td class="text-right">${fmtMoney(it.subtotal)}</td>
        </tr>
      `).join('')}
      <tr class="r-total-row">
        <td>Jami</td>
        <td class="text-right">${fmtMoney(view.total)}</td>
      </tr>
    </table>
    <hr>
    <div class="dim" style="font-size:12px;">
      ${view.order.created_by_name ? `Hisobladi: ${escapeHtml(view.order.created_by_name)}<br>` : ''}
    </div>
  `;
}

function buildEscPosReceiptManual(view) {
  const WIDTH = 42;
  const data = [];
  data.push('\x1B\x40');
  data.push('\x1B\x61\x01');
  data.push('\x1B\x21\x30');
  data.push("Ziyo Famliy restorani\n");
  data.push('\x1B\x21\x00');
  data.push(`${view.order.heading}\n`);
  data.push(`${fmtDateTime(view.order.created_at)}\n`);
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x61\x00');
  view.items.forEach((it) => {
    const name = `${it.name_snapshot} x${it.quantity}`;
    data.push(padReceiptLine(name, fmtMoney(it.subtotal), WIDTH) + '\n');
  });
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x21\x30');
  data.push(padReceiptLine('JAMI', fmtMoney(view.total), WIDTH) + '\n');
  data.push('\x1B\x21\x00');
  if (view.order.created_by_name) data.push(`Hisobladi: ${view.order.created_by_name}\n`);
  data.push('\x1B\x61\x01');
  data.push('Xaridingiz uchun rahmat!\n');
  data.push('\n\n\n');
  data.push('\x1D\x56\x41\x00');
  return data;
}

function buildEscPosReceiptCustomer(view) {
  const WIDTH = 42;
  const data = [];
  data.push('\x1B\x40');
  data.push('\x1B\x61\x01');
  data.push('\x1B\x21\x30');
  data.push("Ziyo Famliy restorani\n");
  data.push('\x1B\x21\x00');
  data.push(`${view.order.heading}\n`);
  data.push(`${fmtDateTime(view.order.created_at)}\n`);
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x61\x00');
  view.items.forEach((it) => {
    const name = `${it.name_snapshot} x${it.quantity}`;
    data.push(padReceiptLine(name, fmtMoney(it.subtotal), WIDTH) + '\n');
  });
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x21\x30');
  data.push(padReceiptLine('JAMI', fmtMoney(view.total), WIDTH) + '\n');
  data.push('\x1B\x21\x00');
  if (view.order.phone) data.push(`Tel: ${view.order.phone}\n`);
  if (view.order.address) data.push(`Manzil: ${view.order.address}\n`);
  data.push('\x1B\x61\x01');
  data.push('Xaridingiz uchun rahmat!\n');
  data.push('\n\n\n');
  data.push('\x1D\x56\x41\x00');
  return data;
}

async function printReceiptView(view) {
  await loadQzTray();
  setupQzSecurity();
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
  const config = qz.configs.create(RECEIPT_PRINTER_NAME, { encoding: 'CP866' });
  const data = view.kind === 'customer' ? buildEscPosReceiptCustomer(view)
    : view.kind === 'manual' ? buildEscPosReceiptManual(view)
    : buildEscPosReceipt(view);
  await qz.print(config, data);
}

function showReceiptModal(view) {
  const el = ensureReceiptModal();
  renderReceiptBox(view);
  el.classList.remove('hidden');
  const closeBtn = el.querySelector('#receiptModalClose');
  const printBtn = el.querySelector('#receiptModalPrint');
  const finish = () => {
    el.classList.add('hidden');
    closeBtn.removeEventListener('click', finish);
    printBtn.removeEventListener('click', onPrint);
    el.removeEventListener('click', onBackdrop);
  };
  const onBackdrop = (e) => { if (e.target === el) finish(); };
  const onPrint = async () => {
    printBtn.disabled = true;
    try {
      await printReceiptView(view);
      toast('Chek chop etildi.');
      finish();
    } catch (err) {
      console.error(err);
      alert(
        `Printerga chop etib bo'lmadi: ${err.message || err}\n\n` +
        `Tekshiring: QZ Tray dasturi ishga tushirilganmi va Windows'da printer aynan "${RECEIPT_PRINTER_NAME}" deb nomlanganmi.`
      );
    } finally {
      printBtn.disabled = false;
    }
  };
  closeBtn.addEventListener('click', finish);
  printBtn.addEventListener('click', onPrint);
  el.addEventListener('click', onBackdrop);
}

// area — qaysi rol hududidagi chek endpoint'i ishlatilishi kerak ('waiter'
// standart; kassir sahifasi 'kassir' bilan chaqiradi, server/routes/
// kassirTables.js'dagi GET /orders/:id/receipt'ga mos). Admin har doim ham
// (areaRole tekshiruvidan chetlab o'tadi) ikkalasini ham chaqira oladi.
async function openReceiptByOrderId(orderId, area = 'waiter') {
  try {
    const view = await api(`/${area}/orders/${orderId}/receipt`);
    showReceiptModal(view);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Admin "Buyurtmalar" (customer_orders) sahifasi buyurtmani items bilan
// birga ALLAQACHON yuklab olgan (GET /admin/customer-orders) — alohida
// "chek" API'siga ehtiyoj yo'q, shu obyektning o'zidan chek ko'rinishi
// tuziladi (public/admin/customer-orders.js chaqiradi).
const FULFILLMENT_LABEL_RECEIPT = { pickup: "Olib ketish", delivery: 'Yetkazib berish' };
function openCustomerReceiptModal(order) {
  const view = {
    kind: 'customer',
    order: {
      heading: `${FULFILLMENT_LABEL_RECEIPT[order.fulfillment] || order.fulfillment} — ${order.full_name}`,
      created_at: order.created_at,
      phone: order.phone,
      address: order.address,
      note: order.note,
    },
    items: order.items,
    total: order.total_amount,
  };
  showReceiptModal(view);
}

function initNav(activePage) {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.page === activePage) a.classList.add('active');
  });
  initNavToggle(nav);
}

// Sidebar rejimida (>=720px, style.css'dagi shu breakpointdagi .bottom-nav
// qoidalariga qarang) menyu standart holatda yopiq turadi — topbar'dagi
// "☰ Menyu" tugmasi bosilsa ochiladi, bo'lim tugmasi yoki orqa fon (backdrop)
// bosilsa yopiladi. Mobil pastki tab-bar rejimida (720px'dan kichik) tugma
// CSS orqali yashirin, shuning uchun bu yerdagi ochish/yopish hech narsaga
// ta'sir qilmaydi. Tugma/backdrop har sahifada bir marta, dinamik yaratiladi
// (ensureNotifList() bilan bir xil naqsh) — 9 ta admin HTML faylini alohida
// tahrirlamaslik uchun.
function initNavToggle(nav) {
  let backdrop = document.getElementById('navBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'navBackdrop';
    backdrop.className = 'nav-backdrop';
    document.body.appendChild(backdrop);
  }
  const close = () => {
    nav.classList.remove('open');
    backdrop.classList.remove('open');
  };
  const topbar = document.querySelector('.topbar');
  if (topbar && !document.getElementById('navToggleBtn')) {
    const btn = document.createElement('button');
    btn.id = 'navToggleBtn';
    btn.className = 'nav-toggle-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Menyu');
    btn.textContent = '☰ Menyu';
    topbar.insertBefore(btn, topbar.firstChild);
    btn.addEventListener('click', () => {
      nav.classList.toggle('open');
      backdrop.classList.toggle('open');
    });
  }
  backdrop.addEventListener('click', close);
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
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
      <span class="notif-msg">${escapeHtml(n.message)}</span>
      ${n.acknowledged_at
        ? `<span class="notif-ack">✅ ${escapeHtml(n.acknowledged_by_name || '')} qabul qildi</span>`
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
// faqat /admin/ sahifalarida ishlaydi va "Chekni chop etish" tugmasi hech
// qanday yangi tab/oyna ochmasdan, shu sahifaning o'zida modal ko'rinishida
// chekni ko'rsatadi (yuqoridagi "Chekni yangi oyna ochmasdan chop etish" bo'limi).
function renderPrintRequests(rows) {
  const box = ensureNotifList();
  if (!rows || rows.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = rows.map((r) => `
    <div class="notif-card">
      <span class="notif-msg">${escapeHtml(r.table_name)} — hisob-kitob qilindi (${fmtMoney(r.total_amount)})</span>
      <button class="btn small primary" data-print-req="${r.id}" data-order-id="${r.order_id}">Chekni chop etish</button>
    </div>
  `).join('');
  box.querySelectorAll('[data-print-req]').forEach((btn) => {
    btn.addEventListener('click', () => {
      markPrintRequestPrinted(Number(btn.dataset.printReq));
      openReceiptByOrderId(Number(btn.dataset.orderId));
    });
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
  // 10s edi — admin chekni kutayotganda kechikish sezilarli bo'lgani uchun
  // 3s'ga tushirildi (foydalanuvchi so'rovi, 2026-09-07).
  setInterval(pollPrintRequests, 3000);
}

// ---------------- Yangi yetkazib berish buyurtmasi — admin/oshpaz/dastavkachi ----------------
// Mijoz landing sahifasidan yetkazib berish (delivery) buyurtmasi kelganda
// (server/routes/publicCustomerOrders.js) uch rolga BARAVAR ko'rinadigan
// bildirishnoma (2026-09-08) — shu bilan admin chekni tayyorlaydi, oshpaz
// taomni tayyorlaydi, dastavkachi esa oldindan xabardor bo'lib turadi.
// Yuqoridagi afitsiant/print-so'rovlar naqshi bilan bir xil (poll + "Ko'rdim"
// tugmasi + ~30s grace-oyna), lekin ALOHIDA konteynerda (deliveryAlertList) —
// admin sahifasida print-so'rovlar ro'yxati bilan bir xil notifList'ni
// ishlatsa, ikkalasi bir-birining innerHTML'ini almashtirib yuborar edi.
function ensureDeliveryAlertList() {
  let el = document.getElementById('deliveryAlertList');
  if (!el) {
    el = document.createElement('div');
    el.id = 'deliveryAlertList';
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

function renderDeliveryAlerts(rows) {
  const box = ensureDeliveryAlertList();
  if (!rows || rows.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = rows.map((n) => `
    <div class="notif-card ${n.acknowledged_at ? 'done' : ''}">
      <span class="notif-msg">${escapeHtml(n.message)}</span>
      ${n.acknowledged_at
        ? `<span class="notif-ack">✅ ${escapeHtml(n.acknowledged_by_name || '')} ko'rdi</span>`
        : `<button class="btn small primary" data-deliv-ack="${n.id}">Ko'rdim</button>`}
    </div>
  `).join('');
  box.querySelectorAll('[data-deliv-ack]').forEach((btn) => {
    btn.addEventListener('click', () => acknowledgeDeliveryAlert(Number(btn.dataset.delivAck)));
  });
}

async function acknowledgeDeliveryAlert(id) {
  try {
    await api(`/delivery-alerts/${id}/acknowledge`, { method: 'POST' });
    pollDeliveryAlerts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function pollDeliveryAlerts() {
  try {
    const rows = await api('/delivery-alerts/unread');
    renderDeliveryAlerts(rows);
  } catch (e) { /* keyingi tsiklda qayta urinadi */ }
}

function initDeliveryAlerts() {
  const p = window.location.pathname;
  if (!p.includes('/admin/') && !p.includes('/chef/') && !p.includes('/courier/')) return;
  pollDeliveryAlerts();
  setInterval(pollDeliveryAlerts, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  initLogout();
  initWaiterNotifications();
  initAdminPrintRequests();
  initDeliveryAlerts();
});
