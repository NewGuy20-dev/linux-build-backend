import { Request, Response } from 'express';
import { buildSchema, BuildSpec } from '../ai/schema';
import { runBuildLifecycle } from '../executor/lifecycle';
import { generateId } from '../utils/id';
import prisma from '../db/db';
import { normalizePackages } from '../utils/packages';

export const startBuild = async (req: Request, res: Response) => {
  try {
    const buildSpec = buildSchema.parse(req.body);
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

    // runBuildLifecycle is async but we don't await it to return quickly
    // However, for the test, catching errors inside it is handled by the function itself.
    runBuildLifecycle(normalizedSpec, buildId);

    res.status(202).json({ buildId });
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
      res.status(200).json(build);
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
