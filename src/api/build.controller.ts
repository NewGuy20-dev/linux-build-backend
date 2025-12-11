import { Request, Response } from 'express';
import { buildSchema, BuildSpec } from '../ai/schema';
import { runBuildLifecycle } from '../executor/lifecycle';
import { generateId } from '../utils/id';
import prisma from '../db/db';
import { normalizePackages } from '../utils/packages';
import { generateBuildSpec } from '../ai/ollama';
import { validatePathWithinDir, maskSensitiveData } from '../utils/sanitizer';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = path.resolve('artifacts');

// Generate owner key from API key (preferred) or IP (deprecated fallback)
const getOwnerKey = (req: Request): string | null => {
  if (req.apiKey) {
    return crypto.createHash('sha256').update(req.apiKey).digest('hex').slice(0, 32);
  }
  // Deprecated: IP-based ownership - log warning
  logger.warn({ ip: req.ip }, 'IP-based ownership is deprecated - use API key authentication');
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
};

// Check if requester owns the build (with tenant scoping and audit logging)
const checkBuildOwnership = async (buildId: string, req: Request): Promise<boolean> => {
  const build = await prisma.userBuild.findUnique({
    where: { id: buildId },
    select: { ownerKey: true, tenantId: true },
  });
  if (!build) return false;
  
  // Tenant scoping: if build has tenant, requester must be in same tenant
  if (build.tenantId && req.tenantId && build.tenantId !== req.tenantId) {
    logger.warn({ buildId, requestTenant: req.tenantId, buildTenant: build.tenantId }, 'Tenant mismatch - access denied');
    return false;
  }
  
  // Allow access if no owner set (legacy builds) or owner matches
  if (!build.ownerKey) return true;
  const ownerKey = getOwnerKey(req);
  const hasAccess = ownerKey === build.ownerKey;
  
  if (!hasAccess) {
    logger.warn({ buildId, ip: req.ip }, 'Build ownership check failed - access denied');
  }
  return hasAccess;
};

export const startBuild = async (req: Request, res: Response) => {
  try {
    let buildSpec: BuildSpec;

    if (req.body.prompt && typeof req.body.prompt === 'string') {
      logger.info('Received prompt, generating build spec via AI');
      buildSpec = await generateBuildSpec(req.body.prompt);
    } else {
      buildSpec = buildSchema.parse(req.body);
    }

    const normalizedSpec: BuildSpec = {
      ...buildSpec,
      packages: normalizePackages(buildSpec.packages),
    };
    const buildId = generateId();
    const ownerKey = getOwnerKey(req);

    await prisma.userBuild.create({
      data: {
        id: buildId,
        baseDistro: buildSpec.base,
        spec: normalizedSpec as any,
        ownerKey,
        tenantId: req.tenantId,
      },
    });

    // Fire-and-forget with error handling
    runBuildLifecycle(normalizedSpec, buildId).catch(async (error) => {
      logger.error({ buildId, error: maskSensitiveData(error.message) }, 'Build lifecycle failed');
      await prisma.userBuild.update({
        where: { id: buildId },
        data: { status: 'FAILED' },
      }).catch((err: Error) => logger.error({ buildId, error: err.message }, 'Failed to update build status'));
    });

    res.status(202).json({ buildId, spec: normalizedSpec });
  } catch (error) {
    logger.error({ error }, 'Error starting build');
    if (error instanceof Error) {
      // Don't expose internal details in production
      const details = process.env.NODE_ENV === 'development' ? error.message : undefined;
      res.status(400).json({ error: 'Invalid build specification', details });
    } else {
      res.status(400).json({ error: 'Invalid build specification' });
    }
  }
};

export const getBuildStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check ownership - return 404 to prevent enumeration
    if (!await checkBuildOwnership(id, req)) {
      res.status(404).json({ error: 'Build not found' });
      return;
    }

    const build = await prisma.userBuild.findUnique({
      where: { id },
      include: { logs: true, artifacts: true },
    });

    if (!build) {
      res.status(404).json({ error: 'Build not found' });
      return;
    }

    const downloadUrls: {
      dockerImage?: string;
      dockerTarDownloadUrl?: string;
      isoDownloadUrl?: string;
    } = {};

    for (const artifact of build.artifacts) {
      if (artifact.fileType === 'docker-image-ref') {
        downloadUrls.dockerImage = artifact.url;
      } else if (artifact.fileType === 'docker-image') {
        downloadUrls.dockerTarDownloadUrl = `/api/build/download/${id}/docker`;
      } else if (artifact.fileType === 'iso') {
        downloadUrls.isoDownloadUrl = `/api/build/download/${id}/iso`;
      }
    }

    // Don't expose ownerKey in response
    const { ownerKey, ...safeData } = build as any;
    res.status(200).json({ ...safeData, downloadUrls });
  } catch (error) {
    logger.error({ buildId: req.params.id, error }, 'Error getting build status');
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBuildArtifact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!await checkBuildOwnership(id, req)) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    const artifact = await prisma.buildArtifact.findFirst({
      where: { buildId: id },
    });

    if (artifact) {
      res.status(200).json({ url: artifact.url });
    } else {
      res.status(404).json({ error: 'Artifact not found' });
    }
  } catch (error) {
    logger.error({ buildId: req.params.id, error }, 'Error getting build artifact');
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const downloadArtifact = async (req: Request, res: Response) => {
  try {
    const { id, type } = req.params;
    
    if (!['iso', 'docker'].includes(type)) {
      res.status(400).json({ error: 'Invalid artifact type. Use "iso" or "docker"' });
      return;
    }

    if (!await checkBuildOwnership(id, req)) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    const fileType = type === 'iso' ? 'iso' : 'docker-image';
    const artifact = await prisma.buildArtifact.findFirst({
      where: { buildId: id, fileType },
    });

    if (!artifact) {
      res.status(404).json({ error: `${type} artifact not found for this build` });
      return;
    }

    if (artifact.fileType === 'docker-image-ref') {
      res.status(200).json({ 
        type: 'docker-hub-reference',
        pullCommand: `docker pull ${artifact.url}`,
        image: artifact.url 
      });
      return;
    }

    // Path traversal prevention
    let filePath: string;
    try {
      filePath = validatePathWithinDir(artifact.url, ARTIFACTS_DIR);
    } catch {
      res.status(404).json({ error: 'Artifact file not found on server' });
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Artifact file not found on server' });
      return;
    }

    const fileName = path.basename(filePath);
    // Sanitize filename for Content-Disposition header to prevent header injection
    const safeFilename = fileName.replace(/[^\w.-]/g, '_').slice(0, 255);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error({ buildId: req.params.id, error }, 'Error downloading artifact');
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateFromPrompt = async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "prompt" field' });
      return;
    }

    const buildSpec = await generateBuildSpec(prompt);
    res.status(200).json({ spec: buildSpec });
  } catch (error) {
    logger.error({ error }, 'Error generating build spec from prompt');
    if (error instanceof SyntaxError) {
      res.status(500).json({ error: 'AI returned invalid JSON' });
    } else if (error instanceof Error) {
      const details = process.env.NODE_ENV === 'development' ? error.message : undefined;
      res.status(500).json({ error: 'Failed to generate build spec', details });
    } else {
      res.status(500).json({ error: 'Failed to generate build spec' });
    }
  }
};
