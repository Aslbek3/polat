import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/lib/passwords.js';
import { createStaff, loginAs, TEST_SECRET, testApp, testDb, truncateAll } from './helpers.js';

const db = testDb();
const app = testApp(db);
afterAll(() => db.close());
beforeEach(() => truncateAll(db));

const cookieOf = (res: request.Response) => String(res.headers['set-cookie'] ?? '');

describe('xodim kirishi', () => {
  it('to\'g\'ri parol — cookie va /api/me', async () => {
    await createStaff(db, 'ali', 'waiter');
    const res = await request(app).post('/api/login').send({ username: ' ali ', password: 'parol123' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, role: 'waiter', full_name: 'ALI' });
    expect(cookieOf(res)).toMatch(/polat_session=s\.\d+\.1\./);
    expect(cookieOf(res)).toContain('HttpOnly');

    const agent = await loginAs(app, 'ali');
    const me = await agent.get('/api/me');
    expect(me.body).toMatchObject({ username: 'ali', role: 'waiter' });
    const { rows } = await db.query('SELECT success FROM login_attempts');
    expect(rows.some((r) => r.success === true)).toBe(true);
  });

  it("noto'g'ri parol / noma'lum login / faolsiz xodim — 401 va urinish yoziladi", async () => {
    const id = await createStaff(db, 'vali', 'kassir');
    expect((await request(app).post('/api/login').send({ username: 'vali', password: 'xato!!' })).status).toBe(401);
    expect((await request(app).post('/api/login').send({ username: 'yoq', password: 'parol123' })).status).toBe(401);
    await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);
    expect((await request(app).post('/api/login').send({ username: 'vali', password: 'parol123' })).status).toBe(401);
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM login_attempts WHERE NOT success');
    expect(rows[0]!.n).toBe(3);
  });

  it("bo'sh so'rov — 400", async () => {
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Login va parol kiritilishi shart');
  });

  it('IP bo\'yicha 5 tadan keyin 429 (bazada saqlanadi)', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/login').send({ username: `u${i}`, password: 'xxxxxx' });
    const res = await request(app).post('/api/login').send({ username: 'u9', password: 'xxxxxx' });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeUndefined(); // login cheklovi service ichida
    const { rows } = await db.query("SELECT count FROM rate_limit_hits WHERE key LIKE 'login:ip:%'");
    expect(rows[0]!.count).toBe(6);
  });

  it('eski server/passwords.js xeshi yangi tizimda ishlaydi', async () => {
    const legacy = createRequire(import.meta.url)('../../server/passwords.js');
    const { salt, hash } = legacy.hashPassword('eski-parol');
    expect(await verifyPassword('eski-parol', salt, hash)).toBe(true);
    expect(await verifyPassword('boshqa', salt, hash)).toBe(false);
  });
});

describe('sessiyani bekor qilish', () => {
  it('eski formatdagi cookie qabul qilinadi va yangisiga almashtiriladi', async () => {
    const id = await createStaff(db, 'eski', 'chef');
    const legacy = `${id}.${createHmac('sha256', TEST_SECRET).update(String(id)).digest('hex')}`;
    const res = await request(app).get('/api/me').set('Cookie', `polat_session=${legacy}`);
    expect(res.status).toBe(200);
    expect(cookieOf(res)).toMatch(/polat_session=s\.\d+\.1\./);

    await db.query('UPDATE users SET session_version = 2 WHERE id = $1', [id]);
    expect((await request(app).get('/api/me').set('Cookie', `polat_session=${legacy}`)).status).toBe(401);
  });

  it("soxta imzo — 401", async () => {
    const id = await createStaff(db, 'x', 'admin');
    expect((await request(app).get('/api/me').set('Cookie', `polat_session=s.${id}.1.${'0'.repeat(64)}`)).status).toBe(401);
  });

  it('logout-all barcha qurilmalardagi sessiyani o\'chiradi', async () => {
    await createStaff(db, 'ali', 'waiter');
    const phone = await loginAs(app, 'ali');
    const laptop = await loginAs(app, 'ali');
    expect((await laptop.post('/api/me/logout-all')).status).toBe(200);
    expect((await phone.get('/api/me')).status).toBe(401);
  });
});

describe('rol hududlari', () => {
  it("login qilmagan: API 401, sahifa /login.html'ga, landing ochiq", async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    const page = await request(app).get('/admin/index.html');
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe('/login.html');
    expect((await request(app).get('/landing/index.html')).status).toBe(200);
    expect((await request(app).get('/login.html')).status).toBe(200);
  });

  it("afitsiant admin/kassir hududiga kira olmaydi, noma'lum /api 403", async () => {
    await createStaff(db, 'ali', 'waiter');
    const agent = await loginAs(app, 'ali');
    expect((await agent.get('/api/admin/users')).status).toBe(403);
    expect((await agent.get('/api/kassir/tables')).status).toBe(403);
    expect((await agent.get('/api/nimadir')).status).toBe(403);
    const page = await agent.get('/admin/index.html');
    expect(page.status).toBe(302);
    expect(page.headers.location).toBe('/waiter/tables.html');
  });

  it('admin hamma hududga kiradi', async () => {
    await createStaff(db, 'boss', 'admin');
    const agent = await loginAs(app, 'boss');
    expect((await agent.get('/api/admin/users')).status).toBe(200);
    expect((await agent.get('/admin/index.html')).status).toBe(200);
  });

  it('statik fayllar kesh siyosati', async () => {
    const html = await request(app).get('/login.html');
    expect(html.headers['cache-control']).toBe('no-cache');
    const js = await request(app).get('/app.js?v=1');
    expect(js.headers['cache-control']).toBe('public, max-age=604800');
  });
});
