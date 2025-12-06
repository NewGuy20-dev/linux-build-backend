import * as fs from 'fs/promises';
import * as path from 'path';

const ARTIFACTS_DIR = path.resolve('artifacts');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export const cleanupOldArtifacts = async () => {
  try {
    const entries = await fs.readdir(ARTIFACTS_DIR, { withFileTypes: true });
    const now = Date.now();
    let cleanedCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirPath = path.join(ARTIFACTS_DIR, entry.name);
      const stats = await fs.stat(dirPath);
      const ageMs = now - stats.mtimeMs;

      if (ageMs > MAX_AGE_MS) {
        await fs.rm(dirPath, { recursive: true, force: true });
        console.log(`[Cleanup] Deleted old artifact: ${entry.name} (age: ${Math.round(ageMs / 3600000)}h)`);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[Cleanup] Removed ${cleanedCount} artifact(s) older than 24 hours`);
    }
  } catch (error) {
    console.error('[Cleanup] Error cleaning up artifacts:', error);
  }
};

export const startArtifactCleanupJob = () => {
  const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run every hour
  
  console.log('[Cleanup] Artifact cleanup job started (runs every hour, deletes artifacts older than 24h)');
  
  cleanupOldArtifacts();
  
  setInterval(cleanupOldArtifacts, CLEANUP_INTERVAL_MS);
};
