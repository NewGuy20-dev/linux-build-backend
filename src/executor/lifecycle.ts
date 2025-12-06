import { BuildSpec } from '../ai/schema';
import { generateDockerfile } from '../builder/dockerfileGenerator';
import { generateIso } from '../builder/isoGenerator';
import { exportDockerImage } from '../builder/tarExporter';
import { createTempDir, cleanupDir } from '../utils/fs';
import { executeCommand } from './executor';
import { log } from './logger';
import { checkCancellation } from '../utils/cancellation';
import prisma from '../db/db';
import * as fs from 'fs/promises';
import * as path from 'path';
import { broadcastBuildComplete, BuildCompletePayload } from '../ws/websocket';

const ARTIFACTS_DIR = path.resolve('artifacts');

const safeDbCall = async (buildId: string, fn: () => Promise<unknown>) => {
  try { await fn(); } catch (e) { console.error(`[${buildId}] DB error (non-fatal):`, e); }
};

const moveToArtifacts = async (srcPath: string, buildId: string): Promise<string> => {
  const buildArtifactsDir = path.join(ARTIFACTS_DIR, buildId);
  await fs.mkdir(buildArtifactsDir, { recursive: true });
  const destPath = path.join(buildArtifactsDir, path.basename(srcPath));
  await fs.rename(srcPath, destPath);
  return destPath;
};

const sendBuildCompleteNotification = async (buildId: string, status: 'SUCCESS' | 'FAILED' | 'CANCELLED') => {
  const artifacts = await prisma.buildArtifact.findMany({ where: { buildId } });
  
  console.log(`[${buildId}] Sending BUILD_COMPLETE notification. Found ${artifacts.length} artifacts:`, artifacts.map(a => ({ fileType: a.fileType, url: a.url })));
  
  const payload: BuildCompletePayload = {
    type: 'BUILD_COMPLETE',
    buildId,
    status,
    artifacts: {},
  };

  for (const artifact of artifacts) {
    if (artifact.fileType === 'docker-image-ref') {
      payload.artifacts.dockerImage = artifact.url;
    } else if (artifact.fileType === 'docker-image') {
      payload.artifacts.dockerTarDownloadUrl = `/api/build/download/${buildId}/docker`;
    } else if (artifact.fileType === 'iso') {
      payload.artifacts.isoDownloadUrl = `/api/build/download/${buildId}/iso`;
    }
  }

  console.log(`[${buildId}] WebSocket payload:`, JSON.stringify(payload));
  broadcastBuildComplete(payload);
};

export const runBuildLifecycle = async (spec: BuildSpec, buildId: string) => {
  let workspacePath: string | null = null;
  try {
    await checkCancellation(buildId);
    await safeDbCall(buildId, () => prisma.userBuild.update({ where: { id: buildId }, data: { status: 'IN_PROGRESS' } }));
    log(buildId, 'Starting build lifecycle...');

    await checkCancellation(buildId);
    workspacePath = await createTempDir();
    workspacePath = path.resolve(workspacePath);
    await fs.mkdir(workspacePath, { recursive: true });
    log(buildId, `Created temporary workspace: ${workspacePath}`);

    const dockerfile = generateDockerfile(spec);
    const dockerfilePath = path.join(workspacePath, 'Dockerfile');
    await fs.writeFile(dockerfilePath, dockerfile);
    log(buildId, 'Generated Dockerfile');

    await checkCancellation(buildId);
    const imageName = `build-${buildId}`;
    await executeCommand(`docker build -t ${imageName} "${workspacePath}"`, buildId);
    log(buildId, 'Docker image built');

    const dockerRepo = process.env.DOCKER_IMAGE_REPO;
    if (dockerRepo) {
      const dockerUser = process.env.DOCKER_HUB_USER;
      const dockerToken = process.env.DOCKER_HUB_TOKEN;
      
      if (dockerUser && dockerToken) {
        log(buildId, `Authenticating with Docker Hub...`);
        await executeCommand(`echo "${dockerToken}" | docker login -u ${dockerUser} --password-stdin`, buildId);
      }
      
      const remoteTag = `${dockerRepo}:${buildId}`;
      log(buildId, `Pushing to registry: ${remoteTag}`);
      await executeCommand(`docker tag ${imageName} ${remoteTag}`, buildId);
      try {
        await executeCommand(`docker push ${remoteTag}`, buildId);
        log(buildId, `Pushed Docker image to ${remoteTag}`);
        await safeDbCall(buildId, () => prisma.buildArtifact.create({
          data: { buildId, fileName: 'docker-manifest', fileType: 'docker-image-ref', url: remoteTag },
        }));
      } catch (err) {
        log(buildId, `Failed to push to registry: ${err}`);
        const tarballPath = await exportDockerImage(imageName, buildId, workspacePath);
        const artifactPath = await moveToArtifacts(tarballPath, buildId);
        await safeDbCall(buildId, () => prisma.buildArtifact.create({
          data: { buildId, fileName: path.basename(artifactPath), fileType: 'docker-image', url: artifactPath },
        }));
      }
    } else {
      const tarballPath = await exportDockerImage(imageName, buildId, workspacePath);
      const artifactPath = await moveToArtifacts(tarballPath, buildId);
      log(buildId, `Exported Docker image: ${artifactPath}`);
      await safeDbCall(buildId, () => prisma.buildArtifact.create({
        data: { buildId, fileName: path.basename(artifactPath), fileType: 'docker-image', url: artifactPath },
      }));
    }

    try {
      const isoPath = await generateIso(spec, buildId, workspacePath);
      const artifactPath = await moveToArtifacts(isoPath, buildId);
      log(buildId, `Generated ISO: ${artifactPath}`);
      await safeDbCall(buildId, () => prisma.buildArtifact.create({
        data: { buildId, fileName: path.basename(artifactPath), fileType: 'iso', url: artifactPath },
      }));
    } catch (err) {
      log(buildId, `Failed to generate ISO (non-fatal): ${err}`);
    }

    await safeDbCall(buildId, () => prisma.userBuild.update({ where: { id: buildId }, data: { status: 'SUCCESS' } }));
    log(buildId, 'Build lifecycle completed successfully');
    await sendBuildCompleteNotification(buildId, 'SUCCESS');

  } catch (error: any) {
    console.error(error);
    const status = error.message === 'BUILD_CANCELLED' ? 'CANCELLED' : 'FAILED';
    await safeDbCall(buildId, () => prisma.userBuild.update({
      where: { id: buildId },
      data: { status },
    }));
    log(buildId, status === 'CANCELLED' ? 'Build lifecycle cancelled' : 'Build lifecycle failed');
    await sendBuildCompleteNotification(buildId, status);
  } finally {
    if (workspacePath) {
      await cleanupDir(workspacePath);
      log(buildId, 'Cleaned up temporary workspace');
    }
  }
};
