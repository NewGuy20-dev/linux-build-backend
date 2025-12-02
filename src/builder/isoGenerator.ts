import { BuildSpec } from '../ai/schema';
import { executeCommand } from '../executor/executor';
import { log } from '../executor/logger';
import { checkCancellation } from '../utils/cancellation';
import { flattenPackages } from '../utils/packages';
import { sanitizePackageName } from '../utils/sanitizer';
import * as fs from 'fs/promises';
import * as path from 'path';

const generateArchIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  const packages = flattenPackages(spec.packages).map(sanitizePackageName);
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  const dockerfile = `
FROM archlinux:latest
RUN pacman -Syu --noconfirm archiso
RUN cp -r /usr/share/archiso/configs/releng /releng
RUN echo "${packages.join('\\n')}" >> /releng/packages.x86_64
CMD ["mkarchiso", "-v", "-w", "/work", "-o", "/out", "/releng"]
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-arch-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${imageName} -f "${dockerfilePath}" "${workspacePath}"`, buildId);

  await checkCancellation(buildId);
  await executeCommand(`docker run --rm --privileged -v "${outDir}:/out" ${imageName}`, buildId);

  await executeCommand(`docker rmi ${imageName}`, buildId).catch(() => {});

  const files = await fs.readdir(outDir);
  const iso = files.find(f => f.endsWith('.iso'));
  if (!iso) throw new Error('Arch ISO not found');
  return path.join(outDir, iso);
};

const generateDebianIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  const packages = flattenPackages(spec.packages).map(sanitizePackageName);
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  const dockerfile = `
FROM debian:bookworm
RUN apt-get update && apt-get install -y live-build
WORKDIR /build
RUN lb config --distribution bookworm --archive-areas "main contrib non-free non-free-firmware"
RUN mkdir -p config/package-lists && echo "${packages.join('\\n')}" > config/package-lists/custom.list.chroot
RUN lb build
CMD cp /build/*.iso /out/ 2>/dev/null || echo "ISO build failed"
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-debian-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${imageName} -f "${dockerfilePath}" "${workspacePath}"`, buildId);

  await checkCancellation(buildId);
  await executeCommand(`docker run --rm --privileged -v "${outDir}:/out" ${imageName}`, buildId);

  await executeCommand(`docker rmi ${imageName}`, buildId).catch(() => {});

  const files = await fs.readdir(outDir);
  const iso = files.find(f => f.endsWith('.iso'));
  if (!iso) throw new Error('Debian ISO not found');
  return path.join(outDir, iso);
};

const generateUbuntuIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  const packages = flattenPackages(spec.packages).map(sanitizePackageName);
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  const dockerfile = `
FROM ubuntu:noble
RUN apt-get update && apt-get install -y live-build
WORKDIR /build
RUN lb config --distribution noble --archive-areas "main restricted universe multiverse" --parent-mirror-bootstrap http://archive.ubuntu.com/ubuntu/
RUN mkdir -p config/package-lists && echo "${packages.join('\\n')}" > config/package-lists/custom.list.chroot
RUN lb build
CMD cp /build/*.iso /out/ 2>/dev/null || echo "ISO build failed"
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-ubuntu-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${imageName} -f "${dockerfilePath}" "${workspacePath}"`, buildId);

  await checkCancellation(buildId);
  await executeCommand(`docker run --rm --privileged -v "${outDir}:/out" ${imageName}`, buildId);

  await executeCommand(`docker rmi ${imageName}`, buildId).catch(() => {});

  const files = await fs.readdir(outDir);
  const iso = files.find(f => f.endsWith('.iso'));
  if (!iso) throw new Error('Ubuntu ISO not found');
  return path.join(outDir, iso);
};

const generateAlpineIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  const packages = flattenPackages(spec.packages).map(sanitizePackageName);
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  const apkList = packages.length > 0 ? packages.join(' ') : 'alpine-base';

  const dockerfile = `
FROM alpine:latest
RUN apk add --no-cache alpine-sdk build-base apk-tools alpine-conf busybox fakeroot syslinux xorriso squashfs-tools sudo
RUN adduser -D builder && addgroup builder abuild && echo "builder ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
USER builder
WORKDIR /home/builder
RUN abuild-keygen -an
USER root
RUN cp /home/builder/.abuild/*.pub /etc/apk/keys/
RUN mkdir -p /iso/apks /iso/boot
RUN apk fetch --no-cache -o /iso/apks ${apkList} alpine-base linux-lts
RUN cp /boot/vmlinuz-lts /iso/boot/vmlinuz 2>/dev/null || cp /boot/vmlinuz* /iso/boot/vmlinuz 2>/dev/null || echo "kernel copy skipped"
RUN cp /boot/initramfs-lts /iso/boot/initramfs 2>/dev/null || true
CMD tar -cvf /out/alpine-${buildId}.tar -C /iso . && echo "Alpine rootfs created"
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-alpine-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${imageName} -f "${dockerfilePath}" "${workspacePath}"`, buildId);

  await checkCancellation(buildId);
  await executeCommand(`docker run --rm -v "${outDir}:/out" ${imageName}`, buildId);

  await executeCommand(`docker rmi ${imageName}`, buildId).catch(() => {});

  // Alpine produces a tar, not ISO - convert or return as-is
  const files = await fs.readdir(outDir);
  const artifact = files.find(f => f.endsWith('.tar') || f.endsWith('.iso'));
  if (!artifact) throw new Error('Alpine artifact not found');
  return path.join(outDir, artifact);
};

export const generateIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  log(buildId, `Starting ISO generation for ${spec.base}...`);

  switch (spec.base) {
    case 'arch':
      return generateArchIso(spec, buildId, workspacePath);
    case 'debian':
      return generateDebianIso(spec, buildId, workspacePath);
    case 'ubuntu':
      return generateUbuntuIso(spec, buildId, workspacePath);
    case 'alpine':
      return generateAlpineIso(spec, buildId, workspacePath);
    default:
      throw new Error(`Unsupported base for ISO generation: ${spec.base}`);
  }
};
