import { Router, Request, Response } from 'express';
import { getUsageSummary, getMonthlyInvoice, getDailyUsage, checkBudget } from '../billing/tracker';
import { checkPermission } from '../middleware/customRoles';

const router = Router();

// Get current month usage summary
router.get('/billing/usage', checkPermission('admin:billing'), async (req: Request, res: Response) => {
  if (!req.tenantId) {
    res.status(403).json({ error: 'Tenant required' });
    return;
  }

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);

  const summary = await getUsageSummary(req.tenantId, startDate, now);
  res.json(summary);
});

// Get monthly invoice
router.get('/billing/invoice/:year/:month', checkPermission('admin:billing'), async (req: Request, res: Response) => {
  if (!req.tenantId) {
    res.status(403).json({ error: 'Tenant required' });
    return;
  }

  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'Invalid year or month' });
    return;
  }

  const invoice = await getMonthlyInvoice(req.tenantId, year, month);
  res.json(invoice);
});

// Get daily usage for charts
router.get('/billing/daily', checkPermission('admin:billing'), async (req: Request, res: Response) => {
  if (!req.tenantId) {
    res.status(403).json({ error: 'Tenant required' });
    return;
  }

  const days = Math.min(90, parseInt(req.query.days as string, 10) || 30);
  const usage = await getDailyUsage(req.tenantId, days);
  res.json({ usage });
});

// Check budget status
router.get('/billing/budget', checkPermission('admin:billing'), async (req: Request, res: Response) => {
  if (!req.tenantId) {
    res.status(403).json({ error: 'Tenant required' });
    return;
  }

  const budget = parseInt(req.query.budget as string, 10) || 10000; // Default $100
  const status = await checkBudget(req.tenantId, budget);
  res.json({
    ...status,
    budgetFormatted: `$${(budget / 100).toFixed(2)}`,
    currentSpendFormatted: `$${(status.currentSpend / 100).toFixed(2)}`,
    remainingFormatted: `$${(status.remaining / 100).toFixed(2)}`,
  });
});

export default router;
