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

// `options`:
//   method, body      — odatdagidek
//   headers           — qo'shimcha sarlavhalar (Content-Type ustidan yozilishi mumkin)
//   noAuthRedirect    — 401 kelganda login sahifasiga YO'NALTIRMASLIK
//
// ⚠️ `noAuthRedirect` NEGA KERAK (2026-09-10 da topilgan KRITIK xato):
// bu funksiya har qanday 401'ni "sessiya tugadi" deb talqin qilib
// login.html'ga yo'naltirardi. Lekin login sahifasining O'ZIDA `API_BASE`
// bo'sh, ya'ni `location.href = 'login.html'` — o'sha sahifani QAYTA
// YUKLAYDI. Natijada noto'g'ri parol kiritilganda xato xabari ekranda
// ko'rinishga ulgurmasdan forma tozalanardi: xodim "tugma ishlamayapti"
// deb o'ylab qayta-qayta urar, 10-urinishda hisob bo'yicha rate-limitga
// urilib 15 daqiqaga qulflanardi va NEGA ekanini bilmasdi.
async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    credentials: 'same-origin',
  };
  if (options.body !== undefined) opts.body = JSON.stringify(options.body);
  const res = await fetch(`${API_BASE}api${path}`, opts);
  if (res.status === 401 && !options.noAuthRedirect) {
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
  // ⚠️ `toLocaleString('uz-UZ')` mingliklarni AJRATISH uchun U+00A0
  // (no-break space) ishlatadi, oddiy probel emas. Ekranda bu muammo emas,
  // lekin ESC/POS chekda (CP866 kodlash) U+00A0 -> 0xFF baytiga aylanadi va
  // ko'p termal printerlarda bu probel emas, begona glif bo'lib chiqadi
  // ("1■234■567 so'm"). Shu sabab oddiy probelga almashtiramiz — ekranda
  // ko'rinish o'zgarmaydi, chek esa to'g'ri chiqadi (2026-09-10).
  return v.toLocaleString('uz-UZ').replace(/ /g, ' ') + " so'm";
}

// Buyurtma holati yorlig'i — YAGONA manba. `orders.status` 2026-09-10 dan
// 'cancelled' ham bo'lishi mumkin; ilgari render joylari
// `status === 'closed' ? 'Yopilgan' : 'Ochiq'` deb yozilgani uchun bekor
// qilingan buyurtma "Ochiq" deb YOLG'ON ko'rsatilardi.
const ORDER_STATUS_LABEL = {
  open: 'Ochiq',
  closed: 'Yopilgan',
  cancelled: 'Bekor qilingan',
};
function orderStatusLabel(status) {
  return ORDER_STATUS_LABEL[status] || status || '';
}

// Mutatsion tugmalarni so'rov davomida bloklaydi (2026-09-10).
// NEGA: loyihada tugmalarning ko'pchiligi so'rov ketayotganda faol qolardi.
// Ikki marta bosilsa ikkinchi so'rov serverdan xato oladi ("allaqachon
// yetkazilgan", "yuborilmagan taom yo'q") va foydalanuvchi MUVAFFAQIYATLI
// amal uchun qizil xato ko'rardi — tizim buzuqdek tuyulardi. Eng og'iri
// ombor "Kirim qilish" edi: POST idempotent emas, miqdor ikki marta
// qo'shilardi.
async function withBusy(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } finally {
    if (btn) btn.disabled = false;
  }
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

