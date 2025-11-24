import { Router } from 'express';
import { createBuild, getBuild, getBuildLogs, launchGui } from './build.controller';

const router = Router();

router.post('/build', createBuild);
router.get('/build/:id', getBuild);
router.get('/build/:id/logs', getBuildLogs);
router.post('/build/:id/launch-gui', launchGui);

export default router;
