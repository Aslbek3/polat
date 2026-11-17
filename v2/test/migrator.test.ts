import { mkdtemp, writeFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_MIGRATIONS_DIR, loadMigrations, migrate } from '../src/db/migrator.js';
import { testDb } from './helpers.js';

const db = testDb();
afterAll(() => db.close());

describe('migrator', () => {
  it("qayta ishga tushirilsa hech narsa qilmaydi (idempotent)", async () => {
    const result = await migrate(db);
    expect(result.applied).toEqual([]);
    expect(result.alreadyApplied).toBeGreaterThanOrEqual(1);
  });

  it('barcha kutilgan jadvallar yaratilgan', async () => {
    const { rows } = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const names = rows.map((r) => r.tablename);
    for (const t of [
      'users', 'tables', 'table_zones', 'menu_categories', 'menu_items', 'orders', 'order_items',
      'customer_orders', 'customer_order_items', 'manual_bills', 'manual_bill_items', 'cash_shifts',
      'inventory_items', 'inventory_movements', 'kitchen_tickets', 'kitchen_ticket_items', 'print_jobs',
      'customers', 'customer_addresses', 'customer_telegram', 'customer_login_links', 'customer_login_codes',
      'reservations', 'expenses', 'notifications', 'audit_log', 'login_attempts', 'settings',
      'print_requests', 'inventory_categories', 'schema_migrations',
    ]) {
      expect(names, t).toContain(t);
    }
  });

  it("qo'llangan fayl o'zgartirilsa rad etadi", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mig-'));
    await cp(DEFAULT_MIGRATIONS_DIR, dir, { recursive: true });
    const first = (await loadMigrations(dir))[0]!;
    await writeFile(path.join(dir, `0001_${first.name}.sql`), `${first.sql}\n-- tahrir`);
    await expect(migrate(db, { dir })).rejects.toThrow(/o'zgartirilgan/);
  });

  it("raqamlar ketma-ket bo'lmasa rad etadi", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mig-'));
    await writeFile(path.join(dir, '0001_a.sql'), 'SELECT 1;');
    await writeFile(path.join(dir, '0003_c.sql'), 'SELECT 1;');
    await expect(loadMigrations(dir)).rejects.toThrow(/ketma-ket/);
  });
});
