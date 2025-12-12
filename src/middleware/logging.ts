import { Request, Response, NextFunction } from 'express';
import { logger, generateRequestId, createChildLogger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: ReturnType<typeof createChildLogger>;
    }
  }
}

export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  req.requestId = requestId;
  req.log = createChildLogger(requestId);

  res.setHeader('x-request-id', requestId);

  const start = Date.now();
  req.log.info({ method: req.method, url: req.url }, 'request started');

  res.on('finish', () => {
    req.log.info(
      { method: req.method, url: req.url, status: res.statusCode, duration: Date.now() - start },
      'request completed'
    );
  });

  next();
};
