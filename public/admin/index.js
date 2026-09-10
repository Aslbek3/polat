// Admin bosh sahifasi — "ertalabki brifing" (2026-09-10, A-01, A-03, A-04,
// A-05, A-09, A-28, A-30). Hammasi BITTA so'rovdan: GET /api/admin/dashboard
// (server/services/dashboard.js — pul raqamlari Hisobot bilan AYNAN bir xil
// manbadan, reports.getSummary()).
//
// NEGA POLL: ilgari sahifa bir marta yuklanib, "Hozir band stollar" va
// raqamlar ertalabki holatda muzlab qolardi (A-04), yangi bron/buyurtma
// kelganini esa hech kim bilmasdi (A-05). Endi 30 soniyada va sahifaga
// qaytilganda (onVisible) yangilanadi.
const DASH_POLL_MS = 30000;

// Taqqoslash belgisi. `goodWhenUp` — o'sish yaxshimi (tushum) yoki yomonmi
// (xarajat); null — neytral (tan narx tushum bilan birga o'sadi, bu yomon
// emas). Rang yagona signal emas: ▲/▼ va matn doim bor.
// Kecha 0 bo'lsa foiz ma'nosiz — faqat kechagi qiymat yoziladi.
function deltaInfo(cur, prev, { goodWhenUp = true, money = true } = {}) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  const prevText = money ? fmtMoney(p) : `${p} ta`;
  if (c === p) return { text: `Kecha ham ${prevText}`, cls: '' };
  if (p === 0) return { text: `Kecha: ${prevText}`, cls: '' };
  const up = c > p;
  const pct = Math.round((Math.abs(c - p) / Math.abs(p)) * 100);
  const good = goodWhenUp === null ? null : (up === goodWhenUp);
  return {
    text: `${up ? '▲' : '▼'} ${pct}% kechaga nisbatan`,
    cls: good === null ? '' : (good ? 'up' : 'down'),
  };
}

function setDelta(id, info) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = info ? info.text : '';
  el.className = `stat-delta${info && info.cls ? ` ${info.cls}` : ''}`;
}

// O'rtacha chek — 0 ga bo'lishdan saqlanadi (sotuv yo'q bo'lsa null).
function avgCheck(p) {
  return p && p.orders_count > 0 ? Math.round(p.revenue / p.orders_count) : null;
}

function renderTiles(d) {
  const t = d.today;
  const y = d.yesterday;
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set('statRevenue', fmtMoney(t.revenue));
  set('statCogs', fmtMoney(t.cost_of_goods));
  set('statExpenses', fmtMoney(t.expenses));
  set('statNet', fmtMoney(t.net));
  set('statOrders', String(t.orders_count));
  const avg = avgCheck(t);
  const avgY = avgCheck(y);
  set('statAvg', avg === null ? '—' : fmtMoney(avg));

  setDelta('deltaRevenue', deltaInfo(t.revenue, y.revenue));
  setDelta('deltaCogs', deltaInfo(t.cost_of_goods, y.cost_of_goods, { goodWhenUp: null }));
  setDelta('deltaExpenses', deltaInfo(t.expenses, y.expenses, { goodWhenUp: false }));
  setDelta('deltaNet', deltaInfo(t.net, y.net));
  setDelta('deltaOrders', deltaInfo(t.orders_count, y.orders_count, { money: false }));
  setDelta('deltaAvg', avg !== null && avgY !== null ? deltaInfo(avg, avgY) : null);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  set('dashUpdated', `Yangilandi: ${pad(now.getHours())}:${pad(now.getMinutes())} · har 30 soniyada avtomatik`);
}

