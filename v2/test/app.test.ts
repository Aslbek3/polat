import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app.js';
import { createDatabase } from '../src/db/pool.js';
import { silentLogger, testDb, testEnv } from './helpers.js';

const db = testDb();
const app = createApp({ env: testEnv(), db, logger: silentLogger });
afterAll(() => db.close());

describe('HTTP asos', () => {
  it('/api/ping eski klient bilan mos', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('/api/health bazani tekshiradi', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
  });

  it('baza ishlamasa /api/health 503 qaytaradi', async () => {
    const deadDb = createDatabase({ connectionString: 'postgres://x:y@127.0.0.1:1/none' });
    const deadApp = createApp({ env: testEnv(), db: deadDb, logger: silentLogger });
    const res = await request(deadApp).get('/api/health');
    expect(res.status).toBe(503);
    await deadDb.close();
  });

  it("noma'lum API yo'li 404 JSON", async () => {
    const res = await request(app).get('/api/yoq-narsa');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('buzilgan JSON 400', async () => {
    const res = await request(app).post('/api/ping').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('bad_json');
  });
});
