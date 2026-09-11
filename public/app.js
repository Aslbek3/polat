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
//
// ⚠️ GLOBAL NOM TO'QNASHUVI (2026-09-10): bu fayl va sahifa skriptlari
// (admin/*.js, waiter/*.js, ...) BITTA global scope'ni baham ko'radi.
// Yangi top-level nom (function/const/let) qo'shishdan oldin
// `grep -rnw "<nom>" public/` bilan tekshiring:
//   - ikkala faylda `let`/`const` bir xil nom bilan — SyntaxError, keyingi
//     skript UMUMAN ishga tushmaydi (2026-09-07 receipt.js voqeasi);
//   - ikkala faylda `function` bir xil nom bilan — keyingisi JIMGINA
//     birinchisini almashtiradi va app.js ichidagi chaqiruvlar sahifaning
//     funksiyasini chaqirib yuboradi. Masalan admin/tables.js va
//     admin/waiters.js'da `openModal(id)`/`closeModal()` bor — shu sabab
//     modal yordamchisi ataylab `openDialog`/`closeDialog` deb nomlangan.
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

// Element yoki uning id matnini qabul qiluvchi yordamchilar uchun (2026-09-10).
function resolveEl(elOrId) {
  return typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
}

// NEGA (X-15, 2026-09-10): tarmoq uzilganda `fetch()` `TypeError` otadi va
// uning matni brauzer tilida — "Failed to fetch" / "NetworkError when
// attempting to fetch resource". Xodim buni "tizim buzuq" deb o'qirdi.
// Endi hamma joyda (toast, renderList xato holati, login xatosi) bir xil
// tushunarli o'zbekcha xabar chiqadi.
const NETWORK_ERROR_MSG = "Internet aloqasi yo'q. Tarmoqni tekshiring va qayta urinib ko'ring.";

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
//
// Tarmoq xatosi (fetch TypeError) — NETWORK_ERROR_MSG bilan Error (X-15).
async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    credentials: 'same-origin',
  };
  if (options.body !== undefined) opts.body = JSON.stringify(options.body);
  let res;
  try {
    res = await fetch(`${API_BASE}api${path}`, opts);
  } catch (err) {
    if (err && err.name === 'AbortError') throw err; // ataylab bekor qilingan
    throw new Error(NETWORK_ERROR_MSG);
  }
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
  // `withMeta: true` (2026-09-10) — javob sarlavhalarini ham qaytaradi.
  // NEGA: ro'yxat endpointlari endi cheklangan (LIMIT) — to'liq son va jami
  // summa `X-Total-Count` / `X-Total-Amount` SARLAVHALARIDA keladi. Ilgari
  // "Jami" ekranda ro'yxatning o'zidan yig'ilardi, ya'ni cheklovdan oshsa
  // jimgina KAM ko'rsatardi (kassir /bills da aynan shu xato bo'lgan edi).
  // Qaytaradi: { data, total, totalAmount, headers } — total/totalAmount
  // sarlavha bo'lmasa null.
  if (options.withMeta) {
    const num = (name) => {
      const v = res.headers.get(name);
      return v === null || v === '' ? null : Number(v);
    };
    return { data, total: num('X-Total-Count'), totalAmount: num('X-Total-Amount'), headers: res.headers };
  }
  return data;
}

// Oflayn banner (X-15, 2026-09-10).
// NEGA: tarmoq uzilganda xodim buni faqat birinchi amal yiqilganda bilardi
// (ba'zan 15 soniyalik poll toast'idan). Sahifa tepasidagi doimiy banner
// "hozir hech narsa saqlanmaydi" degan holatni amal qilishdan OLDIN
// ko'rsatadi. DOMContentLoaded'da avtomatik ulanadi (fayl oxiriga qarang).
function initOfflineBanner() {
  let wasOffline = false;
  const update = () => {
    let el = document.getElementById('offlineBanner');
    if (navigator.onLine === false) {
      wasOffline = true;
      if (!el) {
        el = document.createElement('div');
        el.id = 'offlineBanner';
        el.className = 'offline-banner';
        el.setAttribute('role', 'status');
        // Qisqa: .offline-banner bir qatorli (nowrap + ellipsis), 320px'da
        // uzun matn kesilib qolardi.
        el.textContent = "Internet aloqasi yo'q";
        el.title = "Tarmoq tiklanguncha o'zgarishlar saqlanmaydi";
        document.body.insertBefore(el, document.body.firstChild);
      }
    } else {
      if (el) el.remove();
      if (wasOffline) {
        wasOffline = false;
        toast('Internet aloqasi tiklandi.');
      }
    }
  };
  window.addEventListener('offline', update);
  window.addEventListener('online', update);
  update();
}

function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  // ⚠️ `toLocaleString('uz-UZ')` mingliklarni AJRATISH uchun U+00A0
  // (no-break space) ishlatadi, oddiy probel emas. Ekranda bu muammo emas,
  // lekin ESC/POS chekda (CP866 kodlash) U+00A0 -> 0xFF baytiga aylanadi va
  // ko'p termal printerlarda bu probel emas, begona glif bo'lib chiqadi
  // ("1■234■567 so'm"). Shu sabab oddiy probelga almashtiramiz — ekranda
  // ko'rinish o'zgarmaydi, chek esa to'g'ri chiqadi (2026-09-10).
  // (\u00A0 escape bilan yozilgan — ko'rinmas belgi tahrirda oddiy
  // probelga aylanib ketmasin.)
  return v.toLocaleString('uz-UZ').replace(/\u00A0/g, ' ') + " so'm";
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

// Date -> 'YYYY-MM-DD' LOKAL vaqt bo'yicha (2026-09-10, todayStr() va
// datePresets() uchun umumiy). NEGA toISOString() emas: u UTC beradi —
// Toshkentda (UTC+5) 00:00–05:00 oralig'ida "bugun" KECHAGI sana bo'lib
// chiqardi va hisobot noto'g'ri kunni ko'rsatardi.
function ymdLocal(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayStr() {
  return ymdLocal(new Date());
}

// ── Kutish vaqti (X-01, 2026-09-10) ─────────────────────────────────────
// NEGA: oshpaz ekranida buyurtma qancha kutayotgani umuman ko'rinmasdi —
// server `sent_at`ni yuboradi, lekin chizilmasdi, va 25 daqiqa kutgan stol
// raqami katta bo'lgani uchun ro'yxat pastida qolardi. Bu yordamchilar
// "⏱ 12 daq" yorlig'i va 15/25 daqiqalik ogohlantirish darajasini beradi.
const WAIT_WARN_MINUTES = 15;
const WAIT_DANGER_MINUTES = 25;

function elapsedMinutes(iso, now = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60000));
}

