import { Router } from 'express';
import { startBuild, getBuildStatus, getBuildArtifact, downloadArtifact, generateFromPrompt } from './build.controller';
import { authMiddleware } from '../middleware/auth';
import { buildRateLimit, generateRateLimit, apiRateLimit } from '../middleware/rateLimit';

const router = Router();

// Public endpoints
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Protected endpoints - rate limiting BEFORE auth to prevent brute force
router.post('/build', buildRateLimit, authMiddleware, startBuild);
router.post('/build/start', buildRateLimit, authMiddleware, startBuild);
router.post('/build/generate', generateRateLimit, authMiddleware, generateFromPrompt);
router.get('/build/status/:id', apiRateLimit, authMiddleware, getBuildStatus);
router.get('/build/artifact/:id', apiRateLimit, authMiddleware, getBuildArtifact);
router.get('/build/download/:id/:type', apiRateLimit, authMiddleware, downloadArtifact);

export default router;
