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
