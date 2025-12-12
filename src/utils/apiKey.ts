import { createHash, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const PREFIX = 'lbk_'; // linux-builder-key

export const generateApiKey = (): { key: string; hash: string; prefix: string } => {
  const raw = randomBytes(32).toString('base64url');
  const key = `${PREFIX}${raw}`;
  const hash = hashApiKey(key);
  const prefix = key.slice(0, 12);
  return { key, hash, prefix };
};

export const hashApiKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex');

export const createApiKey = async (
  prisma: any,
  name: string,
  options?: { scopes?: string[]; rateLimit?: number; expiresAt?: Date }
) => {
  const { key, hash, prefix } = generateApiKey();
  
  const record = await prisma.apiKey.create({
    data: {
      name,
      keyHash: hash,
      keyPrefix: prefix,
      scopes: options?.scopes ?? ['build:read', 'build:write'],
      rateLimit: options?.rateLimit ?? 100,
      expiresAt: options?.expiresAt,
    },
  });

  return { key, id: record.id, prefix };
};

export const validateApiKey = async (
  prisma: any,
  key: string
): Promise<{ valid: boolean; scopes?: string[]; rateLimit?: number; id?: string }> => {
  if (!key.startsWith(PREFIX)) return { valid: false };

  const hash = hashApiKey(key);
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hash } });

  if (!record) return { valid: false };
  if (record.revokedAt) return { valid: false };
  if (record.expiresAt && record.expiresAt < new Date()) return { valid: false };

  // Update last used
  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return { valid: true, scopes: record.scopes, rateLimit: record.rateLimit, id: record.id };
};

export const revokeApiKey = async (prisma: any, id: string) =>
  prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
