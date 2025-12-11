import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

const prisma = new PrismaClient();
const ARTIFACTS_DIR = path.resolve('artifacts');

// Cleanup stale builds and artifacts
export const runCleanup = async () => {
  const job = await prisma.maintenanceJob.create({ data: { type: 'cleanup', status: 'running', startedAt: new Date() } });

  try {
    // Delete builds older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.userBuild.deleteMany({ where: { createdAt: { lt: cutoff }, status: { in: ['COMPLETED', 'FAILED'] } } });

    // Clean orphaned artifact files
    let filesDeleted = 0;
    try {
      const files = await fs.readdir(ARTIFACTS_DIR);
      for (const file of files) {
        const stat = await fs.stat(path.join(ARTIFACTS_DIR, file));
        if (stat.mtimeMs < cutoff.getTime()) {
          await fs.unlink(path.join(ARTIFACTS_DIR, file));
          filesDeleted++;
        }
      }
    } catch { /* artifacts dir may not exist */ }

    await prisma.maintenanceJob.update({
      where: { id: job.id },
      data: { status: 'completed', completedAt: new Date(), result: { buildsDeleted: deleted.count, filesDeleted } },
    });

    logger.info({ buildsDeleted: deleted.count, filesDeleted }, 'Cleanup completed');
  } catch (e) {
    await prisma.maintenanceJob.update({ where: { id: job.id }, data: { status: 'failed', error: String(e) } });
    logger.error({ error: e }, 'Cleanup failed');
  }
};

// Health check
export const runHealthCheck = async () => {
  const job = await prisma.maintenanceJob.create({ data: { type: 'healthcheck', status: 'running', startedAt: new Date() } });

  const checks: Record<string, boolean> = {};

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  // Disk space check
  try {
    const stat = await fs.statfs(ARTIFACTS_DIR);
    checks.diskSpace = stat.bavail * stat.bsize > 1e9; // > 1GB free
  } catch {
    checks.diskSpace = true; // Assume OK if can't check
  }

  const healthy = Object.values(checks).every(Boolean);
  await prisma.maintenanceJob.update({
    where: { id: job.id },
    data: { status: healthy ? 'completed' : 'failed', completedAt: new Date(), result: checks },
  });

  return { healthy, checks };
};

// Reset monthly usage counters
export const resetMonthlyUsage = async () => {
  const job = await prisma.maintenanceJob.create({ data: { type: 'usage_reset', status: 'running', startedAt: new Date() } });

  try {
    await prisma.tenant.updateMany({ data: { currentUsage: { builds: 0, storageMb: 0 } } });
    await prisma.maintenanceJob.update({ where: { id: job.id }, data: { status: 'completed', completedAt: new Date() } });
    logger.info('Monthly usage reset completed');
  } catch (e) {
    await prisma.maintenanceJob.update({ where: { id: job.id }, data: { status: 'failed', error: String(e) } });
  }
};

// Schedule jobs (call from index.ts)
export const startMaintenanceScheduler = () => {
  // Daily cleanup at 3 AM
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() === 0) runCleanup();
  }, 60000);

  // Hourly health check
  setInterval(runHealthCheck, 3600000);

  // Monthly usage reset on 1st
  setInterval(() => {
    const now = new Date();
    if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() === 0) resetMonthlyUsage();
  }, 60000);

  logger.info('Maintenance scheduler started');
};
