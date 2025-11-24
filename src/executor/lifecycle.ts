import { BuildSpec } from '../ai/schema';
import { generateDockerfile } from '../builder/dockerfileGenerator';
import { generateIso } from '../builder/isoGenerator';
import { exportDockerImage } from '../builder/tarExporter';
import { createTempDir, cleanupDir } from '../utils/fs';
import { executeCommand } from './executor';
import { log } from './logger';
import { checkCancellation } from '../utils/cancellation';
import prisma from '../db/client';
import * as fs from 'fs/promises';
import * as path from 'path';

export const runBuildLifecycle = async (spec: BuildSpec, buildId: string) => {
  let workspacePath: string | null = null;
  try {
    await checkCancellation(buildId);
    await prisma.userBuild.update({ where: { id: buildId }, data: { status: 'IN_PROGRESS' } });
    log(buildId, 'Starting build lifecycle...');

    await checkCancellation(buildId);
    workspacePath = await createTempDir();
    log(buildId, `Created temporary workspace: ${workspacePath}`);

    // 1. Build Docker Image
    const dockerfile = generateDockerfile(spec);
    const dockerfilePath = path.join(workspacePath, 'Dockerfile');
    await fs.writeFile(dockerfilePath, dockerfile);
    log(buildId, 'Generated Dockerfile');

    await checkCancellation(buildId);
    const imageName = `build-${buildId}`;
    await executeCommand(`docker build -t ${imageName} ${workspacePath}`, buildId);
    log(buildId, 'Docker image built');

    // 2. Push Docker Image or Export
    const registryUrl = process.env.DOCKER_REGISTRY_URL;
    if (registryUrl) {
      const remoteTag = `${registryUrl}/${imageName}:latest`;
      log(buildId, `Pushing to registry: ${remoteTag}`);
      await executeCommand(`docker tag ${imageName} ${remoteTag}`, buildId);
      try {
          await executeCommand(`docker push ${remoteTag}`, buildId);
          log(buildId, `Pushed Docker image to ${remoteTag}`);
          await prisma.buildArtifact.create({
            data: {
              buildId,
              fileName: 'docker-manifest',
              fileType: 'docker-image-ref',
              url: remoteTag, 
            },
          });
      } catch (err) {
          log(buildId, `Failed to push to registry: ${err}`);
          // Fallback to tarball
          const tarballPath = await exportDockerImage(imageName, buildId, workspacePath);
          await prisma.buildArtifact.create({
            data: {
              buildId,
              fileName: path.basename(tarballPath),
              fileType: 'docker-image',
              url: tarballPath, 
            },
          });
      }
    } else {
      const tarballPath = await exportDockerImage(imageName, buildId, workspacePath);
      log(buildId, `Exported Docker image: ${tarballPath}`);
      await prisma.buildArtifact.create({
        data: {
          buildId,
          fileName: path.basename(tarballPath),
          fileType: 'docker-image',
          url: tarballPath, 
        },
      });
    }

    // 3. Generate ISO
    // We always generate ISO as requested
    try {
        const isoPath = await generateIso(spec, buildId, workspacePath);
        log(buildId, `Generated ISO: ${isoPath}`);
        await prisma.buildArtifact.create({
            data: {
            buildId,
            fileName: path.basename(isoPath),
            fileType: 'iso',
            url: isoPath, 
            },
        });
    } catch (err) {
        log(buildId, `Failed to generate ISO: ${err}`);
        throw err; // Fail the build if ISO generation fails
    }

    await prisma.userBuild.update({ where: { id: buildId }, data: { status: 'SUCCESS' } });
    log(buildId, 'Build lifecycle completed successfully');

  } catch (error: any) {
    console.error(error);
    if (error.message === 'BUILD_CANCELLED') {
      await prisma.userBuild.update({ where: { id: buildId }, data: { status: 'CANCELLED' } });
      log(buildId, 'Build lifecycle cancelled');
    } else {
      await prisma.userBuild.update({ where: { id: buildId }, data: { status: 'FAILED' } });
      log(buildId, 'Build lifecycle failed');
    }
  } finally {
    if (workspacePath) {
      await cleanupDir(workspacePath);
      log(buildId, 'Cleaned up temporary workspace');
    }
  }
};
