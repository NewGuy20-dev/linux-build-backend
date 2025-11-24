import { Request, Response } from 'express';
import { buildSchema } from '../ai/schema';
import { runBuildLifecycle } from '../executor/lifecycle';
import { generateId } from '../utils/id';
import prisma from '../db/client';
import getPort from 'get-port';
import { exec } from 'child_process';
import { promisify } from 'util';
import { addSession } from '../executor/session';

const execAsync = promisify(exec);

export const createBuild = async (req: Request, res: Response) => {
  try {
    const buildSpec = buildSchema.parse(req.body);
    const buildId = generateId();

    const build = await prisma.build.create({
      data: {
        id: buildId,
        name: buildSpec.name,
        spec: buildSpec as any,
      },
    });

    runBuildLifecycle(buildSpec, buildId);

    res.status(202).json({ buildId: build.id, status: build.status });
  } catch (error) {
    console.error('Error starting build:', error);
    if (error instanceof Error) {
        res.status(400).json({ error: 'Invalid build specification', details: error.message });
    } else {
        res.status(400).json({ error: 'Invalid build specification' });
    }
  }
};

export const getBuild = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const build = await prisma.build.findUnique({
      where: { id },
      include: { logs: true },
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

export const getBuildLogs = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const logs = await prisma.buildLog.findMany({
      where: { buildId: id },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json(logs);
  } catch (error) {
    console.error(`Error getting build logs for ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const launchGui = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const build = await prisma.build.findUnique({
      where: { id },
    });

    if (!build || !build.imageUrl) {
      return res.status(404).json({ error: 'Build not found or image not available' });
    }

    const port = await getPort();
    const { CODESPACE_NAME } = process.env;

    if (!CODESPACE_NAME) {
      return res.status(500).json({ error: 'CODESPACE_NAME environment variable is not set.' });
    }

    const imageName = build.imageUrl.replace('docker.io/', '');
    const containerName = `gui-session-${id}`;

    try {
      const command = `docker run -d --rm --name ${containerName} -p ${port}:6080 ${imageName}`;
      await execAsync(command);
    } catch (error) {
        console.error(`Error starting GUI container for build ID ${id}:`, error);
        return res.status(500).json({ error: 'Failed to start GUI container' });
    }

    const sessionId = generateId();
    addSession(sessionId, containerName);
    const guiUrl = `https://${CODESPACE_NAME}-${port}.app.github.dev/vnc.html?path=websockify&token=${sessionId}`;

    res.status(200).json({ sessionId, guiUrl });
  } catch (error) {
    console.error(`Error launching GUI for build ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
