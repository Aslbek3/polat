import type { Database } from '../../db/pool.js';
import { burnPasswordCheck, verifyPassword } from '../../lib/passwords.js';
import { hit } from '../../lib/rateLimit.js';
import { TooManyRequestsError, UnauthorizedError } from '../../http/errors.js';
import type { StaffUser } from '../../http/types.js';

const USER_COLUMNS = 'id, username, role, full_name, session_version';

export async function findActiveUser(db: Database, id: number): Promise<StaffUser | null> {
  const { rows } = await db.query<StaffUser>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND is_active`, [id]);
  return rows[0] ?? null;
}

// Brute-force himoyasi ikki darajada: IP bo'yicha (bitta qurilmadan ko'p
// urinish) va login nomi bo'yicha (ko'p IP'dan bitta hisobni buzish).
const IP_RULE = { windowMs: 60_000, max: 5 };
const USERNAME_RULE = { windowMs: 15 * 60_000, max: 10 };

export async function login(
  db: Database,
  input: { username: string; password: string; ip: string | undefined },
): Promise<StaffUser> {
  const username = input.username.trim();
  const ipHit = await hit(db, `login:ip:${input.ip ?? 'unknown'}`, IP_RULE.windowMs, IP_RULE.max);
  if (!ipHit.allowed) throw new TooManyRequestsError("Juda ko'p urinish qilindi, 1 daqiqadan so'ng qayta urinib ko'ring");
  const userHit = await hit(db, `login:user:${username.toLowerCase()}`, USERNAME_RULE.windowMs, USERNAME_RULE.max);
  if (!userHit.allowed) {
    throw new TooManyRequestsError("Bu login uchun juda ko'p noto'g'ri urinish. 15 daqiqadan so'ng qayta urinib ko'ring");
  }

  const { rows } = await db.query<StaffUser & { password_hash: string; password_salt: string }>(
    `SELECT ${USER_COLUMNS}, password_hash, password_salt FROM users WHERE username = $1 AND is_active`,
    [username],
  );
  const row = rows[0];
  const ok = row
    ? await verifyPassword(input.password, row.password_salt, row.password_hash)
    : (await burnPasswordCheck(input.password), false);

  await db.query('INSERT INTO login_attempts (username, success, ip) VALUES ($1, $2, $3)', [username, ok, input.ip ?? null]);
  if (!ok || !row) throw new UnauthorizedError("Login yoki parol noto'g'ri");

  await db.query('UPDATE users SET last_login_at = now(), last_login_ip = $2 WHERE id = $1', [row.id, input.ip ?? null]);
  const { password_hash: _h, password_salt: _s, ...user } = row;
  return user;
}

/** Barcha qurilmalardagi sessiyalarni bekor qiladi; yangi versiyani qaytaradi. */
export async function revokeSessions(db: Pick<Database, 'query'>, userId: number): Promise<number> {
  const { rows } = await db.query<{ session_version: number }>(
    'UPDATE users SET session_version = session_version + 1 WHERE id = $1 RETURNING session_version',
    [userId],
  );
  return rows[0]?.session_version ?? 0;
}
