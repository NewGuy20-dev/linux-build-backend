import { BuildSpec, validateCompatibility } from '../ai/schema';
import { generateDockerfile } from '../builder/dockerfileGenerator';
import { generateIso } from '../builder/isoGenerator';
import { exportDockerImage } from '../builder/tarExporter';
import { createTempDir, cleanupDir } from '../utils/fs';
import { executeCommand } from './executor';
import { log } from './logger';
import { checkCancellation } from '../utils/cancellation';
import { generateFirewallRules, generateFail2banConfig, generateKernelHardening } from '../utils/securityConfig';
import { generateServiceScript } from '../utils/serviceConfig';
import { generateShellRc, generateStarshipConfig } from '../utils/shellConfig';
import prisma from '../db/db';
import * as fs from 'fs/promises';
import * as path from 'path';
import { broadcastBuildComplete, BuildCompletePayload } from '../ws/websocket';

const ARTIFACTS_DIR = path.resolve('artifacts');

export enum BuildStep {
  PENDING = 'pending',
  VALIDATING = 'validating',
  GENERATING = 'generating',
  BUILDING = 'building',
  ISO_GENERATING = 'iso_generating',
  UPLOADING = 'uploading',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

const safeDbCall = async (buildId: string, fn: () => Promise<unknown>) => {
  try { await fn(); } catch (e) { console.error(`[${buildId}] DB error (non-fatal):`, e); }
};

const updateStep = async (buildId: string, step: BuildStep) => {
  log(buildId, `Step: ${step}`);
  await safeDbCall(buildId, () => prisma.userBuild.update({ where: { id: buildId }, data: { status: step === BuildStep.COMPLETE ? 'SUCCESS' : step === BuildStep.FAILED ? 'FAILED' : 'IN_PROGRESS' } }));
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
  const payload: BuildCompletePayload = { type: 'BUILD_COMPLETE', buildId, status, artifacts: {} };

  for (const artifact of artifacts) {
    if (artifact.fileType === 'docker-image-ref') payload.artifacts.dockerImage = artifact.url;
    else if (artifact.fileType === 'docker-image') payload.artifacts.dockerTarDownloadUrl = `/api/build/download/${buildId}/docker`;
    else if (artifact.fileType === 'iso') payload.artifacts.isoDownloadUrl = `/api/build/download/${buildId}/iso`;
  }

  broadcastBuildComplete(payload);
};

const generateConfigFiles = async (spec: BuildSpec, workspacePath: string, buildId: string) => {
  const configDir = path.join(workspacePath, 'configs');
  await fs.mkdir(configDir, { recursive: true });

  // Security configs
  const firewallRules = generateFirewallRules(spec);
  if (firewallRules) {
    await fs.writeFile(path.join(configDir, 'firewall.conf'), firewallRules);
    log(buildId, 'Generated firewall config');
  }

  const fail2ban = generateFail2banConfig(spec);
  if (fail2ban) {
    await fs.writeFile(path.join(configDir, 'jail.local'), fail2ban);
    log(buildId, 'Generated fail2ban config');
  }

  const kernelHardening = generateKernelHardening();
  await fs.writeFile(path.join(configDir, 'sysctl-hardening.conf'), kernelHardening);

  // Service config
  const services = spec.postInstall?.services || [];
  if (services.length) {
    const serviceScript = generateServiceScript(services, spec.init || 'systemd');
    await fs.writeFile(path.join(configDir, 'enable-services.sh'), serviceScript);
    log(buildId, 'Generated service enable script');
  }

  // Shell config
  const shellRc = generateShellRc(spec);
  if (shellRc) {
    const rcFile = spec.customization?.shell === 'zsh' ? '.zshrc' : spec.customization?.shell === 'fish' ? 'config.fish' : '.bashrc';
    await fs.writeFile(path.join(configDir, rcFile), shellRc);
    log(buildId, `Generated ${rcFile}`);
  }

  if (spec.customization?.shellTheme === 'starship') {
    await fs.writeFile(path.join(configDir, 'starship.toml'), generateStarshipConfig());
    log(buildId, 'Generated starship config');
  }

  return configDir;
};

export const runBuildLifecycle = async (spec: BuildSpec, buildId: string) => {
  let workspacePath: string | null = null;
  const startTime = Date.now();

  try {
    // Step 1: Validation
    await checkCancellation(buildId);
    await updateStep(buildId, BuildStep.VALIDATING);
    
    const validation = validateCompatibility(spec);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    validation.warnings.forEach(w => log(buildId, `WARNING: ${w}`));
    log(buildId, `Validated spec for ${spec.base} (${spec.architecture || 'x86_64'})`);

    // Step 2: Generate configs
    await checkCancellation(buildId);
    await updateStep(buildId, BuildStep.GENERATING);
    
    workspacePath = path.resolve(await createTempDir());
    await fs.mkdir(workspacePath, { recursive: true });
    log(buildId, `Workspace: ${workspacePath}`);

    await generateConfigFiles(spec, workspacePath, buildId);

    const dockerfile = generateDockerfile(spec);
    await fs.writeFile(path.join(workspacePath, 'Dockerfile'), dockerfile);
    log(buildId, 'Generated Dockerfile');

    // Step 3: Docker build
    await checkCancellation(buildId);
    await updateStep(buildId, BuildStep.BUILDING);
    
    const imageName = `build-${buildId}`;
    await executeCommand(`docker build -t ${imageName} "${workspacePath}"`, buildId);
    log(buildId, 'Docker image built');

    // Push or export Docker image
    const dockerRepo = process.env.DOCKER_IMAGE_REPO;
    if (dockerRepo) {
      const dockerUser = process.env.DOCKER_HUB_USER;
      const dockerToken = process.env.DOCKER_HUB_TOKEN;
      if (dockerUser && dockerToken) {
        await executeCommand(`echo "${dockerToken}" | docker login -u ${dockerUser} --password-stdin`, buildId);
      }
      const remoteTag = `${dockerRepo}:${buildId}`;
      await executeCommand(`docker tag ${imageName} ${remoteTag}`, buildId);
      try {
        await executeCommand(`docker push ${remoteTag}`, buildId);
        await safeDbCall(buildId, () => prisma.buildArtifact.create({
          data: { buildId, fileName: 'docker-manifest', fileType: 'docker-image-ref', url: remoteTag },
        }));
      } catch {
        const tarballPath = await exportDockerImage(imageName, buildId, workspacePath);
        const artifactPath = await moveToArtifacts(tarballPath, buildId);
        await safeDbCall(buildId, () => prisma.buildArtifact.create({
          data: { buildId, fileName: path.basename(artifactPath), fileType: 'docker-image', url: artifactPath },
        }));
      }
    } else {
      const tarballPath = await exportDockerImage(imageName, buildId, workspacePath);
      const artifactPath = await moveToArtifacts(tarballPath, buildId);
      await safeDbCall(buildId, () => prisma.buildArtifact.create({
        data: { buildId, fileName: path.basename(artifactPath), fileType: 'docker-image', url: artifactPath },
      }));
    }

    // Step 4: ISO generation
    await checkCancellation(buildId);
    await updateStep(buildId, BuildStep.ISO_GENERATING);
    
    try {
      const isoPath = await generateIso(spec, buildId, workspacePath);
      const artifactPath = await moveToArtifacts(isoPath, buildId);
      log(buildId, `Generated ISO: ${artifactPath}`);
      await safeDbCall(buildId, () => prisma.buildArtifact.create({
        data: { buildId, fileName: path.basename(artifactPath), fileType: 'iso', url: artifactPath },
      }));
    } catch (err) {
      log(buildId, `ISO generation failed (non-fatal): ${err}`);
    }

    // Step 5: Complete
    await updateStep(buildId, BuildStep.COMPLETE);
    const duration = Math.round((Date.now() - startTime) / 1000);
    log(buildId, `Build completed in ${duration}s`);
    await sendBuildCompleteNotification(buildId, 'SUCCESS');

  } catch (error: any) {
    console.error(error);
    const status = error.message === 'BUILD_CANCELLED' ? 'CANCELLED' : 'FAILED';
    await safeDbCall(buildId, () => prisma.userBuild.update({ where: { id: buildId }, data: { status } }));
    log(buildId, status === 'CANCELLED' ? 'Build cancelled' : `Build failed: ${error.message}`);
    await sendBuildCompleteNotification(buildId, status);
  } finally {
    if (workspacePath) {
      await cleanupDir(workspacePath);
      log(buildId, 'Cleaned up workspace');
    }
  }
};