// ── renderList(): ro'yxat chizishning umumiy naqshi (2026-09-10) ──────────
//
// NEGA: 18 ta frontend faylda AYNAN bir xil naqsh nusxalangan edi —
// "so'rov yubor → box.innerHTML = rows.map(...) → tugmalarga listener ula →
// catch'da box.innerHTML = xato". Har bir nusxa bilan birga 2026-09-10
// auditida topilgan uchta xato ham nusxalangan edi:
//
//   1. Fon yangilanishi (poll) XATO qaytarsa butun ro'yxat o'chib, o'rniga
//      "Xatolik (500)" chiqardi — bitta o'tkinchi tarmoq uzilishi ekranni
//      tozalab tashlardi (15 soniyada bir marta).
//   2. Poll javobi SHARTSIZ innerHTML yozardi: agar u aynan `mousedown` va
//      `mouseup` orasida tushsa, tugma DOM'dan olib tashlanardi va `click`
//      UMUMAN otilmasdi — foydalanuvchi "tugma ishlamadi" deb o'ylardi.
//   3. Poll va qo'lda chaqirilgan yuklash bir vaqtda ketsa, ESKIROQ javob
//      keyin kelib yangisining ustidan yozib yuborardi.
//
// Bu uchtasi avval faqat `public/admin/customer-orders.js`da QO'LDA
// tuzatilgan edi; shu yerga chiqarilib barcha ro'yxatlarga tarqatildi.
//
// Parametrlar (options obyekti):
//   box     — HTMLElement yoki element id (matn).
//   load    — async () => data. `data` to'g'ridan-to'g'ri berilsa shart emas.
//   data    — allaqachon olingan ma'lumot (so'rovsiz chizish uchun: masalan
//             afitsiant ekrani buyurtma ko'rinishini PATCH javobidan oladi).
//   render  — (data) => HTML matni. FAQAT ma'lumot o'zgarganda chaqiriladi.
//   bind    — (box, data) => void. Har render'dan keyin listener ulash.
//   onData  — (data) => void. Ma'lumot kelishi bilan (chizishdan OLDIN va
//             o'zgarmagan bo'lsa ham) chaqiriladi — yon elementlarni (jami
//             summa, sarlavha, global massiv) yangilash uchun.
//   empty   — bo'sh ro'yxat matni, `<p class="dim">…</p>` ichida chiqadi.
//             DIQQAT: bu DASTURCHI matni, escape QILINMAYDI — foydalanuvchi
//             ma'lumotini bu yerga uzatmang.
//   isEmpty — (data) => bool. Standart: bo'sh massiv.
//   isPoll  — true bo'lsa xato ro'yxatni O'CHIRMAYDI, faqat toast (va bir xil
//             xato takror-takror toast qilinmaydi).
//   key     — holat kaliti (bir sahifada bir nechta ro'yxat bo'lsa kerak
//             bo'ladi). Standart: box elementi (yoki uning id matni).
//   dedupe  — false bo'lsa JSON solishtiruvi o'chiriladi (har safar qayta
//             chiziladi).
//
// Qaytaradi: muvaffaqiyatda `data`, xatoda/eskirgan javobda `undefined`.
//
// ⚠️ `render` foydalanuvchi ma'lumotini HTML'ga qo'yganda escapeHtml() SHART —
// bu yordamchi uni o'zi qilib bermaydi (shablon har xil).
const renderListStates = new Map();

async function renderList(options) {
  const box = typeof options.box === 'string' ? document.getElementById(options.box) : options.box;
  if (!box) return undefined;
  const key = options.key || (typeof options.box === 'string' ? options.box : box);
  let st = renderListStates.get(key);
  if (!st) {
    // seq — so'rovlar navbati (eskirgan javobni tashlash uchun);
    // sig — oxirgi chizilgan ma'lumotning JSON "barmoq izi";
    // lastError — bir xil poll xatosini qayta-qayta toast qilmaslik uchun.
    st = { seq: 0, sig: null, lastError: null };
    renderListStates.set(key, st);
  }
  const my = ++st.seq;

  let data;
  try {
    data = options.load ? await options.load() : options.data;
  } catch (err) {
    if (my !== st.seq) return undefined; // eskirgan javob — yangiroq so'rov ketgan
    if (options.isPoll) {
      // Fon yangilanishi yiqildi — ekrandagi ro'yxat o'z joyida qoladi.
      if (st.lastError !== err.message) {
        st.lastError = err.message;
        toast(`Yangilanmadi: ${err.message}`, 'error');
      }
      return undefined;
    }
    st.sig = null; // keyingi muvaffaqiyatli yuklash albatta qayta chizsin
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
    return undefined;
  }
  if (my !== st.seq) return undefined;
  st.lastError = null;

  if (options.onData) options.onData(data);

  if (options.dedupe !== false) {
    const sig = JSON.stringify(data === undefined ? null : data);
    if (sig === st.sig) return data; // hech narsa o'zgarmagan — DOM'ga tegmaymiz
    st.sig = sig;
  }

  const empty = options.isEmpty ? options.isEmpty(data) : (Array.isArray(data) && data.length === 0);
  if (empty) {
    box.innerHTML = `<p class="dim">${options.empty || "Ro'yxat bo'sh."}</p>`;
    return data;
  }
  box.innerHTML = options.render(data);
  if (options.bind) options.bind(box, data);
  return data;
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
//
// ⚠️ 2026-09-10 da tuzatildi (chek modalidagi bilan AYNI xato): listener'lar
// ilgari showInfoModal()ning HAR chaqirilishida qo'shilardi, holbuki
// ensureInfoModal() DOM'dagi DOIMIY bitta elementni qaytaradi va eski
// listener'lar faqat oyna "finish()" yo'li bilan yopilganda olinardi. Oyna
// yopilmasdan qayta ochilsa listener'lar elementda to'planib qolardi. Endi
// ular element yaratilgan paytda FAQAT BIR MARTA ulanadi — showInfoModal()
// esa faqat matnni almashtiradi.
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
    const close = () => el.classList.add('hidden');
    el.querySelector('#customInfoClose').addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
  }
  return el;
}

