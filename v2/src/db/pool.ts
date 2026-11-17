// PostgreSQL ulanishlar puli va tranzaksiya yordamchilari.
//
// Qoida: pul/ombor/buyurtma bilan bog'liq HAR QANDAY ko'p qadamli amal
// `withTransaction()` ichida bajariladi. Xato bo'lsa ROLLBACK avtomatik.
// Bir vaqtda ikki kassir bitta stolni to'lasa kabi "poyga" holatlari uchun
// service qatlamida `SELECT ... FOR UPDATE` ishlatiladi.
import pg from 'pg';
import type { Logger } from '../lib/logger.js';

// BIGINT (int8) va COUNT(*) natijalari JS'ga string bo'lib keladi. Bizdagi
// pul summalari Number.MAX_SAFE_INTEGER (9 kvadrillion so'm)dan ancha kichik,
// shuning uchun xavfsiz songa aylantiramiz; chegaradan oshsa — xato.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`BIGINT qiymat xavfsiz chegaradan tashqarida: ${value}`);
  return n;
});
// NUMERIC — faqat agregatlarda (masalan SUM) chiqadi.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
// DATE — vaqt mintaqasi siljishi bo'lmasligi uchun "YYYY-MM-DD" string qoladi.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient;

export interface Database {
  pool: pg.Pool;
  /** Bitta so'rov (tranzaksiyasiz). */
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<R>>;
  /** `fn` ichidagi barcha so'rovlar bitta tranzaksiyada; xato bo'lsa ROLLBACK. */
  withTransaction<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T>;
  /** Baza ishlayaptimi (health check uchun). */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDatabase(opts: { connectionString: string; max?: number; logger?: Logger }): Database {
  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    max: opts.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Har ulanishda vaqt mintaqasi UTC — saqlash har doim UTC'da.
    options: '-c timezone=UTC',
  });
  pool.on('error', (err) => opts.logger?.error({ err }, "PostgreSQL pul ulanishida kutilmagan xato"));

  async function withTransaction<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        opts.logger?.error({ err: rollbackErr }, 'ROLLBACK bajarilmadi');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    pool,
    query: (text, params) => pool.query(text, params as unknown[]),
    withTransaction,
    async ping() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    close: () => pool.end(),
  };
}