// "hozirgina" (<1 daq), "5 daq", "1 soat", "1 soat 12 daq".
function fmtElapsed(iso, now = Date.now()) {
  const min = elapsedMinutes(iso, now);
  if (min === null) return '';
  if (min < 1) return 'hozirgina';
  if (min < 60) return `${min} daq`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} soat ${m} daq` : `${h} soat`;
}

// 'ok' (<15 daq) | 'warn' (15–25 daq) | 'danger' (>25 daq).
function waitLevel(iso, now = Date.now()) {
  const min = elapsedMinutes(iso, now);
  if (min === null || min < WAIT_WARN_MINUTES) return 'ok';
  if (min <= WAIT_DANGER_MINUTES) return 'warn';
  return 'danger';
}

// Tayyor badge HTML'i: <span class="wait-badge warn" data-elapsed-since="…">⏱ 17 daq</span>.
// ⚠️ NEGA `data-elapsed-since`: renderList() ma'lumot O'ZGARMAGAN bo'lsa
// DOM'ga tegmaydi (dedupe) — ya'ni render paytida hisoblangan "12 daq"
// yangi ma'lumot kelmaguncha abadiy "12 daq" bo'lib qolardi. Shu atributli
// elementlarni refreshElapsed() har 30 soniyada (va renderList chizgandan
// keyin) o'zi yangilaydi.
function waitBadgeHtml(iso) {
  const lvl = waitLevel(iso);
  const cls = lvl === 'ok' ? 'wait-badge' : `wait-badge ${lvl}`;
  return `<span class="${cls}" data-elapsed-since="${escapeHtml(iso || '')}" data-elapsed-icon title="${escapeHtml(fmtDateTime(iso))}">⏱ ${fmtElapsed(iso)}</span>`;
}

// `root` ichidagi barcha [data-elapsed-since] elementlarining matnini (va
// .wait-badge bo'lsa warn/danger klassini) joriy vaqtga moslaydi. Badge
// `[data-wait-card]` atributli karta ichida bo'lsa, kartaning
// .wait-warn / .wait-danger klassi ham yangilanadi (style.css'dagi rangli
// chap chegara).
function refreshElapsed(root = document) {
  if (!root || !root.querySelectorAll) return;
  const now = Date.now();
  root.querySelectorAll('[data-elapsed-since]').forEach((el) => {
    const iso = el.getAttribute('data-elapsed-since');
    const text = (el.hasAttribute('data-elapsed-icon') ? '⏱ ' : '') + fmtElapsed(iso, now);
    if (el.textContent !== text) el.textContent = text;
    const lvl = waitLevel(iso, now);
    if (el.classList.contains('wait-badge')) {
      el.classList.toggle('warn', lvl === 'warn');
      el.classList.toggle('danger', lvl === 'danger');
    }
    const card = el.closest('[data-wait-card]');
    if (card) {
      card.classList.toggle('wait-warn', lvl === 'warn');
      card.classList.toggle('wait-danger', lvl === 'danger');
    }
  });
}

// ── Toast (X-16, 2026-09-10) ─────────────────────────────────────────────
// NEGA: ilgari har qanday xabar 3 soniya turardi — uzun xato matnini
// (masalan printer xatosi) o'qib ulgurib bo'lmasdi, yopish imkoni yo'q edi
// va ekran o'qiruvchi uni umuman e'lon qilmasdi. Endi: xato 6 s,
// muvaffaqiyat 3 s (yoki `durationMs`), bosilsa darhol yopiladi, xato
// role="alert" (darhol e'lon), boshqasi role="status" (navbat bilan).
let toastTimer = null;
function toast(message, type = 'ok', durationMs) {
  const isError = type === 'error';
  const ms = durationMs != null ? durationMs : (isError ? 6000 : 3000);
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.title = 'Yopish uchun bosing';
    el.addEventListener('click', () => {
      clearTimeout(toastTimer);
      el.style.display = 'none';
    });
    document.body.appendChild(el);
  }
  el.className = `toast ${isError ? 'error' : ''}`;
  el.setAttribute('role', isError ? 'alert' : 'status');
  el.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
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
//   empty   — bo'sh ro'yxat matni, `<div class="empty-state">…</div>` ichida
//             chiqadi. DIQQAT: bu DASTURCHI matni, escape QILINMAYDI —
//             foydalanuvchi ma'lumotini bu yerga uzatmang.
//   emptyHint — (2026-09-10, A-23) bo'sh holatda asosiy matn ostida
//             `<div class="empty-hint">…</div>` bo'lib chiqadigan "endi nima
//             qilish kerak" izohi (masalan "Yuqoridagi «+ Qo'shish» tugmasi
//             bilan birinchi stolni qo'shing."). `empty` kabi escape
//             QILINMAYDI.
//   isEmpty — (data) => bool. Standart: bo'sh massiv.
//   isPoll  — true bo'lsa xato ro'yxatni O'CHIRMAYDI, faqat toast (va bir xil
//             xato takror-takror toast qilinmaydi).
//   retry   — (2026-09-10) false bo'lsa xato holatida "Qayta urinish" tugmasi
//             chiqmaydi. Standart: `load` berilgan bo'lsa chiqadi.
//   key     — holat kaliti (bir sahifada bir nechta ro'yxat bo'lsa kerak
//             bo'ladi). Standart: box elementi (yoki uning id matni).
//   dedupe  — false bo'lsa JSON solishtiruvi o'chiriladi (har safar qayta
//             chiziladi).
//
// Holatlar ko'rinishi (D-J3, 2026-09-10): ilgari xato ham, bo'sh ro'yxat
// ham AYNAN bir xil `<p class="dim">` bo'lib chiqardi — "hech narsa yo'q"
// va "yuklab bo'lmadi"ni ajratib bo'lmasdi. Endi xato —
// `<div class="error-state" role="alert">` (+ "Qayta urinish"), bo'sh —
// `<div class="empty-state">`.
//
// Chizilgandan keyin box ichidagi [data-elapsed-since] elementlari
// refreshElapsed() bilan yangilanadi (waitBadgeHtml()ga qarang).
//
// Qaytaradi: muvaffaqiyatda `data`, xatoda/eskirgan javobda `undefined`.
//
// ⚠️ `render` foydalanuvchi ma'lumotini HTML'ga qo'yganda escapeHtml() SHART —
// bu yordamchi uni o'zi qilib bermaydi (shablon har xil).
const renderListStates = new Map();

async function renderList(options) {
  const box = resolveEl(options.box);
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
    const canRetry = options.load && options.retry !== false;
    box.innerHTML = `
      <div class="error-state" role="alert">
        <span>${escapeHtml(err.message)}</span>
        ${canRetry ? '<button type="button" class="btn small" data-render-list-retry>Qayta urinish</button>' : ''}
      </div>`;
    const retryBtn = box.querySelector('[data-render-list-retry]');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        retryBtn.disabled = true;
        renderList(Object.assign({}, options, { isPoll: false }));
      });
    }
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
    box.innerHTML = `
      <div class="empty-state">
        <div>${options.empty || "Ro'yxat bo'sh."}</div>
        ${options.emptyHint ? `<div class="empty-hint">${options.emptyHint}</div>` : ''}
      </div>`;
    return data;
  }
  box.innerHTML = options.render(data);
  if (options.bind) options.bind(box, data);
  refreshElapsed(box);
  return data;
}

// ── openDialog() / closeDialog(): modal a11y yordamchisi (D-H6, A-19, A-20, 2026-09-10) ──
//
// NEGA: butun loyihada modallarda `role=`, fokus tuzog'i, Escape yo'q edi;
// yopilgach fokus sahifa boshiga tushib ketardi, orqadagi sahifa scroll
// bo'lardi, va fonga bosish ba'zi modallarni yopar, ba'zilarini yopmasdi.
// Klaviatura bilan ishlaydigan admin Tab bosganda ko'rinmas sahifa
// tugmalariga o'tib ketardi.
//
// Loyihadagi modal naqshi: `<div class="modal-backdrop hidden"><div
// class="modal">…</div></div>`, ko'rsatish/yashirish `.hidden` klassi bilan.
//
// openDialog(el, opts) — `el`: .modal-backdrop elementi yoki id (ichidagi
// .modal berilsa ham ishlaydi). opts:
//   initialFocus    — element yoki selektor; `false` — .modal panelining o'zi.
//                     Berilmasa: kompyuterda birinchi input/select/textarea,
//                     bo'lmasa birinchi tugma; sensorli ekranda (pointer:
//                     coarse) panelning o'zi — aks holda telefon klaviaturasi
//                     sakrab chiqib modalning yarmini yopib qo'yardi.
//   closeOnBackdrop — false bo'lsa fonga bosish yopmaydi (standart: yopadi).
//   closeOnEscape   — false bo'lsa Escape yopmaydi (standart: yopadi).
//   onClose(reason) — yopilganda: 'escape' | 'backdrop' | 'external' |
//                     closeDialog()ga uzatilgan sabab.
//   role            — standart 'dialog' (tasdiqlash oynasi 'alertdialog').
//
// ⚠️ Sahifadagi eski `el.classList.add('hidden')` bilan yopish ham TO'G'RI
// ishlaydi (MutationObserver kuzatadi — reason 'external'): fokus qaytadi,
// scroll qulfi yechiladi. Ya'ni mavjud closeX() funksiyalarini o'zgartirish
// shart emas, faqat ochishni `openDialog(el)`ga almashtirish kifoya —
// lekin Escape/fon bilan yopilganda holatni (editingId va h.k.) tozalash
// uchun `onClose` bering.
const dialogStack = []; // ochiq dialoglar: { el, panel, opts, returnFocus, observer, onBackdrop, prevZ }
let dialogSeq = 0;
let dialogBodySaved = null;