function showInfoModal(title, body) {
  const el = ensureInfoModal();
  el.querySelector('#customInfoTitle').textContent = title;
  el.querySelector('#customInfoBody').textContent = body;
  el.classList.remove('hidden');
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

// Chap va o'ng matnni bitta qatorga (belgilangan kenglikda) tekislaydi —
// termal printerda ustunlar (nom ... narx) to'g'ri qatorga tushishi uchun.
//
// ⚠️ 2026-09-10 da ikkita chegara (off-by-one) xatosi tuzatildi:
//   1) shart `space < 1` edi — ya'ni chap va o'ng matn qatorga AYNAN
//      sig'adigan holat (space === 0) ham "sig'madi" deb hisoblanib,
//      chap matndan oxirgi belgi jimgina kesilardi. To'g'risi `space < 0`.
//   2) o'ng matnning o'zi kenglikdan uzun bo'lsa (`right.length >= width`)
//      eski kod chap matnni bo'sh qilib, ustiga bitta probel qo'shardi —
//      natija `width + 1` belgi bo'lib, qator baribir o'ralib ketardi.
//      Endi bunday holatda o'ng matnning o'zi kenglikkacha kesiladi.
function padReceiptLine(left, right, width = 42) {
  left = String(left);
  right = String(right);
  if (right.length >= width) return right.slice(0, width);
  const space = width - left.length - right.length;
  if (space < 0) {
    left = left.slice(0, width - right.length - 1);
    return `${left} ${right}`;
  }
  return left + ' '.repeat(space) + right;
}

// ---------------- ESC/POS chekni qurish (YAGONA manba) ----------------
// Ilgari uchta deyarli bir xil funksiya bor edi: buildEscPosReceipt (dine-in
// stol cheki), buildEscPosReceiptManual (kassirning qo'lda hisobi) va
// buildEscPosReceiptCustomer (landing'dan kelgan mijoz buyurtmasi). Ular
// ~90% bayt-baytiga bir xil edi — aynan shuning uchun quyidagi ikkita xato
// (JAMI qatorining kengligi va yo'q kod-jadval buyrug'i) UCHALASIDA ham
// takrorlangan edi va har birini uch joyda tuzatishga to'g'ri kelardi.
// 2026-09-10 da bitta `buildEscPos()` ga birlashtirildi — chekning
// KO'RINISHI o'zgarmaydi, faqat quyidagi tuzatishlar qo'shildi.
const RECEIPT_WIDTH = 42;
// Ikki barobar kenglik rejimida (ESC ! 0x30) bitta belgi IKKI ustunni
// egallaydi — demak qatorga faqat yarmicha belgi sig'adi.
const RECEIPT_WIDTH_DOUBLE = RECEIPT_WIDTH / 2;
const RECEIPT_TITLE = 'Ziyo Famliy restorani';
const RECEIPT_FOOTER = 'Xaridingiz uchun rahmat!';

// ESC t n — printerda belgilar kod jadvalini (code page) tanlaydi.
// ⚠️ NEGA KERAK (2026-09-10): `qz.configs.create(..., { encoding: 'CP866' })`
// faqat QZ Tray TOMONIDA matnni CP866 baytlariga o'giradi; printerning
// o'ziga esa "bu baytlarni CP866 deb o'qi" degan buyruq umuman
// YUBORILMAGAN edi. Ustiga-ustak ESC @ (init) kod jadvalini printerning
// ZAVOD standartiga qaytaradi (ko'pincha CP437) — natijada kirill va
// maxsus belgilar chalkash chiqadi.
// 0x11 (17) — Epson standartidagi CP866 raqami.
// ⚠️ Bu raqam printer modeliga qarab FARQ QILADI (ba'zi arzon xitoy
// printerlarida CP866 boshqa raqam ostida turadi) va bu o'zgarish HALI
// HAQIQIY PRINTERDA SINALMAGAN. Chek noto'g'ri belgilar bilan chiqsa —
// birinchi navbatda shu qiymatni printer qo'llanmasidagi CP866 raqamiga
// moslash kerak.
const ESC_POS_CODEPAGE_CP866 = '\x1B\x74\x11';

// `items`       — { name_snapshot, quantity, subtotal } ro'yxati
// `footerLines` — JAMI dan keyin, chapga tekislangan holda chiqadigan
//                 qo'shimcha qatorlar (bo'sh qiymatlar tashlab yuboriladi)
function buildEscPos({ subheading, dateIso, items, total, footerLines = [] }) {
  const data = [];
  data.push('\x1B\x40');                // ESC @ — printerni boshlang'ich holatga
  data.push(ESC_POS_CODEPAGE_CP866);    // ESC t — kod jadvali (init'dan KEYIN!)
  data.push('\x1B\x61\x01');            // markazga tekislash
  data.push('\x1B\x21\x30');            // ikki barobar en + bo'y
  data.push(`${RECEIPT_TITLE}\n`);
  data.push('\x1B\x21\x00');            // odatdagi o'lcham
  data.push(`${subheading}\n`);
  data.push(`${fmtDateTime(dateIso)}\n`);
  data.push('-'.repeat(RECEIPT_WIDTH) + '\n');
  data.push('\x1B\x61\x00');            // chapga tekislash
  items.forEach((it) => {
    const name = `${it.name_snapshot} x${it.quantity}`;
    data.push(padReceiptLine(name, fmtMoney(it.subtotal), RECEIPT_WIDTH) + '\n');
  });
  data.push('-'.repeat(RECEIPT_WIDTH) + '\n');
  data.push('\x1B\x21\x30');
  // ⚠️ RECEIPT_WIDTH emas, RECEIPT_WIDTH_DOUBLE (2026-09-10 tuzatish):
  // ikki barobar kenglikda 42 belgi = 84 ustun, ya'ni 42 ustunli termal
  // printerda qator o'ralib, summa keyingi qatorga tushib ketardi.
  data.push(padReceiptLine('JAMI', fmtMoney(total), RECEIPT_WIDTH_DOUBLE) + '\n');
  data.push('\x1B\x21\x00');
  footerLines.filter(Boolean).forEach((line) => data.push(`${line}\n`));
  data.push('\x1B\x61\x01');
  data.push(`${RECEIPT_FOOTER}\n`);
  data.push('\n\n\n');
  data.push('\x1D\x56\x41\x00');        // qog'ozni kesish
  return data;
}

// Chek turini `view.kind` bo'yicha tanlaydi (dine-in / manual / customer).
// Nom saqlab qolindi — public/waiter/receipt.js izohlari va boshqa
// sahifalar shu global nomga tayanadi.
function buildEscPosReceipt(view) {
  if (view.kind === 'customer') {
    return buildEscPos({
      subheading: view.order.heading,
      dateIso: view.order.created_at,
      items: view.items,
      total: view.total,
      footerLines: [
        view.order.phone ? `Tel: ${view.order.phone}` : '',
        view.order.address ? `Manzil: ${view.order.address}` : '',
      ],
    });
  }
  if (view.kind === 'manual') {
    return buildEscPos({
      subheading: view.order.heading,
      dateIso: view.order.created_at,
      items: view.items,
      total: view.total,
      footerLines: [
        view.order.created_by_name ? `Hisobladi: ${view.order.created_by_name}` : '',
      ],
    });
  }
  // dine-in: bekor qilingan (void) taomlar chekka tushmaydi
  return buildEscPos({
    subheading: view.order.table_name,
    dateIso: view.order.closed_at || view.order.opened_at,
    items: view.items.filter((it) => it.status === 'active'),
    total: view.total,
  });
}

// Joriy ochiq chek modalining holati.
// ⚠️ NEGA modul darajasida (2026-09-10 tuzatish): `ensureReceiptModal()`
// DOM'dagi DOIMIY bitta elementni qaytaradi, listener'lar esa ilgari
// `showReceiptModal()`ning HAR chaqirilishida qo'shilardi va faqat oyna
// yopilganda olinardi. Ketma-ket ikkita chek ochilsa "Chekni chop etish"
// bosilganda IKKALA `onPrint` ham ishlab ketardi — printerdan ikkita chek
// chiqardi, biri esa ekranda hech qachon ko'rinmagan (eski) chek edi; eski
// listener'lar elementda abadiy qolib, keyingi ochilishlarda ham eski
// chekni chop etaverardi. Endi listener'lar element yaratilganda BIR MARTA
// ulanadi, "hozir qaysi chek ochiq" degan ma'lumot esa shu o'zgaruvchida
// turadi.
let receiptModalState = null;

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

    const printBtn = el.querySelector('#receiptModalPrint');
    const close = () => {
      el.classList.add('hidden');
      receiptModalState = null;
    };
    el.querySelector('#receiptModalClose').addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    printBtn.addEventListener('click', () => withBusy(printBtn, async () => {
      const state = receiptModalState;
      if (!state) return;
      try {
        await printReceiptView(state.view);
      } catch (err) {
        console.error(err);
        alert(
          `Printerga chop etib bo'lmadi: ${err.message || err}\n\n` +
          `Tekshiring: QZ Tray dasturi ishga tushirilganmi va Windows'da printer aynan "${RECEIPT_PRINTER_NAME}" deb nomlanganmi.`
        );
        return;
      }
      toast('Chek chop etildi.');
      close();
      // ⚠️ `onPrinted` FAQAT chop etish MUVAFFAQIYATLI tugagandan keyin
      // chaqiriladi (2026-09-10 tuzatish) — sababi renderPrintRequests()da
      // batafsil yozilgan. Bu yerdagi xato chek allaqachon chiqib bo'lgani
      // uchun foydalanuvchiga "chop etilmadi" deb ko'rsatilmaydi, faqat
      // konsolga yoziladi (so'rov navbatda qolaveradi — bu xavfsiz tomon).
      if (state.onPrinted) {
        try { await state.onPrinted(); } catch (e) { console.error(e); }
      }
    }));
  }
  return el;
}

