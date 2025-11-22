import { BuildSpec } from '../ai/schema';
import { sanitizePackageName, sanitizeCommand } from '../utils/sanitizer';

const generateArchDockerfile = (spec: BuildSpec): string => {
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const sanitizedCommands = spec.commands.map(sanitizeCommand);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN pacman -S --noconfirm ${sanitizedPackages.join(' ')}` : '';
  const userCommands = sanitizedCommands.map(cmd => `RUN ${cmd}`).join('\n');

  return `
FROM archlinux:latest
RUN pacman -Syu --noconfirm
${packageInstallCommand}
${userCommands}
`.trim();
};

const generateDebianDockerfile = (spec: BuildSpec): string => {
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const sanitizedCommands = spec.commands.map(sanitizeCommand);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN apt-get install -y ${sanitizedPackages.join(' ')}` : '';
  const userCommands = sanitizedCommands.map(cmd => `RUN ${cmd}`).join('\n');

  return `
FROM debian:latest
RUN apt-get update
${packageInstallCommand}
${userCommands}
`.trim();
};

const generateUbuntuDockerfile = (spec: BuildSpec): string => {
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const sanitizedCommands = spec.commands.map(sanitizeCommand);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN apt-get install -y ${sanitizedPackages.join(' ')}` : '';
  const userCommands = sanitizedCommands.map(cmd => `RUN ${cmd}`).join('\n');

  return `
FROM ubuntu:latest
RUN apt-get update
${packageInstallCommand}
${userCommands}
`.trim();
};

const generateAlpineDockerfile = (spec: BuildSpec): string => {
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const sanitizedCommands = spec.commands.map(sanitizeCommand);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN apk add --no-cache ${sanitizedPackages.join(' ')}` : '';
  const userCommands = sanitizedCommands.map(cmd => `RUN ${cmd}`).join('\n');

  return `
FROM alpine:latest
${packageInstallCommand}
${userCommands}
`.trim();
};

export const generateDockerfile = (spec: BuildSpec): string => {
  switch (spec.baseDistro) {
    case 'arch':
      return generateArchDockerfile(spec);
    case 'debian':
      return generateDebianDockerfile(spec);
    case 'ubuntu':
      return generateUbuntuDockerfile(spec);
    case 'alpine':
      return generateAlpineDockerfile(spec);
    default:
      throw new Error(`Unsupported base distro: ${spec.baseDistro}`);
  }
};
