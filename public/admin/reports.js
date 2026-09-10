// Admin "Hisobot" (2026-09-10: A-01, A-02, A-10, A-11, A-22, A-24, A-28, A-30).
// escapeHtml() / renderList() / datePresets() — ../app.js'dan global.

// Ro'yxat 3 manbadan (services/reports.js listOrders): stol, onlayn, qo'lda.
// ⚠️ id faqat O'Z turi ichida noyob (stol #5 va qo'lda chek #5 — boshqa-boshqa
// hujjat) — chek HAR DOIM `kind` bo'yicha ochiladi (A-02).
const KIND_META = {
  table: { icon: '🪑', name: 'Stol' },
  online: { icon: '🌐', name: 'Onlayn' },
  manual: { icon: '🧮', name: "Qo'lda" },
};

// Holat yorlig'i: onlayn buyurtmada 'completed', qo'lda chekda holat yo'q
// (server 'closed' deb beradi — yaratilishining o'zi to'lov).
function reportStatus(o) {
  if (o.kind === 'online') return { label: o.status === 'completed' ? 'Bajarildi' : o.status, cls: 'ok' };
  if (o.kind === 'manual') return { label: "To'langan", cls: 'ok' };
  const cls = o.status === 'closed' ? 'ok' : o.status === 'cancelled' ? 'low' : 'debt';
  return { label: orderStatusLabel(o.status), cls };
}

