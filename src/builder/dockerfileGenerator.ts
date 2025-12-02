import { BuildSpec } from '../ai/schema';
import { sanitizePackageName } from '../utils/sanitizer';
import { flattenPackages } from '../utils/packages';

const ARCH_SPECIAL_PACKAGE_HANDLERS: Record<string, string[]> = {
  'oh-my-zsh': [
    'RUN git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git /opt/oh-my-zsh',
    'RUN ln -s /opt/oh-my-zsh /usr/share/oh-my-zsh || true',
  ],
};

const generateArchDockerfile = (spec: BuildSpec): string => {
  const packages = flattenPackages(spec.packages);
  const specialCommands: string[] = [];
  const filteredPackages: string[] = [];
  let requiresGit = false;

  packages.forEach((pkg) => {
    const handler = ARCH_SPECIAL_PACKAGE_HANDLERS[pkg];
    if (handler) {
      specialCommands.push(...handler);
      if (pkg === 'oh-my-zsh') {
        requiresGit = true;
      }
      return;
    }
    filteredPackages.push(pkg);
  });

  if (requiresGit && !packages.includes('git')) {
    filteredPackages.push('git');
  }
  const sanitizedPackages = filteredPackages
    .map(sanitizePackageName)
    .filter((pkg) => pkg.length > 0);

  const lines = [
    'FROM archlinux:latest',
    'RUN pacman-key --init && pacman-key --populate archlinux',
    'RUN pacman -Sy --noconfirm reflector && reflector --latest 5 --sort rate --save /etc/pacman.d/mirrorlist',
  ];

  if (sanitizedPackages.length > 0) {
    lines.push(`RUN pacman -Syu --noconfirm && pacman -S --noconfirm ${sanitizedPackages.join(' ')}`);
  } else {
    lines.push('RUN pacman -Syu --noconfirm');
  }

  lines.push(...specialCommands);

  return lines.join('\n').trim();
};

const generateDebianDockerfile = (spec: BuildSpec): string => {
  const packages = flattenPackages(spec.packages);
  const sanitizedPackages = packages.map(sanitizePackageName);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN apt-get install -y ${sanitizedPackages.join(' ')}` : '';

  return `
FROM debian:latest
RUN apt-get update
${packageInstallCommand}
`.trim();
};

const generateUbuntuDockerfile = (spec: BuildSpec): string => {
  const packages = flattenPackages(spec.packages);
  const sanitizedPackages = packages.map(sanitizePackageName);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN apt-get install -y ${sanitizedPackages.join(' ')}` : '';

  return `
FROM ubuntu:latest
RUN apt-get update
${packageInstallCommand}
`.trim();
};

const generateAlpineDockerfile = (spec: BuildSpec): string => {
  const packages = flattenPackages(spec.packages);
  const sanitizedPackages = packages.map(sanitizePackageName);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN apk add --no-cache ${sanitizedPackages.join(' ')}` : '';

  return `
FROM alpine:latest
${packageInstallCommand}
`.trim();
};

export const generateDockerfile = (spec: BuildSpec): string => {
  switch (spec.base) {
    case 'arch':
      return generateArchDockerfile(spec);
    case 'debian':
      return generateDebianDockerfile(spec);
    case 'ubuntu':
      return generateUbuntuDockerfile(spec);
    case 'alpine':
      return generateAlpineDockerfile(spec);
    default:
      // Fallback or throw. For this test, assuming valid base.
      // If specific base like 'linux-zen' (kernel) is confused with base distro, handle it.
      // The spec says "base": "arch".
      throw new Error(`Unsupported base distro: ${spec.base}`);
  }
};
