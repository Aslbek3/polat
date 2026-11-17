// Chek / QZ Tray / oshxona cheki chop etish — 2026-10-24'da app.js'dan ajratildi
// ("Kod sifati": app.js 900 qator edi). Kod O'ZGARTIRILMAGAN, faqat ko'chirildi.
// app.js'dan KEYIN ulanadi va uning global yordamchilarini (api, escapeHtml,
// fmtMoney, toast, API_BASE ...) ishlatadi.

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
    api('/qz/certificate').then((data) => resolve(data.certificate)).catch(reject);
  });
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    api('/qz/sign', { method: 'POST', body: { request: toSign } })
      .then((data) => resolve(data.signature))
      .catch(reject);
  });
}

const RECEIPT_PRINTER_NAME = 'Kassa-Printer';

// 2026-10-10: foydalanuvchida kassa va oshxona uchun BITTA jismoniy printer
// bor — avvalgi alohida "Oshxona-Printer" nomi olib tashlandi, oshxona
// cheki endi xuddi shu RECEIPT_PRINTER_NAME'ga chop etiladi.
const KITCHEN_PRINTER_NAME = RECEIPT_PRINTER_NAME;

// Kassir "Qo'lda hisoblash" chekining yuqorisidagi telefon qatori —
// `public/landing/index.html`dagi "Aloqa" bo'limida mijozlarga ko'rsatilgan
// raqamlar bilan AYNAN bir xil (2026-11-15, foydalanuvchi so'rovi). Restoran
// manzili boshida ham bor edi, lekin 2026-11-15'da foydalanuvchi so'rovi
// bilan olib tashlandi (kerak emas deb topildi).
const RESTAURANT_HEADER_NAME = 'ZIYO FAMILY';
const RESTAURANT_PHONES = ['+998 91 652 77 71', '+998 98 575 75 74'];

// fmtMoney() "so'm" qo'shib qaytaradi — qo'lda hisoblash chekidagi taom
// qatorlari/оraliq summalarda (Taomlar/Yetkazib berish) foydalanuvchi bergan
// maketda "so'm" yozilmagan, faqat YAKUNIY JAMI'da bor — shu sabab shu yerga
// xos oddiy (so'mSIZ) raqam formatlagich.
function fmtMoneyPlain(n) {
  return Math.round(Number(n) || 0).toLocaleString('uz-UZ');
}

// Bir qatorda chapga va o'ngga tekislangan ikki matn (ESC/POS, oddiy
// o'lcham) — Chek/Kassir meta qatorlari va Taomlar/Yetkazib berish oraliq
// summalari uchun.
function twoColLine(left, right, width = 42) {
  const gap = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
}

// Bitta qatorni ESC/POS "double size" (balandligi+kengligi 2x) rejimida,
// berilgan tekislash bilan chop etadi, so'ng oddiy holatga qaytaradi.
// Taom NOMIDAN tashqari qolgan barcha qatorlar (sarlavha osti, narxlar,
// "Jami", "Yetkazib berish", pastki izoh) shu orqali katta chiqadi —
// 2026-11-09, foydalanuvchi so'rovi ([[feedback-receipt-font-hierarchy]]
// xotira yozuvi: ekrandagi katta/kichik qoidasi printerda ham amal qilsin).
function pushDoubleLine(data, text, align = 'left') {
  const alignCode = { left: '\x00', center: '\x01', right: '\x02' }[align] || '\x00';
  data.push(`\x1B\x61${alignCode}`);
  data.push('\x1B\x21\x30');
  data.push(`${text}\n`);
  data.push('\x1B\x21\x00');
  data.push('\x1B\x61\x00');
}

