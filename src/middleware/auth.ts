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

// In-memory cache for validated keys
const cache = new Map<string, { valid: boolean; scopes?: string[]; id?: string; expires: number }>();
const CACHE_TTL = 60_000; // 1 minute

const validateKey = async (key: string): Promise<{ valid: boolean; scopes?: string[]; id?: string }> => {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return { valid: cached.valid, scopes: cached.scopes, id: cached.id };
  }

  // Try database first (for lbk_ prefixed keys)
  if (key.startsWith('lbk_')) {
    const result = await validateApiKey(prisma, key);
    cache.set(key, { ...result, expires: Date.now() + CACHE_TTL });
    return result;
  }

  // Fallback to env-based keys
  const envKeys = getEnvApiKeys();
  const valid = envKeys.has(key);
  cache.set(key, { valid, expires: Date.now() + CACHE_TTL });
  return { valid };
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Skip auth in dev if no keys configured
  const envKeys = getEnvApiKeys();
  if (envKeys.size === 0 && process.env.NODE_ENV === 'development') {
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

  req.apiKey = hashApiKey(token);
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
      req.apiKey = hashApiKey(token);
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
