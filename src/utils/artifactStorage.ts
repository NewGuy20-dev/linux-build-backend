import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger';
import { validatePathWithinDir } from './sanitizer';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || './artifacts';
const ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const BUILD_ID_PATTERN = /^[a-z0-9]{20,30}$/;

export const ensureArtifactDir = async () => {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
};

export const getArtifactPath = (buildId: string, filename: string): string => {
  // Validate buildId format
  if (!BUILD_ID_PATTERN.test(buildId)) {
    throw new Error('Invalid build ID format');
  }
  // Sanitize filename - remove path separators and null bytes
  const safeFilename = path.basename(filename).replace(/\0/g, '');
  if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
    throw new Error('Invalid filename');
  }
  const fullPath = path.join(ARTIFACT_DIR, buildId, safeFilename);
  return validatePathWithinDir(fullPath, ARTIFACT_DIR);
};

export const saveArtifact = async (buildId: string, filename: string, data: Buffer) => {
  const filePath = getArtifactPath(buildId, filename);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, data);
  return filePath;
};

export const getArtifact = async (buildId: string, filename: string): Promise<Buffer | null> => {
  try {
    const filePath = getArtifactPath(buildId, filename);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
};

export const deleteArtifacts = async (buildId: string) => {
  if (!BUILD_ID_PATTERN.test(buildId)) {
    throw new Error('Invalid build ID format');
  }
  const dir = path.join(ARTIFACT_DIR, buildId);
  const safePath = validatePathWithinDir(dir, ARTIFACT_DIR);
  await fs.rm(safePath, { recursive: true, force: true });
};

export const cleanupExpiredArtifacts = async () => {
  const now = Date.now();
  let cleaned = 0;

  try {
    const entries = await fs.readdir(ARTIFACT_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!BUILD_ID_PATTERN.test(entry.name)) continue; // Skip invalid dirs

      const dirPath = path.join(ARTIFACT_DIR, entry.name);
      const stat = await fs.stat(dirPath);

      if (now - stat.mtimeMs > ARTIFACT_TTL_MS) {
        await fs.rm(dirPath, { recursive: true, force: true });
        cleaned++;
      }
    }

    logger.info({ cleaned }, 'Artifact cleanup completed');
  } catch (err) {
    logger.error({ err }, 'Artifact cleanup failed');
  }

  return cleaned;
};

export const startCleanupScheduler = () => {
  setInterval(cleanupExpiredArtifacts, 60 * 60 * 1000);
  logger.info('Artifact cleanup scheduler started');
};
