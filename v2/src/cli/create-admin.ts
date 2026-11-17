// `npm run create-admin -- <login> <parol>` — boshlang'ich admin (mavjud bo'lsa
// tegilmaydi) va standart sozlamalar. Eski `npm run migrate` (server/migrate.js) o'rnida.
import { config } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { createDatabase } from '../db/pool.js';
import { migrate } from '../db/migrator.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../lib/passwords.js';

const [username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD] = process.argv.slice(2);
const env = config();
const logger = createLogger(env.LOG_LEVEL);

if (!username || !password || password.length < MIN_PASSWORD_LENGTH) {
  logger.fatal(`Foydalanish: npm run create-admin -- <login> <parol (kamida ${MIN_PASSWORD_LENGTH} belgi)>`);
  process.exit(1);
}

const db = createDatabase({ connectionString: env.DATABASE_URL, max: 1, logger });
try {
  await migrate(db, { logger });
  const { salt, hash } = await hashPassword(password);
  await db.withTransaction(async (tx) => {
    for (const [key, value] of Object.entries({ restaurant_name: "Po'lat", restaurant_phone: '', restaurant_address: '' })) {
      await tx.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
    }
    const r = await tx.query(
      `INSERT INTO users (username, password_hash, password_salt, role, full_name)
       VALUES ($1, $2, $3, 'admin', 'Administrator') ON CONFLICT (username) DO NOTHING`,
      [username, hash, salt],
    );
    logger.info(r.rowCount ? `Admin yaratildi: ${username}` : `"${username}" allaqachon mavjud — tegilmadi`);
  });
} catch (err) {
  logger.fatal({ err }, 'Xato');
  process.exitCode = 1;
} finally {
  await db.close();
}
