// Admin "Onlayn buyurtmalar" (landing'dan kelgan olib ketish/yetkazib berish).
// 2026-09-10: A-07 (filtr + "N ta yangi"), A-08 (qidiruv), A-14 (tasdiqlash,
// withBusy), A-23 (bo'sh holat), A-27 (nom).
// escapeHtml() / renderList() — ../app.js'dan; chipGroup() — admin.js'dan.
const STATUS_LABEL = { new: 'Yangi', confirmed: 'Tasdiqlangan', completed: 'Bajarildi', cancelled: 'Bekor qilingan' };
const STATUS_BADGE = { new: 'debt', confirmed: 'ok', completed: 'ok', cancelled: 'low' };
const FULFILLMENT_LABEL = { pickup: "Olib ketish", delivery: 'Yetkazib berish' };
const ORDER_FILTER_TITLE = { active: 'Faol buyurtmalar', new: 'Yangi buyurtmalar', all: 'Barcha buyurtmalar' };
const PAGE_TITLE = 'Onlayn buyurtmalar — Ziyo Famliy admin';

// "🖨 Chek" tugmasi shu massivdan (id bo'yicha) buyurtmani oladi.
let orders = [];
let orderFilter = null; // chipGroup
let orderQuery = '';

// Bekor qilingan buyurtmada ombor qoldig'i QAYTARILDIMI yoki YO'Q —
// `customer_orders.stock_state` (server/services/customerOrders.js
// planStockChange()): 'released' — qaytarildi, 'spent' — sarflangan.
// Admin buni bilmasa qo'lda "tuzatish" kiritib qoldiqni ikki marta buzardi.
function stockStateBadge(o) {
  if (o.status !== 'cancelled') return '';
  if (o.stock_state === 'released') return ' <span class="badge ok">📦 Ombor qaytarildi</span>';
  if (o.stock_state === 'spent') return ' <span class="badge low">📦 Ombor sarflangan</span>';
  return '';
}

function renderOrderCard(o) {
  // Yetkazib berish buyurtmasi 'completed' bo'lsa ham kuryer hali yetkazmagan
  // bo'lishi mumkin — "Bajarildi" chalg'itadi (2026-09-08 bug fix).
  let badgeCls = STATUS_BADGE[o.status] || '';
  let badgeLabel = STATUS_LABEL[o.status] || o.status;
  if (o.status === 'completed' && o.fulfillment === 'delivery') {
    if (o.delivered_at) { badgeCls = 'ok'; badgeLabel = '✅ Yetkazildi'; } else { badgeCls = 'debt'; badgeLabel = '🚚 Yetkazilishi kutilmoqda'; }
  }
  const lat = Number(o.location_lat);
  const lng = Number(o.location_lng);
  const hasLoc = o.location_lat != null && o.location_lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  return `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${escapeHtml(o.full_name)} <span class="badge ${badgeCls}">${escapeHtml(badgeLabel)}</span>${stockStateBadge(o)}</div>
          <div class="card-sub">№${Number(o.id)} · ${escapeHtml(FULFILLMENT_LABEL[o.fulfillment] || o.fulfillment || '')} · ${fmtDateTime(o.created_at)}</div>
          <div class="card-sub"><a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>${o.address ? ' · ' + escapeHtml(o.address) : ''}${hasLoc ? ` · <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener">🗺 Xaritada ko'rish</a>` : ''}</div>
          ${o.note ? `<div class="card-sub">${escapeHtml(o.note)}</div>` : ''}
        </div>
        <div class="card-title text-right">${fmtMoney(o.total_amount)}</div>
      </div>
      <div class="mt-8" style="border-top:1px dashed var(--border); padding-top:8px;">
        ${(o.items || []).map((it) => `<div class="card-sub">${Number(it.quantity)} × ${escapeHtml(it.name_snapshot)} — ${fmtMoney(it.subtotal)}</div>`).join('')}
      </div>
      <div class="mt-8" style="display:flex; gap:6px; flex-wrap:wrap;">
        <button type="button" class="btn small" data-print="${o.id}"><span aria-hidden="true">🖨</span> Chek</button>
        ${o.status !== 'confirmed' ? `<button type="button" class="btn small" data-act="confirmed" data-id="${o.id}"><span aria-hidden="true">✅</span> Tasdiqlash</button>` : ''}
        ${o.status !== 'completed' ? `<button type="button" class="btn small" data-act="completed" data-id="${o.id}"><span aria-hidden="true">🏁</span> Bajarildi</button>` : ''}
        ${o.status !== 'cancelled' ? `<button type="button" class="btn small" data-act="cancelled" data-id="${o.id}"><span aria-hidden="true">❌</span> Bekor qilish</button>` : ''}
        <button type="button" class="btn small danger" data-del="${o.id}"><span aria-hidden="true">🗑</span> O'chirish</button>
      </div>
    </div>`;
}

// Qidiruv (A-08) — ism, telefon, buyurtma raqami. Faqat mijoz tomonida:
// ro'yxat allaqachon yuklangan, har harfda so'rov yuborish shart emas.
function renderOrdersHtml(rows) {
  const visible = orderQuery ? rows.filter((o) => matchesSearch(`${o.full_name} ${o.phone} ${o.id} ${o.address || ''}`, orderQuery)) : rows;
  if (visible.length === 0) {
    return `<div class="empty-state"><div>«${escapeHtml(orderQuery)}» bo'yicha buyurtma topilmadi.</div></div>`;
  }
  return visible.map(renderOrderCard).join('');
}

