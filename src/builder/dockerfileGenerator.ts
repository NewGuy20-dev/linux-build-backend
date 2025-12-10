import { BuildSpec } from '../ai/schema';
import { resolvePackages, getPackageManager } from './packageMaps';
import { validateGitUrl } from '../utils/sanitizer';

export const DOCKER_IMAGES: Record<string, string> = {
  arch: 'archlinux:latest',
  debian: 'debian:latest',
  ubuntu: 'ubuntu:latest',
  alpine: 'alpine:latest',
  fedora: 'fedora:latest',
  opensuse: 'opensuse/tumbleweed:latest',
  void: 'voidlinux/voidlinux:latest',
  gentoo: 'gentoo/stage3:latest',
};

function flattenPackages(spec: BuildSpec): string[] {
  const pkgs = spec.packages;
  if (Array.isArray(pkgs)) return pkgs;
  if (typeof pkgs === 'object' && pkgs !== null) {
    if ('base' in pkgs && Array.isArray((pkgs as { base: string[] }).base)) {
      const p = pkgs as { base: string[]; development: string[]; ai_ml: string[]; security: string[]; networking: string[]; databases: string[]; servers: string[]; multimedia: string[]; utils: string[] };
      return [...p.base, ...p.development, ...p.ai_ml, ...p.security, ...p.networking, ...p.databases, ...p.servers, ...p.multimedia, ...p.utils];
    }
    // Record<string, boolean> format
    return Object.entries(pkgs as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k);
  }
  return [];
}

function generateShellSetup(spec: BuildSpec, distro: string): string[] {
  const lines: string[] = [];
  const shell = spec.customization?.shell || 'bash';
  const pm = getPackageManager(distro);

  if (shell !== 'bash') {
    const { packages } = resolvePackages([shell], distro);
    if (packages.length) {
      lines.push(`RUN ${pm.install} ${packages[0]}`);
    }
  }

  if (spec.customization?.shellFramework === 'oh-my-zsh' && shell === 'zsh') {
    lines.push('RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended || true');
  }

  if (spec.customization?.shellTheme === 'starship') {
    lines.push('RUN curl -sS https://starship.rs/install.sh | sh -s -- -y || true');
  }

  return lines;
}

function generateSecuritySetup(spec: BuildSpec, distro: string): string[] {
  const lines: string[] = [];
  const pm = getPackageManager(distro);
  const sec = spec.securityFeatures;
  if (!sec) return lines;

  // Install security packages
  const secPkgs: string[] = [];
  if (sec.mac?.includes('apparmor')) secPkgs.push('apparmor');
  if (sec.mac?.includes('selinux')) secPkgs.push('selinux');
  if (sec.firewall?.backend) secPkgs.push(sec.firewall.backend);
  if (sec.ssh?.fail2ban) secPkgs.push('fail2ban');

  if (secPkgs.length) {
    const { packages, warnings } = resolvePackages(secPkgs, distro);
    if (packages.length) {
      lines.push(`RUN ${pm.install} ${packages.join(' ')} || true`);
    }
    warnings.forEach(w => lines.push(`# WARNING: ${w}`));
  }

  return lines;
}

function generateServiceSetup(spec: BuildSpec): string[] {
  const lines: string[] = [];
  const init = spec.init || 'systemd';
  const services = spec.postInstall?.services || [];

  for (const svc of services) {
    switch (init) {
      case 'systemd':
        lines.push(`RUN systemctl enable ${svc} 2>/dev/null || true`);
        break;
      case 'openrc':
        lines.push(`RUN rc-update add ${svc} default 2>/dev/null || true`);
        break;
      case 'runit':
        lines.push(`RUN ln -sf /etc/sv/${svc} /var/service/ 2>/dev/null || true`);
        break;
      case 's6':
        lines.push(`# S6 service setup for ${svc}`);
        break;
    }
  }

  return lines;
}

