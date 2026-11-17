import { pino, type Logger } from 'pino';

export function createLogger(level: string, pretty = false): Logger {
  return pino({
    level,
    base: { app: 'polat' },
    // Maxfiy qiymatlar hech qachon logga tushmasin.
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'password',
        '*.password',
        'token',
        '*.token',
        'code',
        '*.code',
      ],
      censor: '[yashirildi]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } } : {}),
  });
}

export type { Logger };
