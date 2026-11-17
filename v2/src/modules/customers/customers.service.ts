// Mijoz profili va saqlangan manzillari. Har bir amal FAQAT shu mijozning
// o'z yozuvlariga tegadi (customer_id sharti har so'rovda).
import type { Database, Queryable } from '../../db/pool.js';
import { NotFoundError, ValidationError } from '../../http/errors.js';
import type { CustomerUser } from '../../http/types.js';

export const MAX_ADDRESSES = 10;

export interface AddressInput {
  label: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
}

export function publicCustomer(c: CustomerUser) {
  return { id: c.id, phone: c.phone, full_name: c.full_name || '', created_at: c.created_at };
}

export async function listAddresses(q: Queryable, customerId: number) {
  const { rows } = await q.query(
    `SELECT id, label, address, location_lat, location_lng, is_default, created_at
       FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, id DESC`,
    [customerId],
  );
  return rows;
}

export async function updateName(db: Database, customerId: number, name: string): Promise<CustomerUser> {
  const { rows } = await db.query<CustomerUser>(
    'UPDATE customers SET full_name = $2 WHERE id = $1 RETURNING id, phone, full_name, session_version, created_at',
    [customerId, name],
  );
  return rows[0]!;
}

export async function revokeCustomerSessions(db: Database, customerId: number): Promise<void> {
  await db.query('UPDATE customers SET session_version = session_version + 1 WHERE id = $1', [customerId]);
}

export async function addAddress(db: Database, customerId: number, a: AddressInput) {
  return db.withTransaction(async (tx) => {
    // Mijoz qatorini qulflaymiz — parallel so'rovlar 10 ta chegarani buzolmasin.
    await tx.query('SELECT 1 FROM customers WHERE id = $1 FOR UPDATE', [customerId]);
    const dup = await tx.query<{ id: number }>(
      'SELECT id FROM customer_addresses WHERE customer_id = $1 AND address = $2',
      [customerId, a.address],
    );
    if (dup.rows[0]) return { id: dup.rows[0].id, duplicate: true };
    const { rows } = await tx.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM customer_addresses WHERE customer_id = $1',
      [customerId],
    );
    const count = rows[0]!.n;
    if (count >= MAX_ADDRESSES) throw new ValidationError(`Ko'pi bilan ${MAX_ADDRESSES} ta manzil saqlash mumkin`);
    const makeDefault = a.isDefault || count === 0; // birinchi manzil — avtomatik asosiy
    if (makeDefault) await tx.query('UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1', [customerId]);
    const ins = await tx.query<{ id: number }>(
      `INSERT INTO customer_addresses (customer_id, label, address, location_lat, location_lng, is_default)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [customerId, a.label, a.address, a.lat, a.lng, makeDefault],
    );
    return { id: ins.rows[0]!.id, duplicate: false };
  });
}

export async function updateAddress(db: Database, customerId: number, id: number, a: AddressInput) {
  await db.withTransaction(async (tx) => {
    const own = await tx.query('SELECT 1 FROM customer_addresses WHERE id = $1 AND customer_id = $2 FOR UPDATE', [id, customerId]);
    if (!own.rowCount) throw new NotFoundError('Manzil topilmadi');
    if (a.isDefault) await tx.query('UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1', [customerId]);
    await tx.query(
      `UPDATE customer_addresses SET label = $2, address = $3, location_lat = $4, location_lng = $5,
              is_default = is_default OR $6
        WHERE id = $1`,
      [id, a.label, a.address, a.lat, a.lng, a.isDefault],
    );
  });
}

export async function deleteAddress(db: Database, customerId: number, id: number) {
  await db.withTransaction(async (tx) => {
    const { rows } = await tx.query<{ is_default: boolean }>(
      'DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2 RETURNING is_default',
      [id, customerId],
    );
    if (!rows[0]) throw new NotFoundError('Manzil topilmadi');
    if (rows[0].is_default) {
      // Asosiy manzil o'chirilsa — eng yangisi asosiy bo'ladi.
      await tx.query(
        `UPDATE customer_addresses SET is_default = TRUE WHERE id =
           (SELECT id FROM customer_addresses WHERE customer_id = $1 ORDER BY id DESC LIMIT 1)`,
        [customerId],
      );
    }
  });
}
