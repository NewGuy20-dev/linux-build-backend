import { Router } from 'express';
import { startBuild, getBuildStatus, getBuildArtifact, downloadArtifact, generateFromPrompt } from './build.controller';
import { authMiddleware } from '../middleware/auth';
import { buildRateLimit, generateRateLimit, apiRateLimit } from '../middleware/rateLimit';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * @openapi
 * /build:
 *   post:
 *     summary: Start a new build
 *     tags: [Build]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               base:
 *                 type: string
 *                 enum: [arch, debian, ubuntu, alpine, fedora]
 *               packages:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       202:
 *         description: Build started
 *       400:
 *         description: Invalid request
 */
router.post('/build', buildRateLimit, authMiddleware, startBuild);
router.post('/build/start', buildRateLimit, authMiddleware, startBuild);

/**
 * @openapi
 * /build/generate:
 *   post:
 *     summary: Generate build spec from natural language
 *     tags: [Build]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *     responses:
 *       200:
 *         description: Generated build spec
 */
router.post('/build/generate', generateRateLimit, authMiddleware, generateFromPrompt);

/**
 * @openapi
 * /build/status/{id}:
 *   get:
 *     summary: Get build status
 *     tags: [Build]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Build status
 *       404:
 *         description: Build not found
 */
router.get('/build/status/:id', apiRateLimit, authMiddleware, getBuildStatus);

/**
 * @openapi
 * /build/artifact/{id}:
 *   get:
 *     summary: Get build artifact info
 *     tags: [Build]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Artifact info
 */
router.get('/build/artifact/:id', apiRateLimit, authMiddleware, getBuildArtifact);

/**
 * @openapi
 * /build/download/{id}/{type}:
 *   get:
 *     summary: Download build artifact
 *     tags: [Build]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [iso, dockerfile, script]
 *     responses:
 *       200:
 *         description: Artifact file
 */
router.get('/build/download/:id/:type', apiRateLimit, authMiddleware, downloadArtifact);

export default router;
