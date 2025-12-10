import pino from 'pino';
import { randomUUID } from 'crypto';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  base: { service: 'linux-builder' },
});

export const generateRequestId = (): string => randomUUID();

export const createChildLogger = (requestId: string) =>
  logger.child({ requestId });
