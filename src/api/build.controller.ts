import { Request, Response } from 'express';
import { buildSchema, BuildSpec } from '../ai/schema';
import { runBuildLifecycle } from '../executor/lifecycle';
import { generateId } from '../utils/id';
import prisma from '../db/db';
import { normalizePackages } from '../utils/packages';
import { generateBuildSpec } from '../ai/ollama';
import * as fs from 'fs';
import * as path from 'path';

export const startBuild = async (req: Request, res: Response) => {
  try {
    let buildSpec: BuildSpec;

    // Check if request is a prompt (string) or direct JSON spec
    if (req.body.prompt && typeof req.body.prompt === 'string') {
      // Frontend sent a prompt - generate spec via AI
      console.log('Received prompt, generating build spec via AI...');
      buildSpec = await generateBuildSpec(req.body.prompt);
    } else {
      // Frontend sent a direct JSON spec
      buildSpec = buildSchema.parse(req.body);
    }

    const normalizedSpec: BuildSpec = {
      ...buildSpec,
      packages: normalizePackages(buildSpec.packages),
    };
    const buildId = generateId();

    await prisma.userBuild.create({
      data: {
        id: buildId,
        baseDistro: buildSpec.base,
        spec: normalizedSpec as any,
      },
    });

    runBuildLifecycle(normalizedSpec, buildId);

    res.status(202).json({ buildId, spec: normalizedSpec });
  } catch (error) {
    console.error('Error starting build:', error);
    if (error instanceof Error) {
      res.status(400).json({ error: 'Invalid build specification', details: error.message, stack: (error as any).issues });
    } else {
      res.status(400).json({ error: 'Invalid build specification' });
    }
  }
};

export const getBuildStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const build = await prisma.userBuild.findUnique({
      where: { id },
      include: { logs: true, artifacts: true },
    });

    if (build) {
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

      res.status(200).json({ ...build, downloadUrls });
    } else {
      res.status(404).json({ error: 'Build not found' });
    }
  } catch (error) {
    console.error(`Error getting build status for ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBuildArtifact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const artifact = await prisma.buildArtifact.findFirst({
      where: { buildId: id },
    });

    if (artifact) {
      res.status(200).json({ url: artifact.url });
    } else {
      res.status(404).json({ error: 'Artifact not found' });
    }
  } catch (error) {
    console.error(`Error getting build artifact for ID ${req.params.id}:`, error);
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

    const filePath = artifact.url;
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Artifact file not found on server' });
      return;
    }

    const fileName = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error(`Error downloading artifact for ID ${req.params.id}:`, error);
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
    console.error('Error generating build spec from prompt:', error);
    if (error instanceof SyntaxError) {
      res.status(500).json({ error: 'AI returned invalid JSON' });
    } else if (error instanceof Error) {
      res.status(500).json({ error: 'Failed to generate build spec', details: error.message });
    } else {
      res.status(500).json({ error: 'Failed to generate build spec' });
    }
  }
};
