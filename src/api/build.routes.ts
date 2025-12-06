import { Router } from 'express';
import { startBuild, getBuildStatus, getBuildArtifact, downloadArtifact } from './build.controller';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.post('/build', startBuild);
router.post('/build/start', startBuild);
router.get('/build/status/:id', getBuildStatus);
router.get('/build/artifact/:id', getBuildArtifact);
router.get('/build/download/:id/:type', downloadArtifact);

export default router;
