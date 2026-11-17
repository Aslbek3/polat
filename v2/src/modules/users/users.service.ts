// Xodimlarni boshqarish (admin). Eski adminUsers.js xulq-atvori saqlangan,
// qo'shimcha himoyalar:
//  - parol almashsa / rol o'zgarsa / xodim o'chirilsa — uning barcha
//    sessiyalari darhol bekor bo'ladi;
//  - oxirgi faol adminni o'chirish yoki rolini tushirish mumkin emas;
//  - admin o'zini o'chira/faolsizlantira/rolini o'zgartira olmaydi;
//  - "o'chirish": xodim biror joyda ishlatilgan bo'lsa (har qanday FK) —
//    faqat faolsizlantiriladi, tarix buzilmaydi.
import type { PoolClient } from 'pg';
import type { Database } from '../../db/pool.js';
import { hashPassword } from '../../lib/passwords.js';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { logAudit } from '../audit/audit.service.js';
import type { Role } from '../auth/roles.js';

const PUBLIC_FIELDS = 'id, username, role, full_name, is_active, created_at, last_login_at, last_login_ip';

export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  full_name: string | null;
  is_active: boolean;
  created_at: Date;
  last_login_at: Date | null;
  last_login_ip: string | null;
}

// Xodimning izi bor-yo'qligi (ro'yxatda "o'chirish"/"faolsizlantirish" tugmasini tanlash uchun).
const HAS_ACTIVITY_SQL = `(
  EXISTS (SELECT 1 FROM orders o WHERE o.opened_by = u.id OR o.closed_by = u.id)
  OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.added_by = u.id OR oi.cancelled_by = u.id)
  OR EXISTS (SELECT 1 FROM expenses e WHERE e.created_by = u.id)
  OR EXISTS (SELECT 1 FROM manual_bills mb WHERE mb.created_by = u.id)
  OR EXISTS (SELECT 1 FROM cash_shifts cs WHERE cs.opened_by = u.id OR cs.closed_by = u.id)
  OR EXISTS (SELECT 1 FROM inventory_movements im WHERE im.created_by = u.id)
  OR EXISTS (SELECT 1 FROM customer_orders co WHERE co.assigned_courier_id = u.id)
)`;

export async function listUsers(db: Database) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_FIELDS.split(', ').map((c) => `u.${c}`).join(', ')}, ${HAS_ACTIVITY_SQL} AS has_activity
       FROM users u ORDER BY u.role, u.username`,
  );
  return rows;
}

async function getUserForUpdate(tx: PoolClient, id: number) {
  const { rows } = await tx.query<PublicUser>(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1 FOR UPDATE`, [id]);
  const user = rows[0];
  if (!user) throw new NotFoundError('Foydalanuvchi topilmadi');
  return user;
}

async function assertNotLastAdmin(tx: PoolClient, userId: number) {
  // Barcha faol adminlarni qulflaymiz — ikki admin bir vaqtda bir-birini o'chira olmasin.
  const { rows } = await tx.query<{ id: number }>("SELECT id FROM users WHERE role = 'admin' AND is_active FOR UPDATE");
  if (rows.length <= 1 && rows.some((r) => r.id === userId)) {
    throw new ConflictError("Oxirgi faol adminni o'chirib yoki rolini o'zgartirib bo'lmaydi");
  }
}

export async function createUser(
  db: Database,
  input: { username: string; password: string; role: Role; full_name?: string | null },
  actorId: number,
): Promise<PublicUser> {
  const { salt, hash } = await hashPassword(input.password);
  return db.withTransaction(async (tx) => {
    const dup = await tx.query('SELECT 1 FROM users WHERE username = $1', [input.username]);
    if (dup.rowCount) throw new ValidationError('Bu login band', { field: 'username' });
    const { rows } = await tx.query<PublicUser>(
      `INSERT INTO users (username, password_hash, password_salt, role, full_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${PUBLIC_FIELDS}`,
      [input.username, hash, salt, input.role, input.full_name || null],
    );
    const user = rows[0]!;
    await logAudit(tx, {
      action: 'user.create', entityType: 'user', entityId: user.id,
      newValue: { username: user.username, role: user.role }, performedBy: actorId,
    });
    return user;
  });
}

