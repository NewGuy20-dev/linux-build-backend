import { redis } from '../utils/redis';
import { createHash } from 'crypto';

interface CacheConfig {
  baseImages: { enabled: boolean; ttl: number };
  packages: { enabled: boolean; ttl: number };
  artifacts: { enabled: boolean; ttl: number };
}

const DEFAULT_CONFIG: CacheConfig = {
  baseImages: { enabled: true, ttl: 86400 },  // 24h
  packages: { enabled: true, ttl: 3600 },     // 1h
  artifacts: { enabled: true, ttl: 604800 },  // 7d
};

export const generateSpecHash = (spec: object): string => {
  return createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 16);
};

export const getCachedArtifact = async (specHash: string): Promise<string | null> => {
  return redis.get(`artifact:${specHash}`);
};

export const setCachedArtifact = async (specHash: string, artifactPath: string, ttl = DEFAULT_CONFIG.artifacts.ttl) => {
  await redis.setex(`artifact:${specHash}`, ttl, artifactPath);
};

export const getCacheStats = async () => {
  const keys = await redis.keys('artifact:*');
  return { cachedArtifacts: keys.length };
};

export const invalidateCache = async (pattern: string) => {
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
  return keys.length;
};
