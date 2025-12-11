import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { redis } from '../utils/redis';
import { getMetrics, getContentType } from '../utils/metrics';
import { apiRateLimit } from '../middleware/rateLimit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();
const prisma = new PrismaClient();

interface HealthCheck {
  status: 'ok' | 'error';
  latency?: number;
  message?: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Record<string, HealthCheck>;
}

const checkDatabase = async (): Promise<HealthCheck> => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latency: Date.now() - start };
  } catch (e) {
    return { status: 'error', message: 'Database connection failed' };
  }
};

const checkRedis = async (): Promise<HealthCheck> => {
  try {
    const start = Date.now();
    await redis.ping();
    return { status: 'ok', latency: Date.now() - start };
  } catch {
    return { status: 'error', message: 'Redis connection failed' };
  }
};

const checkDocker = async (): Promise<HealthCheck> => {
  try {
    const start = Date.now();
    await execAsync('docker info --format "{{.ServerVersion}}"', { timeout: 5000 });
    return { status: 'ok', latency: Date.now() - start };
  } catch {
    return { status: 'error', message: 'Docker daemon not available' };
  }
};

// Rate limited health check
router.get('/health', apiRateLimit, async (_req: Request, res: Response) => {
  const [database, redisCheck] = await Promise.all([checkDatabase(), checkRedis()]);

  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: { database, redis: redisCheck },
  };

  if (database.status === 'error') health.status = 'unhealthy';
  if (redisCheck.status === 'error' && health.status === 'healthy') health.status = 'degraded';

  res.status(health.status === 'unhealthy' ? 503 : 200).json(health);
});

// Detailed health check with all dependencies
router.get('/health/detailed', apiRateLimit, async (_req: Request, res: Response) => {
  const [database, redisCheck, docker] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkDocker(),
  ]);

  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: { database, redis: redisCheck, docker },
  };

  const errors = Object.values(health.checks).filter(c => c.status === 'error');
  if (errors.length > 0) {
    health.status = errors.some(e => e.message?.includes('Database')) ? 'unhealthy' : 'degraded';
  }

  res.status(health.status === 'unhealthy' ? 503 : 200).json(health);
});

// Lightweight liveness probe - no rate limit needed
router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness probe with rate limit
router.get('/health/ready', apiRateLimit, async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

// Metrics endpoint with rate limit
router.get('/metrics', apiRateLimit, async (_req: Request, res: Response) => {
  res.set('Content-Type', getContentType());
  res.send(await getMetrics());
});

export default router;
