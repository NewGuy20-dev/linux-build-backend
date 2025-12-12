import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface BuildMetricsData {
  buildId: string;
  distro: string;
  duration: number;
  cpuSeconds?: number;
  memoryPeakMb?: number;
  diskUsageMb?: number;
  packageCount?: number;
  cacheHitRate?: number;
  status: string;
}

export const recordBuildMetrics = async (data: BuildMetricsData) => {
  await prisma.buildMetrics.upsert({
    where: { buildId: data.buildId },
    update: data,
    create: data,
  });
};

export const getAnalyticsSummary = async (tenantId?: string, days = 30) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const metrics = await prisma.buildMetrics.findMany({
    where: { createdAt: { gte: since } },
  });

  const total = metrics.length;
  const successful = metrics.filter(m => m.status === 'COMPLETED').length;
  const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / (total || 1);
  const byDistro = metrics.reduce((acc, m) => {
    acc[m.distro] = (acc[m.distro] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    total,
    successful,
    failed: total - successful,
    successRate: total ? (successful / total * 100).toFixed(1) : 0,
    avgDuration: Math.round(avgDuration),
    byDistro,
  };
};

export const getDailyStats = async (days = 7) => {
  const stats = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const count = await prisma.buildMetrics.count({
      where: { createdAt: { gte: date, lt: nextDate } },
    });
    stats.push({ date: date.toISOString().split('T')[0], builds: count });
  }
  return stats.reverse();
};
