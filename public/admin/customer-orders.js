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

// 15 soniyalik pollingni "zararsiz" qilish uchun uchta narsa (2026-09-10):
//
//  1. `lastOrdersJson` — oldingi javob bilan solishtirish. Ilgari loadOrders()
//     SHARTSIZ `box.innerHTML = ...` qilardi: agar poll aynan `mousedown` va
//     `mouseup` orasida tushsa, tugma DOM'dan olib tashlanardi va `click`
//     UMUMAN otilmasdi — admin "❌ Bekor qilish"ni bosardi, hech narsa
//     bo'lmasdi va sababini tushunmasdi. Ma'lumot o'zgarmagan bo'lsa endi
//     DOM'ga umuman tegilmaydi.
//  2. `reqSeq` — eskirgan javobni render qilmaslik. Poll va qo'lda chaqirilgan
//     loadOrders() bir vaqtda ketsa, sekinroq (eski) javob keyin kelib yangisini
//     ustidan yozib yuborishi mumkin edi.
//  3. Poll XATOSIDA ro'yxat O'CHIRILMAYDI — faqat toast. Ilgari bitta o'tkinchi
//     tarmoq uzilishi butun ekranni `<p class="dim">Xatolik (500)</p>` ga
//     almashtirardi, ya'ni 15 soniyada bir marta ekran tozalanib turardi.
let lastOrdersJson = null;
let reqSeq = 0;
let lastPollErrorMsg = null; // bir xil xatoni har 15 soniyada qayta toast qilmaslik uchun

async function loadOrders(isPoll) {
  const box = document.getElementById('orderList');
  const seq = ++reqSeq;
  try {
    const rows = await api('/admin/customer-orders');
    if (seq !== reqSeq) return; // eskirgan javob — yangiroq so'rov allaqachon ketgan
    lastPollErrorMsg = null;
    const rowsJson = JSON.stringify(rows);
    if (rowsJson === lastOrdersJson) return; // hech narsa o'zgarmagan — DOM'ga tegmaymiz
    lastOrdersJson = rowsJson;
    orders = rows;
    if (rows.length === 0) {
      box.innerHTML = '<p class="dim">Hozircha buyurtma yo\'q.</p>';
      return;
    }
    box.innerHTML = rows.map((o) => {
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
    }).join('');
    box.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => {
      const order = orders.find((o) => o.id === Number(b.dataset.print));
      if (order) openCustomerReceiptModal(order);
    }));
    box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => setStatus(Number(b.dataset.id), b.dataset.act)));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delOrder(Number(b.dataset.del))));
  } catch (err) {
    if (seq !== reqSeq) return;
    if (isPoll) {
      // Fon yangilanishi yiqildi — ekrandagi ro'yxat o'z joyida qoladi.
      if (lastPollErrorMsg !== err.message) {
        lastPollErrorMsg = err.message;
        toast(`Yangilanmadi: ${err.message}`, 'error');
      }
      return;
    }
    lastOrdersJson = null; // keyingi muvaffaqiyatli yuklash albatta qayta chizsin
    box.innerHTML = `<p class="dim">${escapeHtml(err.message)}</p>`;
  }
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
  // isPoll=true — xato bo'lsa ro'yxat o'chirilmasin (yuqoridagi izohga qarang).
  setInterval(() => loadOrders(true), 15000);
});
