import { Request, Response, NextFunction } from 'express';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      apiKey?: string;
      apiKeyValid?: boolean;
    }
  }
}

// Simple in-memory cache for API key validation
const keyCache = new Map<string, { valid: boolean; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Load API keys from environment (comma-separated)
const getApiKeys = (): Set<string> => {
  const keys = process.env.API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];
  return new Set(keys);
};

// Check cache or validate key
const isValidApiKey = (token: string): boolean => {
  const cached = keyCache.get(token);
  if (cached && cached.expires > Date.now()) {
    return cached.valid;
  }
  
  const apiKeys = getApiKeys();
  const valid = apiKeys.has(token);
  
  keyCache.set(token, { valid, expires: Date.now() + CACHE_TTL });
  return valid;
};

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Skip auth in development if no keys configured
  const apiKeys = getApiKeys();
  if (apiKeys.size === 0 && process.env.NODE_ENV === 'development') {
    req.apiKeyValid = false;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (!isValidApiKey(token)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.apiKey = token;
  req.apiKeyValid = true;
  next();
};

// Optional auth - doesn't reject, just attaches user info if present
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (isValidApiKey(token)) {
      req.apiKey = token;
      req.apiKeyValid = true;
    }
  }
  next();
};
