import { BuildSpec } from '../ai/schema';
import { executeCommand } from '../executor/executor';
import * as fs from 'fs/promises';
import * as path from 'path';
import { sanitizePackageName } from '../utils/sanitizer';

const generateArchIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  // Create a dedicated workspace for the Arch ISO build
  const archBuildWorkspace = path.join(workspacePath, 'arch_iso_build');
  await fs.mkdir(archBuildWorkspace, { recursive: true });

  // Create the packages file
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const packagesFileContent = sanitizedPackages.join('\n');
  const packagesFilePath = path.join(archBuildWorkspace, 'packages.x86_64');
  await fs.writeFile(packagesFilePath, packagesFileContent);

  // Create a temporary Dockerfile for the Arch build environment
  const archDockerfile = `
FROM archlinux:latest
RUN pacman -Syu --noconfirm && pacman -S --noconfirm archiso
WORKDIR /build
COPY packages.x86_64 /build/packages.x86_64
RUN cp -r /usr/share/archiso/configs/releng/ .
RUN cat /build/packages.x86_64 >> /build/releng/packages.x86_64
RUN mkarchiso -v -w /build/work -o /output .
  `;
  const archDockerfilePath = path.join(archBuildWorkspace, 'Dockerfile.arch');
  await fs.writeFile(archDockerfilePath, archDockerfile);

  const outDirPath = path.join(workspacePath, 'out');
  await fs.mkdir(outDirPath, { recursive: true });
  const imageName = `arch-builder-${buildId}`;

  // Build the temporary Arch builder container
  await executeCommand(
    `docker build -t ${imageName} -f ${archDockerfilePath} .`,
    buildId,
    { cwd: archBuildWorkspace }
  );

  // Run the container, mounting the output directory
  const absoluteOutDirPath = path.resolve(outDirPath);
  await executeCommand(
    `docker run --privileged --rm -v ${absoluteOutDirPath}:/output ${imageName}`,
    buildId
  );

  // Find the generated ISO file in the output directory
  const files = await fs.readdir(outDirPath);
  const isoFile = files.find(file => file.endsWith('.iso'));

  if (!isoFile) {
    throw new Error('ISO file not found after running Arch build container');
  }

  // Clean up the builder image
  await executeCommand(`docker rmi ${imageName}`, buildId);

  return path.join(outDirPath, isoFile);
};


const generateDebianUbuntuIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  const buildWorkspace = path.join(workspacePath, 'live-build');
  await fs.mkdir(buildWorkspace, { recursive: true });

  const configPath = path.join(buildWorkspace, 'config');
  await fs.mkdir(configPath, { recursive: true });

  const packageListPath = path.join(configPath, 'package-lists');
  await fs.mkdir(packageListPath, { recursive: true });

  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const packagesFilePath = path.join(packageListPath, 'my.list.chroot');
  await fs.writeFile(packagesFilePath, sanitizedPackages.join('\n'));

  // Differentiate between Debian and Ubuntu distributions
  const distribution = spec.baseDistro === 'debian' ? 'bullseye' : 'focal';
  const archiveAreas = spec.baseDistro === 'ubuntu' ? 'main universe' : 'main';
  const mirror = spec.baseDistro === 'ubuntu' ? 'http://archive.ubuntu.com/ubuntu/' : 'http://deb.debian.org/debian/';

  const configCommand = `lb config --distribution ${distribution} --archive-areas "${archiveAreas}" --parent-mirror-bootstrap ${mirror}`;

  await executeCommand(`${configCommand} && lb build`, buildId, { cwd: buildWorkspace });

  const files = await fs.readdir(buildWorkspace);
  const isoFile = files.find(file => file.endsWith('.iso'));

  if (!isoFile) {
    throw new Error('ISO file not found after running live-build');
  }

  return path.join(buildWorkspace, isoFile);
};

const generateAlpineIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  // Create a dedicated workspace for the Alpine ISO build
  const alpineBuildWorkspace = path.join(workspacePath, 'alpine_iso_build');
  await fs.mkdir(alpineBuildWorkspace, { recursive: true });

  // Create the profile script for mkimage.sh
  const profileName = `custom-${buildId}`;
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const profileScript = `
profile_${profileName}() {
  profile_standard
  apks="${sanitizedPackages.join(' ')}"
}
  `;
  const profileScriptPath = path.join(alpineBuildWorkspace, `mkimg.${profileName}.sh`);
  await fs.writeFile(profileScriptPath, profileScript);

  // Create a temporary Dockerfile for the Alpine build environment
  const alpineDockerfile = `
FROM alpine:latest
RUN apk update && apk add alpine-sdk syslinux xorriso squashfs-tools git
WORKDIR /build
RUN git clone --depth=1 https://gitlab.alpinelinux.org/alpine/aports.git
COPY mkimg.${profileName}.sh /build/aports/scripts/
WORKDIR /build/aports/scripts
RUN ./mkimage.sh --profile ${profileName} --outdir /output
  `;
  const alpineDockerfilePath = path.join(alpineBuildWorkspace, 'Dockerfile.alpine');
  await fs.writeFile(alpineDockerfilePath, alpineDockerfile);

  const outDirPath = path.join(workspacePath, 'out');
  await fs.mkdir(outDirPath, { recursive: true });
  const imageName = `alpine-builder-${buildId}`;

  // Build the temporary Alpine builder container
  await executeCommand(
    `docker build -t ${imageName} -f ${alpineDockerfilePath} .`,
    buildId,
    { cwd: alpineBuildWorkspace }
  );

  // Run the container, mounting the output directory
  const absoluteOutDirPath = path.resolve(outDirPath);
  await executeCommand(
    `docker run --rm -v ${absoluteOutDirPath}:/output ${imageName}`,
    buildId
  );

  // Find the generated ISO file in the output directory
  const files = await fs.readdir(outDirPath);
  const isoFile = files.find(file => file.endsWith('.iso'));

  if (!isoFile) {
    throw new Error('ISO file not found after running Alpine build container');
  }

  // Clean up the builder image
  await executeCommand(`docker rmi ${imageName}`, buildId);

  return path.join(outDirPath, isoFile);
};

export const generateIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  switch (spec.baseDistro) {
    case 'arch':
      return generateArchIso(spec, buildId, workspacePath);
    case 'debian':
    case 'ubuntu':
      return generateDebianUbuntuIso(spec, buildId, workspacePath);
    case 'alpine':
      return generateAlpineIso(spec, buildId, workspacePath);
    default:
      throw new Error(`Unsupported base distro for ISO generation: ${spec.baseDistro}`);
  }
};
