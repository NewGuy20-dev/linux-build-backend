import { Request, Response } from 'express';
import { buildSchema } from '../ai/schema';
import { runBuildLifecycle } from '../executor/lifecycle';
import { runGuiSession, stopGuiSession } from '../services/docker/runGuiSession';
import { generateId } from '../utils/id';
import prisma from '../db/client';

export const startBuild = async (req: Request, res: Response) => {
  try {
    const buildSpec = buildSchema.parse(req.body);
    const buildId = generateId();

    await prisma.userBuild.create({
      data: {
        id: buildId,
        ...buildSpec,
      },
    });

    runBuildLifecycle(buildSpec, buildId);

    res.status(202).json({ buildId });
  } catch (error) {
    console.error('Error starting build:', error);
    res.status(400).json({ error: 'Invalid build specification' });
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
      res.status(200).json(build);
    } else {
      res.status(404).json({ error: 'Build not found' });
    }
  } catch (error) {
    console.error(`Error getting build status for ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const stopGui = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    await stopGuiSession(sessionId);
    res.status(200).json({ message: 'GUI session stopped successfully' });
  } catch (error) {
    console.error(`Error stopping GUI session ${req.params.sessionId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const launchGui = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const build = await prisma.userBuild.findUnique({ where: { id } });

    if (!build) {
      return res.status(404).json({ error: 'Build not found' });
    }

    if (!build.hasGuiEnvironment || !build.imageUrl) {
      return res.status(400).json({ error: 'This build does not have a GUI environment.' });
    }

    const { sessionId, guiUrl } = await runGuiSession(build.imageUrl);

    res.status(200).json({ sessionId, guiUrl });
  } catch (error) {
    console.error(`Error launching GUI for build ID ${req.params.id}:`, error);
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
      // In a real application, we would redirect to a signed URL for the artifact.
      // For now, we'll just send the placeholder URL.
      res.status(200).json({ url: artifact.url });
    } else {
      res.status(404).json({ error: 'Artifact not found' });
    }
  } catch (error) {
    console.error(`Error getting build artifact for ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
