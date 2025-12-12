import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenant?: { id: string; name: string; tier: string };
    }
  }
}

const prisma = new PrismaClient();

export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Get tenant from API key or header
  const tenantSlug = req.headers['x-tenant-id'] as string;
  
  if (!tenantSlug && !req.apiKeyId) {
    return next(); // No tenant context
  }

  try {
    let tenant;
    
    if (req.apiKeyId) {
      // Get tenant from API key
      const apiKey = await prisma.apiKey.findUnique({
        where: { id: req.apiKeyId },
        include: { tenant: true },
      });
      tenant = apiKey?.tenant;
    } else if (tenantSlug) {
      tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    }

    if (tenant) {
      req.tenantId = tenant.id;
      req.tenant = { id: tenant.id, name: tenant.name, tier: tenant.tier };
    }
  } catch {
    // Continue without tenant context
  }

  next();
};

export const requireTenant = (req: Request, res: Response, next: NextFunction) => {
  if (!req.tenantId) {
    res.status(403).json({ error: 'Tenant context required' });
    return;
  }
  next();
};

// Helper to filter queries by tenant
export const withTenant = <T extends { tenantId?: string }>(query: T, tenantId?: string): T => {
  if (tenantId) {
    return { ...query, tenantId };
  }
  return query;
};
