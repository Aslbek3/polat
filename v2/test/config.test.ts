import { describe, expect, it } from 'vitest';
import { ConfigError, parseEnv } from '../src/config/env.js';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('config', () => {
  it("standart qiymatlarni beradi", () => {
    const env = parseEnv({ ...base });
    expect(env.PORT).toBe(3214);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.SESSION_SECRET.length).toBeGreaterThan(20);
  });

  it("DATABASE_URL bo'lmasa xato", () => {
    expect(() => parseEnv({})).toThrow(ConfigError);
  });

  it("production'da qisqa SESSION_SECRET va TRUST_PROXY=0 qabul qilinmaydi", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', SESSION_SECRET: 'qisqa', TRUST_PROXY: '1' })).toThrow(
      /SESSION_SECRET/,
    );
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), TRUST_PROXY: '0' }),
    ).toThrow(/TRUST_PROXY/);
    const ok = parseEnv({ ...base, NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), TRUST_PROXY: '1' });
    expect(ok.TRUST_PROXY).toBe(true);
  });

  it("bo'sh qatorni 'berilmagan' deb oladi", () => {
    expect(parseEnv({ ...base, PRINT_TOKEN: '  ' }).PRINT_TOKEN).toBeUndefined();
  });
});
