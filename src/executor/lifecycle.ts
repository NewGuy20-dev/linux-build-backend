import { BuildSpec } from '../ai/schema';
import { generateDockerfile } from '../builder/dockerfileGenerator';
import { generateIso } from '../builder/isoGenerator';
import { exportDockerImage } from '../builder/tarExporter';
import { createTempDir, cleanupDir } from '../utils/fs';
import { executeCommand } from './executor';
import { log } from './logger';
import prisma from '../db/client';
import * as fs from 'fs/promises';
import * as path from 'path';

export const runBuildLifecycle = async (spec: BuildSpec, buildId: string) => {
  let workspacePath: string | null = null;
  try {
    await prisma.userBuild.update({ where: { id: buildId }, data: { status: 'IN_PROGRESS' } });
    log(buildId, 'Starting build lifecycle...');

    workspacePath = await createTempDir();
    log(buildId, `Created temporary workspace: ${workspacePath}`);

    const dockerfile = generateDockerfile(spec);
    const dockerfilePath = path.join(workspacePath, 'Dockerfile');
    await fs.writeFile(dockerfilePath, dockerfile);
    log(buildId, 'Generated Dockerfile');

    const imageName = `build-${buildId}`;
    await executeCommand(`docker build -t ${imageName} ${workspacePath}`, buildId);
    log(buildId, 'Docker image built');

    if (spec.outputFormat === 'iso') {
      const isoPath = await generateIso(spec, buildId, workspacePath);
      log(buildId, `Generated ISO: ${isoPath}`);
      // In a real application, we would upload this to a storage service
      // and save the URL in the database.
      await prisma.buildArtifact.create({
        data: {
          buildId,
          fileName: path.basename(isoPath),
          fileType: 'iso',
          url: isoPath, // Placeholder URL
        },
      });
    } else if (spec.outputFormat === 'docker') {
      const tarballPath = await exportDockerImage(imageName, buildId, workspacePath);
      log(buildId, `Exported Docker image: ${tarballPath}`);
      // In a real application, we would upload this to a storage service
      // and save the URL in the database.
      await prisma.buildArtifact.create({
        data: {
          buildId,
          fileName: path.basename(tarballPath),
          fileType: 'docker-image',
          url: tarballPath, // Placeholder URL
        },
      });
    }

    await prisma.userBuild.update({ where: { id: buildId }, data: { status: 'SUCCESS' } });
    log(buildId, 'Build lifecycle completed successfully');

  } catch (error) {
    console.error(error);
    await prisma.userBuild.update({ where: { id: buildId }, data: { status: 'FAILED' } });
    log(buildId, 'Build lifecycle failed');
  } finally {
    if (workspacePath) {
      await cleanupDir(workspacePath);
      log(buildId, 'Cleaned up temporary workspace');
    }
  }
};
