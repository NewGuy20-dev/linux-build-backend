import { BuildSpec } from '../ai/schema';
import { executeCommand } from '../executor/executor';
import { log } from '../executor/logger';
import { checkCancellation } from '../utils/cancellation';
import { flattenPackages } from '../utils/packages';
import { sanitizePackageName, validateBuildId, escapeShellArg } from '../utils/sanitizer';
import { resolvePackages } from './packageMaps';
import * as fs from 'fs/promises';
import * as path from 'path';

// Kernel packages per distro
const KERNELS: Record<string, Record<string, string>> = {
  arch: { 'linux-lts': 'linux-lts', 'linux-zen': 'linux-zen', 'linux-hardened': 'linux-hardened' },
  debian: { 'linux-lts': 'linux-image-amd64', 'linux-zen': 'linux-image-amd64', 'linux-hardened': 'linux-image-amd64' },
  ubuntu: { 'linux-lts': 'linux-image-generic', 'linux-zen': 'linux-image-generic', 'linux-hardened': 'linux-image-generic' },
  fedora: { 'linux-lts': 'kernel', 'linux-zen': 'kernel', 'linux-hardened': 'kernel' },
  alpine: { 'linux-lts': 'linux-lts', 'linux-zen': 'linux-lts', 'linux-hardened': 'linux-lts' },
  opensuse: { 'linux-lts': 'kernel-default', 'linux-zen': 'kernel-default', 'linux-hardened': 'kernel-default' },
  void: { 'linux-lts': 'linux', 'linux-zen': 'linux', 'linux-hardened': 'linux' },
  gentoo: { 'linux-lts': 'gentoo-kernel-bin', 'linux-zen': 'gentoo-kernel-bin', 'linux-hardened': 'gentoo-kernel-bin' },
};

function getKernelPackage(distro: string, kernelVersion: string): string {
  return KERNELS[distro]?.[kernelVersion] || KERNELS[distro]?.['linux-lts'] || 'linux';
}

function generateBootloaderConfig(spec: BuildSpec): string {
  const bootloader = spec.customization?.bootloader;
  const kernelParams = spec.defaults?.kernelParams || '';
  const timeout = 5;

  if (bootloader?.type === 'systemd-boot') {
    return `
title   Custom Linux
linux   /vmlinuz
initrd  /initramfs.img
options root=LABEL=ROOT rw ${kernelParams}
`;
  }

  // GRUB config (default)
  return `
GRUB_DEFAULT=0
GRUB_TIMEOUT=${timeout}
GRUB_CMDLINE_LINUX_DEFAULT="quiet ${kernelParams}"
GRUB_CMDLINE_LINUX=""
`;
}

function generateEncryptionSetup(spec: BuildSpec): string {
  const enc = spec.filesystem?.encryption;
  if (!enc) return '';

  return `
# LUKS Encryption Setup
cryptsetup luksFormat --type ${enc} /dev/sdX
cryptsetup open /dev/sdX cryptroot
mkfs.ext4 /dev/mapper/cryptroot
`;
}

function generateFilesystemSetup(spec: BuildSpec): string {
  const fs = spec.filesystem;
  if (!fs) return '';

  let script = `# Filesystem: ${fs.root}\n`;

  if (fs.root === 'btrfs') {
    script += `
mkfs.btrfs -L ROOT /dev/sdX
mount /dev/sdX /mnt
btrfs subvolume create /mnt/@
btrfs subvolume create /mnt/@home
btrfs subvolume create /mnt/@snapshots
umount /mnt
mount -o subvol=@ /dev/sdX /mnt
`;
    if (fs.compression) {
      script += `# Enable compression: mount -o compress=zstd\n`;
    }
  } else if (fs.root === 'zfs') {
    script += `
zpool create -f rpool /dev/sdX
zfs create rpool/ROOT
zfs create rpool/home
`;
  } else {
    script += `mkfs.${fs.root} -L ROOT /dev/sdX\n`;
  }

  return script;
}