// Chek qutisining uch tur uchun ham BIR XIL qismi: sarlavha, sana, taomlar
// jadvali va "Jami" qatori. Farq faqat eng pastdagi izoh blokida — shu
// sabab u tayyor HTML sifatida uzatiladi (2026-09-10 birlashtirish; ilgari
// bu markup renderReceiptBox / renderCustomerReceiptBox /
// renderManualReceiptBox'da uch marta takrorlangan edi).
function renderReceiptBoxHtml({ subheading, dateIso, items, total, footerHtml }) {
  const box = document.getElementById('receiptModalBox');
  box.innerHTML = `
    <h2>${escapeHtml(RECEIPT_TITLE)}</h2>
    <div class="r-sub">${escapeHtml(subheading)} · ${fmtDateTime(dateIso)}</div>
    <hr>
    <table>
      ${items.map((it) => `
        <tr>
          <td>${escapeHtml(it.name_snapshot)} × ${it.quantity}</td>
          <td class="text-right">${fmtMoney(it.subtotal)}</td>
        </tr>
      `).join('')}
      <tr class="r-total-row">
        <td>Jami</td>
        <td class="text-right">${fmtMoney(total)}</td>
      </tr>
    </table>
    <hr>
    <div class="dim" style="font-size:12px;">
      ${footerHtml}
    </div>
  `;
}

