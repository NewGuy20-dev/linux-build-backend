import { BuildSpec, validateCompatibility } from '../ai/schema';
import { generateDockerfile } from '../builder/dockerfileGenerator';
import { generateIso } from '../builder/isoGenerator';
import { exportDockerImage } from '../builder/tarExporter';
import { createTempDir, cleanupDir } from '../utils/fs';
import { executeCommand, executeCommandSecure } from './executor';
import { log } from './logger';
import { checkCancellation } from '../utils/cancellation';
import { validateBuildId, validatePathWithinDir, escapeShellArg } from '../utils/sanitizer';
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
  PARSING = 'parsing',
  VALIDATING = 'validating',
  RESOLVING = 'resolving',
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
  // Validate buildId format to prevent command injection
  validateBuildId(buildId);
  
  let workspacePath: string | null = null;
  const startTime = Date.now();
  const buildWarnings: string[] = [];

  try {
    // Step 1: Validation
    await checkCancellation(buildId);
    await updateStep(buildId, BuildStep.VALIDATING);
    
    const validation = validateCompatibility(spec);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    validation.warnings.forEach(w => {
      log(buildId, `WARNING: ${w}`);
      buildWarnings.push(w);
    });
    log(buildId, `Validated spec for ${spec.base} (${spec.architecture || 'x86_64'})`);

    // Step 2: Resolving (package resolution)
    await checkCancellation(buildId);
    await updateStep(buildId, BuildStep.RESOLVING);
    log(buildId, 'Resolving packages and dependencies...');

    // Determine security level
    const securityLevel = spec.securityFeatures?.mac?.length || spec.securityFeatures?.kernelHardening?.length
      ? 'hardened'
      : spec.securityFeatures?.firewall || spec.securityFeatures?.ssh?.fail2ban
        ? 'standard'
        : 'minimal';

    // Step 3: Generate configs
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
    await executeCommand(`docker build -t ${escapeShellArg(imageName)} ${escapeShellArg(workspacePath)}`, buildId);
    log(buildId, 'Docker image built');

    // Push or export Docker image
    const dockerRepo = process.env.DOCKER_IMAGE_REPO;
    if (dockerRepo) {
      const dockerUser = process.env.DOCKER_HUB_USER;
      const dockerToken = process.env.DOCKER_HUB_TOKEN;
      if (dockerUser && dockerToken) {
        // Use secure command execution to avoid logging token, bypass proxy for Docker Hub
        const loginEnv = {
          ...process.env,
          NO_PROXY: 'registry-1.docker.io,auth.docker.io,docker.io',
          HTTP_PROXY: '',
          HTTPS_PROXY: ''
        };
        await executeCommandSecure(`echo ${escapeShellArg(dockerToken)} | docker login -u ${escapeShellArg(dockerUser)} --password-stdin`, buildId, { env: loginEnv });
      }
      const remoteTag = `${dockerRepo}:${buildId}`;
      await executeCommand(`docker tag ${escapeShellArg(imageName)} ${escapeShellArg(remoteTag)}`, buildId);
      try {
        const pushEnv = {
          ...process.env,
          NO_PROXY: 'registry-1.docker.io,auth.docker.io,docker.io',
          HTTP_PROXY: '',
          HTTPS_PROXY: ''
        };
        await executeCommand(`docker push ${escapeShellArg(remoteTag)}`, buildId, { env: pushEnv });
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

    // Persist all build metadata
    await safeDbCall(buildId, () => prisma.userBuild.update({
      where: { id: buildId },
      data: {
        status: 'SUCCESS',
        kernelVersion: spec.kernel?.version || 'linux-lts',
        initSystem: spec.init || 'systemd',
        architecture: spec.architecture || 'x86_64',
        securityLevel,
        featuresJson: spec as any,
        buildDuration: duration,
        warnings: buildWarnings,
      },
    }));

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
