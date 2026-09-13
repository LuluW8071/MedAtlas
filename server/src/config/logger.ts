/** Configure the shared structured application logger. */
import pino from 'pino';
import { env } from './env.js';

/** Shared structured logger with readable console output. */
export const logger = pino({
  level: env.logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      singleLine: true,
    },
  },
});
