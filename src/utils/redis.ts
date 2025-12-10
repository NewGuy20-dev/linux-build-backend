import Redis from 'ioredis';
import { logger } from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Warn if not using TLS in production
if (process.env.NODE_ENV === 'production' && !REDIS_URL.startsWith('rediss://')) {
  logger.warn('Redis connection not using TLS in production - consider using rediss://');
}

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));

export const getRedisConnection = () => redis;

// Cache helpers
export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
};

export const cacheSet = async (key: string, value: unknown, ttlSeconds = 300): Promise<void> => {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
};

export const cacheDel = async (key: string): Promise<void> => {
  await redis.del(key);
};