function generatePostInstallScript(spec: BuildSpec): string {
  const lines: string[] = ['#!/bin/bash', 'set -e'];

  // System tuning
  if (spec.postInstall?.systemTuning?.swappiness !== undefined) {
    lines.push(`echo "vm.swappiness=${spec.postInstall.systemTuning.swappiness}" >> /etc/sysctl.conf`);
  }
  if (spec.defaults?.trim) {
    lines.push('systemctl enable fstrim.timer 2>/dev/null || true');
  }

  // Custom scripts
  spec.postInstall?.scripts?.forEach(s => lines.push(`# Custom: ${s}`));

  // Services
  spec.postInstall?.services?.forEach(svc => {
    lines.push(`systemctl enable ${svc} 2>/dev/null || rc-update add ${svc} default 2>/dev/null || true`);
  });

  return lines.join('\n');
}

const generateArchIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  validateBuildId(buildId);
  const packages = flattenPackages(spec.packages).map(sanitizePackageName);
  const { packages: resolved } = resolvePackages(packages, 'arch');
  const kernel = getKernelPackage('arch', spec.kernel?.version || 'linux-lts');
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  const allPkgs = [kernel, ...resolved];
  const echoCommands = allPkgs.map(pkg => `RUN echo "${sanitizePackageName(pkg)}" >> /releng/packages.x86_64`).join('\n');
  const grubConfig = generateBootloaderConfig(spec);
  const postInstall = generatePostInstallScript(spec);

  const dockerfile = `
FROM archlinux:latest
RUN pacman -Syu --noconfirm archiso
RUN cp -r /usr/share/archiso/configs/releng /releng
${echoCommands}
RUN mkdir -p /releng/airootfs/etc/default /releng/airootfs/root
RUN echo '${grubConfig.replace(/'/g, "\\'").replace(/\n/g, '\\n')}' > /releng/airootfs/etc/default/grub
RUN echo '${postInstall.replace(/'/g, "\\'").replace(/\n/g, '\\n')}' > /releng/airootfs/root/post-install.sh
RUN chmod +x /releng/airootfs/root/post-install.sh
CMD ["mkarchiso", "-v", "-w", "/work", "-o", "/out", "/releng"]
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-arch-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${escapeShellArg(imageName)} -f ${escapeShellArg(dockerfilePath)} ${escapeShellArg(workspacePath)}`, buildId);
  await checkCancellation(buildId);
  await executeCommand(`docker run --rm --privileged -v ${escapeShellArg(outDir + ':/out')} ${escapeShellArg(imageName)}`, buildId);
  await executeCommand(`docker rmi ${escapeShellArg(imageName)}`, buildId).catch(() => {});

  const files = await fs.readdir(outDir);
  const iso = files.find(f => f.endsWith('.iso'));
  if (!iso) throw new Error('Arch ISO not found');
  return path.join(outDir, iso);
};

const generateDebianIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  validateBuildId(buildId);
  const packages = flattenPackages(spec.packages).map(sanitizePackageName);
  const { packages: resolved } = resolvePackages(packages, 'debian');
  const kernel = getKernelPackage('debian', spec.kernel?.version || 'linux-lts');
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  const allPkgs = [kernel, ...resolved].map(sanitizePackageName);

  const dockerfile = `
FROM debian:bookworm
RUN apt-get update && apt-get install -y live-build
WORKDIR /build
RUN lb config --distribution bookworm --archive-areas "main contrib non-free non-free-firmware"
RUN mkdir -p config/package-lists && printf '%s\\n' ${allPkgs.map(p => `"${p}"`).join(' ')} > config/package-lists/custom.list.chroot
RUN lb build
CMD cp /build/*.iso /out/ 2>/dev/null || echo "ISO build failed"
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-debian-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${escapeShellArg(imageName)} -f ${escapeShellArg(dockerfilePath)} ${escapeShellArg(workspacePath)}`, buildId);
  await checkCancellation(buildId);
  await executeCommand(`docker run --rm --privileged -v ${escapeShellArg(outDir + ':/out')} ${escapeShellArg(imageName)}`, buildId);
  await executeCommand(`docker rmi ${escapeShellArg(imageName)}`, buildId).catch(() => {});

  const files = await fs.readdir(outDir);
  const iso = files.find(f => f.endsWith('.iso'));
  if (!iso) throw new Error('Debian ISO not found');
  return path.join(outDir, iso);
};

const generateUbuntuIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  validateBuildId(buildId);
  const packages = flattenPackages(spec.packages).map(sanitizePackageName);
  const { packages: resolved } = resolvePackages(packages, 'ubuntu');
  const kernel = getKernelPackage('ubuntu', spec.kernel?.version || 'linux-lts');
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  const allPkgs = [kernel, ...resolved].map(sanitizePackageName);

  const dockerfile = `
FROM ubuntu:noble
RUN apt-get update && apt-get install -y live-build
WORKDIR /build
RUN lb config --distribution noble --archive-areas "main restricted universe multiverse"
RUN mkdir -p config/package-lists && printf '%s\\n' ${allPkgs.map(p => `"${p}"`).join(' ')} > config/package-lists/custom.list.chroot
RUN lb build
CMD cp /build/*.iso /out/ 2>/dev/null || echo "ISO build failed"
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-ubuntu-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${escapeShellArg(imageName)} -f ${escapeShellArg(dockerfilePath)} ${escapeShellArg(workspacePath)}`, buildId);
  await checkCancellation(buildId);
  await executeCommand(`docker run --rm --privileged -v ${escapeShellArg(outDir + ':/out')} ${escapeShellArg(imageName)}`, buildId);
  await executeCommand(`docker rmi ${escapeShellArg(imageName)}`, buildId).catch(() => {});

  const files = await fs.readdir(outDir);
  const iso = files.find(f => f.endsWith('.iso'));
  if (!iso) throw new Error('Ubuntu ISO not found');
  return path.join(outDir, iso);
};

const generateFedoraIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  validateBuildId(buildId);
  const packages = flattenPackages(spec.packages).map(sanitizePackageName);
  const { packages: resolved } = resolvePackages(packages, 'fedora');
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  const dockerfile = `
FROM fedora:latest
RUN dnf install -y lorax livecd-tools
WORKDIR /build
RUN livemedia-creator --make-iso --ks=/build/ks.cfg --no-virt --resultdir=/out || echo "Using fallback"
CMD cp /build/*.iso /out/ 2>/dev/null || tar -cvf /out/fedora-rootfs.tar /
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-fedora-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${escapeShellArg(imageName)} -f ${escapeShellArg(dockerfilePath)} ${escapeShellArg(workspacePath)}`, buildId);
  await checkCancellation(buildId);
  await executeCommand(`docker run --rm --privileged -v ${escapeShellArg(outDir + ':/out')} ${escapeShellArg(imageName)}`, buildId);
  await executeCommand(`docker rmi ${escapeShellArg(imageName)}`, buildId).catch(() => {});

  const files = await fs.readdir(outDir);
  const artifact = files.find(f => f.endsWith('.iso') || f.endsWith('.tar'));
  if (!artifact) throw new Error('Fedora artifact not found');
  return path.join(outDir, artifact);
};

const generateAlpineIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  validateBuildId(buildId);
  const packages = flattenPackages(spec.packages).map(sanitizePackageName);
  const { packages: resolved } = resolvePackages(packages, 'alpine');
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  const apkList = resolved.length > 0 ? resolved.map(sanitizePackageName).join(' ') : 'alpine-base';

  const dockerfile = `
FROM alpine:latest
RUN apk add --no-cache alpine-sdk build-base apk-tools alpine-conf busybox fakeroot syslinux xorriso squashfs-tools
RUN mkdir -p /iso/apks /iso/boot
RUN apk fetch --no-cache -o /iso/apks ${apkList} alpine-base linux-lts || true
CMD tar -cvf /out/alpine-${buildId}.tar -C /iso .
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-alpine-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${escapeShellArg(imageName)} -f ${escapeShellArg(dockerfilePath)} ${escapeShellArg(workspacePath)}`, buildId);
  await checkCancellation(buildId);
  await executeCommand(`docker run --rm -v ${escapeShellArg(outDir + ':/out')} ${escapeShellArg(imageName)}`, buildId);
  await executeCommand(`docker rmi ${escapeShellArg(imageName)}`, buildId).catch(() => {});

  const files = await fs.readdir(outDir);
  const artifact = files.find(f => f.endsWith('.tar') || f.endsWith('.iso'));
  if (!artifact) throw new Error('Alpine artifact not found');
  return path.join(outDir, artifact);
};

const generateGenericRootfs = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  validateBuildId(buildId);
  const outDir = path.join(workspacePath, 'out');
  await fs.mkdir(outDir, { recursive: true });

  log(buildId, `Generating rootfs tarball for ${spec.base}...`);

  const baseImage = spec.base === 'opensuse' ? 'opensuse/tumbleweed' : spec.base === 'void' ? 'voidlinux/voidlinux' : spec.base === 'gentoo' ? 'gentoo/stage3' : spec.base;
  const dockerfile = `
FROM ${baseImage}:latest
CMD tar -cvf /out/${spec.base}-rootfs-${buildId}.tar --exclude=/out --exclude=/proc --exclude=/sys --exclude=/dev /
`.trim();

  const dockerfilePath = path.join(workspacePath, 'Dockerfile.iso');
  await fs.writeFile(dockerfilePath, dockerfile);

  const imageName = `iso-${spec.base}-${buildId}`;
  await checkCancellation(buildId);
  await executeCommand(`docker build -t ${escapeShellArg(imageName)} -f ${escapeShellArg(dockerfilePath)} ${escapeShellArg(workspacePath)}`, buildId);
  await checkCancellation(buildId);
  await executeCommand(`docker run --rm -v ${escapeShellArg(outDir + ':/out')} ${escapeShellArg(imageName)}`, buildId);
  await executeCommand(`docker rmi ${escapeShellArg(imageName)}`, buildId).catch(() => {});

  const files = await fs.readdir(outDir);
  const artifact = files.find(f => f.endsWith('.tar'));
  if (!artifact) throw new Error(`${spec.base} artifact not found`);
  return path.join(outDir, artifact);
};

export const generateIso = async (spec: BuildSpec, buildId: string, workspacePath: string): Promise<string> => {
  log(buildId, `Starting ISO generation for ${spec.base}...`);
  log(buildId, `Kernel: ${spec.kernel?.version || 'linux-lts'}, Filesystem: ${spec.filesystem?.root || 'ext4'}`);

  switch (spec.base) {
    case 'arch':
      return generateArchIso(spec, buildId, workspacePath);
    case 'debian':
      return generateDebianIso(spec, buildId, workspacePath);
    case 'ubuntu':
      return generateUbuntuIso(spec, buildId, workspacePath);
    case 'alpine':
      return generateAlpineIso(spec, buildId, workspacePath);
    case 'fedora':
      return generateFedoraIso(spec, buildId, workspacePath);
    case 'opensuse':
    case 'void':
    case 'gentoo':
      return generateGenericRootfs(spec, buildId, workspacePath);
    default:
      throw new Error(`Unsupported base for ISO generation: ${spec.base}`);
  }
};

// Export helper functions for external use
export { generateBootloaderConfig, generateEncryptionSetup, generateFilesystemSetup, generatePostInstallScript };