function renderReceiptBox(view) {
  if (view.kind === 'customer') return renderCustomerReceiptBox(view);
  if (view.kind === 'manual') return renderManualReceiptBox(view);
  renderReceiptBoxHtml({
    subheading: view.order.table_name,
    dateIso: view.order.closed_at || view.order.opened_at,
    items: view.items.filter((it) => it.status === 'active'),
    total: view.total,
    // ⚠️ 2026-09-10: ilgari bu yerda `status === 'closed' ? 'Yopilgan' :
    // 'Ochiq'` yozilgan edi — bekor qilingan (cancelled) buyurtma chekda
    // "Ochiq" deb YOLG'ON ko'rsatilardi. Endi yagona manba —
    // orderStatusLabel().
    footerHtml: `
      ${view.order.opened_by_name ? `Ochdi: ${escapeHtml(view.order.opened_by_name)}<br>` : ''}
      ${view.order.closed_by_name ? `Yopdi: ${escapeHtml(view.order.closed_by_name)}<br>` : ''}
      Holat: ${escapeHtml(orderStatusLabel(view.order.status))}
    `,
  });
}

// Landing sahifadan kelgan (login shart emas) mijoz buyurtmasi (customer_orders)
// uchun chek — dine-in `orders`dan farqli, stol/afitsiant emas, mijoz
// ismi/telefoni/manzili bor (2026-09-08, admin "Buyurtmalar" sahifasidagi
// "🖨 Chek" tugmasi orqali, public/admin/customer-orders.js). Bir xil modal/QZ
// Tray infratuzilmasi (ensureReceiptModal/printReceiptView) ishlatiladi,
// faqat pastki izoh bloki `view.kind` bo'yicha farq qiladi.
function renderCustomerReceiptBox(view) {
  renderReceiptBoxHtml({
    subheading: view.order.heading,
    dateIso: view.order.created_at,
    items: view.items,
    total: view.total,
    footerHtml: `
      ${view.order.phone ? `Tel: ${escapeHtml(view.order.phone)}<br>` : ''}
      ${view.order.address ? `Manzil: ${escapeHtml(view.order.address)}<br>` : ''}
      ${view.order.note ? `Izoh: ${escapeHtml(view.order.note)}<br>` : ''}
    `,
  });
}

