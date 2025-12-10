import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateApiKey, hashApiKey } from '../utils/apiKey';

declare global {
  namespace Express {
    interface Request {
      apiKey?: string;
      apiKeyId?: string;
      apiKeyValid?: boolean;
      scopes?: string[];
    }
  }
}

const prisma = new PrismaClient();

// Fallback: env-based keys (comma-separated)
const getEnvApiKeys = (): Set<string> => {
  const keys = process.env.API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];
  return new Set(keys);
};

// Cache by hash, not raw key - Fix for Finding 5
const cache = new Map<string, { valid: boolean; scopes?: string[]; id?: string; expires: number }>();
const CACHE_TTL = 60_000; // 1 minute

const validateKey = async (key: string): Promise<{ valid: boolean; scopes?: string[]; id?: string; hash: string }> => {
  const keyHash = hashApiKey(key);
  const cached = cache.get(keyHash);
  if (cached && cached.expires > Date.now()) {
    return { valid: cached.valid, scopes: cached.scopes, id: cached.id, hash: keyHash };
  }

  // Try database first (for lbk_ prefixed keys)
  if (key.startsWith('lbk_')) {
    const result = await validateApiKey(prisma, key);
    cache.set(keyHash, { ...result, expires: Date.now() + CACHE_TTL });
    return { ...result, hash: keyHash };
  }

  // Fallback to env-based keys
  const envKeys = getEnvApiKeys();
  const valid = envKeys.has(key);
  cache.set(keyHash, { valid, expires: Date.now() + CACHE_TTL });
  return { valid, hash: keyHash };
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Only skip auth if explicitly disabled AND in development
  const envKeys = getEnvApiKeys();
  if (process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV === 'development' && envKeys.size === 0) {
    req.apiKeyValid = false;
    return next();
  }

  const authHeader = req.headers.authorization;
  const headerKey = req.headers['x-api-key'] as string | undefined;
  
  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (headerKey) {
    token = headerKey;
  }

  if (!token) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  const result = await validateKey(token);
  if (!result.valid) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.apiKey = result.hash;
  req.apiKeyId = result.id;
  req.apiKeyValid = true;
  req.scopes = result.scopes;
  next();
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  const headerKey = req.headers['x-api-key'] as string | undefined;
  
  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (headerKey) {
    token = headerKey;
  }

  if (token) {
    const result = await validateKey(token);
    if (result.valid) {
      req.apiKey = result.hash;
      req.apiKeyId = result.id;
      req.apiKeyValid = true;
      req.scopes = result.scopes;
    }
  }
  next();
};

export const requireScope = (scope: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.scopes?.includes(scope)) {
    res.status(403).json({ error: `Missing required scope: ${scope}` });
    return;
  }
  next();
};
