import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { redis } from '../utils/redis';
import { getMetrics, getContentType } from '../utils/metrics';
import { apiRateLimit } from '../middleware/rateLimit';

const router = Router();
const prisma = new PrismaClient();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Record<string, { status: string; latency?: number }>;
}

// Rate limited health check
router.get('/health', apiRateLimit, async (_req: Request, res: Response) => {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // Database check
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = { status: 'ok', latency: Date.now() - start };
  } catch {
    health.checks.database = { status: 'error' };
    health.status = 'unhealthy';
  }

  // Redis check
  try {
    const start = Date.now();
    await redis.ping();
    health.checks.redis = { status: 'ok', latency: Date.now() - start };
  } catch {
    health.checks.redis = { status: 'error' };
    health.status = health.status === 'healthy' ? 'degraded' : health.status;
  }

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
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
