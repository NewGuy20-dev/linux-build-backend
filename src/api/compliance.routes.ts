import { Router, Request, Response } from 'express';
import { runComplianceCheck, getComplianceReport, listProfiles, getProfile, COMPLIANCE_PROFILES } from '../security/compliance';
import prisma from '../db/db';

const router = Router();

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
  const profile = getProfile(req.params.name);
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
router.post('/compliance/check/:buildId', async (req: Request, res: Response) => {
  const { buildId } = req.params;
  const { profile } = req.body;

  if (!profile || !listProfiles().includes(profile)) {
    res.status(400).json({ error: 'Invalid profile', available: listProfiles() });
    return;
  }

  const build = await prisma.userBuild.findUnique({ where: { id: buildId } });
  if (!build) {
    res.status(404).json({ error: 'Build not found' });
    return;
  }

  try {
    const result = await runComplianceCheck(buildId, profile, build.spec);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Compliance check failed' });
  }
});

// Get compliance report for a build
router.get('/compliance/report/:buildId', async (req: Request, res: Response) => {
  const { buildId } = req.params;
  
  const build = await prisma.userBuild.findUnique({ where: { id: buildId } });
  if (!build) {
    res.status(404).json({ error: 'Build not found' });
    return;
  }

  const reports = await getComplianceReport(buildId);
  res.json({ buildId, reports });
});

export default router;
