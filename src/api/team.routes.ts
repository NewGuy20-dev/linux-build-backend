import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { checkRole } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

// List teams
router.get('/teams', async (req: Request, res: Response) => {
  if (!req.tenantId) {
    res.status(403).json({ error: 'Tenant required' });
    return;
  }
  const teams = await prisma.team.findMany({ where: { tenantId: req.tenantId }, include: { members: true } });
  res.json({ teams });
});

// Create team
router.post('/teams', checkRole('admin'), async (req: Request, res: Response) => {
  const { name, slug } = req.body;
  const team = await prisma.team.create({ data: { name, slug, tenantId: req.tenantId! } });
  res.status(201).json({ team });
});

// Add member to team
router.post('/teams/:id/members', checkRole('admin'), async (req: Request, res: Response) => {
  const { userId, role = 'viewer' } = req.body;
  const member = await prisma.teamMember.create({ data: { teamId: req.params.id, userId, role } });
  res.status(201).json({ member });
});

// Remove member
router.delete('/teams/:id/members/:userId', checkRole('admin'), async (req: Request, res: Response) => {
  await prisma.teamMember.delete({ where: { teamId_userId: { teamId: req.params.id, userId: req.params.userId } } });
  res.json({ success: true });
});

// Request build approval
router.post('/builds/:buildId/approval', checkRole('member'), async (req: Request, res: Response) => {
  const { teamId } = req.body;
  const approval = await prisma.buildApproval.create({ data: { buildId: req.params.buildId, teamId } });
  res.status(201).json({ approval });
});

// Approve/reject build
router.patch('/approvals/:id', checkRole('admin'), async (req: Request, res: Response) => {
  const { status, comment } = req.body;
  const userId = req.headers['x-user-id'] as string;
  const approval = await prisma.buildApproval.update({
    where: { id: req.params.id },
    data: { status, comment, reviewerId: userId },
  });
  res.json({ approval });
});

export default router;
