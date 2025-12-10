import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '../utils/redis';
import { BuildJobData, BuildJobResult } from './buildQueue';
import { logger } from '../utils/logger';
import { getLimitsForTier } from '../utils/dockerLimits';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const connection = getRedisConnection();

const processBuild = async (job: Job<BuildJobData>): Promise<BuildJobResult> => {
  const { buildId, spec, tier = 'free' } = job.data;
  const log = logger.child({ buildId, jobId: job.id });

  try {
    log.info('Starting build');
    await job.updateProgress(10);

    // Update DB status
    await prisma.userBuild.update({
      where: { id: buildId },
      data: { status: 'BUILDING' },
    });

    const limits = getLimitsForTier(tier);
    log.info({ limits }, 'Using resource limits');
    await job.updateProgress(30);

    // TODO: Actual build logic here
    // This is a placeholder - integrate with existing builder
    await job.updateProgress(90);

    await prisma.userBuild.update({
      where: { id: buildId },
      data: { status: 'COMPLETED' },
    });

    log.info('Build completed');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error({ error: message }, 'Build failed');

    await prisma.userBuild.update({
      where: { id: buildId },
      data: { status: 'FAILED' },
    });

    return { success: false, error: message };
  }
};

export const buildWorker = new Worker<BuildJobData, BuildJobResult>('build-jobs', processBuild, {
  connection,
  concurrency: 2,
  limiter: { max: 5, duration: 60000 }, // 5 jobs per minute
});

buildWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Worker completed job');
});

buildWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Worker job failed');
});

export const startWorker = () => {
  logger.info('Build worker started');
  return buildWorker;
};
