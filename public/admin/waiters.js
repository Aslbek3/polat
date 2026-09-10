// Admin "Xodimlar". escapeHtml() / renderList() — ../app.js'dan;
// openFormDialog() / requestCloseFormDialog() — admin.js'dan.
let users = [];
let editingId = null;
let resettingId = null;
let userQuery = '';

// ROLE_LABEL/ROLE_BADGE — server/roles.js'dagi kabi mustaqil ro'yxat (build
// tizimi yo'q): yangi rol qo'shilsa server/roles.js bilan BIRGA shu yerga ham
// (va public/login.html'dagi redirect switch'iga) qo'lda qo'shish kerak.
const ROLE_LABEL = { admin: 'admin', waiter: 'afitsiant', chef: 'oshpaz', courier: 'dastavka', kassir: 'kassir' };
const ROLE_BADGE = { admin: 'debt', waiter: 'ok', chef: 'low', courier: 'ok', kassir: 'low' };

function renderUserCard(u) {
  const canHardDelete = !u.has_activity;
  const who = u.full_name || u.username;
  let actionBtns = '';
  if (u.is_active) {
    const label = canHardDelete ? "O'chirish" : 'Faolsizlantirish';
    actionBtns = `<button type="button" class="btn small danger" data-del="${u.id}" data-hard="${canHardDelete}">${label}</button>`;
  } else {
    actionBtns = `<button type="button" class="btn small" data-activate="${u.id}">Faollashtirish</button>`;
    if (canHardDelete) {
      actionBtns += `<button type="button" class="btn small danger" data-del="${u.id}" data-hard="true">Butunlay o'chirish</button>`;
    }
  }
  return `
    <div class="card" aria-label="${escapeHtml(who)}" role="group">
      <div class="card-row">
        <div>
          <div class="card-title">${escapeHtml(who)} <span class="badge ${ROLE_BADGE[u.role] || 'ok'}">${escapeHtml(ROLE_LABEL[u.role] || u.role)}</span> ${u.is_active ? '' : '<span class="badge low">faolsiz</span>'}</div>
          <div class="card-sub">login: ${escapeHtml(u.username)}</div>
        </div>
      </div>
      <div class="mt-8" style="display:flex; gap:6px; flex-wrap:wrap;">
        <button type="button" class="btn small" data-edit="${u.id}">Tahrirlash</button>
        <button type="button" class="btn small" data-reset="${u.id}">Parolni tiklash</button>
        ${actionBtns}
      </div>
    </div>`;
}

// Qidiruv (A-08): ism, login, rol — mijoz tomonida (ro'yxat kichik).
function renderUsersHtml(rows) {
  const visible = userQuery
    ? rows.filter((u) => matchesSearch(`${u.full_name || ''} ${u.username} ${ROLE_LABEL[u.role] || u.role}`, userQuery))
    : rows;
  if (visible.length === 0) {
    return `<div class="empty-state"><div>«${escapeHtml(userQuery)}» bo'yicha xodim topilmadi.</div></div>`;
  }
  return visible.map(renderUserCard).join('');
}

function bindUserRows(box) {
  box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openUserModal(Number(b.dataset.edit))));
  box.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', () => openResetModal(Number(b.dataset.reset))));
  box.querySelectorAll('[data-activate]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => activateUser(Number(b.dataset.activate)))));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => delUser(Number(b.dataset.del), b.dataset.hard === 'true'))));
}

async function loadUsers() {
  await renderList({
    box: 'userList',
    load: () => api('/admin/users'),
    onData: (rows) => { users = rows; },
    empty: "Hali xodim yo'q.",
    emptyHint: "Yuqoridagi «+ Yangi xodim» tugmasi bilan afitsiant, oshpaz yoki kassir qo'shing.",
    render: renderUsersHtml,
    bind: bindUserRows,
  });
}

function rerenderUsers() {
  if (users.length === 0) return;
  const box = document.getElementById('userList');
  box.innerHTML = renderUsersHtml(users);
  bindUserRows(box);
}

