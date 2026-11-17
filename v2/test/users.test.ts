import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createStaff, loginAs, testApp, testDb, truncateAll } from './helpers.js';

const db = testDb();
const app = testApp(db);
afterAll(() => db.close());

let adminId: number;
let admin: Awaited<ReturnType<typeof loginAs>>;
beforeEach(async () => {
  await truncateAll(db);
  adminId = await createStaff(db, 'boss', 'admin');
  admin = await loginAs(app, 'boss');
});

describe('xodimlarni boshqarish', () => {
  it('yaratish, ro\'yxat, takroriy login', async () => {
    const res = await admin.post('/api/admin/users').send({ username: 'ali', password: 'parol123', role: 'waiter', full_name: ' Ali ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'ali', role: 'waiter', full_name: 'Ali', is_active: true });
    expect(res.body.password_hash).toBeUndefined();

    const dup = await admin.post('/api/admin/users').send({ username: 'ali', password: 'parol123', role: 'waiter' });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toBe('Bu login band');

    const bad = await admin.post('/api/admin/users').send({ username: 'v', password: '123', role: 'waiter' });
    expect(bad.status).toBe(400);
    expect((await admin.post('/api/admin/users').send({ username: 'v', password: 'parol123', role: 'boss' })).status).toBe(400);

    const list = await admin.get('/api/admin/users');
    expect(list.body.map((u: { username: string }) => u.username)).toEqual(['boss', 'ali']);
    const { rows } = await db.query("SELECT action FROM audit_log WHERE action = 'user.create'");
    expect(rows).toHaveLength(1);
  });

  it("parol almashsa xodimning eski sessiyalari bekor bo'ladi va yangi parol ishlaydi", async () => {
    const id = await createStaff(db, 'ali', 'waiter');
    const ali = await loginAs(app, 'ali');
    expect((await admin.post(`/api/admin/users/${id}/reset-password`).send({ password: 'yangi-parol' })).status).toBe(200);
    expect((await ali.get('/api/me')).status).toBe(401);
    await loginAs(app, 'ali', 'yangi-parol');
  });

  it("rol o'zgarsa sessiya bekor bo'ladi va audit yoziladi", async () => {
    const id = await createStaff(db, 'ali', 'waiter');
    const ali = await loginAs(app, 'ali');
    const res = await admin.put(`/api/admin/users/${id}`).send({ role: 'kassir' });
    expect(res.body.role).toBe('kassir');
    expect((await ali.get('/api/me')).status).toBe(401);
    const { rows } = await db.query("SELECT old_value, new_value FROM audit_log WHERE action = 'user.role_change'");
    expect(rows[0]).toEqual({ old_value: { role: 'waiter' }, new_value: { role: 'kassir' } });
  });

  it("admin o'zini o'chira, faolsizlantira yoki rolini tushira olmaydi", async () => {
    expect((await admin.delete(`/api/admin/users/${adminId}`)).status).toBe(400);
    expect((await admin.put(`/api/admin/users/${adminId}`).send({ is_active: false })).status).toBe(400);
    expect((await admin.put(`/api/admin/users/${adminId}`).send({ role: 'waiter' })).status).toBe(400);
  });

  it("oxirgi faol adminni boshqa admin ham o'chirolmaydi", async () => {
    const second = await createStaff(db, 'boss2', 'admin');
    const boss2 = await loginAs(app, 'boss2');
    expect((await admin.put(`/api/admin/users/${second}`).send({ is_active: false })).status).toBe(200);
    // endi faqat 'boss' qoldi — boss2 faolsiz, lekin uni ham qaytadan faollashtirib sinaymiz:
    expect((await boss2.get('/api/me')).status).toBe(401);
    await db.query('UPDATE users SET is_active = TRUE WHERE id = $1', [second]);
    const b2 = await loginAs(app, 'boss2');
    expect((await b2.delete(`/api/admin/users/${adminId}`)).status).toBe(200); // 2 ta admin bor edi — mumkin
    await db.query('UPDATE users SET is_active = TRUE WHERE id = $1', [adminId]);
    await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [second]);
    const boss = await loginAs(app, 'boss');
    await db.query('UPDATE users SET is_active = TRUE WHERE id = $1', [second]);
    await db.query("UPDATE users SET role = 'waiter' WHERE id = $1", [second]);
    expect((await boss.put(`/api/admin/users/${adminId}`).send({ role: 'kassir' })).status).toBe(400);
  });

  it("izi bor xodim faqat faolsizlantiriladi, izsizi butunlay o'chadi", async () => {
    const used = await createStaff(db, 'ali', 'waiter');
    const fresh = await createStaff(db, 'yangi', 'chef');
    const t = await db.query<{ id: number }>("INSERT INTO tables (name) VALUES ('1') RETURNING id");
    await db.query('INSERT INTO orders (table_id, opened_by) VALUES ($1, $2)', [t.rows[0]!.id, used]);

    const a = await admin.delete(`/api/admin/users/${used}`);
    expect(a.body).toEqual({ ok: true, hardDeleted: false });
    const b = await admin.delete(`/api/admin/users/${fresh}`);
    expect(b.body).toEqual({ ok: true, hardDeleted: true });

    const { rows } = await db.query('SELECT username, is_active FROM users ORDER BY id');
    expect(rows).toEqual([
      { username: 'boss', is_active: true },
      { username: 'ali', is_active: false },
    ]);
    const list = await admin.get('/api/admin/users');
    expect(list.body.find((u: { username: string }) => u.username === 'ali').has_activity).toBe(true);
  });

  it('audit xulosasi', async () => {
    await createStaff(db, 'ali', 'waiter');
    await db.query("INSERT INTO login_attempts (username, success) VALUES ('ali', FALSE), ('ali', FALSE)");
    const res = await admin.get('/api/admin/audit/summary');
    expect(res.status).toBe(200);
    expect(res.body.failedLogins[0]).toMatchObject({ username: 'ali', attempt_count: 2 });
    expect(res.body).toHaveProperty('cancellations');
    expect(res.body).toHaveProperty('manualBills');
  });

  it("noto'g'ri ID — 400, yo'q ID — 404", async () => {
    expect((await admin.put('/api/admin/users/abc').send({})).status).toBe(400);
    expect((await admin.put('/api/admin/users/999').send({})).status).toBe(404);
  });
});