const DIALOG_FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), '
  + 'select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function dialogFocusables(panel) {
  return Array.from(panel.querySelectorAll(DIALOG_FOCUSABLE))
    .filter((n) => n.getClientRects().length > 0 && !n.closest('.hidden'));
}

function dialogPanel(el) {
  return el.querySelector('.modal') || el;
}

// role/aria atributlari — dialog allaqachon ochiq bo'lsa ham qayta
// qo'llanadi (ichidagi sarlavha innerHTML bilan almashtirilgan bo'lishi
// mumkin).
function applyDialogAria(el, opts) {
  const panel = dialogPanel(el);
  panel.setAttribute('role', opts.role || 'dialog');
  panel.setAttribute('aria-modal', 'true');
  if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
  const heading = panel.querySelector('h1, h2, h3');
  if (heading) {
    if (!heading.id) heading.id = `dialog-title-${++dialogSeq}`;
    panel.setAttribute('aria-labelledby', heading.id);
  }
  return panel;
}

function focusDialogInitial(el, panel, opts) {
  let target = null;
  if (opts.initialFocus === false) {
    target = panel;
  } else if (opts.initialFocus) {
    target = typeof opts.initialFocus === 'string' ? el.querySelector(opts.initialFocus) : opts.initialFocus;
  }
  if (!target) {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const list = dialogFocusables(panel);
    if (!coarse) {
      target = list.find((n) => n.matches('input, select, textarea'))
        || list.find((n) => n.tagName === 'BUTTON')
        || list[0]
        || null;
    }
  }
  (target || panel).focus();
}

