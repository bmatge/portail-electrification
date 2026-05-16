// Logger pino + sérialisation request/response. En dev (NODE_ENV !== 'production')
// on utilise pino-pretty pour un output lisible ; en prod c'est du JSON brut
// streamé vers stdout (Docker récupère et persiste).

import { pino } from 'pino';
import type { LoggerOptions } from 'pino';

function getLevel(): string {
  return process.env['LOG_LEVEL'] ?? 'info';
}

function getOptions(): LoggerOptions {
  const isProd = process.env['NODE_ENV'] === 'production';
  if (isProd) {
    return {
      level: getLevel(),
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', '*.token', '*.token_hash'],
        censor: '[REDACTED]',
      },
    };
  }
  return {
    level: getLevel(),
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l' },
    },
  };
}

export const logger = pino(getOptions());
