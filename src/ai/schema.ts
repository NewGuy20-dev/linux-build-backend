import { z } from 'zod';

// Enums
const baseEnum = z.enum(['arch', 'debian', 'ubuntu', 'alpine', 'fedora', 'opensuse', 'void', 'gentoo']);
const archEnum = z.enum(['x86_64', 'aarch64']);
const initEnum = z.enum(['systemd', 'openrc', 'runit', 's6']);
const kernelEnum = z.enum(['linux-lts', 'linux-zen', 'linux-hardened']);
const fsEnum = z.enum(['ext4', 'btrfs', 'xfs', 'zfs']);
const encryptionEnum = z.enum(['luks1', 'luks2']).nullable();
const displayServerEnum = z.enum(['wayland', 'xorg']).nullable();
const compositorEnum = z.enum(['hyprland', 'sway', 'i3', 'gnome', 'kde', 'xfce', 'dwm', 'bspwm']);
const firewallBackendEnum = z.enum(['nftables', 'iptables', 'ufw']);
const shellEnum = z.enum(['zsh', 'bash', 'fish']);
const backupToolEnum = z.enum(['borg', 'restic']);
const bootloaderEnum = z.enum(['grub', 'systemd-boot']);

// Sub-schemas
const modulesSchema = z.object({
  enable: z.array(z.string()).default([]),
  disable: z.array(z.string()).default([]),
}).optional();

const kernelSchema = z.object({
  version: kernelEnum.default('linux-lts'),
  customFlags: z.array(z.string()).default([]),
  modules: modulesSchema,
}).optional();

const snapshotsSchema = z.object({
  enabled: z.boolean().default(false),
  interval: z.string().optional(),
  retention: z.number().optional(),
}).optional();

const partitionSchema = z.object({
  mount: z.string(),
  size: z.string().optional(),
  encrypted: z.boolean().default(false),
});

const filesystemSchema = z.object({
  root: fsEnum.default('ext4'),
  encryption: encryptionEnum.default(null),
  compression: z.boolean().default(false),
  snapshots: snapshotsSchema,
  partitions: z.array(partitionSchema).default([]),
  lvm: z.boolean().default(false),
  raid: z.boolean().default(false),
}).optional();

const displaySchema = z.object({
  server: displayServerEnum.default(null),
  compositor: compositorEnum.optional(),
  bar: z.string().optional(),
  launcher: z.string().optional(),
  terminal: z.string().optional(),
  theme: z.string().optional(),
  notifications: z.string().optional(),
  lockscreen: z.string().optional(),
}).optional();

const packagesSchema = z.object({
  base: z.array(z.string()).default([]),
  development: z.array(z.string()).default([]),
  ai_ml: z.array(z.string()).default([]),
  security: z.array(z.string()).default([]),
  networking: z.array(z.string()).default([]),
  databases: z.array(z.string()).default([]),
  servers: z.array(z.string()).default([]),
  multimedia: z.array(z.string()).default([]),
  utils: z.array(z.string()).default([]),
}).or(z.array(z.string())).or(z.record(z.string(), z.boolean()));

const firewallRuleSchema = z.object({
  port: z.number(),
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
  action: z.enum(['allow', 'deny']).default('allow'),
});

const firewallSchema = z.object({
  backend: firewallBackendEnum.default('nftables'),
  policy: z.enum(['deny', 'allow']).default('deny'),
  rules: z.array(firewallRuleSchema).default([]),
}).optional();

const sshSchema = z.object({
  fail2ban: z.boolean().default(false),
  maxRetries: z.number().default(5),
  banTime: z.string().default('10m'),
}).optional();

const updatesSchema = z.object({
  automatic: z.boolean().default(false),
  securityOnly: z.boolean().default(true),
}).optional();

const securityFeaturesSchema = z.object({
  mac: z.array(z.enum(['apparmor', 'selinux'])).default([]),
  firewall: firewallSchema,
  ssh: sshSchema,
  updates: updatesSchema,
  kernelHardening: z.array(z.string()).default([]),
}).optional();

const serviceConfigSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  port: z.number().optional(),
  models: z.array(z.string()).optional(),
});