function openDialog(elOrId, opts = {}) {
  let el = resolveEl(elOrId);
  if (!el) return null;
  if (el.classList.contains('modal') && el.parentElement && el.parentElement.classList.contains('modal-backdrop')) {
    el = el.parentElement;
  }
  const panel = applyDialogAria(el, opts);
  const existing = dialogStack.find((d) => d.el === el);
  if (existing) {
    existing.opts = opts; // qayta ochildi — yangi callback'lar
    el.classList.remove('hidden');
    return el;
  }

  const returnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const d = { el, panel, opts, returnFocus, observer: null, onBackdrop: null, prevZ: el.style.zIndex };

  d.onBackdrop = (e) => {
    if (e.target === el && d.opts.closeOnBackdrop !== false) closeDialog(el, 'backdrop');
  };
  el.addEventListener('click', d.onBackdrop);

  // Sahifa kodi `classList.add('hidden')` bilan yopsa ham tozalash ishlasin.
  if (typeof MutationObserver !== 'undefined') {
    d.observer = new MutationObserver(() => {
      if (el.classList.contains('hidden') && dialogStack.includes(d)) closeDialog(el, 'external');
    });
    d.observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  if (dialogStack.length === 0) {
    const b = document.body;
    dialogBodySaved = { overflow: b.style.overflow, paddingRight: b.style.paddingRight };
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    b.style.overflow = 'hidden';
    if (scrollbar > 0) b.style.paddingRight = `${scrollbar}px`;
  } else {
    // Modal ustida modal (masalan forma ustida customConfirm): DOM
    // tartibidan qat'i nazar yangisi USTDA tursin.
    el.style.zIndex = String(20 + dialogStack.length + 1);
  }
  dialogStack.push(d);

  el.classList.remove('hidden');
  focusDialogInitial(el, panel, opts);
  return el;
}

function closeDialog(elOrId, reason) {
  let el = resolveEl(elOrId);
  if (!el) return;
  if (el.classList.contains('modal') && el.parentElement && el.parentElement.classList.contains('modal-backdrop')) {
    el = el.parentElement;
  }
  const idx = dialogStack.findIndex((d) => d.el === el);
  if (idx === -1) {
    el.classList.add('hidden');
    return;
  }
  const [d] = dialogStack.splice(idx, 1);
  if (d.observer) d.observer.disconnect();
  el.removeEventListener('click', d.onBackdrop);
  el.style.zIndex = d.prevZ;
  el.classList.add('hidden');

  if (dialogStack.length === 0 && dialogBodySaved) {
    document.body.style.overflow = dialogBodySaved.overflow;
    document.body.style.paddingRight = dialogBodySaved.paddingRight;
    dialogBodySaved = null;
  }

  // Fokus modalni ochgan elementga qaytadi (agar u hali DOM'da bo'lsa —
  // renderList qayta chizgan bo'lsa tushib qolgan bo'lishi mumkin).
  const top = dialogStack[dialogStack.length - 1];
  const back = d.returnFocus;
  if (back && document.contains(back) && typeof back.focus === 'function'
      && (!top || top.panel.contains(back))) {
    back.focus();
  } else if (top) {
    focusDialogInitial(top.el, top.panel, { initialFocus: false });
  }

  if (d.opts.onClose) {
    try { d.opts.onClose(reason); } catch (e) { console.error(e); }
  }
}

// Escape va Tab — faqat ENG USTDAGI dialog uchun.
document.addEventListener('keydown', (e) => {
  const top = dialogStack[dialogStack.length - 1];
  if (!top || e.isComposing) return;
  if (e.key === 'Escape') {
    if (top.opts.closeOnEscape === false) return;
    e.preventDefault();
    closeDialog(top.el, 'escape');
    return;
  }
  if (e.key !== 'Tab') return;
  const list = dialogFocusables(top.panel);
  if (list.length === 0) {
    e.preventDefault();
    top.panel.focus();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  if (!top.panel.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && (active === first || active === top.panel)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
});

// Fokus sichqoncha/dastur orqali dialogdan tashqariga chiqsa — qaytariladi.
document.addEventListener('focusin', (e) => {
  const top = dialogStack[dialogStack.length - 1];
  if (!top || top.panel.contains(e.target)) return;
  focusDialogInitial(top.el, top.panel, { initialFocus: false });
});

// Brauzerning standart (ekranga mos kelmaydigan, "<sayt> says" ko'rinishidagi)
// window.confirm() o'rniga ilova dizayniga mos custom oyna — mavjud
// .modal-backdrop/.modal/.modal-actions CSS naqshidan (admin/tables.html va
// h.k.dagi qo'lda yozilgan modallar bilan bir xil) DOM'ga dinamik qo'shiladi,
// shuning uchun har bir HTML sahifaga alohida qo'shish shart emas.
// Promise qaytaradi: OK bosilsa true, Bekor/orqa fon/Escape bo'lsa false.
//
// 2026-09-10: ichki tomondan openDialog()ga o'tkazildi (D-H6) va listener'lar
// element yaratilganda BIR MARTA ulanadi (showInfoModal bilan bir xil sabab).
function ensureConfirmModal() {
  let el = document.getElementById('customConfirmModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'customConfirmModal';
    el.className = 'modal-backdrop hidden';
    el.innerHTML = `
      <div class="modal" aria-describedby="customConfirmMsg">
        <h2 id="customConfirmTitle">Tasdiqlash</h2>
        <p id="customConfirmMsg" class="dim"></p>
        <div class="modal-actions">
          <button type="button" class="btn" id="customConfirmCancel">Bekor</button>
          <button type="button" class="btn primary" id="customConfirmOk">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('#customConfirmOk').addEventListener('click', () => closeDialog(el, 'ok'));
    el.querySelector('#customConfirmCancel').addEventListener('click', () => closeDialog(el, 'cancel'));
  }
  return el;
}

// `options` (2026-09-10, ixtiyoriy — eski chaqiruvlar o'zgarmaydi):
//   title      — sarlavha (standart "Tasdiqlash")
//   okText     — tasdiqlash tugmasi matni (standart "OK")
//   cancelText — bekor tugmasi matni (standart "Bekor")
//   danger     — true bo'lsa tasdiqlash tugmasi `.btn.danger` (o'chirish kabi
//                qaytarib bo'lmaydigan amallar uchun)
// Fokus ataylab "Bekor"da turadi — tasodifiy Enter xavfli amalni bajarmasin.
function customConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const el = ensureConfirmModal();
    // Oldingi tasdiqlash hali ochiq bo'lsa — u "rad etildi" deb yopiladi
    // (uning Promise'i osilib qolmasin).
    if (dialogStack.some((d) => d.el === el)) closeDialog(el, 'replaced');
    el.querySelector('#customConfirmTitle').textContent = options.title || 'Tasdiqlash';
    el.querySelector('#customConfirmMsg').textContent = message;
    const okBtn = el.querySelector('#customConfirmOk');
    okBtn.textContent = options.okText || 'OK';
    okBtn.className = `btn ${options.danger ? 'danger' : 'primary'}`;
    el.querySelector('#customConfirmCancel').textContent = options.cancelText || 'Bekor';
    openDialog(el, {
      role: 'alertdialog',
      initialFocus: '#customConfirmCancel',
      onClose: (reason) => resolve(reason === 'ok'),
    });
  });
}

// Bitta tugmali ("Yopish") umumiy ma'lumot oynasi — customConfirm bilan bir xil
// .modal-backdrop naqshidan foydalanadi. Afitsiant menyusida taom ustiga
// (+ tugmasi emas) bosilganda shu taom haqidagi tavsifni ko'rsatish uchun
// ishlatiladi (public/waiter/order.js, showItemInfo()). 2026-09-10 dan
// native alert() o'rnida ham (D-J4).
//
// ⚠️ 2026-09-10 da tuzatildi (chek modalidagi bilan AYNI xato): listener'lar
// ilgari showInfoModal()ning HAR chaqirilishida qo'shilardi, holbuki
// ensureInfoModal() DOM'dagi DOIMIY bitta elementni qaytaradi va eski
// listener'lar faqat oyna "finish()" yo'li bilan yopilganda olinardi. Oyna
// yopilmasdan qayta ochilsa listener'lar elementda to'planib qolardi. Endi
// ular element yaratilgan paytda FAQAT BIR MARTA ulanadi — showInfoModal()
// esa faqat matnni almashtiradi. Fon/Escape bilan yopish openDialog()da.
function ensureInfoModal() {
  let el = document.getElementById('customInfoModal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'customInfoModal';
    el.className = 'modal-backdrop hidden';
    el.innerHTML = `
      <div class="modal" aria-describedby="customInfoBody">
        <h2 id="customInfoTitle"></h2>
        <p id="customInfoBody" class="dim" style="white-space:pre-wrap;"></p>
        <div class="modal-actions">
          <button type="button" class="btn primary" id="customInfoClose">Yopish</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('#customInfoClose').addEventListener('click', () => closeDialog(el, 'close'));
  }
  return el;
}

function showInfoModal(title, body) {
  const el = ensureInfoModal();
  el.querySelector('#customInfoTitle').textContent = title;
  el.querySelector('#customInfoBody').textContent = body;
  openDialog(el, { initialFocus: '#customInfoClose' });
}

// ── Inline validatsiya (A-18, L-14, 2026-09-10) ──────────────────────────
// NEGA: forma xatosi faqat 3 soniyalik toast bilan chiqardi — qaysi maydon
// noto'g'ri ekani belgilanmasdi, uzun formada foydalanuvchi toast'ni
// o'qib ulgurmasdan xato maydonni izlab qolardi, ekran o'qiruvchi esa
// umuman bilmasdi.
//
// setFieldError(input, message, { focus = true }) — input'ning `.field` ota
// elementiga `.has-error`, ichiga `<div class="field-error">`, input'ga
// aria-invalid + aria-describedby. `.field` bo'lmasa xato matni input'dan
// keyin qo'yiladi. Bir validatsiya o'tishida bir nechta maydonga
// chaqirilsa — DOM tartibidagi BIRINCHI xato maydonga fokus + scroll
// (bitta mikrotask'da jamlanadi). Foydalanuvchi maydonga yoza boshlasa
// xato o'zi yo'qoladi. Bo'sh `message` — shu maydon xatosini tozalaydi.
let fieldErrorSeq = 0;
let fieldErrorFocusQueued = false;
const fieldErrorBound = new WeakSet();

function clearFieldError(inputOrId) {
  const input = resolveEl(inputOrId);
  if (!input) return;
  const errId = input.getAttribute('data-field-error-id');
  if (errId) {
    const errEl = document.getElementById(errId);
    if (errEl) errEl.remove();
    const rest = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && t !== errId);
    if (rest.length) input.setAttribute('aria-describedby', rest.join(' '));
    else input.removeAttribute('aria-describedby');
    input.removeAttribute('data-field-error-id');
  }
  input.removeAttribute('aria-invalid');
  const field = input.closest('.field');
  if (field && !field.querySelector('[aria-invalid="true"]')) field.classList.remove('has-error');
}

function setFieldError(inputOrId, message, options = {}) {
  const input = resolveEl(inputOrId);
  if (!input) return;
  if (!message) { clearFieldError(input); return; }
  const field = input.closest('.field');
  let errId = input.getAttribute('data-field-error-id');
  let errEl = errId ? document.getElementById(errId) : null;
  if (!errEl) {
    errId = input.id ? `${input.id}-error` : `field-error-${++fieldErrorSeq}`;
    errEl = document.createElement('div');
    errEl.className = 'field-error';
    errEl.id = errId;
    if (field) field.appendChild(errEl);
    // .pw-field ichiga emas, undan KEYIN — aks holda o'rovchi balandligi
    // o'sib, absolute joylashgan "ko'rsatish" tugmasi siljib ketadi.
    else (input.closest('.pw-field') || input).insertAdjacentElement('afterend', errEl);
    input.setAttribute('data-field-error-id', errId);
    const tokens = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!tokens.includes(errId)) tokens.push(errId);
    input.setAttribute('aria-describedby', tokens.join(' '));
  }
  errEl.textContent = message;
  input.setAttribute('aria-invalid', 'true');
  if (field) field.classList.add('has-error');

  if (!fieldErrorBound.has(input)) {
    fieldErrorBound.add(input);
    const clear = () => { if (input.getAttribute('aria-invalid') === 'true') clearFieldError(input); };
    input.addEventListener('input', clear);
    input.addEventListener('change', clear);
  }

  if (options.focus !== false && !fieldErrorFocusQueued) {
    fieldErrorFocusQueued = true;
    const scope = input.closest('form, .modal') || document;
    Promise.resolve().then(() => {
      fieldErrorFocusQueued = false;
      const first = scope.querySelector('[aria-invalid="true"]') || input;
      if (typeof first.focus === 'function') first.focus();
      if (typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'center' });
    });
  }
}

