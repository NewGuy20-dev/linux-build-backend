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

// Unit costs (in cents)
const UNIT_COSTS: Record<UsageType, number> = {
  build: 50,           // $0.50 per build
  storage: 1,          // $0.01 per MB per month
  api_call: 0,         // Free (included)
  compliance_check: 10, // $0.10 per check
};

// Record usage
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

// Record build usage
export const recordBuildUsage = async (tenantId: string, buildId: string, durationSeconds: number): Promise<void> => {
  await recordUsage({
    tenantId,
    type: 'build',
    quantity: 1,
    unitCost: UNIT_COSTS.build,
    metadata: { buildId, durationSeconds },
  });
};

// Record storage usage
export const recordStorageUsage = async (tenantId: string, sizeMb: number): Promise<void> => {
  await recordUsage({
    tenantId,
    type: 'storage',
    quantity: sizeMb,
    unitCost: UNIT_COSTS.storage,
  });
};

// Get usage summary for a tenant
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

// Get monthly invoice data
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
    status: 'pending', // Would integrate with payment system
  };
};

// Check if tenant is within budget
export const checkBudget = async (tenantId: string, monthlyBudgetCents: number): Promise<{ withinBudget: boolean; currentSpend: number; remaining: number }> => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = now;

  const summary = await getUsageSummary(tenantId, startDate, endDate);
  const remaining = monthlyBudgetCents - summary.totalCost;

  return {
    withinBudget: remaining >= 0,
    currentSpend: summary.totalCost,
    remaining: Math.max(0, remaining),
  };
};

// Get daily usage for charts
export const getDailyUsage = async (tenantId: string, days = 30) => {
  const result: Array<{ date: string; builds: number; cost: number }> = [];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const records = await prisma.usageRecord.findMany({
      where: {
        tenantId,
        timestamp: { gte: date, lt: nextDate },
      },
    });

    const builds = records.filter((r) => r.type === 'build').reduce((sum, r) => sum + r.quantity, 0);
    const cost = records.reduce((sum, r) => sum + r.quantity * r.unitCost, 0);

    result.push({
      date: date.toISOString().split('T')[0],
      builds,
      cost,
    });
  }

  return result.reverse();
};
