// Production kirish nuqtasi: sozlamalarni tekshiradi, migratsiyalarni
// qo'llaydi, serverni ishga tushiradi va SIGTERM/SIGINT'da toza to'xtaydi
// (PM2 restart paytida yarim yozilgan tranzaksiya qolmasin).
import { config, ConfigError } from './config/index.js';
import { createLogger } from './lib/logger.js';
import { createDatabase } from './db/pool.js';
import { migrate } from './db/migrator.js';
import { createApp } from './http/app.js';
import { purgeExpired } from './lib/rateLimit.js';

async function main() {
  let env;
  try {
    env = config();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  const db = createDatabase({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX, logger });

  await migrate(db, { logger });

  const app = createApp({ env, db, logger });
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV }, 'polat v2 ishga tushdi');
  });

  // Fon vazifasi: muddati o'tgan rate-limit yozuvlarini tozalash.
  const purgeTimer = setInterval(() => {
    purgeExpired(db).catch((err) => logger.warn({ err }, "rate_limit_hits tozalanmadi"));
  }, 10 * 60_000);
  purgeTimer.unref();

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "To'xtatilmoqda...");
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(async () => {
      await db.close();
      logger.info("To'xtadi");
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
}

main().catch((err) => {
  console.error('Ishga tushishda xato:', err);
  process.exit(1);
});
