import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { BUILD_PRESETS, listPresets, getPreset } from '../templates/presets';
import { checkRole } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

// Input validation
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_TAGS = 10;
const VALID_NAME_PATTERN = /^[a-zA-Z0-9\s\-_]+$/;

const validateTemplateInput = (body: any): { valid: boolean; error?: string } => {
  if (!body.name || typeof body.name !== 'string') return { valid: false, error: 'Name required' };
  if (body.name.length > MAX_NAME_LENGTH) return { valid: false, error: 'Name too long' };
  if (!VALID_NAME_PATTERN.test(body.name)) return { valid: false, error: 'Invalid name characters' };
  if (body.description && body.description.length > MAX_DESCRIPTION_LENGTH) return { valid: false, error: 'Description too long' };
  if (body.tags && (!Array.isArray(body.tags) || body.tags.length > MAX_TAGS)) return { valid: false, error: 'Invalid tags' };
  if (!body.spec || typeof body.spec !== 'object') return { valid: false, error: 'Spec required' };
  return { valid: true };
};

// List presets
router.get('/presets', (_req: Request, res: Response) => {
  res.json({ presets: listPresets(), details: BUILD_PRESETS });
});

// Get preset by name
router.get('/presets/:name', (req: Request, res: Response) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9\-_]/g, '');
  const preset = getPreset(name);
  if (!preset) {
    res.status(404).json({ error: 'Preset not found' });
    return;
  }
  res.json({ preset });
});

// List templates with pagination limits
router.get('/templates', async (req: Request, res: Response) => {
  const page = Math.max(1, Math.min(100, Number(req.query.page) || 1));
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
  const tag = typeof req.query.tag === 'string' ? req.query.tag.slice(0, 50) : undefined;
  
  const where: any = { isPublic: true };
  if (tag) where.tags = { has: tag };
  if (req.tenantId) where.OR = [{ isPublic: true }, { tenantId: req.tenantId }];

  const templates = await prisma.buildTemplate.findMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { downloads: 'desc' },
    select: { id: true, name: true, description: true, tags: true, rating: true, downloads: true, isPublic: true, createdAt: true },
  });
  res.json({ templates, page, limit });
});

// Get template by ID
router.get('/templates/:id', async (req: Request, res: Response) => {
  const id = req.params.id.slice(0, 30);
  const template = await prisma.buildTemplate.findUnique({ where: { id } });
  if (!template || (!template.isPublic && template.tenantId !== req.tenantId)) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json({ template });
});

// Create template
router.post('/templates', checkRole('member'), async (req: Request, res: Response) => {
  const validation = validateTemplateInput(req.body);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const { name, description, spec, tags, isPublic } = req.body;
  const userId = req.headers['x-user-id'] as string;

  const template = await prisma.buildTemplate.create({
    data: {
      name: name.slice(0, MAX_NAME_LENGTH),
      description: description?.slice(0, MAX_DESCRIPTION_LENGTH),
      spec,
      tags: (tags || []).slice(0, MAX_TAGS).map((t: string) => t.slice(0, 50)),
      isPublic: isPublic === true,
      authorId: userId,
      tenantId: req.tenantId,
    },
  });
  res.status(201).json({ template });
});

// Fork template
router.post('/templates/:id/fork', checkRole('member'), async (req: Request, res: Response) => {
  const id = req.params.id.slice(0, 30);
  const parent = await prisma.buildTemplate.findUnique({ where: { id } });
  if (!parent || (!parent.isPublic && parent.tenantId !== req.tenantId)) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const userId = req.headers['x-user-id'] as string;
  const forked = await prisma.buildTemplate.create({
    data: {
      name: `${parent.name} (fork)`.slice(0, MAX_NAME_LENGTH),
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

// Add review with validation
router.post('/templates/:id/reviews', checkRole('member'), async (req: Request, res: Response) => {
  const { rating, comment } = req.body;
  
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Rating must be 1-5' });
    return;
  }

  const userId = req.headers['x-user-id'] as string;
  const templateId = req.params.id.slice(0, 30);

  const review = await prisma.templateReview.upsert({
    where: { templateId_userId: { templateId, userId } },
    update: { rating, comment: comment?.slice(0, 500) },
    create: { templateId, userId, rating, comment: comment?.slice(0, 500) },
  });

  const reviews = await prisma.templateReview.findMany({ where: { templateId } });
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  await prisma.buildTemplate.update({ where: { id: templateId }, data: { rating: avgRating } });

  res.json({ review });
});

export default router;
