import { parseEnv, type Env } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { createDatabase, type Database } from '../src/db/pool.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://polat:polat@127.0.0.1:5432/polat_test';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL, LOG_LEVEL: 'silent', ...overrides });
}

export const silentLogger = createLogger('silent');

export function testDb(): Database {
  return createDatabase({ connectionString: TEST_DATABASE_URL, max: 4 });
}

/** Barcha ilova jadvallarini tozalaydi (sxema qoladi). */
export async function truncateAll(db: Database): Promise<void> {
  const { rows } = await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
  );
  if (rows.length === 0) return;
  await db.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

import request from 'supertest';
import { createApp } from '../src/http/app.js';
import { hashPassword } from '../src/lib/passwords.js';

export const TEST_SECRET = 'test-secret-'.padEnd(40, 'x');

export function testApp(db: Database) {
  return createApp({ env: testEnv({ SESSION_SECRET: TEST_SECRET }), db, logger: silentLogger });
}

export async function createStaff(db: Database, username: string, role: string, password = 'parol123') {
  const { salt, hash } = await hashPassword(password);
  const { rows } = await db.query<{ id: number }>(
    'INSERT INTO users (username, password_hash, password_salt, role, full_name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [username, hash, salt, role, username.toUpperCase()],
  );
  return rows[0]!.id;
}

/** Login qiladi va cookie'ni saqlovchi supertest agentini qaytaradi. */
export async function loginAs(app: ReturnType<typeof testApp>, username: string, password = 'parol123') {
  const agent = request.agent(app);
  const res = await agent.post('/api/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