const servicesSchema = z.object({
  databases: z.array(serviceConfigSchema).default([]),
  monitoring: z.array(serviceConfigSchema).default([]),
  ai: z.array(serviceConfigSchema).default([]),
}).optional();

const retentionSchema = z.object({
  daily: z.number().default(7),
  weekly: z.number().default(4),
  monthly: z.number().default(12),
});

const backupSchema = z.object({
  tool: backupToolEnum.optional(),
  schedule: z.enum(['daily', 'weekly']).default('daily'),
  retention: retentionSchema.optional(),
  destinations: z.array(z.string()).default(['local']),
  enabled: z.boolean().default(false),
}).optional();

const bootloaderSchema = z.object({
  type: bootloaderEnum.default('grub'),
  theme: z.string().optional(),
  plymouth: z.boolean().default(false),
  mode: z.enum(['uefi', 'bios']).default('uefi'),
});

const dotfilesSchema = z.object({
  enabled: z.boolean().default(false),
  repo: z.string().optional(),
});

const customizationSchema = z.object({
  shell: shellEnum.default('bash'),
  shellFramework: z.string().optional(),
  shellTheme: z.string().optional(),
  bootloader: bootloaderSchema.optional(),
  dotfiles: dotfilesSchema.optional(),
}).optional();

const systemTuningSchema = z.object({
  swappiness: z.number().optional(),
  cachePressure: z.number().optional(),
});

const postInstallSchema = z.object({
  scripts: z.array(z.string()).default([]),
  systemTuning: systemTuningSchema.optional(),
  services: z.array(z.string()).default([]),
}).optional();

const defaultsSchema = z.object({
  swappiness: z.number().optional(),
  trim: z.boolean().default(true),
  kernelParams: z.string().optional(),
  dnsOverHttps: z.boolean().default(false),
  macRandomization: z.boolean().default(false),
}).optional();

// Main BuildSpec schema
export const buildSchema = z.object({
  name: z.string().optional(),
  base: baseEnum,
  architecture: archEnum.optional().default('x86_64'),
  kernel: kernelSchema,
  init: initEnum.optional().default('systemd'),
  filesystem: filesystemSchema,
  display: displaySchema.nullable().optional(),
  packages: packagesSchema,
  securityFeatures: securityFeaturesSchema,
  services: servicesSchema,
  backup: backupSchema,
  customization: customizationSchema,
  postInstall: postInstallSchema,
  defaults: defaultsSchema,
});

export type BuildSpec = z.infer<typeof buildSchema>;

// Cross-field validation
export function validateCompatibility(spec: BuildSpec): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // MAC conflict
  if (spec.securityFeatures?.mac?.includes('apparmor') && spec.securityFeatures?.mac?.includes('selinux')) {
    errors.push('Cannot use both AppArmor and SELinux simultaneously');
  }

  // Display conflicts
  if (spec.display?.compositor === 'hyprland' && spec.display?.server === 'xorg') {
    errors.push('Hyprland requires Wayland, not Xorg');
  }
  if (spec.display?.compositor === 'i3' && spec.display?.server === 'wayland') {
    errors.push('i3 requires Xorg, not Wayland');
  }

  // Distro compatibility warnings
  if (spec.filesystem?.root === 'zfs' && spec.base === 'alpine') {
    warnings.push('ZFS has limited support on Alpine');
  }
  if (spec.securityFeatures?.mac?.includes('selinux') && spec.base === 'arch') {
    warnings.push('SELinux is complex to configure on Arch');
  }
  if (spec.base === 'gentoo') {
    warnings.push('Gentoo builds may take significantly longer due to compilation');
  }

  // Init system compatibility
  const initCompat: Record<string, string[]> = {
    arch: ['systemd', 'openrc', 'runit', 's6'],
    debian: ['systemd', 'openrc'],
    ubuntu: ['systemd'],
    alpine: ['openrc'],
    fedora: ['systemd'],
    opensuse: ['systemd'],
    void: ['runit'],
    gentoo: ['openrc', 'systemd'],
  };
  if (!initCompat[spec.base]?.includes(spec.init)) {
    errors.push(`${spec.init} is not available on ${spec.base}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
