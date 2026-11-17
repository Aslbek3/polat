import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_SECRET, testApp, testDb, truncateAll } from './helpers.js';
import { normalizeUzPhone } from '../src/lib/phone.js';

const db = testDb();
const app = testApp(db);
afterAll(() => db.close());
beforeEach(() => truncateAll(db));

// Eski server/customerAuth.js bilan bir xil algoritm — v2 eski cookie'larni qabul qilishini tasdiqlaydi.
function legacyCustomerCookie(id: number, version: number) {
  const key = createHmac('sha256', TEST_SECRET).update('polat-customer-session-v1').digest();
  const value = `c.${id}.${version}`;
  return `polat_customer=${value}.${createHmac('sha256', key).update(value).digest('hex')}`;
}

async function customer(phone = '+998901234567') {
  const { rows } = await db.query<{ id: number }>('INSERT INTO customers (phone, full_name) VALUES ($1, $2) RETURNING id', [phone, 'Mijoz']);
  return { id: rows[0]!.id, cookie: legacyCustomerCookie(rows[0]!.id, 1) };
}

describe('telefon', () => {
  it('turli yozuvlarni bitta formatga keltiradi', () => {
    for (const v of ['90 123 45 67', '901234567', '998901234567', '+998 (90) 123-45-67']) {
      expect(normalizeUzPhone(v)).toBe('+998901234567');
    }
    expect(normalizeUzPhone('12345')).toBeNull();
    expect(normalizeUzPhone(null)).toBeNull();
  });
});

describe('mijoz sessiyasi', () => {
  it('login qilmagan: session null, /me 401', async () => {
    expect((await request(app).get('/api/customer/auth/session')).body).toEqual({ customer: null });
    expect((await request(app).get('/api/customer/me')).status).toBe(401);
  });

  it('eski cookie bilan ishlaydi, logout-all bekor qiladi', async () => {
    const c = await customer();
    const s = await request(app).get('/api/customer/auth/session').set('Cookie', c.cookie);
    expect(s.body.customer).toMatchObject({ id: c.id, phone: '+998901234567', full_name: 'Mijoz' });
    expect((await request(app).post('/api/customer/logout-all').set('Cookie', c.cookie)).status).toBe(200);
    expect((await request(app).get('/api/customer/me').set('Cookie', c.cookie)).status).toBe(401);
  });

  it("mijoz cookie'si xodim sahifalarini ochmaydi", async () => {
    const c = await customer();
    expect((await request(app).get('/api/me').set('Cookie', c.cookie)).status).toBe(401);
  });

  it('ismni yangilash va tekshirish', async () => {
    const c = await customer();
    expect((await request(app).put('/api/customer/me').set('Cookie', c.cookie).send({ full_name: 'A' })).status).toBe(400);
    const ok = await request(app).put('/api/customer/me').set('Cookie', c.cookie).send({ full_name: '  Ali   Valiyev ' });
    expect(ok.body.customer.full_name).toBe('Ali Valiyev');
  });
});

describe('manzillar', () => {
  it("birinchisi asosiy, takror saqlanmaydi, 10 tadan oshmaydi", async () => {
    const c = await customer();
    const post = (body: object) => request(app).post('/api/customer/addresses').set('Cookie', c.cookie).send(body);
    const first = await post({ address: 'Toshkent, Chilonzor 1' });
    expect(first.body.addresses[0].is_default).toBe(true);
    const dup = await post({ address: 'Toshkent, Chilonzor 1' });
    expect(dup.body.duplicate).toBe(true);
    expect((await post({ address: 'abc' })).status).toBe(400);
    for (let i = 2; i <= 10; i++) expect((await post({ address: `Manzil raqami ${i}` })).status).toBe(200);
    const over = await post({ address: 'Manzil raqami 11' });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/10 ta/);
  });

  it("asosiysi o'chirilsa eng yangisi asosiy bo'ladi; begona manzilga tegib bo'lmaydi", async () => {
    const a = await customer('+998901111111');
    const b = await customer('+998902222222');
    const first = await request(app).post('/api/customer/addresses').set('Cookie', a.cookie).send({ address: 'Birinchi manzil', location_lat: 41.3, location_lng: 69.2 });
    await request(app).post('/api/customer/addresses').set('Cookie', a.cookie).send({ address: 'Ikkinchi manzil' });
    const firstId = first.body.id;

    expect((await request(app).delete(`/api/customer/addresses/${firstId}`).set('Cookie', b.cookie)).status).toBe(404);
    expect((await request(app).put(`/api/customer/addresses/${firstId}`).set('Cookie', b.cookie).send({ address: 'Buzilgan manzil' })).status).toBe(404);

    const del = await request(app).delete(`/api/customer/addresses/${firstId}`).set('Cookie', a.cookie);
    expect(del.body.addresses).toHaveLength(1);
    expect(del.body.addresses[0]).toMatchObject({ address: 'Ikkinchi manzil', is_default: true });
  });

  it("noto'g'ri koordinata e'tiborsiz qoldiriladi", async () => {
    const c = await customer();
    const res = await request(app).post('/api/customer/addresses').set('Cookie', c.cookie)
      .send({ address: 'Koordinatasiz manzil', location_lat: 500, location_lng: 'x' });
    expect(res.body.addresses[0]).toMatchObject({ location_lat: null, location_lng: null });
  });
});
