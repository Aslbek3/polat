// Versiyalangan SQL migratsiyalar.
//
// `migrations/NNNN_nom.sql` fayllari raqam tartibida, HAR BIRI o'z
// tranzaksiyasida bajariladi va `schema_migrations` jadvaliga yoziladi.
// Qo'llangan fayl keyin o'zgartirilsa (checksum mos kelmasa) — xato: eski
// migratsiyani tahrirlash o'rniga YANGI fayl qo'shish kerak.
// Ikki jarayon bir vaqtda migratsiya qilmasligi uchun advisory lock.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from './pool.js';
import type { Logger } from '../lib/logger.js';

const LOCK_KEY = 7_202_611; // ixtiyoriy, shu ilova uchun o'zgarmas son
const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export const DEFAULT_MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
);

export interface MigrationFile {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export async function loadMigrations(dir = DEFAULT_MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const out: MigrationFile[] = [];
  for (const file of files) {
    const m = FILE_RE.exec(file);
    if (!m) throw new Error(`Migratsiya fayl nomi noto'g'ri: ${file} (kutilgan: 0001_nom.sql)`);
    const sql = await readFile(path.join(dir, file), 'utf8');
    out.push({
      version: Number(m[1]),
      name: m[2]!,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  out.forEach((mig, i) => {
    if (mig.version !== i + 1) {
      throw new Error(`Migratsiya raqamlari ketma-ket emas: ${mig.version} (kutilgan ${i + 1})`);
    }
  });
  return out;
}

export interface MigrateResult {
  applied: string[];
  alreadyApplied: number;
}

export async function migrate(db: Database, opts: { dir?: string; logger?: Logger } = {}): Promise<MigrateResult> {
  const migrations = await loadMigrations(opts.dir);
  const client = await db.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER     PRIMARY KEY,
        name        TEXT        NOT NULL,
        checksum    TEXT        NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: number; name: string; checksum: string }>(
      'SELECT version, name, checksum FROM schema_migrations ORDER BY version',
    );
    const done = new Map(rows.map((r) => [r.version, r]));

    for (const row of rows) {
      const file = migrations.find((m) => m.version === row.version);
      if (!file) throw new Error(`Bazada ${row.version}_${row.name} qo'llangan, lekin fayli topilmadi`);
      if (file.checksum !== row.checksum) {
        throw new Error(
          `${row.version}_${row.name} migratsiyasi qo'llangandan keyin o'zgartirilgan. ` +
            `Eski faylni tahrirlamang — yangi migratsiya qo'shing.`,
        );
      }
    }

    const applied: string[] = [];
    for (const mig of migrations) {
      if (done.has(mig.version)) continue;
      const label = `${String(mig.version).padStart(4, '0')}_${mig.name}`;
      opts.logger?.info({ migration: label }, 'Migratsiya qo\'llanmoqda');
      try {
        await client.query('BEGIN');
        await client.query(mig.sql);
        await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
          mig.version,
          mig.name,
          mig.checksum,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${label} migratsiyasi bajarilmadi: ${(err as Error).message}`, { cause: err });
      }
      applied.push(label);
    }
    return { applied, alreadyApplied: done.size };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}
