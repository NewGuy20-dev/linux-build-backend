import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db';
import { logger } from '../utils/logger';

// Permission definitions
export const PERMISSIONS = {
  // Build permissions
  'build:read': 'View builds',
  'build:write': 'Create builds',
  'build:delete': 'Delete builds',
  'build:cancel': 'Cancel builds',

  // Template permissions
  'template:read': 'View templates',
  'template:write': 'Create/edit templates',
  'template:delete': 'Delete templates',
  'template:publish': 'Publish templates',

  // Team permissions
  'team:read': 'View teams',
  'team:manage': 'Manage team members',
  'team:create': 'Create teams',
  'team:delete': 'Delete teams',

  // Admin permissions
  'admin:users': 'Manage users',
  'admin:billing': 'View/manage billing',
  'admin:settings': 'Manage tenant settings',
  'admin:audit': 'View audit logs',

  // API key permissions
  'apikey:read': 'View API keys',
  'apikey:write': 'Create API keys',
  'apikey:revoke': 'Revoke API keys',
} as const;

export type Permission = keyof typeof PERMISSIONS;

// Default role permissions
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

// Get user permissions (from custom role or default)
export const getUserPermissions = async (tenantId: string, userId: string): Promise<Permission[]> => {
  const member = await prisma.tenantMember.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });

  if (!member) return [];

  // Check for custom role first
  const customRole = await prisma.customRole.findFirst({
    where: { tenantId, name: member.role },
  });

  if (customRole) {
    return customRole.permissions as Permission[];
  }

  // Fall back to default role
  return DEFAULT_ROLES[member.role] || [];
};

// Check if user has specific permission
export const hasPermission = async (tenantId: string, userId: string, permission: Permission): Promise<boolean> => {
  const permissions = await getUserPermissions(tenantId, userId);
  return permissions.includes(permission);
};

// Middleware to check permission
export const checkPermission = (permission: Permission) => {
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

    const allowed = await hasPermission(req.tenantId, userId, permission);
    if (!allowed) {
      logger.warn({ tenantId: req.tenantId, userId, permission }, 'Permission denied');
      res.status(403).json({ error: `Permission denied: ${permission}` });
      return;
    }

    next();
  };
};

// Check multiple permissions (any)
export const checkAnyPermission = (permissions: Permission[]) => {
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

    const userPerms = await getUserPermissions(req.tenantId, userId);
    const hasAny = permissions.some((p) => userPerms.includes(p));

    if (!hasAny) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    next();
  };
};

// CRUD for custom roles
export const createCustomRole = async (tenantId: string, name: string, permissions: Permission[]) => {
  return prisma.customRole.create({
    data: { tenantId, name, permissions },
  });
};

export const updateCustomRole = async (roleId: string, permissions: Permission[]) => {
  return prisma.customRole.update({
    where: { id: roleId },
    data: { permissions },
  });
};

export const deleteCustomRole = async (roleId: string) => {
  return prisma.customRole.delete({ where: { id: roleId } });
};

export const listCustomRoles = async (tenantId: string) => {
  return prisma.customRole.findMany({ where: { tenantId } });
};
