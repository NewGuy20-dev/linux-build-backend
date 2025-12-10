import { Queue, QueueEvents } from 'bullmq';
import { getRedisConnection } from '../utils/redis';
import { BuildSpec } from '../ai/schema';
import { logger } from '../utils/logger';

export interface BuildJobData {
  buildId: string;
  spec: BuildSpec;
  apiKeyHash?: string;
  tier?: 'free' | 'standard' | 'premium';
}

export interface BuildJobResult {
  success: boolean;
  artifactUrl?: string;
  error?: string;
}

const connection = getRedisConnection();

export const buildQueue = new Queue<BuildJobData, BuildJobResult>('build-jobs', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export const buildQueueEvents = new QueueEvents('build-jobs', { connection });

buildQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.info({ jobId, result: returnvalue }, 'Build job completed');
});

buildQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error({ jobId, reason: failedReason }, 'Build job failed');
});

export const addBuildJob = async (data: BuildJobData, priority = 0) => {
  const job = await buildQueue.add('build', data, { priority, jobId: data.buildId });
  logger.info({ jobId: job.id, buildId: data.buildId }, 'Build job queued');
  return job;
};

export const getBuildJobStatus = async (buildId: string) => {
  const job = await buildQueue.getJob(buildId);
  if (!job) return null;
  const state = await job.getState();
  return { state, progress: job.progress, data: job.data };
};
