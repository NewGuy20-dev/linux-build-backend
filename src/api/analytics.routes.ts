import { Router, Request, Response } from 'express';
import { getAnalyticsSummary, getDailyStats } from '../analytics/collector';
import { checkRole } from '../middleware/rbac';

const router = Router();

router.get('/analytics/summary', checkRole('viewer'), async (req: Request, res: Response) => {
  const days = Number(req.query.days) || 30;
  const summary = await getAnalyticsSummary(req.tenantId, days);
  res.json(summary);
});

router.get('/analytics/daily', checkRole('viewer'), async (req: Request, res: Response) => {
  const days = Number(req.query.days) || 7;
  const stats = await getDailyStats(days);
  res.json({ stats });
});

export default router;
