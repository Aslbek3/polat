// Admin "Xarajatlar" (2026-09-10: A-12, A-13, A-18, A-19, A-23, A-26).
// escapeHtml() / renderList() / datePresets() — ../app.js'dan;
// periodLabel() — admin.js'dan.
let expensePresets = null;

// A-12: ilgari butun tarix yuklanib, tepada DAVRSIZ "Jami: 340 000 000"
// turardi (hisobot esa bugunni ochardi — ikki sahifa ikki xil mantiqda).
// Endi standart — shu oy; "Jami" ro'yxatdan yig'ilMAYDI: server ro'yxatni
// 500 tada kesadi, to'liq summa `X-Total-Amount` sarlavhasida.
async function loadExpenses() {
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const p = expensePresets && expensePresets.get();
  const label = periodLabel(from, to, p && p.from === from && p.to === to ? p.key : null);
  const totalEl = document.getElementById('expenseTotal');
  const note = document.getElementById('expenseNote');
  totalEl.textContent = `${label} jami: …`;
  await renderList({
    box: 'expenseList',
    load: async () => {
      const r = await api(`/admin/expenses${qs.toString() ? `?${qs.toString()}` : ''}`, { withMeta: true });
      return { key: qs.toString(), rows: r.data || [], total: r.total, totalAmount: r.totalAmount };
    },
    onData: (d) => {
      const amount = d.totalAmount == null ? d.rows.reduce((s, r) => s + r.amount, 0) : d.totalAmount;
      const count = d.total == null ? d.rows.length : d.total;
      totalEl.textContent = `${label} jami: ${fmtMoney(amount)} (${count} ta)`;
      const cut = d.total != null && d.total > d.rows.length;
      note.textContent = cut ? `Oxirgi ${d.rows.length} tasi ko'rsatilmoqda (jami ${d.total} ta). "Jami" summa hammasini hisobga oladi.` : '';
      note.classList.toggle('hidden', !cut);
    },
    isEmpty: (d) => d.rows.length === 0,
    empty: "Bu davrda xarajat yo'q.",
    emptyHint: 'Yuqoridagi forma orqali xarajat qo\'shing yoki boshqa davrni tanlang.',
    render: (d) => d.rows.map((r) => `
      <div class="card card-row">
        <div>
          <div class="card-title">${fmtMoney(r.amount)} ${r.category ? `<span class="badge debt">${escapeHtml(r.category)}</span>` : ''}</div>
          <div class="card-sub">${escapeHtml(r.expense_date)}${r.note ? ` · ${escapeHtml(r.note)}` : ''}</div>
          ${r.created_by_name ? `<div class="card-sub">Kiritdi: ${escapeHtml(r.created_by_name)}</div>` : ''}
        </div>
        <button type="button" class="btn small danger" data-del="${r.id}" aria-label="${escapeHtml(`${fmtMoney(r.amount)} xarajatni o'chirish`)}">O'chirish</button>
      </div>
    `).join(''),
    bind: (el) => {
      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => delExpense(Number(b.dataset.del)))));
    },
  });
}

// withBusy() — bu POST idempotent emas: ikkinchi bosish bir xil xarajatni
// IKKI MARTA yozardi. A-18: xato — maydon ostida (setFieldError), toast emas.
document.getElementById('expenseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('addBtn');
  if (btn.disabled) return;
  clearFieldErrors('expenseForm');
  const amountEl = document.getElementById('fAmount');
  const dateEl = document.getElementById('fDate');
  const amount = Number(amountEl.value);
  let bad = false;
  if (!dateEl.value) { setFieldError(dateEl, 'Sanani tanlang'); bad = true; }
  if (amountEl.value.trim() === '' || !Number.isFinite(amount) || amount <= 0) {
    setFieldError(amountEl, "Summani kiriting (0 dan katta son)");
    bad = true;
  }
  if (bad) return;
  withBusy(btn, async () => {
    try {
      await api('/admin/expenses', {
        method: 'POST',
        body: {
          amount,
          expense_date: dateEl.value,
          category: document.getElementById('fCategory').value.trim(),
          note: document.getElementById('fNote').value.trim(),
        },
      });
      amountEl.value = '';
      document.getElementById('fCategory').value = '';
      document.getElementById('fNote').value = '';
      toast("Qo'shildi");
      loadExpenses();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});

document.getElementById('filterForm').addEventListener('submit', (e) => {
  e.preventDefault();
  withBusy(document.getElementById('filterBtn'), loadExpenses);
});
['filterFrom', 'filterTo'].forEach((id) => {
  document.getElementById(id).addEventListener('change', () => { if (expensePresets) expensePresets.set(null); });
});

async function delExpense(id) {
  if (!(await customConfirm("Xarajatni o'chirasizmi?", { okText: "O'chirish", danger: true }))) return;
  try {
    await api(`/admin/expenses/${id}`, { method: 'DELETE' });
    toast("O'chirildi");
    loadExpenses();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('expenses');
  document.getElementById('fDate').value = todayStr();
  expensePresets = datePresets('expensePresets', {
    initial: 'month',
    onChange: ({ from, to }) => {
      document.getElementById('filterFrom').value = from;
      document.getElementById('filterTo').value = to;
      loadExpenses();
    },
  });
  const r = expensePresets.get();
  document.getElementById('filterFrom').value = r.from;
  document.getElementById('filterTo').value = r.to;
  loadExpenses();
});
