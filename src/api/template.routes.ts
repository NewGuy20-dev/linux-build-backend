import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { BUILD_PRESETS, listPresets, getPreset } from '../templates/presets';
import { checkRole } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

// List presets
router.get('/presets', (_req: Request, res: Response) => {
  res.json({ presets: listPresets(), details: BUILD_PRESETS });
});

// Get preset by name
router.get('/presets/:name', (req: Request, res: Response) => {
  const preset = getPreset(req.params.name);
  if (!preset) {
    res.status(404).json({ error: 'Preset not found' });
    return;
  }
  res.json({ preset });
});

// List templates
router.get('/templates', async (req: Request, res: Response) => {
  const { page = 1, limit = 20, tag } = req.query;
  const where: any = { isPublic: true };
  if (tag) where.tags = { has: tag as string };
  if (req.tenantId) where.OR = [{ isPublic: true }, { tenantId: req.tenantId }];

  const templates = await prisma.buildTemplate.findMany({
    where,
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    orderBy: { downloads: 'desc' },
  });
  res.json({ templates });
});

// Get template by ID
router.get('/templates/:id', async (req: Request, res: Response) => {
  const template = await prisma.buildTemplate.findUnique({ where: { id: req.params.id } });
  if (!template || (!template.isPublic && template.tenantId !== req.tenantId)) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json({ template });
});

// Create template
router.post('/templates', checkRole('member'), async (req: Request, res: Response) => {
  const { name, description, spec, tags, isPublic } = req.body;
  const userId = req.headers['x-user-id'] as string;

  const template = await prisma.buildTemplate.create({
    data: { name, description, spec, tags: tags || [], isPublic: isPublic || false, authorId: userId, tenantId: req.tenantId },
  });
  res.status(201).json({ template });
});

// Fork template
router.post('/templates/:id/fork', checkRole('member'), async (req: Request, res: Response) => {
  const parent = await prisma.buildTemplate.findUnique({ where: { id: req.params.id } });
  if (!parent) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const userId = req.headers['x-user-id'] as string;
  const forked = await prisma.buildTemplate.create({
    data: {
      name: `${parent.name} (fork)`,
      description: parent.description,
      spec: parent.spec as any,
      tags: parent.tags,
      authorId: userId,
      parentId: parent.id,
      tenantId: req.tenantId,
    },
  });

  await prisma.buildTemplate.update({ where: { id: parent.id }, data: { downloads: { increment: 1 } } });
  res.status(201).json({ template: forked });
});

// Add review
router.post('/templates/:id/reviews', checkRole('member'), async (req: Request, res: Response) => {
  const { rating, comment } = req.body;
  const userId = req.headers['x-user-id'] as string;

  const review = await prisma.templateReview.upsert({
    where: { templateId_userId: { templateId: req.params.id, userId } },
    update: { rating, comment },
    create: { templateId: req.params.id, userId, rating, comment },
  });

  // Update average rating
  const reviews = await prisma.templateReview.findMany({ where: { templateId: req.params.id } });
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  await prisma.buildTemplate.update({ where: { id: req.params.id }, data: { rating: avgRating } });

  res.json({ review });
});

export default router;