// Taom qatori: nomi ODDIY o'lchamda, o'z qatorida (chapga tekislangan,
// ekrandagi `.r-item-name` bilan bir xil — o'zgarmaydi), narxi esa ALOHIDA
// qatorda, katta va o'ngga tekislangan holda. ESC/POS'da bitta qatorda ikki
// xil shrift o'lchamini ustun sifatida to'g'ri tekislab bo'lmaydi (katta
// belgilar 2x kenglik egallaydi, oldingi qattiq-kenglikdagi ustun hisobini
// buzadi) — shu sabab narx nomdan alohida qatorga ko'chirilgan.
function pushItemLines(data, name, price) {
  data.push('\x1B\x61\x00');
  data.push(`${name}\n`);
  pushDoubleLine(data, price, 'right');
}

// Qalin + 2x balandlik (Mijoz/Manzil qatorlari, "qo'lda hisoblash" cheki,
// 2026-11-15) — pushDoubleLine'ga qalin (\x1B\x45\x01) qo'shilgan versiyasi.
function pushBoldDoubleLine(data, text, align = 'left') {
  const alignCode = { left: '\x00', center: '\x01', right: '\x02' }[align] || '\x00';
  data.push(`\x1B\x61${alignCode}`);
  data.push('\x1B\x45\x01');
  data.push('\x1B\x21\x30');
  data.push(`${text}\n`);
  data.push('\x1B\x21\x00');
  data.push('\x1B\x45\x00');
  data.push('\x1B\x61\x00');
}

// Qalin, ODDIY o'lcham, markazda ("YETKAZIB BERISH" sarlavhasi).
function pushBoldLine(data, text) {
  data.push('\x1B\x61\x01');
  data.push('\x1B\x45\x01');
  data.push(`${text}\n`);
  data.push('\x1B\x45\x00');
  data.push('\x1B\x61\x00');
}

