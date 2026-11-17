import 'dotenv/config';
import { parseEnv, type Env } from './env.js';

let cached: Env | undefined;

/** Ilova sozlamalari (birinchi chaqiruvda `process.env`dan o'qiladi va keshlanadi). */
export function config(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export { parseEnv, ConfigError, type Env } from './env.js';