export async function updateUser(
  db: Database,
  id: number,
  patch: { full_name?: string | null; role?: Role; is_active?: boolean },
  actorId: number,
): Promise<PublicUser> {
  return db.withTransaction(async (tx) => {
    const existing = await getUserForUpdate(tx, id);
    const role = patch.role ?? existing.role;
    const isActive = patch.is_active ?? existing.is_active;
    const fullName = patch.full_name !== undefined ? patch.full_name : existing.full_name;
    const roleChanged = role !== existing.role;
    const activeChanged = isActive !== existing.is_active;

    if (id === actorId && (roleChanged || !isActive)) {
      throw new ValidationError("O'zingizning rolingizni o'zgartira yoki o'zingizni o'chira olmaysiz");
    }
    if (existing.role === 'admin' && existing.is_active && (roleChanged || !isActive)) {
      await assertNotLastAdmin(tx, id);
    }

    const { rows } = await tx.query<PublicUser>(
      `UPDATE users SET full_name = $2, role = $3, is_active = $4,
              session_version = session_version + CASE WHEN $5 THEN 1 ELSE 0 END
        WHERE id = $1 RETURNING ${PUBLIC_FIELDS}`,
      [id, fullName, role, isActive, roleChanged || activeChanged],
    );
    if (roleChanged) {
      await logAudit(tx, { action: 'user.role_change', entityType: 'user', entityId: id,
        oldValue: { role: existing.role }, newValue: { role }, performedBy: actorId });
    }
    if (activeChanged) {
      await logAudit(tx, { action: 'user.active_change', entityType: 'user', entityId: id,
        oldValue: { is_active: existing.is_active }, newValue: { is_active: isActive }, performedBy: actorId });
    }
    return rows[0]!;
  });
}

export async function resetPassword(db: Database, id: number, password: string, actorId: number): Promise<void> {
  const { salt, hash } = await hashPassword(password);
  await db.withTransaction(async (tx) => {
    await getUserForUpdate(tx, id);
    await tx.query(
      'UPDATE users SET password_hash = $2, password_salt = $3, session_version = session_version + 1 WHERE id = $1',
      [id, hash, salt],
    );
    await logAudit(tx, { action: 'user.password_reset', entityType: 'user', entityId: id, performedBy: actorId });
  });
}

export async function deleteUser(db: Database, id: number, actorId: number): Promise<{ hardDeleted: boolean }> {
  if (id === actorId) throw new ValidationError("O'zingizni o'chira olmaysiz");
  return db.withTransaction(async (tx) => {
    const existing = await getUserForUpdate(tx, id);
    if (existing.role === 'admin' && existing.is_active) await assertNotLastAdmin(tx, id);

    // Avval haqiqiy o'chirishga urinamiz; xodim biror joyda ishlatilgan bo'lsa
    // (FK 23503) — savepoint'ga qaytib, faqat faolsizlantiramiz.
    await tx.query('SAVEPOINT del_user');
    try {
      // audit_log'dagi o'z yozuvlari ham "iz" hisoblanadi — u holda o'chirilmaydi.
      await tx.query('DELETE FROM users WHERE id = $1', [id]);
      await tx.query('RELEASE SAVEPOINT del_user');
      await logAudit(tx, { action: 'user.delete', entityType: 'user', entityId: id,
        oldValue: { username: existing.username, role: existing.role }, performedBy: actorId });
      return { hardDeleted: true };
    } catch (err) {
      if ((err as { code?: string }).code !== '23503') throw err;
      await tx.query('ROLLBACK TO SAVEPOINT del_user');
    }
    await tx.query('UPDATE users SET is_active = FALSE, session_version = session_version + 1 WHERE id = $1', [id]);
    await logAudit(tx, { action: 'user.deactivate', entityType: 'user', entityId: id,
      oldValue: { is_active: existing.is_active }, newValue: { is_active: false }, performedBy: actorId });
    return { hardDeleted: false };
  });
}