// ⚠️ 2026-09-10: ilgari `openModal`/`closeModal` — global scope'da umumiy
// nom edi (app.js izohi), shu sabab qayta nomlandi. A-26: "foydalanuvchi"
// emas, "xodim" — bo'lim nomi bilan bir xil.
function openUserModal(id) {
  editingId = id;
  const u = id ? users.find((x) => x.id === id) : null;
  document.getElementById('modalTitle').textContent = u ? 'Xodimni tahrirlash' : 'Yangi xodim';
  document.getElementById('fUsername').value = u ? u.username : '';
  document.getElementById('fUsername').disabled = !!u;
  document.getElementById('fPassword').value = '';
  document.getElementById('passField').classList.toggle('hidden', !!u);
  document.getElementById('fFullName').value = u ? (u.full_name || '') : '';
  document.getElementById('fRole').value = u ? u.role : 'waiter';
  openFormDialog('modal', { onClose: () => { editingId = null; } });
}

document.getElementById('addBtn').addEventListener('click', () => openUserModal(null));
document.getElementById('cancelBtn').addEventListener('click', () => requestCloseFormDialog('modal'));
// withBusy(): ikkinchi POST "bu login band" degan yolg'on xato berardi.
// A-18: tekshiruv xatosi — maydon ostida.
document.getElementById('userForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveBtn');
  if (btn.disabled) return;
  clearFieldErrors('userForm');
  const full_name = document.getElementById('fFullName').value.trim();
  const role = document.getElementById('fRole').value;
  const username = document.getElementById('fUsername').value.trim();
  const password = document.getElementById('fPassword').value;
  if (!editingId) {
    let bad = false;
    if (!username) { setFieldError('fUsername', 'Login kiriting'); bad = true; }
    if (!password || password.length < 6) { setFieldError('fPassword', 'Parol kamida 6 belgi bo\'lsin'); bad = true; }
    if (bad) return;
  }
  withBusy(btn, async () => {
    try {
      if (editingId) {
        await api(`/admin/users/${editingId}`, { method: 'PUT', body: { full_name, role } });
      } else {
        await api('/admin/users', { method: 'POST', body: { username, password, role, full_name } });
      }
      closeDialog('modal', 'saved');
      toast('Saqlandi');
      loadUsers();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});

function openResetModal(id) {
  resettingId = id;
  const u = users.find((x) => x.id === id);
  document.getElementById('resetModalTitle').textContent = u ? `Parolni tiklash — ${u.full_name || u.username}` : 'Parolni tiklash';
  document.getElementById('rPassword').value = '';
  openFormDialog('resetModal', { onClose: () => { resettingId = null; } });
}
document.getElementById('resetCancelBtn').addEventListener('click', () => requestCloseFormDialog('resetModal'));
document.getElementById('resetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('resetSaveBtn');
  if (btn.disabled) return;
  clearFieldErrors('resetForm');
  const password = document.getElementById('rPassword').value;
  if (!password || password.length < 6) { setFieldError('rPassword', 'Parol kamida 6 belgi bo\'lsin'); return; }
  withBusy(btn, async () => {
    try {
      await api(`/admin/users/${resettingId}/reset-password`, { method: 'POST', body: { password } });
      closeDialog('resetModal', 'saved');
      toast('Parol yangilandi');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
});

async function delUser(id, hard) {
  const msg = hard
    ? "Bu xodimni butunlay o'chirasizmi? Bu amalni ortga qaytarib bo'lmaydi."
    : "Bu xodimni faolsizlantirasizmi? U endi tizimga kira olmaydi.";
  if (!(await customConfirm(msg, { okText: hard ? "O'chirish" : 'Faolsizlantirish', danger: true }))) return;
  try {
    const res = await api(`/admin/users/${id}`, { method: 'DELETE' });
    toast(res && res.hardDeleted ? "O'chirildi" : 'Faolsizlantirildi');
    loadUsers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function activateUser(id) {
  try {
    await api(`/admin/users/${id}`, { method: 'PUT', body: { is_active: true } });
    toast('Faollashtirildi');
    loadUsers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav('waiters');
  attachSearch('userSearch', { onFilter: (q) => { userQuery = q; rerenderUsers(); } });
  loadUsers();
});
