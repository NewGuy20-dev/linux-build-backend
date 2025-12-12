import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateApiKey, hashApiKey } from '../utils/apiKey';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

// Extend Request type for apiKeyScopes
declare global {
  namespace Express {
    interface Request {
      apiKeyScopes?: string[];
    }
  }
}

// Admin middleware - check for admin scope
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.apiKeyScopes?.includes('admin')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};

// List API keys (admin only)
router.get('/admin/api-keys', requireAdmin, async (req: Request, res: Response) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: req.tenantId ? { tenantId: req.tenantId } : {},
      select: {
        id: true,
        name: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ keys });
  } catch (error) {
    logger.error({ error }, 'Failed to list API keys');
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// Create API key (admin only)
router.post('/admin/api-keys', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, scopes = ['build:create', 'build:read'], expiresInDays } = req.body;
    
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    
    const { key: rawKey, hash: keyHash, prefix: keyPrefix } = generateApiKey();
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    
    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        keyHash,
        keyPrefix,
        scopes,
        expiresAt,
        ...(req.tenantId && { tenant: { connect: { id: req.tenantId } } }),
      },
    });
    
    logger.info({ keyId: apiKey.id, name }, 'API key created');
    
    // Return the raw key only once - it cannot be retrieved later
    res.status(201).json({
      id: apiKey.id,
      key: rawKey,
      name: apiKey.name,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      message: 'Store this key securely - it cannot be retrieved again',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create API key');
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Revoke API key (admin only)
router.delete('/admin/api-keys/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const apiKey = await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    
    logger.info({ keyId: id }, 'API key revoked');
    res.json({ message: 'API key revoked', id: apiKey.id });
  } catch (error) {
    logger.error({ error, keyId: req.params.id }, 'Failed to revoke API key');
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// Rotate API key (admin only)
router.post('/admin/api-keys/:id/rotate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Revoke old key
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    
    // Get old key details
    const oldKey = await prisma.apiKey.findUnique({ where: { id } });
    if (!oldKey) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    
    // Create new key with same settings
    const { key: rawKey, hash: keyHash, prefix: keyPrefix } = generateApiKey();
    
    const newKey = await prisma.apiKey.create({
      data: {
        name: `${oldKey.name} (rotated)`,
        keyHash,
        keyPrefix,
        scopes: oldKey.scopes,
        expiresAt: oldKey.expiresAt,
        ...(oldKey.tenantId && { tenant: { connect: { id: oldKey.tenantId } } }),
      },
    });
    
    logger.info({ oldKeyId: id, newKeyId: newKey.id }, 'API key rotated');
    
    res.json({
      id: newKey.id,
      key: rawKey,
      message: 'Old key revoked, store new key securely',
    });
  } catch (error) {
    logger.error({ error, keyId: req.params.id }, 'Failed to rotate API key');
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
});

export default router;
