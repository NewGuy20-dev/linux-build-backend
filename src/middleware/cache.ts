import { Request, Response, NextFunction } from 'express';
import { cacheGet, cacheSet } from '../utils/redis';

export const cacheMiddleware = (ttlSeconds = 60) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    const key = `cache:${req.originalUrl}`;
    const cached = await cacheGet<{ body: unknown; status: number }>(key);

    if (cached) {
      res.status(cached.status).json(cached.body);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode < 400) {
        cacheSet(key, { body, status: res.statusCode }, ttlSeconds).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  };
};

export const invalidateCache = async (pattern: string) => {
  // For specific key invalidation
  const { cacheDel } = await import('../utils/redis');
  await cacheDel(pattern);
};
