import { Router } from 'express';
import { startBuild, getBuildStatus, getBuildArtifact } from './build.controller';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.post('/build', startBuild);
router.post('/build/start', startBuild);
router.get('/build/status/:id', getBuildStatus);
router.get('/build/artifact/:id', getBuildArtifact);

export default router;
