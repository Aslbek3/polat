// `npm run migrate` — bazani oxirgi sxemaga keltiradi. Idempotent.
import { config } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { createDatabase } from './pool.js';
import { migrate } from './migrator.js';

const env = config();
const logger = createLogger(env.LOG_LEVEL);
const db = createDatabase({ connectionString: env.DATABASE_URL, max: 1, logger });

try {
  const result = await migrate(db, { logger });
  if (result.applied.length === 0) {
    logger.info({ alreadyApplied: result.alreadyApplied }, "Baza allaqachon oxirgi versiyada");
  } else {
    logger.info({ applied: result.applied }, 'Migratsiyalar qo\'llandi');
  }
} catch (err) {
  logger.fatal({ err }, 'Migratsiya muvaffaqiyatsiz');
  process.exitCode = 1;
} finally {
  await db.close();
}
