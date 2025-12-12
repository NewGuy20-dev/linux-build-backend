import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db';
import { logger } from '../utils/logger';

export const PERMISSIONS = {
  'build:read': 'View builds',
  'build:write': 'Create builds',
  'build:delete': 'Delete builds',
  'build:cancel': 'Cancel builds',
  'template:read': 'View templates',
  'template:write': 'Create/edit templates',
  'template:delete': 'Delete templates',
  'template:publish': 'Publish templates',
  'team:read': 'View teams',
  'team:manage': 'Manage team members',
  'team:create': 'Create teams',
  'team:delete': 'Delete teams',
  'admin:users': 'Manage users',
  'admin:billing': 'View/manage billing',
  'admin:settings': 'Manage tenant settings',
  'admin:audit': 'View audit logs',
  'apikey:read': 'View API keys',
  'apikey:write': 'Create API keys',
  'apikey:revoke': 'Revoke API keys',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const DEFAULT_ROLES: Record<string, Permission[]> = {
  owner: Object.keys(PERMISSIONS) as Permission[],
  admin: [
    'build:read', 'build:write', 'build:delete', 'build:cancel',
    'template:read', 'template:write', 'template:delete', 'template:publish',
    'team:read', 'team:manage', 'team:create',
    'admin:users', 'admin:settings', 'admin:audit',
    'apikey:read', 'apikey:write', 'apikey:revoke',
  ],
  member: [
    'build:read', 'build:write', 'build:cancel',
    'template:read', 'template:write',
    'team:read',
    'apikey:read',
  ],
  viewer: [
    'build:read',
    'template:read',
    'team:read',
  ],
};

// Validate user ID format (CUID2 pattern)
const USER_ID_PATTERN = /^[a-z0-9]{20,30}$/;

const validateUserId = (userId: string | undefined): string | null => {
  if (!userId || typeof userId !== 'string') return null;
  // Allow CUID2 format or UUID format
  if (USER_ID_PATTERN.test(userId) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return userId;
  }
  return null;
};

// Get authenticated user ID from request (prefer authenticated source)
const getAuthenticatedUserId = (req: Request): string | null => {
  // Prefer user ID from authentication middleware (set by auth.ts)
  if (req.authenticatedUserId) {
    return req.authenticatedUserId;
  }

  // Fall back to header only if request is authenticated via API key
  if (req.apiKey) {
    const headerUserId = req.headers['x-user-id'] as string;
    return validateUserId(headerUserId);
  }

  return null;
};

export const getUserPermissions = async (tenantId: string, userId: string): Promise<Permission[]> => {
  const member = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });

  if (!member) return [];

  const customRole = await prisma.customRole.findFirst({
    where: { tenantId, name: member.role },
  });

  if (customRole) {
    return customRole.permissions as Permission[];
  }

  return DEFAULT_ROLES[member.role] || [];
};

export const hasPermission = async (tenantId: string, userId: string, permission: Permission): Promise<boolean> => {
  const permissions = await getUserPermissions(tenantId, userId);
  return permissions.includes(permission);
};

export const checkPermission = (permission: Permission) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantId) {
      res.status(403).json({ error: 'Tenant context required' });
      return;
    }

    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      logger.warn({ ip: req.ip }, 'Permission check failed: no valid user ID');
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const allowed = await hasPermission(req.tenantId, userId, permission);
    if (!allowed) {
      logger.warn({ tenantId: req.tenantId, userId, permission }, 'Permission denied');
      res.status(403).json({ error: `Permission denied: ${permission}` });
      return;
    }

    next();
  };
};

export const checkAnyPermission = (permissions: Permission[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantId) {
      res.status(403).json({ error: 'Tenant context required' });
      return;
    }

    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userPerms = await getUserPermissions(req.tenantId, userId);
    const hasAny = permissions.some((p) => userPerms.includes(p));

    if (!hasAny) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    next();
  };
};

export const createCustomRole = async (tenantId: string, name: string, permissions: Permission[]) => {
  // Validate permissions
  const validPerms = permissions.filter((p) => p in PERMISSIONS);
  return prisma.customRole.create({
    data: { tenantId, name, permissions: validPerms },
  });
};

export const updateCustomRole = async (roleId: string, permissions: Permission[]) => {
  const validPerms = permissions.filter((p) => p in PERMISSIONS);
  return prisma.customRole.update({
    where: { id: roleId },
    data: { permissions: validPerms },
  });
};

export const deleteCustomRole = async (roleId: string) => {
  return prisma.customRole.delete({ where: { id: roleId } });
};

export const listCustomRoles = async (tenantId: string) => {
  return prisma.customRole.findMany({ where: { tenantId } });
};