// Qalin + FAQAT balandligi 2x (kengligi O'ZGARMAYDI) — qattiq-kenglikdagi
// ustunli qator (Nomi/Soni/Narxi/Summa) buzilmasin deb, `pushDoubleLine`dan
// farqli `GS ! n` (kenglik×1, balandlik×2) ishlatiladi, `ESC !` emas (u
// kenglikni ham 2x qilib ustun hisobini buzardi). 2026-11-15 (3).
function pushBoldTallLine(data, text) {
  data.push('\x1B\x45\x01');
  data.push('\x1D\x21\x01');
  data.push(`${text}\n`);
  data.push('\x1D\x21\x00');
  data.push('\x1B\x45\x00');
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
  pushDoubleLine(data, view.order.table_name, 'center');
  pushDoubleLine(data, fmtDateTime(view.order.closed_at || view.order.opened_at), 'center');
  data.push('-'.repeat(WIDTH) + '\n');
  activeItems.forEach((it) => {
    pushItemLines(data, `${it.name_snapshot} x${it.quantity}`, fmtMoney(it.subtotal));
  });
  data.push('-'.repeat(WIDTH) + '\n');
  pushDoubleLine(data, 'JAMI', 'left');
  pushDoubleLine(data, fmtMoney(view.total), 'right');
  pushDoubleLine(data, 'Xaridingiz uchun rahmat!', 'center');
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
          <td class="r-item-name">${escapeHtml(it.name_snapshot)} × ${it.quantity}</td>
          <td class="text-right">${fmtMoney(it.subtotal)}</td>
        </tr>
      `).join('')}
      <tr class="r-total-row">
        <td>Jami</td>
        <td class="text-right">${fmtMoney(view.total)}</td>
      </tr>
    </table>
    <hr>
    <div class="dim" style="font-size:36px;">
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
          <td class="r-item-name">${escapeHtml(it.name_snapshot)} × ${it.quantity}</td>
          <td class="text-right">${fmtMoney(it.subtotal)}</td>
        </tr>
      `).join('')}
      <tr class="r-total-row">
        <td>Jami</td>
        <td class="text-right">${fmtMoney(view.total)}</td>
      </tr>
    </table>
    <hr>
    <div class="dim" style="font-size:36px;">
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
  const billNo = '#' + String(view.order.id || 0).padStart(4, '0');
  const itemsTotal = view.items.reduce((s, it) => s + it.subtotal, 0);
  const showMijoz = Boolean(view.order.customer_phone);
  const showManzil = Boolean(view.order.note && view.order.delivery_price);
  const hasDeliveryInfo = showMijoz || showManzil;
  box.innerHTML = `
    <h2>${RESTAURANT_HEADER_NAME}</h2>
    ${RESTAURANT_PHONES.map((p) => `<div class="r-shop-info">Tel: ${escapeHtml(p)}</div>`).join('')}
    <hr>
    <div class="r-meta-row"><span>Chek: ${billNo}</span><span>${fmtDateTime(view.order.created_at)}</span></div>
    <div class="r-meta-row"><span>Kassir: ${escapeHtml(view.order.created_by_name || '')}</span><span>${escapeHtml(view.order.heading)}</span></div>
    <hr>
    <table>
      <tr class="r-head-row">
        <td>Nomi</td>
        <td class="r-qty">Soni</td>
        <td class="text-right">Narxi</td>
        <td class="text-right">Summa</td>
      </tr>
      ${view.items.map((it) => `
        <tr class="r-manual-item-row">
          <td>${escapeHtml(it.name_snapshot)}</td>
          <td class="r-qty">${it.quantity}</td>
          <td class="text-right">${fmtMoneyPlain(it.unit_price)}</td>
          <td class="text-right">${fmtMoneyPlain(it.subtotal)}</td>
        </tr>
      `).join('')}
    </table>
    <hr>
    <table>
      <tr class="r-subtotal-row">
        <td>Taomlar:</td>
        <td colspan="3" class="text-right">${fmtMoneyPlain(itemsTotal)}</td>
      </tr>
      ${view.order.delivery_price ? `
        <tr class="r-subtotal-row">
          <td>Yetkazib berish:</td>
          <td colspan="3" class="text-right">${fmtMoneyPlain(view.order.delivery_price)}</td>
        </tr>
      ` : ''}
      <tr class="r-total-row">
        <td>JAMI:</td>
        <td colspan="3" class="text-right">${fmtMoney(view.total)}</td>
      </tr>
    </table>
    ${hasDeliveryInfo ? `
      <div class="r-delivery-heading">YETKAZIB BERISH</div>
      ${showMijoz ? `<div class="r-customer-phone">Mijoz: ${escapeHtml(view.order.customer_phone)}</div>` : ''}
      ${showManzil ? `<div class="r-customer-phone">Manzil: ${escapeHtml(view.order.note)}</div>` : ''}
    ` : ''}
    <hr>
    <div class="r-footer-note">Xaridingiz uchun rahmat!</div>
  `;
}

// Kassir "Qo'lda hisoblash" cheki — 2026-11-15, foydalanuvchi bergan aniq
// maket bo'yicha to'liq qayta qurildi: restoran nomi/JAMI/Mijoz/Manzil
// 2x-qalin, qolgan HAMMASI (manzil/tel, chek/kassir, taom jadvali,
// Taomlar/Yetkazib berish oraliq summalari, pastki izoh) oddiy o'lcham —
// bu 2026-11-09'dagi umumiy "hammasi 2x" qoidasidan ATAYLAB farq qiladi,
// chunki bu safargi maketda aniq qaysi qatorlar kattalashtirilishi
// ko'rsatilgan edi ([[feedback-receipt-font-hierarchy]]ga qarang).
const MANUAL_COL_NAME_W = 18;
const MANUAL_COL_QTY_W = 5;
const MANUAL_COL_PRICE_W = 9;
const MANUAL_COL_SUM_W = 10;