// Kassir "Hisoblash" (qo'lda kiritilgan, stol/menyuga bog'liq bo'lmagan chek)
// uchun — 2026-09-09, server/services/manualBills.js'dagi `kind: 'manual'`
// view'iga mos. renderCustomerReceiptBox bilan bir xil naqsh, faqat
// telefon/manzil o'rniga "Hisobladi: <kassir>" ko'rsatiladi.
function renderManualReceiptBox(view) {
  renderReceiptBoxHtml({
    subheading: view.order.heading,
    dateIso: view.order.created_at,
    items: view.items,
    total: view.total,
    footerHtml: `
      ${view.order.created_by_name ? `Hisobladi: ${escapeHtml(view.order.created_by_name)}<br>` : ''}
    `,
  });
}

async function printReceiptView(view) {
  await loadQzTray();
  setupQzSecurity();
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
  const config = qz.configs.create(RECEIPT_PRINTER_NAME, { encoding: 'CP866' });
  await qz.print(config, buildEscPosReceipt(view));
}

// `options.onPrinted` — chek MUVAFFAQIYATLI chop etilgandan keyin
// chaqiriladigan ixtiyoriy callback (masalan admin print-navbatidagi
// so'rovni "chop etildi" deb belgilash — renderPrintRequests()ga qara).
function showReceiptModal(view, options = {}) {
  const el = ensureReceiptModal();
  receiptModalState = { view, onPrinted: options.onPrinted || null };
  renderReceiptBox(view);
  el.classList.remove('hidden');
}

// area — qaysi rol hududidagi chek endpoint'i ishlatilishi kerak ('waiter'
// standart; kassir sahifasi 'kassir' bilan chaqiradi, server/routes/
// kassirTables.js'dagi GET /orders/:id/receipt'ga mos). Admin har doim ham
// (areaRole tekshiruvidan chetlab o'tadi) ikkalasini ham chaqira oladi.
// `options` — showReceiptModal()ga o'zgarishsiz uzatiladi (onPrinted).
async function openReceiptByOrderId(orderId, area = 'waiter', options = {}) {
  try {
    const view = await api(`/${area}/orders/${orderId}/receipt`);
    showReceiptModal(view, options);
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
      // ⚠️ 2026-09-10 tuzatish (JIDDIY): ilgari `markPrintRequestPrinted()`
      // DARHOL, chek chop etilishidan OLDIN chaqirilardi. Agar chek fetch'i
      // yiqilsa yoki QZ Tray ishlamasa — navbat allaqachon tozalangan, chek
      // esa chiqmagan bo'lardi va so'rov BUTUNLAY yo'qolardi (stol yopilgan,
      // mijozga chek berilmagan, adminda esa hech qanday iz qolmagan). Endi
      // navbatdan o'chirish faqat `printReceiptView()` muvaffaqiyatli
      // tugagandan keyin, `onPrinted` callback'i orqali bo'ladi.
      const requestId = Number(btn.dataset.printReq);
      openReceiptByOrderId(Number(btn.dataset.orderId), 'waiter', {
        onPrinted: () => markPrintRequestPrinted(requestId),
      });
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
