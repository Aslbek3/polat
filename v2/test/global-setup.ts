// Test bazasini noldan quradi: public sxemani o'chirib, barcha migratsiyalarni
// qo'llaydi. DIQQAT: TEST_DATABASE_URL hech qachon production bazaga
// qaratilmasin — nomida "test" bo'lmasa ishga tushmaydi.
import { createDatabase } from '../src/db/pool.js';
import { migrate } from '../src/db/migrator.js';
import { TEST_DATABASE_URL } from './helpers.js';

export default async function setup() {
  if (!/test/i.test(new URL(TEST_DATABASE_URL).pathname)) {
    throw new Error(`TEST_DATABASE_URL baza nomida "test" bo'lishi shart: ${TEST_DATABASE_URL}`);
  }
  const db = createDatabase({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(db);
  } finally {
    await db.close();
  }
}