// `container` (element, id yoki bo'sh = butun hujjat) ichidagi barcha
// inline xatolarni tozalaydi — odatda validatsiya boshida chaqiriladi.
function clearFieldErrors(containerOrId) {
  const root = resolveEl(containerOrId) || document;
  root.querySelectorAll('[aria-invalid="true"]').forEach((input) => clearFieldError(input));
  root.querySelectorAll('.field.has-error').forEach((f) => f.classList.remove('has-error'));
  root.querySelectorAll('.field-error').forEach((e) => e.remove());
}

// ── Davr tanlash tugmalari (A-11, 2026-09-10) ─────────────────────────────
// NEGA: oylik hisobot uchun mobil `date` tanlagichda 6–8 teginish kerak
// edi. Tayyor "Bugun / Kecha / 7 kun / Bu oy / O'tgan oy" chiplari buni
// bitta teginishga tushiradi. Sanalar LOKAL vaqt bo'yicha (todayStr() bilan
// bir xil mantiq — ymdLocal()).
const DATE_PRESETS = [
  ['today', 'Bugun'],
  ['yesterday', 'Kecha'],
  ['week', '7 kun'],
  ['month', 'Bu oy'],
  ['lastMonth', "O'tgan oy"],
];

// key -> { from, to } ('YYYY-MM-DD'), noma'lum kalit — null.
function datePresetRange(key, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const today = ymdLocal(new Date(y, m, d));
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const t = ymdLocal(new Date(y, m, d - 1)); return { from: t, to: t }; }
    case 'week': return { from: ymdLocal(new Date(y, m, d - 6)), to: today };
    case 'month': return { from: ymdLocal(new Date(y, m, 1)), to: today };
    case 'lastMonth': return { from: ymdLocal(new Date(y, m - 1, 1)), to: ymdLocal(new Date(y, m, 0)) };
    default: return null;
  }
}

// datePresets(container, { onChange, initial }) — container ichiga
// `.chip-row` qo'shadi. Chip bosilsa `.active` o'tadi va
// onChange({ from, to, key }) chaqiriladi.
// `initial` — faqat BELGILAYDI, onChange'ni CHAQIRMAYDI (boshlang'ich
// yuklashni sahifa o'zi `presets.get()` bilan qiladi).
// Qaytaradi: { set(key, { silent }), get() }:
//   set(key)  — chipni tanlaydi va onChange chaqiradi ({ silent: true } — chaqirmaydi);
//               set(null) — tanlovni olib tashlaydi (masalan foydalanuvchi
//               sanani qo'lda o'zgartirganda).
//   get()     — { key, from, to } (joriy vaqtga qayta hisoblangan) yoki null.
function datePresets(containerOrId, { onChange, initial } = {}) {
  const container = resolveEl(containerOrId);
  let activeKey = null;
  if (!container) return { set() {}, get() { return null; } };
  const old = container.querySelector(':scope > .chip-row[data-date-presets]');
  if (old) old.remove();
  const row = document.createElement('div');
  row.className = 'chip-row';
  row.setAttribute('data-date-presets', '');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Tayyor davrlar');
  row.innerHTML = DATE_PRESETS.map(([key, label]) =>
    `<button type="button" class="chip" data-preset="${key}" aria-pressed="false">${label}</button>`).join('');
  container.appendChild(row);

  const mark = () => {
    row.querySelectorAll('[data-preset]').forEach((b) => {
      const on = b.dataset.preset === activeKey;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };
  const ctrl = {
    set(key, opts = {}) {
      const range = key ? datePresetRange(key) : null;
      activeKey = range ? key : null;
      mark();
      if (range && !opts.silent && onChange) onChange(Object.assign({ key }, range));
    },
    get() {
      const range = activeKey ? datePresetRange(activeKey) : null;
      return range ? Object.assign({ key: activeKey }, range) : null;
    },
  };
  row.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (b) ctrl.set(b.dataset.preset);
  });
  if (initial) ctrl.set(initial, { silent: true });
  return ctrl;
}

// ── Qidiruv (A-08, X-22, 2026-09-10) ──────────────────────────────────────
// NEGA: admin panelda ham, afitsiant menyusida ham bironta qidiruv yo'q
// edi. O'zbek lotin yozuvida apostrof 5 xil belgi bilan yoziladi (' ʻ ʼ ‘ ’)
// va xodim telefonda odatda uni umuman yozmaydi — "lagmon" "Lag'mon"ni
// topishi SHART, aks holda qidiruv "ishlamaydi" deb tashlab ketiladi.
const SEARCH_APOSTROPHES_RE = /['`´ʻʼ‘’]/g;

// Kichik harf + apostroflarsiz + bitta probel.
function normalizeSearchText(s) {
  return String(s == null ? '' : s).toLowerCase().replace(SEARCH_APOSTROPHES_RE, '').replace(/\s+/g, ' ').trim();
}

// So'rovdagi HAR BIR so'z matnda uchrasa true ("osh qo" -> "Qovurma osh").
// Bo'sh so'rov — true.
function matchesSearch(text, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const t = normalizeSearchText(text);
  return q.split(' ').every((w) => t.includes(w));
}

// attachSearch(input, { onFilter, delay = 150 }) — `input` hodisasini
// debounce qilib onFilter(normalizedQuery) chaqiradi. Escape (maydonda
// matn bo'lsa) tozalaydi va darhol onFilter('') chaqiradi — modal ichida
// bo'lsa modalni yopmaydi. Qaytaradi: { clear(), get() }.
function attachSearch(inputOrId, { onFilter, delay = 150 } = {}) {
  const input = resolveEl(inputOrId);
  if (!input) return { clear() {}, get() { return ''; } };
  if (!input.hasAttribute('autocomplete')) input.setAttribute('autocomplete', 'off');
  if (!input.hasAttribute('enterkeyhint')) input.setAttribute('enterkeyhint', 'search');
  input.setAttribute('spellcheck', 'false');
  let timer = null;
  const fire = () => {
    clearTimeout(timer);
    if (onFilter) onFilter(normalizeSearchText(input.value));
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(fire, delay);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      fire();
    } else if (e.key === 'Enter') {
      fire(); // kutmasdan
    }
  });
  return {
    clear() { input.value = ''; fire(); },
    get() { return normalizeSearchText(input.value); },
  };
}

