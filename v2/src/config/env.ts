// Sozlamalar ishga tushishda BIR MARTA o'qiladi va zod bilan tekshiriladi.
// Noto'g'ri yoki yetishmayotgan qiymat bo'lsa server ishga TUSHMAYDI va
// aniq xabar chiqaradi — eski tizimdagi "SESSION_SECRET bo'sh bo'lsa har
// restartda sessiyalar jimgina bekor bo'ladi" kabi yashirin xatolar o'rniga.
import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const boolFlag = z.preprocess(
  (v) => (v === undefined || v === '' ? false : v === '1' || v === 'true'),
  z.boolean(),
);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3214),
    HOST: z.string().default('127.0.0.1'),
    TRUST_PROXY: boolFlag,
    // Frontend fayllari (eski `public/` papkasi). Bo'sh bo'lsa — repo'dagi ../public.
    PUBLIC_DIR: optionalString,
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    SESSION_SECRET: optionalString,

    PRINT_TOKEN: optionalString,
    PRINT_JOB_MAX_AGE_MIN: z.coerce.number().int().min(1).default(120),

    TELEGRAM_BOT_TOKEN: optionalString,
    TELEGRAM_BOT_USERNAME: optionalString,
    ESKIZ_EMAIL: optionalString,
    ESKIZ_PASSWORD: optionalString,
    ESKIZ_FROM: optionalString,
    SMS_CODE_TEMPLATE: optionalString,
    SMS_PER_PHONE_DAILY: z.coerce.number().int().min(0).default(5),
    SMS_DAILY_LIMIT: z.coerce.number().int().min(0).default(300),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['SESSION_SECRET'],
          message: "production'da kamida 32 belgili SESSION_SECRET SHART",
        });
      }
      if (!env.TRUST_PROXY) {
        ctx.addIssue({
          code: 'custom',
          path: ['TRUST_PROXY'],
          message: "production nginx ortida ishlaydi — TRUST_PROXY=1 SHART",
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema> & { SESSION_SECRET: string };

export class ConfigError extends Error {}

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new ConfigError(`.env sozlamalarida xato:\n${lines.join('\n')}`);
  }
  const env = result.data;
  // Development/testda secret berilmasa — vaqtinchalik (har restartda yangi).
  const secret = env.SESSION_SECRET ?? `dev-only-${process.pid}-${Date.now()}-insecure-secret`;
  return { ...env, SESSION_SECRET: secret };
}