// "Shu oy" — kichik jadval, HISOB ko'rinishida (A-01: raqamlar qo'shiladi).
function renderMonth(d) {
  const m = d.month;
  const now = new Date();
  document.getElementById('monthTitle').textContent = `Shu oy — ${UZ_MONTHS[now.getMonth()]} (1–${now.getDate()})`;
  const avg = avgCheck(m);
  const html = `
    <table>
      <tr><td class="dim">Tushum</td><td class="text-right">${fmtMoney(m.revenue)}</td></tr>
      <tr><td class="dim">− Taom tan narxi</td><td class="text-right">${fmtMoney(m.cost_of_goods)}</td></tr>
      <tr><td class="dim">− Xarajatlar</td><td class="text-right">${fmtMoney(m.expenses)}</td></tr>
      <tr><td><strong>= Oylik sof foyda</strong></td><td class="text-right"><strong>${fmtMoney(m.net)}</strong></td></tr>
      <tr><td class="dim">Sotuvlar soni · o'rtacha chek</td><td class="text-right">${m.orders_count} ta · ${avg === null ? '—' : fmtMoney(avg)}</td></tr>
    </table>`;
  const box = document.getElementById('monthCard');
  if (box.dataset.sig !== html) {
    box.dataset.sig = html;
    box.innerHTML = html;
  }
}

// "E'tibor talab qiladi" — har qator tegishli sahifaga (filtr tanlangan
// holda) olib boradi.
function alertRows(d) {
  const rows = [];
  const low = d.low_stock || [];
  low.slice(0, 4).forEach((it) => {
    const out = it.quantity <= 0;
    rows.push({
      href: 'inventory.html?low=1',
      danger: out,
      html: `📦 <strong>${escapeHtml(it.name)}</strong> — ${out ? 'tugadi' : 'kam qoldi'} (${escapeHtml(String(it.quantity))} ${escapeHtml(it.unit || '')})`,
    });
  });
  if (low.length > 4) {
    rows.push({ href: 'inventory.html?low=1', html: '📦 Yana kam qolgan mahsulotlar', count: low.length - 4 });
  }
  if (d.new_customer_orders > 0) {
    rows.push({ href: 'customer-orders.html?status=new', html: '🛒 Yangi onlayn buyurtmalar', count: d.new_customer_orders });
  }
  if (d.new_reservations > 0) {
    rows.push({ href: 'reservations.html?status=new', html: '📅 Tasdiqlanmagan bronlar', count: d.new_reservations });
  }
  if (d.today_reservations > 0) {
    rows.push({ href: 'reservations.html', html: '📅 Bugungi bronlar', count: d.today_reservations });
  }
  return rows;
}

async function loadDashboard(isPoll) {
  await renderList({
    box: 'dashAlerts',
    isPoll,
    load: () => api('/admin/dashboard'),
    onData: (d) => { renderTiles(d); renderMonth(d); },
    isEmpty: (d) => alertRows(d).length === 0,
    empty: '✅ Hammasi joyida',
    emptyHint: "Kam qolgan mahsulot, yangi onlayn buyurtma yoki tasdiqlanmagan bron yo'q.",
    render: (d) => `<div class="alert-list">${alertRows(d).map((r) => `
      <a class="alert-item${r.danger ? ' danger' : ''}" href="${r.href}">
        <span class="alert-text">${r.html}</span>
        ${r.count != null ? `<span class="alert-count">${r.count}</span>` : ''}
      </a>`).join('')}</div>`,
  });
}

// renderList() — ../app.js'dagi umumiy ro'yxat yordamchisi (2026-09-10).
async function loadOccupied(isPoll) {
  await renderList({
    box: 'occupiedTables',
    isPoll,
    load: async () => (await api('/waiter/tables')).filter((t) => t.occupied),
    empty: "Hozir band stol yo'q.",
    render: (occupied) => occupied.map((t) => `
      <div class="card card-row">
        <div>
          <div class="card-title">${escapeHtml(t.name)}</div>
          <div class="card-sub">${t.item_count} taom</div>
        </div>
        <div class="card-title">${fmtMoney(t.total)}</div>
      </div>
    `).join(''),
  });
}

function refreshDashboard(isPoll) {
  // Yashirin tabda keraksiz so'rov yubormaymiz — qaytganda onVisible yangilaydi.
  if (isPoll && document.visibilityState === 'hidden') return;
  loadDashboard(isPoll);
  loadOccupied(isPoll);
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('index');
  refreshDashboard(false);
  setInterval(() => refreshDashboard(true), DASH_POLL_MS);
  onVisible(() => refreshDashboard(true));
});