// onActivate(el, fn) — `role="button"` bo'lgan <div> uchun click + Enter/Space
// (D-H10, 2026-09-10). Haqiqiy <button> buni o'zi qiladi; bu yordamchi faqat
// bosiladigan karta/qatorlar uchun. Ichidagi boshqa tugma/havola bosilganda
// fn chaqirilmaydi; klaviaturada faqat elementning O'ZI fokusda bo'lsa.
function onActivate(el, fn) {
  el.addEventListener('click', (e) => {
    const control = e.target.closest('button, a, input, select, textarea');
    if (control && control !== el && el.contains(control)) return;
    fn(e);
  });
  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn(e);
    }
  });
}

// Sahifaga qaytilganda yangilash (X-24, 2026-09-10).
// NEGA: planshet uxlab qolsa yoki xodim boshqa ilovaga o'tib qaytsa,
// setInterval'lar to'xtab turgan bo'ladi va ekranda daqiqalab eski
// ma'lumot turardi. onVisible(fn) — sahifa yana KO'RINADIGAN bo'lganda
// (shuningdek "orqaga" tugmasi bilan bfcache'dan qaytilganda) fn()
// chaqiradi. Qaytaradi: obunani bekor qiluvchi funksiya.
function onVisible(fn) {
  const onVis = () => { if (document.visibilityState === 'visible') fn(); };
  const onShow = (e) => { if (e.persisted) fn(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pageshow', onShow);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pageshow', onShow);
  };
}