async function openReportReceipt(kind, id) {
  try {
    if (kind === 'online') {
      openCustomerReceiptModal(await api(`/admin/customer-orders/${id}`));
    } else if (kind === 'manual') {
      showReceiptModal(await api(`/admin/reports/manual-bills/${id}/receipt`));
    } else {
      showReceiptModal(await api(`/admin/reports/orders/${id}/receipt`));
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

const STATUS_TITLE = {
  closed: 'Sotuvlar',
  open: 'Ochiq stol buyurtmalari',
  cancelled: 'Bekor qilingan buyurtmalar',
  '': 'Barcha buyurtmalar',
};

let presets = null;
let summarySeq = 0;

function setTile(id, text) {
  document.getElementById(id).textContent = text;
}

function currentRange() {
  return {
    from: document.getElementById('filterFrom').value,
    to: document.getElementById('filterTo').value,
  };
}

async function loadSummary(qs, label) {
  const my = ++summarySeq;
  // A-11 / A-24: yuklanayotganda eski raqam turmasin — u yangi davrniki
  // deb o'qilardi.
  ['statRevenue', 'statCogs', 'statExpenses', 'statNet', 'statOrders', 'statAvg'].forEach((id) => setTile(id, '…'));
  document.getElementById('reportTiles').setAttribute('aria-busy', 'true');
  try {
    const s = await api(`/admin/reports/summary${qs}`);
    if (my !== summarySeq) return;
    setTile('statRevenue', fmtMoney(s.revenue));
    setTile('statCogs', fmtMoney(s.cost_of_goods));
    setTile('statExpenses', fmtMoney(s.expenses_total));
    setTile('statNet', fmtMoney(s.net));
    setTile('statNetLabel', label);
    setTile('statOrders', String(s.orders_count));
    setTile('statAvg', s.orders_count > 0 ? fmtMoney(Math.round(s.revenue / s.orders_count)) : '—');
  } catch (err) {
    if (my !== summarySeq) return;
    ['statRevenue', 'statCogs', 'statExpenses', 'statNet', 'statOrders', 'statAvg'].forEach((id) => setTile(id, '—'));
    toast(err.message, 'error');
  } finally {
    if (my === summarySeq) document.getElementById('reportTiles').removeAttribute('aria-busy');
  }
}

function renderOrderRows(orders) {
  return orders.map((o) => {
    const k = KIND_META[o.kind] || KIND_META.table;
    const st = reportStatus(o);
    const who = o.closed_by_name || o.opened_by_name || '';
    return `
      <div class="card card-row">
        <div>
          <div class="card-title"><span aria-hidden="true">${k.icon}</span> ${escapeHtml(o.label || o.table_name || '')} — ${fmtMoney(o.total_amount)} <span class="badge ${st.cls}">${escapeHtml(st.label)}</span></div>
          <div class="card-sub">${k.name} · ${fmtDateTime(o.closed_at || o.opened_at)}${who ? ` · ${escapeHtml(who)}` : ''}</div>
        </div>
        <button type="button" class="btn small" data-kind="${escapeHtml(o.kind)}" data-id="${Number(o.id)}" aria-label="${escapeHtml(`${o.label || ''} chekini ochish`)}">Chek</button>
      </div>`;
  }).join('');
}

async function loadReport() {
  const { from, to } = currentRange();
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const p = presets && presets.get();
  const key = p && p.from === from && p.to === to ? p.key : null;
  document.getElementById('periodTitle').textContent = periodLabel(from, to, key);
  // A-28: "Sof foyda" plitkasida davr — qisqa shaklda (plitka tor).
  const NET_LABEL = { today: 'Bugungi sof foyda', yesterday: 'Kechagi sof foyda', week: '7 kunlik sof foyda', month: 'Shu oy sof foydasi', lastMonth: "O'tgan oy sof foydasi" };
  const label = NET_LABEL[key] || 'Davr sof foydasi';

  const status = document.getElementById('filterStatus').value;
  const qs2 = new URLSearchParams(qs);
  if (status) qs2.set('status', status);
  const note = document.getElementById('orderListNote');

  // renderList(): eskirgan javobni tashlaydi (chiplar ketma-ket bosilsa
  // sekinroq javob yangisining ustidan yozmaydi).
  await Promise.all([
    loadSummary(query, label),
    renderList({
      box: 'orderList',
      load: async () => {
        const r = await api(`/admin/reports/orders?${qs2.toString()}`, { withMeta: true });
        return { key: qs2.toString(), rows: r.data || [], total: r.total };
      },
      onData: (d) => {
        const title = STATUS_TITLE[status] || 'Buyurtmalar';
        const total = d.total == null ? d.rows.length : d.total;
        document.getElementById('orderListTitle').textContent = `${title} — ${total} ta`;
        // A-22: ro'yxat serverda 200 tada kesiladi — endi bu aytiladi.
        const cut = d.total != null && d.total > d.rows.length;
        note.textContent = cut ? `Oxirgi ${d.rows.length} tasi ko'rsatilmoqda (jami ${d.total}). To'liq ko'rish uchun davrni qisqartiring.` : '';
        note.classList.toggle('hidden', !cut);
      },
      isEmpty: (d) => d.rows.length === 0,
      empty: 'Bu davrda buyurtma topilmadi.',
      emptyHint: "Yuqoridan boshqa davr yoki holatni tanlang.",
      render: (d) => renderOrderRows(d.rows),
      bind: (box) => {
        box.querySelectorAll('[data-kind]').forEach((btn) => {
          btn.addEventListener('click', () => withBusy(btn, () => openReportReceipt(btn.dataset.kind, Number(btn.dataset.id))));
        });
      },
    }),
  ]);
}

document.getElementById('filterForm').addEventListener('submit', (e) => {
  e.preventDefault();
  withBusy(document.getElementById('filterBtn'), loadReport);
});
// Holat tanlanishi bilan darhol qayta yuklanadi (2026-09-10).
document.getElementById('filterStatus').addEventListener('change', loadReport);
// Sana qo'lda o'zgartirilsa — tayyor chip endi to'g'ri emas.
['filterFrom', 'filterTo'].forEach((id) => {
  document.getElementById(id).addEventListener('change', () => { if (presets) presets.set(null); });
});

document.addEventListener('DOMContentLoaded', () => {
  initNav('reports');
  presets = datePresets('reportPresets', {
    initial: 'today',
    onChange: ({ from, to }) => {
      document.getElementById('filterFrom').value = from;
      document.getElementById('filterTo').value = to;
      withBusy(document.getElementById('filterBtn'), loadReport);
    },
  });
  const r = presets.get();
  document.getElementById('filterFrom').value = r.from;
  document.getElementById('filterTo').value = r.to;
  loadReport();
});
