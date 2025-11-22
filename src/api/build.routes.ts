import { Router } from 'express';
import { startBuild, getBuildStatus, getBuildArtifact } from './build.controller';

const router = Router();

router.post('/build/start', startBuild);
router.get('/build/status/:id', getBuildStatus);
router.get('/build/artifact/:id', getBuildArtifact);

export default router;