function generateExtrasSetup(spec: BuildSpec, distro: string): string[] {
  const lines: string[] = [];
  const pm = getPackageManager(distro);

  // Plymouth boot splash
  if (spec.customization?.bootloader?.plymouth) {
    const { packages } = resolvePackages(['plymouth'], distro);
    if (packages.length) {
      lines.push(`RUN ${pm.install} ${packages[0]} || true`);
      lines.push('RUN plymouth-set-default-theme spinner 2>/dev/null || true');
    }
  }

  // Dotfiles - validate URL before cloning
  if (spec.customization?.dotfiles?.enabled && spec.customization.dotfiles.repo) {
    try {
      const validatedUrl = validateGitUrl(spec.customization.dotfiles.repo);
      lines.push(`RUN git clone --depth 1 '${validatedUrl}' /root/.dotfiles 2>/dev/null || true`);
      lines.push('RUN cd /root/.dotfiles && [ -f install.sh ] && bash install.sh || true');
    } catch (e) {
      lines.push(`# WARNING: Dotfiles URL validation failed - skipped`);
    }
  }

  // DNS over HTTPS
  if (spec.defaults?.dnsOverHttps) {
    const { packages } = resolvePackages(['stubby'], distro);
    if (packages.length) {
      lines.push(`RUN ${pm.install} ${packages[0]} || true`);
      lines.push('RUN echo "nameserver 127.0.0.1" > /etc/resolv.conf.head 2>/dev/null || true');
    }
  }

  // MAC randomization
  if (spec.defaults?.macRandomization) {
    const { packages } = resolvePackages(['macchanger'], distro);
    if (packages.length) {
      lines.push(`RUN ${pm.install} ${packages[0]} || true`);
      lines.push('RUN echo "[connection]" >> /etc/NetworkManager/conf.d/mac.conf 2>/dev/null || true');
      lines.push('RUN echo "wifi.cloned-mac-address=random" >> /etc/NetworkManager/conf.d/mac.conf 2>/dev/null || true');
      lines.push('RUN echo "ethernet.cloned-mac-address=random" >> /etc/NetworkManager/conf.d/mac.conf 2>/dev/null || true');
    }
  }

  return lines;
}

function generateDistroDockerfile(spec: BuildSpec): string {
  const distro = spec.base;
  const image = DOCKER_IMAGES[distro];
  const pm = getPackageManager(distro);

  const allPackages = flattenPackages(spec);
  const { packages, warnings } = resolvePackages(allPackages, distro);

  const lines: string[] = [`FROM ${image}`];

  // Add warnings as comments
  warnings.forEach(w => lines.push(`# WARNING: ${w}`));

  // Distro-specific setup
  switch (distro) {
    case 'arch':
      lines.push('RUN pacman-key --init && pacman-key --populate archlinux');
      lines.push('RUN pacman -Sy --noconfirm reflector && reflector --latest 5 --sort rate --save /etc/pacman.d/mirrorlist || true');
      break;
    case 'gentoo':
      lines.push('RUN emerge --sync --quiet');
      lines.push('RUN echo \'MAKEOPTS="-j$(nproc)"\' >> /etc/portage/make.conf');
      lines.push('RUN echo \'FEATURES="binpkg-request-signature getbinpkg"\' >> /etc/portage/make.conf');
      break;
    case 'void':
      lines.push('RUN xbps-install -Syu xbps');
      break;
    case 'alpine':
      lines.push('RUN apk update');
      break;
    case 'opensuse':
      lines.push('RUN zypper refresh');
      break;
  }

  // System update
  if (distro !== 'gentoo') {
    lines.push(`RUN ${pm.update}`);
  }

  // Install packages
  if (packages.length > 0) {
    // Split into chunks for better caching
    const chunkSize = 20;
    for (let i = 0; i < packages.length; i += chunkSize) {
      const chunk = packages.slice(i, i + chunkSize);
      lines.push(`RUN ${pm.install} ${chunk.join(' ')} || true`);
    }
  }

  // Shell setup
  lines.push(...generateShellSetup(spec, distro));

  // Security setup
  lines.push(...generateSecuritySetup(spec, distro));

  // Service setup
  lines.push(...generateServiceSetup(spec));

  // Extras: Plymouth, dotfiles, DNS over HTTPS, MAC randomization
  lines.push(...generateExtrasSetup(spec, distro));

  // Set default shell if not bash
  if (spec.customization?.shell && spec.customization.shell !== 'bash') {
    lines.push(`RUN chsh -s /bin/${spec.customization.shell} root 2>/dev/null || true`);
  }

  return lines.join('\n');
}

export function generateDockerfile(spec: BuildSpec): string {
  if (!DOCKER_IMAGES[spec.base]) {
    throw new Error(`Unsupported base distro: ${spec.base}`);
  }
  return generateDistroDockerfile(spec);
}