function buildEscPosReceiptManual(view) {
  const WIDTH = 42;
  const data = [];
  data.push('\x1B\x40');
  pushBoldDoubleLine(data, RESTAURANT_HEADER_NAME, 'center');
  data.push('\x1B\x61\x01');
  RESTAURANT_PHONES.forEach((p) => data.push(`Tel: ${p}\n`));
  data.push('\x1B\x61\x00');
  data.push('-'.repeat(WIDTH) + '\n');
  const billNo = '#' + String(view.order.id || 0).padStart(4, '0');
  data.push(twoColLine(`Chek: ${billNo}`, fmtDateTime(view.order.created_at)) + '\n');
  data.push(twoColLine(`Kassir: ${view.order.created_by_name || ''}`, view.order.heading) + '\n');
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x45\x01');
  data.push(
    'Nomi'.padEnd(MANUAL_COL_NAME_W) +
    'Soni'.padStart(MANUAL_COL_QTY_W) +
    'Narxi'.padStart(MANUAL_COL_PRICE_W) +
    'Summa'.padStart(MANUAL_COL_SUM_W) + '\n'
  );
  data.push('\x1B\x45\x00');
  let itemsTotal = 0;
  view.items.forEach((it) => {
    itemsTotal += it.subtotal;
    pushBoldTallLine(
      data,
      String(it.name_snapshot).slice(0, MANUAL_COL_NAME_W).padEnd(MANUAL_COL_NAME_W) +
      String(it.quantity).padStart(MANUAL_COL_QTY_W) +
      fmtMoneyPlain(it.unit_price).padStart(MANUAL_COL_PRICE_W) +
      fmtMoneyPlain(it.subtotal).padStart(MANUAL_COL_SUM_W)
    );
  });
  data.push('-'.repeat(WIDTH) + '\n');
  data.push(twoColLine('Taomlar:', fmtMoneyPlain(itemsTotal)) + '\n');
  if (view.order.delivery_price) {
    data.push(twoColLine('Yetkazib berish:', fmtMoneyPlain(view.order.delivery_price)) + '\n');
  }
  data.push('='.repeat(WIDTH) + '\n');
  pushBoldDoubleLine(data, `JAMI: ${fmtMoney(view.total)}`, 'center');
  data.push('='.repeat(WIDTH) + '\n');
  const showMijoz = Boolean(view.order.customer_phone);
  const showManzil = Boolean(view.order.note && view.order.delivery_price);
  if (showMijoz || showManzil) {
    pushBoldLine(data, 'YETKAZIB BERISH');
    if (showMijoz) pushBoldDoubleLine(data, `Mijoz: ${view.order.customer_phone}`, 'center');
    if (showManzil) pushBoldDoubleLine(data, `Manzil: ${view.order.note}`, 'center');
  }
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x61\x01');
  data.push('Xaridingiz uchun rahmat!\n');
  data.push('\x1B\x61\x00');
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
  pushDoubleLine(data, view.order.heading, 'center');
  pushDoubleLine(data, fmtDateTime(view.order.created_at), 'center');
  data.push('-'.repeat(WIDTH) + '\n');
  view.items.forEach((it) => {
    pushItemLines(data, `${it.name_snapshot} x${it.quantity}`, fmtMoney(it.subtotal));
  });
  data.push('-'.repeat(WIDTH) + '\n');
  pushDoubleLine(data, 'JAMI', 'left');
  pushDoubleLine(data, fmtMoney(view.total), 'right');
  if (view.order.phone) pushDoubleLine(data, `Tel: ${view.order.phone}`, 'left');
  if (view.order.address) pushDoubleLine(data, `Manzil: ${view.order.address}`, 'left');
  pushDoubleLine(data, 'Xaridingiz uchun rahmat!', 'center');
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

// ---------------- Oshxona cheki (kitchen ticket) — narxsiz, faqat taom+soni ----------------
// Mijoz/mehmon chekidan ATAYLAB alohida: bu yerda narx umuman ko'rsatilmaydi
// (oshxonaga faqat "qaysi stolga qaysi taomdan nechta tayyorlash kerak" kerak),
// va bu HECH QANDAY modal/tugma orqali emas — initChefKitchenTicketPrinting()
// tomonidan avtomatik chaqiriladi (pastga qarang).
function buildEscPosKitchenTicket(ticket) {
  const WIDTH = 42;
  const data = [];
  data.push('\x1B\x40');
  data.push('\x1B\x61\x01');
  data.push('\x1B\x21\x00');
  data.push('OSHXONA CHEKI\n');
  data.push(`${fmtDateTime(ticket.created_at)}\n`);
  data.push('='.repeat(WIDTH) + '\n');
  data.push('\x1B\x21\x30');
  data.push(`${ticket.table_name}\n`);
  data.push('-'.repeat(WIDTH) + '\n');
  data.push('\x1B\x61\x00');
  ticket.items.forEach((it) => {
    data.push(`${it.quantity} x ${it.name_snapshot}\n`);
  });
  data.push('\x1B\x21\x00');
  data.push('\n\n\n');
  data.push('\x1D\x56\x41\x00');
  return data;
}

async function printKitchenTicketView(ticket) {
  await loadQzTray();
  setupQzSecurity();
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
  const config = qz.configs.create(KITCHEN_PRINTER_NAME, { encoding: 'CP866' });
  await qz.print(config, buildEscPosKitchenTicket(ticket));
}

// Afitsiant "🍽️ Oshxonaga yuborish" tugmasini bosganda server yangi
// kitchen_tickets yozuvi yaratadi (server/services/orders.js sendPendingItems()).
// Oshpaz kompyuterida doim ochiq turadigan /chef/kitchen.html sahifasi buni har
// 5s'da so'rab (poll), HECH QANDAY tugma bosilmasdan darhol oshxona printeriga
// chop etadi — oshpazning qo'li ovqat tayyorlash bilan band bo'lishi mumkin.
// Muvaffaqiyatli chop etilgach server printed_at bilan belgilanadi (bir marta
// chop etiladi, sahifa qayta yuklansa ham qayta chop etilmaydi). Xato bo'lsa
// (printer o'chiq/QZ Tray ishlamayapti) chek printed_at'siz qoladi — keyingi
// pollda avtomatik qayta urinadi; xato haqidagi ogohlantirish esa oshpazni har
// 5s'da bezovta qilmasligi uchun eng ko'pi bilan 30s'da bir marta ko'rsatiladi.
const printingKitchenTicketIds = new Set();
let lastKitchenPrintErrorAt = 0;

async function pollKitchenTickets() {
  let tickets;
  try {
    tickets = await api('/chef/kitchen-tickets/pending');
    reportPollResult('kitchenTickets', true);
  } catch (e) {
    reportPollResult('kitchenTickets', false, 'oshxona chek navbati');
    return; // keyingi tsiklda qayta urinadi
  }
  for (const ticket of tickets) {
    if (printingKitchenTicketIds.has(ticket.id)) continue;
    printingKitchenTicketIds.add(ticket.id);
    try {
      await printKitchenTicketView(ticket);
      await api(`/chef/kitchen-tickets/${ticket.id}/printed`, { method: 'POST' });
    } catch (err) {
      console.error('Oshxona cheki chop etilmadi:', err);
      const now = Date.now();
      if (now - lastKitchenPrintErrorAt > 30000) {
        lastKitchenPrintErrorAt = now;
        toast(
          `Oshxona chekini chop etib bo'lmadi: ${err.message || err}. Printer va QZ Tray dasturini tekshiring.`,
          'error',
          8000
        );
      }
    } finally {
      printingKitchenTicketIds.delete(ticket.id);
    }
  }
}

function initChefKitchenTicketPrinting() {
  if (!window.location.pathname.includes('/chef/')) return;
  pollKitchenTickets();
  setInterval(pollKitchenTickets, 5000);
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
