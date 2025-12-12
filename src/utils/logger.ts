import pino from 'pino';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  base: { service: 'linux-builder' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', '*.password', '*.token', '*.apiKey'],
    censor: '[REDACTED]',
  },
});

export const generateRequestId = (): string => randomUUID();

export const createChildLogger = (requestId: string) =>
  logger.child({ requestId });

// Request ID middleware
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}