// Parolni ko'rsatish tugmasi (X-26, 2026-09-10).
// NEGA: telefonda yulduzchalar ostida parolni xato terish oson, xodim esa
// qayerda xato qilganini ko'ra olmay qayta-qayta urinib rate-limitga
// (10 urinish / 15 daqiqa) urilardi. Input `.pw-field` o'rovchiga olinadi
// (style.css tugmani uning o'ng chetiga 44×44 qilib joylaydi; o'rovchi
// allaqachon bo'lsa yangisi yaratilmaydi) va input'dan keyin
// `<button class="pw-toggle">` qo'yiladi; forma yuborilganda parol yana
// yashiriladi (brauzer uni oddiy matn sifatida eslab qolmasin).
// Qaytaradi: tugma elementi.
function attachPasswordToggle(inputOrId) {
  const input = resolveEl(inputOrId);
  if (!input) return null;
  if (input.hasAttribute('data-pw-toggle')) {
    return input.nextElementSibling && input.nextElementSibling.classList.contains('pw-toggle') ? input.nextElementSibling : null;
  }
  input.setAttribute('data-pw-toggle', '');
  if (!input.parentElement || !input.parentElement.classList.contains('pw-field')) {
    const hadFocus = document.activeElement === input;
    const wrap = document.createElement('div');
    wrap.className = 'pw-field';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    if (hadFocus) input.focus();
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pw-toggle';
  btn.textContent = '👁';
  if (input.id) btn.setAttribute('aria-controls', input.id);
  const setShown = (shown) => {
    input.type = shown ? 'text' : 'password';
    btn.setAttribute('aria-pressed', shown ? 'true' : 'false');
    btn.setAttribute('aria-label', shown ? 'Parolni yashirish' : "Parolni ko'rsatish");
  };
  setShown(false);
  btn.addEventListener('click', () => setShown(input.type === 'password'));
  if (input.form) input.form.addEventListener('submit', () => setShown(false));
  input.insertAdjacentElement('afterend', btn);
  return btn;
}

// ── Restoran sozlamalari (D-I, 7.9-bo'lim, 2026-09-10) ────────────────────
// Chekka restoran telefoni/manzilini qo'yish uchun. `GET /api/public/settings`
// (javob: { restaurant_name, restaurant_phone, restaurant_address, ... })
// bir marta yuklanib keshlanadi. Endpoint yo'q / xato / 401 bo'lsa XATO
// OTMAYDI — `{}` qaytaradi (chekda shunchaki chiqmaydi) va keyingi
// chaqiruvda qayta urinadi.
let settingsCache = null;
let settingsPromise = null;
function getSettings() {
  if (settingsCache) return Promise.resolve(settingsCache);
  if (!settingsPromise) {
    settingsPromise = api('/public/settings', { noAuthRedirect: true })
      .then((data) => {
        settingsCache = data && typeof data === 'object' ? data : {};
        return settingsCache;
      })
      .catch(() => {
        settingsPromise = null;
        return {};
      });
  }
  return settingsPromise;
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
// ⚠️ Brend nomi ataylab settings.restaurant_name bilan ALMASHTIRILMAGAN
// (2026-09-10) — bu alohida qaror; settings'dan faqat telefon/manzil olinadi.
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

// Chek raqami (D-I, 2026-09-10). NEGA: chekda raqam yo'q edi — mijoz
// "hisobda xato bor" deb qaytsa, admin qaysi buyurtma ekanini faqat vaqt
// va summa bo'yicha taxmin qilardi. Stol buyurtmasi, onlayn buyurtma va
// qo'lda hisob ALOHIDA jadvallarda (id'lari mustaqil) — shu sabab
// prefiks har xil, aks holda "№12" ikki xil hujjatga tegishli bo'lardi.
// `view.order.id` bo'lmasa (masalan server qo'lda hisob view'iga id
// qo'shmagan) — bo'sh matn, chekda chiqmaydi.
function receiptNumberLabel(view) {
  const id = view && view.order ? view.order.id : null;
  if (id === null || id === undefined || id === '') return '';
  if (view.kind === 'customer') return `Onlayn buyurtma №${id}`;
  if (view.kind === 'manual') return `Hisob №${id}`;
  return `Chek №${id}`;
}

// Restoran manzili va telefoni qatorlari (settings bo'sh bo'lsa — []).
function receiptContactLines(settings) {
  const s = settings || {};
  return [
    s.restaurant_address ? String(s.restaurant_address) : '',
    s.restaurant_phone ? `Tel: ${s.restaurant_phone}` : '',
  ].filter(Boolean);
}

// `items`        — { name_snapshot, quantity, subtotal } ro'yxati
// `receiptNo`    — "Chek №123" (bo'sh bo'lsa chiqmaydi)
// `contactLines` — sarlavha ostidagi restoran manzili/telefoni
// `footerLines`  — JAMI dan keyin, chapga tekislangan holda chiqadigan
//                  qo'shimcha qatorlar (bo'sh qiymatlar tashlab yuboriladi)
function buildEscPos({ subheading, receiptNo = '', contactLines = [], dateIso, items, total, footerLines = [] }) {
  const data = [];
  data.push('\x1B\x40');                // ESC @ — printerni boshlang'ich holatga
  data.push(ESC_POS_CODEPAGE_CP866);    // ESC t — kod jadvali (init'dan KEYIN!)
  data.push('\x1B\x61\x01');            // markazga tekislash
  data.push('\x1B\x21\x30');            // ikki barobar en + bo'y
  data.push(`${RECEIPT_TITLE}\n`);
  data.push('\x1B\x21\x00');            // odatdagi o'lcham
  contactLines.filter(Boolean).forEach((line) => data.push(`${line}\n`));
  data.push(`${subheading}\n`);
  if (receiptNo) data.push(`${receiptNo}\n`);
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
// `settings` (2026-09-10, ixtiyoriy) — restoran telefoni/manzili uchun;
// berilmasa getSettings() keshidagi qiymat (printReceiptView uni oldindan
// yuklab qo'yadi).
function buildEscPosReceipt(view, settings) {
  const common = {
    receiptNo: receiptNumberLabel(view),
    contactLines: receiptContactLines(settings || settingsCache),
  };
  if (view.kind === 'customer') {
    // "Mijoz tel:" (oddiy "Tel:" emas) — tepadagi restoran telefoni bilan
    // adashtirilmasin (2026-09-10).
    return buildEscPos(Object.assign(common, {
      subheading: view.order.heading,
      dateIso: view.order.created_at,
      items: view.items,
      total: view.total,
      footerLines: customerChargeLines(view).concat([
        view.order.phone ? `Mijoz tel: ${view.order.phone}` : '',
        view.order.address ? `Manzil: ${view.order.address}` : '',
      ]),
    }));
  }
  if (view.kind === 'manual') {
    return buildEscPos(Object.assign(common, {
      subheading: view.order.heading,
      dateIso: view.order.created_at,
      items: view.items,
      total: view.total,
      footerLines: [
        view.order.created_by_name ? `Hisobladi: ${view.order.created_by_name}` : '',
      ],
    }));
  }
  // dine-in: bekor qilingan (void) taomlar chekka tushmaydi
  return buildEscPos(Object.assign(common, {
    subheading: view.order.table_name,
    dateIso: view.order.closed_at || view.order.opened_at,
    items: view.items.filter((it) => it.status === 'active'),
    total: view.total,
  }));
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
          <button type="button" class="btn" id="receiptModalClose">Yopish</button>
          <button type="button" class="btn primary" id="receiptModalPrint">Chekni chop etish</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    const printBtn = el.querySelector('#receiptModalPrint');
    // Yopish (tugma, fon, Escape) — openDialog() orqali; holat onClose'da
    // tozalanadi (showReceiptModal()ga qarang).
    const close = () => closeDialog(el, 'close');
    el.querySelector('#receiptModalClose').addEventListener('click', close);
    printBtn.addEventListener('click', () => withBusy(printBtn, async () => {
      const state = receiptModalState;
      if (!state) return;
      try {
        await printReceiptView(state.view);
      } catch (err) {
        console.error(err);
        // D-J4 (2026-09-10): native alert() emas — u "127.0.0.1:3213 says"
        // sarlavhali brauzer oynasida chiqardi.
        showInfoModal(
          "Chek chop etilmadi",
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
// 2026-09-10: chek raqami va (settings keshida bo'lsa) restoran
// manzili/telefoni qo'shildi; h2'ning doimiy id'si modal aria-labelledby
// uchun (innerHTML qayta yozilganda ham bog'lanish uzilmasin).
function renderReceiptBoxHtml({ subheading, receiptNo = '', dateIso, items, total, footerHtml }) {
  const box = document.getElementById('receiptModalBox');
  const contact = receiptContactLines(settingsCache);
  box.innerHTML = `
    <h2 id="receiptModalTitle">${escapeHtml(RECEIPT_TITLE)}</h2>
    ${contact.length ? `<div class="r-sub">${contact.map(escapeHtml).join(' · ')}</div>` : ''}
    <div class="r-sub">${receiptNo ? `${escapeHtml(receiptNo)} · ` : ''}${escapeHtml(subheading)} · ${fmtDateTime(dateIso)}</div>
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
    receiptNo: receiptNumberLabel(view),
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
    receiptNo: receiptNumberLabel(view),
    dateIso: view.order.created_at,
    items: view.items,
    total: view.total,
    footerHtml: `
      ${customerChargeLines(view).map((line) => `${escapeHtml(line)}<br>`).join('')}
      ${view.order.phone ? `Mijoz tel: ${escapeHtml(view.order.phone)}<br>` : ''}
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
    receiptNo: receiptNumberLabel(view),
    dateIso: view.order.created_at,
    items: view.items,
    total: view.total,
    footerHtml: `
      ${view.order.created_by_name ? `Hisobladi: ${escapeHtml(view.order.created_by_name)}<br>` : ''}
    `,
  });
}

async function printReceiptView(view) {
  // Restoran telefoni/manzili (D-I). 2 soniyadan oshsa kutmaymiz — sozlama
  // endpoint'i sekin/yo'q bo'lgani uchun chek chiqmay qolmasin.
  const settings = await Promise.race([
    getSettings(),
    new Promise((resolve) => setTimeout(() => resolve(settingsCache || {}), 2000)),
  ]);
  await loadQzTray();
  setupQzSecurity();
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
  const config = qz.configs.create(RECEIPT_PRINTER_NAME, { encoding: 'CP866' });
  await qz.print(config, buildEscPosReceipt(view, settings));
}

// `options.onPrinted` — chek MUVAFFAQIYATLI chop etilgandan keyin
// chaqiriladigan ixtiyoriy callback (masalan admin print-navbatidagi
// so'rovni "chop etildi" deb belgilash — renderPrintRequests()ga qara).
// 2026-09-10: openDialog() orqali ochiladi (role, Escape, fokus, scroll
// qulfi); settings hali keshda bo'lmasa, kelgach chek qayta chiziladi.
function showReceiptModal(view, options = {}) {
  const el = ensureReceiptModal();
  receiptModalState = { view, onPrinted: options.onPrinted || null };
  renderReceiptBox(view);
  openDialog(el, {
    initialFocus: '#receiptModalPrint',
    onClose: () => { receiptModalState = null; },
  });
  if (!settingsCache) {
    getSettings().then((s) => {
      if (receiptModalState && receiptModalState.view === view && receiptContactLines(s).length) {
        renderReceiptBox(view);
      }
    });
  }
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
// 2026-09-10: `id` — chek raqami uchun (receiptNumberLabel).
const FULFILLMENT_LABEL_RECEIPT = { pickup: "Olib ketish", delivery: 'Yetkazib berish' };
function openCustomerReceiptModal(order) {
  const view = {
    kind: 'customer',
    order: {
      id: order.id,
      heading: `${FULFILLMENT_LABEL_RECEIPT[order.fulfillment] || order.fulfillment} — ${order.full_name}`,
      created_at: order.created_at,
      phone: order.phone,
      address: order.address,
      note: order.note,
      delivery_fee: order.delivery_fee,
    },
    items: order.items,
    total: order.total_amount,
  };
  showReceiptModal(view);
}

// Yetkazish narxi (2026-09-11). Buyurtma paytidagi narx `customer_orders.
// delivery_fee`da saqlanadi va `total_amount`ga (taomlar) KIRMAYDI — shu
// sabab kuryer "mijozdan qancha olish kerak"ni alohida ko'rishi shart
// (ilgari mijozga "yetkazish alohida 10 000" deyilardi, kuryer ekranida
// esa bu summa umuman yo'q edi). 0/NULL (olib ketish, bepul yoki eski
// yozuv) — hech narsa chiqmaydi. Qaytaradi: { fee, payable } yoki null.
function deliveryCharge(order) {
  const fee = Number(order && order.delivery_fee);
  if (!Number.isFinite(fee) || fee <= 0) return null;
  return { fee, payable: (Number(order.total_amount) || 0) + fee };
}

// Mijoz buyurtmasi cheki uchun (JAMI — taomlar — dan keyingi qatorlar).
function customerChargeLines(view) {
  const c = deliveryCharge({ delivery_fee: view.order.delivery_fee, total_amount: view.total });
  return c ? [`Yetkazish: ${fmtMoney(c.fee)}`, `To'lov jami: ${fmtMoney(c.payable)}`] : [];
}

// Kuryer va admin kartalari uchun bitta qator HTML (bo'sh bo'lsa '').
function deliveryChargeHtml(order) {
  const c = deliveryCharge(order);
  if (!c) return '';
  return `<div class="card-sub">🚚 Yetkazish: ${fmtMoney(c.fee)} · Mijozdan olinadi: <strong>${fmtMoney(c.payable)}</strong></div>`;
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

// Chiqish (X-11, 2026-09-10).
// NEGA tasdiqlash: tugma har sahifada yuqori o'ngda, kichik — bosh barmoq
// tasodifan tegsa smena o'rtasida sessiya tugardi.
// NEGA login.html (landing emas): ilgari mijozlar landing sahifasiga
// qaytarilardi, xodim qayta kirish uchun landing → "Xodim kirishi" →
// login → parol — 4–5 qadam bosib o'tardi, mijoz esa kutib turardi.
function initLogout() {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const ok = await customConfirm('Tizimdan chiqasizmi?', { title: 'Chiqish', okText: 'Chiqish' });
    if (!ok) return;
    btn.disabled = true;
    try { await api('/logout', { method: 'POST', noAuthRedirect: true }); } catch (e) { /* baribir yo'naltiramiz */ }
    window.location.href = `${API_BASE}login.html`;
  });
}

// ---------------- Bildirishnoma kartalari: diff bilan yangilash ----------------
// NEGA (X-02, X-03, 2026-09-10): ilgari har poll'da (3–10 s) ro'yxat
// `box.innerHTML = ...` bilan BUTUNLAY qayta chizilardi. Natija:
//   - xodim "Qabul qildim"ni bosib turgan paytda poll tushsa, tugma DOM'dan
//     olib tashlanib `click` umuman otilmasdi (renderList izohidagi 2-xato);
//   - yangi karta qo'shilganda butun ro'yxat qayta joylashib, sahifa
//     sakrardi.
// Endi kartalar `id` bo'yicha solishtiriladi: o'zgarmagan karta DOM'da
// TEGILMASDAN qoladi, faqat yangisi qo'shiladi / o'zgargani almashtiriladi
// / yo'qolgani olib tashlanadi.
//
// `source` — kartalar manbasi ('waiter' | 'print' | 'deliv'). Admin
// sahifasida chop etish so'rovlari va yetkazib berish xabarlari endi BITTA
// konteynerda turadi (har bir manba faqat o'z kartalariga tegadi) — ilgari
// ular innerHTML bir-birini o'chirmasligi uchun ikkita alohida ro'yxatda
// edi, lekin .notif-list sticky bo'lgach ikkita sticky ro'yxat bir-birining
// ustiga tushib qolardi.
function syncNotifCards(box, source, rows, toHtml, bind) {
  const list = rows || [];
  const existing = new Map();
  box.querySelectorAll(`[data-notif-src="${source}"]`).forEach((c) => existing.set(c.getAttribute('data-notif-key'), c));
  const wanted = new Set(list.map((r) => String(r.id)));
  existing.forEach((card, k) => {
    if (!wanted.has(k)) {
      card.remove();
      existing.delete(k);
    }
  });
  let prev = null;
  list.forEach((row) => {
    const k = String(row.id);
    const sig = JSON.stringify(row);
    let card = existing.get(k);
    if (!card || card.getAttribute('data-notif-sig') !== sig) {
      const tpl = document.createElement('template');
      tpl.innerHTML = toHtml(row).trim();
      const fresh = tpl.content.firstElementChild;
      fresh.setAttribute('data-notif-src', source);
      fresh.setAttribute('data-notif-key', k);
      fresh.setAttribute('data-notif-sig', sig);
      if (bind) bind(fresh, row);
      if (card) {
        card.replaceWith(fresh);
      } else if (prev) {
        prev.after(fresh);
      } else {
        box.insertBefore(fresh, box.querySelector(`[data-notif-src="${source}"]`));
      }
      card = fresh;
    }
    if (prev && prev.nextElementSibling !== card) prev.after(card);
    prev = card;
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
    // Yangi karta ekran o'qiruvchida e'lon qilinsin (2026-09-10).
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Bildirishnomalar');
    el.setAttribute('aria-live', 'polite');
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
  syncNotifCards(ensureNotifList(), 'waiter', rows, (n) => `
    <div class="notif-card ${n.acknowledged_at ? 'done' : ''}">
      <span class="notif-msg">${escapeHtml(n.message)}</span>
      ${n.acknowledged_at
        ? `<span class="notif-ack">✅ ${escapeHtml(n.acknowledged_by_name || '')} qabul qildi</span>`
        : `<button type="button" class="btn small primary" data-ack="${n.id}">Qabul qildim</button>`}
    </div>
  `, (card, n) => {
    const btn = card.querySelector('[data-ack]');
    if (btn) btn.addEventListener('click', () => withBusy(btn, () => acknowledgeWaiterNotification(n.id)));
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
  syncNotifCards(ensureNotifList(), 'print', rows, (r) => `
    <div class="notif-card">
      <span class="notif-msg">${escapeHtml(r.table_name)} — hisob-kitob qilindi (${fmtMoney(r.total_amount)})</span>
      <button type="button" class="btn small primary" data-print-req="${r.id}" data-order-id="${r.order_id}">Chekni chop etish</button>
    </div>
  `, (card, r) => {
    const btn = card.querySelector('[data-print-req]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      // ⚠️ 2026-09-10 tuzatish (JIDDIY): ilgari `markPrintRequestPrinted()`
      // DARHOL, chek chop etilishidan OLDIN chaqirilardi. Agar chek fetch'i
      // yiqilsa yoki QZ Tray ishlamasa — navbat allaqachon tozalangan, chek
      // esa chiqmagan bo'lardi va so'rov BUTUNLAY yo'qolardi (stol yopilgan,
      // mijozga chek berilmagan, adminda esa hech qanday iz qolmagan). Endi
      // navbatdan o'chirish faqat `printReceiptView()` muvaffaqiyatli
      // tugagandan keyin, `onPrinted` callback'i orqali bo'ladi.
      const requestId = Number(r.id);
      openReceiptByOrderId(Number(r.order_id), 'waiter', {
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
// tugmasi + ~30s grace-oyna).
// 2026-09-10: endi alohida `deliveryAlertList` emas, umumiy `notifList`
// ichida ('deliv' manbasi) — syncNotifCards() izohiga qarang. Nom eski
// chaqiruvlar uchun saqlab qolindi.
function ensureDeliveryAlertList() {
  return ensureNotifList();
}

function renderDeliveryAlerts(rows) {
  syncNotifCards(ensureNotifList(), 'deliv', rows, (n) => `
    <div class="notif-card ${n.acknowledged_at ? 'done' : ''}">
      <span class="notif-msg">${escapeHtml(n.message)}</span>
      ${n.acknowledged_at
        ? `<span class="notif-ack">✅ ${escapeHtml(n.acknowledged_by_name || '')} ko'rdi</span>`
        : `<button type="button" class="btn small primary" data-deliv-ack="${n.id}">Ko'rdim</button>`}
    </div>
  `, (card, n) => {
    const btn = card.querySelector('[data-deliv-ack]');
    if (btn) btn.addEventListener('click', () => withBusy(btn, () => acknowledgeDeliveryAlert(n.id)));
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
  initOfflineBanner();
  initLogout();
  initWaiterNotifications();
  initAdminPrintRequests();
  initDeliveryAlerts();
  // Kutish vaqti yorliqlari (waitBadgeHtml) har 30 s'da o'zi yangilanadi.
  setInterval(() => refreshElapsed(), 30000);
  onVisible(() => refreshElapsed());
});
