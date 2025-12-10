import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || './artifacts';
const ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const ensureArtifactDir = async () => {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
};

export const getArtifactPath = (buildId: string, filename: string) =>
  path.join(ARTIFACT_DIR, buildId, filename);

export const saveArtifact = async (buildId: string, filename: string, data: Buffer) => {
  const dir = path.join(ARTIFACT_DIR, buildId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, data);
  return filePath;
};

export const getArtifact = async (buildId: string, filename: string): Promise<Buffer | null> => {
  try {
    return await fs.readFile(getArtifactPath(buildId, filename));
  } catch {
    return null;
  }
};

export const deleteArtifacts = async (buildId: string) => {
  const dir = path.join(ARTIFACT_DIR, buildId);
  await fs.rm(dir, { recursive: true, force: true });
};

export const cleanupExpiredArtifacts = async () => {
  const now = Date.now();
  let cleaned = 0;

  try {
    const entries = await fs.readdir(ARTIFACT_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

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

// Run cleanup every hour
export const startCleanupScheduler = () => {
  setInterval(cleanupExpiredArtifacts, 60 * 60 * 1000);
  logger.info('Artifact cleanup scheduler started');
};
