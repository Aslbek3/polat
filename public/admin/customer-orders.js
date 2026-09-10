// escapeHtml() — endi ../app.js'dan global (2026-09-09'da 15 xil fayldagi
// nusxa birlashtirildi).
const STATUS_LABEL = { new: 'Yangi', confirmed: 'Tasdiqlangan', completed: 'Bajarildi', cancelled: 'Bekor qilingan' };
const STATUS_BADGE = { new: 'debt', confirmed: 'ok', completed: 'ok', cancelled: 'low' };
const FULFILLMENT_LABEL = { pickup: "Olib ketish", delivery: 'Yetkazib berish' };

// "🖨 Chek" tugmasi bosilganda shu massivdan (id bo'yicha) topib
// openCustomerReceiptModal()ga uzatiladi — alohida "chek" API'si shart emas,
// items allaqachon shu yerda (GET /admin/customer-orders) yuklangan.
let orders = [];

// Bekor qilingan buyurtmada ombor qoldig'i QAYTARILDIMI yoki YO'Q — server
// buni `customer_orders.stock_state` ustunida saqlaydi (2026-09-10 da aynan
// shu farqni ko'rsatish uchun qo'shilgan, server/services/customerOrders.js
// dagi planStockChange() jadvaliga qarang):
//   'released' — buyurtma tayyorlanmagan edi, mahsulot omborga qaytarildi;
//   'spent'    — buyurtma allaqachon 'completed' bo'lgan, mahsulot sarflangan
//                va QAYTARILMAYDI (terminal holat).
// Bu farq interfeysda umuman ko'rinmasdi: admin bekor qilgandan keyin
// omborda mahsulot qaytdimi-yo'qmi bilolmasdi va qo'lda "tuzatish" kiritib,
// qoldiqni ikki marta buzib qo'yishi mumkin edi. 'held' (faol buyurtma)
// uchun belgi ko'rsatilmaydi — u odatiy holat.
function stockStateBadge(o) {
  if (o.status !== 'cancelled') return '';
  if (o.stock_state === 'released') return ' <span class="badge ok">📦 Ombor qaytarildi</span>';
  if (o.stock_state === 'spent') return ' <span class="badge low">📦 Ombor sarflangan</span>';
  return '';
}

// 15 soniyalik pollingni "zararsiz" qilgan uchta narsa (eskirgan javobni
// tashlash, o'zgarmagan ma'lumotda DOM'ga tegmaslik, poll xatosida ro'yxatni
// O'CHIRMASLIK) shu faylda QO'LDA yozilgan edi — 2026-09-10 da ../app.js'dagi
// umumiy renderList()ga chiqarildi va barcha ro'yxatlarga tarqatildi.
// Batafsil "NEGA" izohi o'sha yerda.
async function loadOrders(isPoll) {
  await renderList({
    box: 'orderList',
    isPoll,
    load: () => api('/admin/customer-orders'),
    onData: (rows) => { orders = rows; },
    empty: "Hozircha buyurtma yo'q.",
    render: (rows) => rows.map((o) => {
      // Yetkazib berish buyurtmasi "tayyor" (status='completed') bo'lganda ham
      // dastavkachi hali yetkazmagan bo'lishi mumkin — shunday holatda "Bajarildi"
      // deyish CHALG'ITADI (admin buyurtma bilan hech narsa qilish shart emas deb
      // o'ylashi mumkin). Shu sabab yetkazib berish buyurtmalari uchun asosiy
      // status-belgisi delivered_at'ga qarab aniqlashtiriladi (2026-09-08 bug fix).
      let badgeCls = STATUS_BADGE[o.status];
      let badgeLabel = STATUS_LABEL[o.status];
      if (o.status === 'completed' && o.fulfillment === 'delivery') {
        if (o.delivered_at) {
          badgeCls = 'ok';
          badgeLabel = '✅ Yetkazildi';
        } else {
          badgeCls = 'debt';
          badgeLabel = '🚚 Yetkazilishi kutilmoqda';
        }
      }
      return `
      <div class="card">
        <div class="card-row">
          <div>
            <div class="card-title">${escapeHtml(o.full_name)} <span class="badge ${badgeCls}">${badgeLabel}</span>${stockStateBadge(o)}</div>
            <div class="card-sub">${FULFILLMENT_LABEL[o.fulfillment]} · ${fmtDateTime(o.created_at)}</div>
            <div class="card-sub"><a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>${o.address ? ' · ' + escapeHtml(o.address) : ''}${o.location_lat != null && o.location_lng != null ? ` · <a href="https://www.google.com/maps?q=${o.location_lat},${o.location_lng}" target="_blank" rel="noopener">🗺 Xaritada ko'rish</a>` : ''}</div>
            ${o.note ? `<div class="card-sub">${escapeHtml(o.note)}</div>` : ''}
          </div>
          <div class="card-title text-right">${fmtMoney(o.total_amount)}</div>
        </div>
        <div class="mt-8" style="border-top:1px dashed var(--border); padding-top:8px;">
          ${o.items.map((it) => `<div class="card-sub">${it.quantity} × ${escapeHtml(it.name_snapshot)} — ${fmtMoney(it.subtotal)}</div>`).join('')}
        </div>
        <div class="mt-8" style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn small" data-print="${o.id}">🖨 Chek</button>
          ${o.status !== 'confirmed' ? `<button class="btn small" data-act="confirmed" data-id="${o.id}">✅ Tasdiqlash</button>` : ''}
          ${o.status !== 'completed' ? `<button class="btn small" data-act="completed" data-id="${o.id}">🏁 Bajarildi</button>` : ''}
          ${o.status !== 'cancelled' ? `<button class="btn small" data-act="cancelled" data-id="${o.id}">❌ Bekor qilish</button>` : ''}
          <button class="btn small danger" data-del="${o.id}">🗑 O'chirish</button>
        </div>
      </div>
    `;
    }).join(''),
    bind: (box) => {
      box.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => {
        const order = orders.find((o) => o.id === Number(b.dataset.print));
        if (order) openCustomerReceiptModal(order);
      }));
      box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => setStatus(Number(b.dataset.id), b.dataset.act)));
      box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delOrder(Number(b.dataset.del))));
    },
  });
}

async function setStatus(id, status) {
  try {
    await api(`/admin/customer-orders/${id}`, { method: 'PUT', body: { status } });
    toast('Holat yangilandi');
    loadOrders();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delOrder(id) {
  // customConfirm() — brauzerning standart confirm() o'rniga (2026-09-10).
  // Bu sahifada bu ayniqsa muhim: bloklovchi confirm() ochiq turganda
  // setInterval callbacklari to'planib qolardi va dialog yopilishi bilan
  // bir necha loadOrders() birdan otilardi.
  if (!(await customConfirm("Buyurtmani o'chirasizmi?"))) return;
  try {
    await api(`/admin/customer-orders/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadOrders();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('customer-orders');
  loadOrders();
  // Ilgari faqat sahifa ochilganda bir marta yuklanardi — admin dastavka
  // holatini (masalan "Yetkazildi"ga o'zgarishini) ko'rish uchun qo'lda
  // yangilashga (F5) majbur edi. Oshpaz/dastavkachi ekranlari bilan bir xil
  // 15s avtomatik yangilanish qo'shildi (2026-09-08 bug fix).
  // isPoll=true — xato bo'lsa ro'yxat o'chirilmasin (renderList() izohiga qarang).
  setInterval(() => loadOrders(true), 15000);
});
