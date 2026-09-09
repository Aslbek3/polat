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
let reqSeq = 0;

async function loadTableName() {
  try {
    const tables = await api('/kassir/tables');
    const t = tables.find((x) => String(x.id) === String(TABLE_ID));
    if (t) document.getElementById('tableTitle').textContent = t.name;
  } catch (e) { /* jim */ }
}

function renderOrder(view) {
  const box = document.getElementById('orderLines');
  const totalEl = document.getElementById('totalAmount');
  const closeBtn = document.getElementById('closeBtn');
  const cancelOrderBtn = document.getElementById('cancelOrderBtn');

  if (!view) {
    box.innerHTML = '<p class="dim">Hozircha bu stolda ochiq buyurtma yo\'q.</p>';
    totalEl.textContent = fmtMoney(0);
    closeBtn.style.display = 'none';
    cancelOrderBtn.style.display = 'none';
    return;
  }

  if (view.items.length === 0) {
    // Afitsiant barcha taomlarni bekor qilgan bo'lishi mumkin — closeTable()
    // bo'sh chekni rad etadi, shu sabab stolni bo'shatishning yagona yo'li
    // "Bo'shatish" (cancel-order).
    box.innerHTML = '<p class="dim">Buyurtmada taom yo\'q (hammasi bekor qilingan). Stolni bo\'shatish uchun pastdagi tugmani bosing.</p>';
    totalEl.textContent = fmtMoney(0);
    closeBtn.style.display = 'none';
    cancelOrderBtn.style.display = '';
    return;
  }

  closeBtn.style.display = '';
  cancelOrderBtn.style.display = 'none';
  box.innerHTML = view.items.map((it) => `
    <div class="order-line">
      <div>
        <div class="ol-name">${escapeHtml(it.name_snapshot)}</div>
        <div class="ol-meta">${it.quantity} × ${fmtMoney(it.unit_price)}</div>
      </div>
      <div class="ol-subtotal">${fmtMoney(it.subtotal)}</div>
    </div>
  `).join('');
  totalEl.textContent = fmtMoney(view.total);
}

async function loadOrder() {
  const my = ++reqSeq;
  try {
    const view = await api(`/kassir/tables/${TABLE_ID}/order`);
    // Eskirgan poll javobi yangi holatning ustidan yozmasin (2026-09-10).
    if (my !== reqSeq) return;
    renderOrder(view);
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('closeBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const ok = await customConfirm("Stolni yopib, hisob-kitob qilasizmi? Bu amalni ortga qaytarib bo'lmaydi.");
  if (!ok) return;
  await withBusy(btn, async () => {
    const my = ++reqSeq;
    try {
      const receipt = await api(`/kassir/tables/${TABLE_ID}/close`, { method: 'POST' });
      // NEGA darhol renderOrder(null) (2026-09-10): ilgari yopilgandan keyin
      // ekranda allaqachon yopilgan buyurtmaning qatorlari, jami summasi va
      // FAOL "💳 Hisob-kitob qilish" tugmasi keyingi poll'gacha (8 soniyagacha)
      // qolib turardi. Kassir yana bosardi va `404 "Bu stolda ochiq buyurtma
      // yo'q"` xato toast'ini olardi — muvaffaqiyatli amaldan keyin.
      if (my === reqSeq) renderOrder(null);
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
});
