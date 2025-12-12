import { Router, Request, Response } from 'express';
import { runComplianceCheck, getComplianceReport, listProfiles, getProfile, COMPLIANCE_PROFILES } from '../security/compliance';
import { validateBuildId } from '../utils/sanitizer';
import { rateLimit } from 'express-rate-limit';
import prisma from '../db/db';

const router = Router();

// Rate limit for compliance checks (10 per minute)
const complianceRateLimit = rateLimit({
  windowMs: 60000,
  max: 10,
  message: { error: 'Too many compliance checks, try again later' },
});

// Check build ownership
const checkBuildAccess = async (buildId: string, req: Request): Promise<{ build: any } | null> => {
  const build = await prisma.userBuild.findUnique({ where: { id: buildId } });
  if (!build) return null;

  // Tenant scoping
  if (build.tenantId && req.tenantId && build.tenantId !== req.tenantId) {
    return null;
  }

  return { build };
};

// List available compliance profiles
router.get('/compliance/profiles', (_req: Request, res: Response) => {
  const profiles = Object.entries(COMPLIANCE_PROFILES).map(([id, p]) => ({
    id,
    name: p.name,
    description: p.description,
    checkCount: p.checks.length,
  }));
  res.json({ profiles });
});

// Get profile details
router.get('/compliance/profiles/:name', (req: Request, res: Response) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9\-]/g, '');
  const profile = getProfile(name);
  if (!profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }
  res.json({
    name: profile.name,
    description: profile.description,
    checks: profile.checks.map((c) => ({ id: c.id, description: c.description })),
  });
});

// Run compliance check on a build
router.post('/compliance/check/:buildId', complianceRateLimit, async (req: Request, res: Response) => {
  const { buildId } = req.params;

  // Validate buildId format
  try {
    validateBuildId(buildId);
  } catch {
    res.status(400).json({ error: 'Invalid build ID format' });
    return;
  }

  const { profile } = req.body;
  if (!profile || !listProfiles().includes(profile)) {
    res.status(400).json({ error: 'Invalid profile', available: listProfiles() });
    return;
  }

  // Check ownership
  const access = await checkBuildAccess(buildId, req);
  if (!access) {
    res.status(404).json({ error: 'Build not found' });
    return;
  }

  try {
    const result = await runComplianceCheck(buildId, profile, access.build.spec);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Compliance check failed' });
  }
});

// Get compliance report for a build
router.get('/compliance/report/:buildId', async (req: Request, res: Response) => {
  const { buildId } = req.params;

  try {
    validateBuildId(buildId);
  } catch {
    res.status(400).json({ error: 'Invalid build ID format' });
    return;
  }

  const access = await checkBuildAccess(buildId, req);
  if (!access) {
    res.status(404).json({ error: 'Build not found' });
    return;
  }

  const reports = await getComplianceReport(buildId);
  res.json({ buildId, reports });
});

export default router;
