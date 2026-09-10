// Kassir "Hisob-kitob" ekrani — afitsiantning order.js'idan farqli, bu yerda
// MENYU/taom qo'shish yo'q (kassir faqat mavjud buyurtmani ko'radi va hisob-
// kitob qiladi). escapeHtml() — ../app.js'dan global.
const params = new URLSearchParams(window.location.search);
const TABLE_ID = params.get('table');

// So'rovlar navbati (2026-09-10).
// NEGA: sahifa har 8 soniyada `loadOrder()` bilan poll qiladi, kassirning
// amali ham xuddi shu `renderOrder()`ni chaqiradi — javoblarning kelish
// tartibi kafolatlanmagan. Poll GET yuborilgandan keyin kassir stolni yopsa,
// keyin ESKI poll javobi kelib ekranga allaqachon yopilgan buyurtmani qayta
// chizardi (faol "Hisob-kitob" tugmasi bilan). Endi eskirgan javob tashlanadi.
//
// Navbat qo'lda `reqSeq` bilan yozilgan edi — 2026-09-10 da ../app.js'dagi
// umumiy renderList()ga o'tkazildi (u `orderLines` uchun o'z navbatini
// yuritadi va har bir chizishda uni oldinga suradi, ya'ni renderOrder(null)
// yo'lda qolgan poll javobini ham bekor qiladi).

async function loadTableName() {
  try {
    const tables = await api('/kassir/tables');
    const t = tables.find((x) => String(x.id) === String(TABLE_ID));
    if (t) document.getElementById('tableTitle').textContent = t.name;
  } catch (e) { /* jim */ }
}

// Buyurtma qatorlari #orderLines ichida, jami summa va ikki tugma esa undan
// TASHQARIDA — shu sabab `render` faqat quti ichini beradi, tashqaridagi
// boshqaruvlar `onData` da yangilanadi.
function orderLinesHtml(view) {
  if (!view) {
    return '<p class="dim">Hozircha bu stolda ochiq buyurtma yo\'q.</p>';
  }
  if (view.items.length === 0) {
    // Afitsiant barcha taomlarni bekor qilgan bo'lishi mumkin — closeTable()
    // bo'sh chekni rad etadi, shu sabab stolni bo'shatishning yagona yo'li
    // "Bo'shatish" (cancel-order).
    return '<p class="dim">Buyurtmada taom yo\'q (hammasi bekor qilingan). Stolni bo\'shatish uchun pastdagi tugmani bosing.</p>';
  }
  return view.items.map((it) => `
    <div class="order-line">
      <div>
        <div class="ol-name">${escapeHtml(it.name_snapshot)}</div>
        <div class="ol-meta">${it.quantity} × ${fmtMoney(it.unit_price)}</div>
      </div>
      <div class="ol-subtotal">${fmtMoney(it.subtotal)}</div>
    </div>
  `).join('');
}

function applyOrderControls(view) {
  const totalEl = document.getElementById('totalAmount');
  const closeBtn = document.getElementById('closeBtn');
  const cancelOrderBtn = document.getElementById('cancelOrderBtn');
  // 2026-09-10 (X-28): inline style.display o'rniga `.hidden` klassi —
  // HTML'da ikkala tugma boshlang'ich holatda yashirin (ma'lumot kelmaguncha
  // "Hisob-kitob" bo'sh stol uchun ko'rinib turmasin).
  const show = (btn, on) => btn.classList.toggle('hidden', !on);

  if (!view) {
    totalEl.textContent = fmtMoney(0);
    show(closeBtn, false);
    show(cancelOrderBtn, false);
    return;
  }

  if (view.items.length === 0) {
    totalEl.textContent = fmtMoney(0);
    show(closeBtn, false);
    show(cancelOrderBtn, true);
    return;
  }

  show(closeBtn, true);
  show(cancelOrderBtn, false);
  totalEl.textContent = fmtMoney(view.total);
}

// `isEmpty: () => false` — bo'sh holatlar (ochiq buyurtma yo'q / hamma taom
// bekor qilingan) har biri O'Z matni va O'Z tugma holatiga ega.
function orderRenderOptions(extra) {
  return Object.assign({
    box: 'orderLines',
    isEmpty: () => false,
    onData: applyOrderControls,
    render: orderLinesHtml,
  }, extra);
}

// Allaqachon olingan ko'rinishni so'rovsiz chizadi. renderList() `load`
// bo'lmasa `await` qilmaydi — DOM shu yerda SINXRON yangilanadi.
function renderOrder(view) {
  renderList(orderRenderOptions({ data: view }));
}

// `isPoll: true` — bu ekranda xato HAR DOIM faqat toast bo'lgan (buyurtma
// qatorlari o'rniga xato matni CHIQMAGAN), shu xulq saqlab qolindi; ustiga
// endi bir xil xato har 8 soniyada qayta toast qilinmaydi.
async function loadOrder() {
  await renderList(orderRenderOptions({
    isPoll: true,
    load: () => api(`/kassir/tables/${TABLE_ID}/order`),
  }));
}

document.getElementById('closeBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const ok = await customConfirm("Stolni yopib, hisob-kitob qilasizmi? Bu amalni ortga qaytarib bo'lmaydi.");
  if (!ok) return;
  await withBusy(btn, async () => {
    try {
      const receipt = await api(`/kassir/tables/${TABLE_ID}/close`, { method: 'POST' });
      // NEGA darhol renderOrder(null) (2026-09-10): ilgari yopilgandan keyin
      // ekranda allaqachon yopilgan buyurtmaning qatorlari, jami summasi va
      // FAOL "💳 Hisob-kitob qilish" tugmasi keyingi poll'gacha (8 soniyagacha)
      // qolib turardi. Kassir yana bosardi va `404 "Bu stolda ochiq buyurtma
      // yo'q"` xato toast'ini olardi — muvaffaqiyatli amaldan keyin.
      // (Navbat tekshiruvi endi renderList() ichida: bu chizish navbatni
      // oldinga suradi va yo'lda qolgan poll javobini bekor qiladi.)
      renderOrder(null);
      toast('Hisob-kitob yakunlandi.');
      // Chekni kassir o'zi shu yerda ko'rib chop eta oladi (afitsiantdan farqli —
      // u yerda printer administrator kompyuteriga ulangani uchun faqat navbatga
      // qo'yiladi; kassa kompyuterida esa QZ Tray o'rnatilgan deb kutiladi).
      openReceiptByOrderId(receipt.order.id, 'kassir');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});

document.getElementById('cancelOrderBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const ok = await customConfirm('Buyurtmada taom yo\'q. Stolni bo\'shatasizmi? Chek chiqmaydi.');
  if (!ok) return;
  let redirecting = false;
  await withBusy(btn, async () => {
    try {
      await api(`/kassir/tables/${TABLE_ID}/cancel-order`, { method: 'POST' });
      redirecting = true;
      toast('Stol bo\'shatildi.');
      setTimeout(() => { window.location.href = 'tables.html'; }, 900);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  // Stollarga qaytishgacha ~0.9s — shu oraliqda qayta bosilmasin.
  if (redirecting) btn.disabled = true;
});

document.addEventListener('DOMContentLoaded', () => {
  if (!TABLE_ID) {
    window.location.href = 'tables.html';
    return;
  }
  loadTableName();
  loadOrder();
  setInterval(loadOrder, 8000);
  // X-24 (2026-09-10): boshqa oynadan qaytilganda darhol yangilanadi — eski
  // jami summa bilan hisob-kitob qilinmasin.
  onVisible(loadOrder);
});
