import { BuildSpec } from '../ai/schema';
import { sanitizePackageName, sanitizeCommand } from '../utils/sanitizer';

const generateArchDockerfile = (spec: BuildSpec): string => {
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const sanitizedCommands = spec.commands.map(sanitizeCommand);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN pacman -S --noconfirm ${sanitizedPackages.join(' ')}` : '';
  const userCommands = sanitizedCommands.map(cmd => `RUN ${cmd}`).join('\n');
  const guiPackages = spec.desktopEnv ? 'xorg-server-xvfb xfce4 tigervnc novnc websockify' : '';
  const guiInstallCommand = spec.desktopEnv ? `RUN pacman -S --noconfirm ${guiPackages}` : '';
  const guiScriptCopy = spec.desktopEnv ? `
COPY src/scripts/start-gui.sh /usr/local/bin/start-gui.sh
RUN chmod +x /usr/local/bin/start-gui.sh
` : '';

  return `
FROM archlinux:latest
RUN pacman -Syu --noconfirm
${packageInstallCommand}
${guiInstallCommand}
${userCommands}
${guiScriptCopy}
`.trim();
};

const generateDebianDockerfile = (spec: BuildSpec): string => {
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const sanitizedCommands = spec.commands.map(sanitizeCommand);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN apt-get install -y ${sanitizedPackages.join(' ')}` : '';
  const userCommands = sanitizedCommands.map(cmd => `RUN ${cmd}`).join('\n');
  const guiPackages = spec.desktopEnv ? 'xvfb xfce4 tigervnc-standalone-server novnc websockify' : '';
  const guiInstallCommand = spec.desktopEnv ? `RUN apt-get install -y ${guiPackages}` : '';
  const guiScriptCopy = spec.desktopEnv ? `
COPY src/scripts/start-gui.sh /usr/local/bin/start-gui.sh
RUN chmod +x /usr/local/bin/start-gui.sh
` : '';

  return `
FROM debian:latest
RUN apt-get update
${packageInstallCommand}
${guiInstallCommand}
${userCommands}
${guiScriptCopy}
`.trim();
};

const generateUbuntuDockerfile = (spec: BuildSpec): string => {
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const sanitizedCommands = spec.commands.map(sanitizeCommand);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN apt-get install -y ${sanitizedPackages.join(' ')}` : '';
  const userCommands = sanitizedCommands.map(cmd => `RUN ${cmd}`).join('\n');
  const guiPackages = spec.desktopEnv ? 'xvfb xfce4 tigervnc-standalone-server novnc websockify' : '';
  const guiInstallCommand = spec.desktopEnv ? `RUN apt-get install -y ${guiPackages}` : '';
  const guiScriptCopy = spec.desktopEnv ? `
COPY src/scripts/start-gui.sh /usr/local/bin/start-gui.sh
RUN chmod +x /usr/local/bin/start-gui.sh
` : '';

  return `
FROM ubuntu:latest
RUN apt-get update
${packageInstallCommand}
${guiInstallCommand}
${userCommands}
${guiScriptCopy}
`.trim();
};

const generateAlpineDockerfile = (spec: BuildSpec): string => {
  const sanitizedPackages = spec.packages.map(sanitizePackageName);
  const sanitizedCommands = spec.commands.map(sanitizeCommand);

  const packageInstallCommand = sanitizedPackages.length > 0 ? `RUN apk add --no-cache ${sanitizedPackages.join(' ')}` : '';
  const userCommands = sanitizedCommands.map(cmd => `RUN ${cmd}`).join('\n');
  const guiPackages = spec.desktopEnv ? 'xvfb xfce4 tigervnc novnc websockify' : '';
  const guiInstallCommand = spec.desktopEnv ? `RUN apk add --no-cache ${guiPackages}` : '';
  const guiScriptCopy = spec.desktopEnv ? `
COPY src/scripts/start-gui.sh /usr/local/bin/start-gui.sh
RUN chmod +x /usr/local/bin/start-gui.sh
` : '';

  return `
FROM alpine:latest
${packageInstallCommand}
${guiInstallCommand}
${userCommands}
${guiScriptCopy}
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
