import { redis } from '../utils/redis';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

export interface CacheEntry {
  key: string;
  data: string;
  size: number;
  createdAt: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  entries: number;
}

// Cache key prefixes
const PREFIX = {
  LAYER: 'cache:layer:',
  ARTIFACT: 'cache:artifact:',
  PACKAGE: 'cache:package:',
  STATS: 'cache:stats',
};

// Default TTLs in seconds
const TTL = {
  LAYER: 86400 * 7,    // 7 days
  ARTIFACT: 86400 * 30, // 30 days
  PACKAGE: 3600,        // 1 hour
};

// Generate hash for cache key
export const generateCacheKey = (data: string | object): string => {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
};

// Layer cache operations
export const getLayerCache = async (layerHash: string): Promise<string | null> => {
  const key = `${PREFIX.LAYER}${layerHash}`;
  const data = await redis.get(key);
  
  if (data) {
    await redis.hincrby(PREFIX.STATS, 'hits', 1);
    logger.debug({ layerHash }, 'Layer cache hit');
  } else {
    await redis.hincrby(PREFIX.STATS, 'misses', 1);
  }
  
  return data;
};

export const setLayerCache = async (layerHash: string, data: string, ttl = TTL.LAYER): Promise<void> => {
  const key = `${PREFIX.LAYER}${layerHash}`;
  await redis.setex(key, ttl, data);
  await redis.hincrby(PREFIX.STATS, 'size', data.length);
  logger.debug({ layerHash, size: data.length }, 'Layer cached');
};

// Artifact cache operations
export const getArtifactCache = async (specHash: string): Promise<string | null> => {
  const key = `${PREFIX.ARTIFACT}${specHash}`;
  return redis.get(key);
};

export const setArtifactCache = async (specHash: string, artifactPath: string, ttl = TTL.ARTIFACT): Promise<void> => {
  const key = `${PREFIX.ARTIFACT}${specHash}`;
  await redis.setex(key, ttl, artifactPath);
};

// Package cache operations (for resolved package lists)
export const getPackageCache = async (distro: string, packages: string[]): Promise<string[] | null> => {
  const hash = generateCacheKey({ distro, packages: packages.sort() });
  const key = `${PREFIX.PACKAGE}${hash}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
};

export const setPackageCache = async (distro: string, packages: string[], resolved: string[]): Promise<void> => {
  const hash = generateCacheKey({ distro, packages: packages.sort() });
  const key = `${PREFIX.PACKAGE}${hash}`;
  await redis.setex(key, TTL.PACKAGE, JSON.stringify(resolved));
};

// Cache statistics
export const getCacheStats = async (): Promise<CacheStats> => {
  const stats = await redis.hgetall(PREFIX.STATS);
  const layerKeys = await redis.keys(`${PREFIX.LAYER}*`);
  const artifactKeys = await redis.keys(`${PREFIX.ARTIFACT}*`);
  
  return {
    hits: parseInt(stats.hits || '0', 10),
    misses: parseInt(stats.misses || '0', 10),
    size: parseInt(stats.size || '0', 10),
    entries: layerKeys.length + artifactKeys.length,
  };
};

// Cache invalidation
export const invalidateLayerCache = async (pattern?: string): Promise<number> => {
  const keys = await redis.keys(`${PREFIX.LAYER}${pattern || '*'}`);
  if (keys.length === 0) return 0;
  await redis.del(...keys);
  logger.info({ count: keys.length }, 'Layer cache invalidated');
  return keys.length;
};

export const invalidateArtifactCache = async (specHash?: string): Promise<number> => {
  const pattern = specHash ? `${PREFIX.ARTIFACT}${specHash}` : `${PREFIX.ARTIFACT}*`;
  const keys = await redis.keys(pattern);
  if (keys.length === 0) return 0;
  await redis.del(...keys);
  return keys.length;
};

// Warm cache with common base images
export const warmCache = async (baseImages: string[]): Promise<void> => {
  logger.info({ images: baseImages }, 'Warming cache with base images');
  for (const image of baseImages) {
    const hash = generateCacheKey(image);
    const exists = await redis.exists(`${PREFIX.LAYER}${hash}`);
    if (!exists) {
      // Mark as pending warm
      await redis.setex(`${PREFIX.LAYER}${hash}:pending`, 300, '1');
    }
  }
};

// Check if build can use cached artifact
export const checkCachedBuild = async (spec: object): Promise<string | null> => {
  const specHash = generateCacheKey(spec);
  const cached = await getArtifactCache(specHash);
  
  if (cached) {
    logger.info({ specHash }, 'Found cached build artifact');
    return cached;
  }
  
  return null;
};
