import { Queue, QueueEvents } from 'bullmq';
import { getRedisConnection } from '../utils/redis';
import { BuildSpec } from '../ai/schema';
import { logger } from '../utils/logger';

export interface BuildJobData {
  buildId: string;
  spec: BuildSpec;
  apiKeyHash?: string;
  tier?: 'free' | 'standard' | 'premium';
  tenantId?: string;
}

export interface BuildJobResult {
  success: boolean;
  artifactUrl?: string;
  error?: string;
  duration?: number;
}

// Priority levels by tier
const TIER_PRIORITY: Record<string, number> = {
  premium: 1,
  standard: 5,
  free: 10,
};

// Max concurrent builds per user
const MAX_CONCURRENT_PER_USER = 2;

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

// Dead letter queue for failed jobs
export const deadLetterQueue = new Queue<BuildJobData>('build-jobs-dlq', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
  },
});

export const buildQueueEvents = new QueueEvents('build-jobs', { connection });

buildQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.info({ jobId, result: returnvalue }, 'Build job completed');
});

buildQueueEvents.on('failed', async ({ jobId, failedReason }) => {
  logger.error({ jobId, reason: failedReason }, 'Build job failed');
  
  // Move to DLQ after max retries
  const job = await buildQueue.getJob(jobId);
  if (job && job.attemptsMade >= 3) {
    await deadLetterQueue.add('failed-build', job.data, { jobId: `dlq-${jobId}` });
    logger.warn({ jobId }, 'Job moved to dead letter queue');
  }
});

// Check if user has reached concurrent build limit
const checkUserConcurrency = async (apiKeyHash?: string): Promise<boolean> => {
  if (!apiKeyHash) return true;
  
  const activeJobs = await buildQueue.getJobs(['active', 'waiting']);
  const userJobs = activeJobs.filter(j => j.data.apiKeyHash === apiKeyHash);
  return userJobs.length < MAX_CONCURRENT_PER_USER;
};

export const addBuildJob = async (data: BuildJobData) => {
  // Check per-user concurrency
  if (!await checkUserConcurrency(data.apiKeyHash)) {
    throw new Error(`Maximum concurrent builds (${MAX_CONCURRENT_PER_USER}) reached`);
  }
  
  // Set priority based on tier
  const priority = TIER_PRIORITY[data.tier || 'free'] || 10;
  
  const job = await buildQueue.add('build', data, { 
    priority, 
    jobId: data.buildId,
  });
  
  logger.info({ jobId: job.id, buildId: data.buildId, priority, tier: data.tier }, 'Build job queued');
  return job;
};

export const getBuildJobStatus = async (buildId: string) => {
  const job = await buildQueue.getJob(buildId);
  if (!job) return null;
  const state = await job.getState();
  return { state, progress: job.progress, data: job.data };
};

export const getQueueStats = async () => {
  const [waiting, active, completed, failed] = await Promise.all([
    buildQueue.getWaitingCount(),
    buildQueue.getActiveCount(),
    buildQueue.getCompletedCount(),
    buildQueue.getFailedCount(),
  ]);
  return { waiting, active, completed, failed };
};
