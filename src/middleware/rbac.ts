import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Role hierarchy: owner > admin > member > viewer
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export const checkRole = (requiredRole: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantId) {
      res.status(403).json({ error: 'Tenant context required' });
      return;
    }

    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(401).json({ error: 'User ID required' });
      return;
    }

    const member = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: req.tenantId, userId } },
    });

    if (!member) {
      res.status(403).json({ error: 'Not a member of this tenant' });
      return;
    }

    const userLevel = ROLE_HIERARCHY[member.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;

    if (userLevel < requiredLevel) {
      res.status(403).json({ error: `Requires ${requiredRole} role or higher` });
      return;
    }

    next();
  };
};

// Check resource quota before build
export const checkQuota = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.tenantId) return next();

  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId } });
  if (!tenant) return next();

  const usage = (tenant.currentUsage as any) || { builds: 0 };
  if (usage.builds >= tenant.maxBuildsPerMonth) {
    res.status(429).json({ error: 'Monthly build quota exceeded' });
    return;
  }

  const activeBuilds = await prisma.userBuild.count({
    where: { tenantId: req.tenantId, status: { in: ['PENDING', 'BUILDING'] } },
  });

  if (activeBuilds >= tenant.maxConcurrentBuilds) {
    res.status(429).json({ error: 'Concurrent build limit reached' });
    return;
  }

  next();
};

// Track usage after build
export const trackUsage = async (tenantId: string, type: 'build' | 'storage', amount: number = 1) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;

  const usage = (tenant.currentUsage as any) || { builds: 0, storageMb: 0 };
  if (type === 'build') usage.builds += amount;
  if (type === 'storage') usage.storageMb += amount;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { currentUsage: usage },
  });
};
