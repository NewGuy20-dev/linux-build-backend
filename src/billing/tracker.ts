import prisma from '../db/db';
import { logger } from '../utils/logger';

export type UsageType = 'build' | 'storage' | 'api_call' | 'compliance_check';

export interface UsageRecord {
  tenantId: string;
  type: UsageType;
  quantity: number;
  unitCost: number;
  metadata?: Record<string, any>;
}

const UNIT_COSTS: Record<UsageType, number> = {
  build: 50,
  storage: 1,
  api_call: 0,
  compliance_check: 10,
};

const MAX_DAYS = 90;

export const recordUsage = async (record: UsageRecord): Promise<void> => {
  const cost = record.unitCost ?? UNIT_COSTS[record.type] ?? 0;

  await prisma.usageRecord.create({
    data: {
      tenantId: record.tenantId,
      type: record.type,
      quantity: record.quantity,
      unitCost: cost,
      metadata: record.metadata,
    },
  });

  logger.debug({ ...record, cost }, 'Usage recorded');
};

export const recordBuildUsage = async (tenantId: string, buildId: string, durationSeconds: number): Promise<void> => {
  await recordUsage({
    tenantId,
    type: 'build',
    quantity: 1,
    unitCost: UNIT_COSTS.build,
    metadata: { buildId, durationSeconds },
  });
};

export const recordStorageUsage = async (tenantId: string, sizeMb: number): Promise<void> => {
  await recordUsage({
    tenantId,
    type: 'storage',
    quantity: sizeMb,
    unitCost: UNIT_COSTS.storage,
  });
};

export const getUsageSummary = async (tenantId: string, startDate: Date, endDate: Date) => {
  const records = await prisma.usageRecord.findMany({
    where: {
      tenantId,
      timestamp: { gte: startDate, lte: endDate },
    },
  });

  const summary: Record<UsageType, { count: number; totalCost: number }> = {
    build: { count: 0, totalCost: 0 },
    storage: { count: 0, totalCost: 0 },
    api_call: { count: 0, totalCost: 0 },
    compliance_check: { count: 0, totalCost: 0 },
  };

  for (const record of records) {
    const type = record.type as UsageType;
    summary[type].count += record.quantity;
    summary[type].totalCost += record.quantity * record.unitCost;
  }

  const totalCost = Object.values(summary).reduce((sum, s) => sum + s.totalCost, 0);

  return {
    period: { start: startDate, end: endDate },
    breakdown: summary,
    totalCost,
    totalCostFormatted: `$${(totalCost / 100).toFixed(2)}`,
  };
};

export const getMonthlyInvoice = async (tenantId: string, year: number, month: number) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const summary = await getUsageSummary(tenantId, startDate, endDate);

  return {
    tenantId,
    tenantName: tenant?.name,
    invoicePeriod: `${year}-${String(month).padStart(2, '0')}`,
    ...summary,
    status: 'pending',
  };
};

export const checkBudget = async (tenantId: string, monthlyBudgetCents: number): Promise<{ withinBudget: boolean; currentSpend: number; remaining: number }> => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);

  const summary = await getUsageSummary(tenantId, startDate, now);
  const remaining = monthlyBudgetCents - summary.totalCost;

  return {
    withinBudget: remaining >= 0,
    currentSpend: summary.totalCost,
    remaining: Math.max(0, remaining),
  };
};

// Fixed: Single query instead of N+1
export const getDailyUsage = async (tenantId: string, days = 30) => {
  // Limit days to prevent DoS
  const safeDays = Math.min(Math.max(1, days), MAX_DAYS);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - safeDays);
  startDate.setHours(0, 0, 0, 0);

  // Single query for all records in range
  const records = await prisma.usageRecord.findMany({
    where: {
      tenantId,
      timestamp: { gte: startDate },
    },
    orderBy: { timestamp: 'asc' },
  });

  // Group by date in memory
  const dailyMap = new Map<string, { builds: number; cost: number }>();

  // Initialize all days
  for (let i = 0; i < safeDays; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    dailyMap.set(key, { builds: 0, cost: 0 });
  }

  // Aggregate records
  for (const record of records) {
    const key = record.timestamp.toISOString().split('T')[0];
    const day = dailyMap.get(key);
    if (day) {
      if (record.type === 'build') day.builds += record.quantity;
      day.cost += record.quantity * record.unitCost;
    }
  }

  // Convert to array
  return Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
};
