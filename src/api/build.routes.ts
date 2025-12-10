import { Router } from 'express';
import { startBuild, getBuildStatus, getBuildArtifact, downloadArtifact, generateFromPrompt } from './build.controller';
import { authMiddleware } from '../middleware/auth';
import { buildRateLimit, generateRateLimit, apiRateLimit } from '../middleware/rateLimit';

const router = Router();

// Public endpoints
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Protected endpoints with rate limiting
router.post('/build', authMiddleware, buildRateLimit, startBuild);
router.post('/build/start', authMiddleware, buildRateLimit, startBuild);
router.post('/build/generate', authMiddleware, generateRateLimit, generateFromPrompt);
router.get('/build/status/:id', authMiddleware, apiRateLimit, getBuildStatus);
router.get('/build/artifact/:id', authMiddleware, apiRateLimit, getBuildArtifact);
router.get('/build/download/:id/:type', authMiddleware, apiRateLimit, downloadArtifact);

export default router;
