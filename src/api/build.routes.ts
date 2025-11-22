import { Router } from 'express';
import { startBuild, getBuildStatus, getBuildArtifact, launchGui, stopGui } from './build.controller';

const router = Router();

router.post('/build/start', startBuild);
router.get('/build/status/:id', getBuildStatus);
router.get('/build/artifact/:id', getBuildArtifact);
router.post('/builds/:id/launch-gui', launchGui);
router.post('/builds/gui/:sessionId/stop', stopGui);

export default router;