function bindOrderRows(box) {
  box.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => {
    const order = orders.find((o) => o.id === Number(b.dataset.print));
    if (order) openCustomerReceiptModal(order);
  }));
  box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => setStatus(Number(b.dataset.id), b.dataset.act))));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => delOrder(Number(b.dataset.del)))));
}

// "N ta yangi" (A-07) — sarlavhada, "Yangi" chipida va brauzer tab nomida.
function updateOrderCounters(rows) {
  const n = rows.filter((o) => o.status === 'new').length;
  const badge = document.getElementById('newOrdersBadge');
  badge.textContent = `${n} ta yangi`;
  badge.classList.toggle('hidden', n === 0);
  orderFilter.setLabel('new', n > 0 ? `Yangi (${n})` : 'Yangi');
  document.title = n > 0 ? `(${n}) ${PAGE_TITLE}` : PAGE_TITLE;
  document.getElementById('ordersHeading').textContent = ORDER_FILTER_TITLE[orderFilter.get()] || 'Buyurtmalar';
}

// renderList(): poll xatosida ro'yxatni o'chirmaydi, eskirgan javobni
// tashlaydi, o'zgarmagan ma'lumotda DOM'ga tegmaydi (batafsil — app.js).
async function loadOrders(isPoll) {
  const filter = orderFilter.get();
  await renderList({
    box: 'orderList',
    isPoll,
    load: async () => ({ filter, rows: await api(`/admin/customer-orders?status=${filter}`) }),
    onData: (d) => { orders = d.rows; updateOrderCounters(d.rows); },
    isEmpty: (d) => d.rows.length === 0,
    empty: filter === 'all' ? "Hozircha buyurtma yo'q." : filter === 'new' ? "Yangi buyurtma yo'q." : "Faol buyurtma yo'q.",
    emptyHint: "Buyurtmalar landing sahifadagi savat orqali keladi. Bajarilgan va bekor qilinganlarni ko'rish uchun «Hammasi» ni tanlang.",
    render: (d) => renderOrdersHtml(d.rows),
    bind: bindOrderRows,
  });
}

// Qidiruv o'zgarganda — tarmoqsiz qayta chizish. render funksiyasi joriy
// `orderQuery`ni o'qigani uchun keyingi poll ham shu filtr bilan chizadi.
function rerenderOrders() {
  const box = document.getElementById('orderList');
  if (orders.length === 0) return; // bo'sh holat renderList'da
  box.innerHTML = renderOrdersHtml(orders);
  bindOrderRows(box);
}

async function setStatus(id, status) {
  // A-14: "Bekor qilish" "Bajarildi" yonida turadi va qaytarib bo'lmaydigan
  // ombor harakatini qiladi — tasdiqlanadi.
  if (status === 'cancelled') {
    const o = orders.find((x) => x.id === id);
    const ok = await customConfirm(
      `${o ? `«${o.full_name}» buyurtmasi` : 'Buyurtma'} bekor qilinsinmi? Tayyorlanmagan bo'lsa, mahsulotlar omborga qaytariladi.`,
      { title: 'Buyurtmani bekor qilish', okText: 'Ha, bekor qilish', cancelText: "Yo'q", danger: true },
    );
    if (!ok) return;
  }
  try {
    await api(`/admin/customer-orders/${id}`, { method: 'PUT', body: { status } });
    toast('Holat yangilandi');
    loadOrders();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function delOrder(id) {
  if (!(await customConfirm("Buyurtmani o'chirasizmi? Bu amalni ortga qaytarib bo'lmaydi.", { okText: "O'chirish", danger: true }))) return;
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
  const fromUrl = pageParam('status');
  orderFilter = chipGroup('orderFilterChips', {
    label: 'Holat bo\'yicha',
    options: [['active', 'Faol'], ['new', 'Yangi'], ['all', 'Hammasi']],
    initial: ['active', 'new', 'all'].includes(fromUrl) ? fromUrl : 'active',
    onChange: () => loadOrders(),
  });
  attachSearch('orderSearch', { onFilter: (q) => { orderQuery = q; rerenderOrders(); } });
  loadOrders();
  // 15 s avtomatik yangilanish (2026-09-08) + sahifaga qaytilganda.
  setInterval(() => { if (document.visibilityState !== 'hidden') loadOrders(true); }, 15000);
  onVisible(() => loadOrders(true));
});
