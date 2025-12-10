import { BuildSpec } from '../ai/schema';

export function generateFirewallRules(spec: BuildSpec): string {
  const fw = spec.securityFeatures?.firewall;
  if (!fw) return '';

  const backend = fw.backend || 'nftables';
  const policy = fw.policy || 'deny';
  const rules = fw.rules || [];

  if (backend === 'nftables') {
    const lines = [
      '#!/usr/sbin/nft -f',
      'flush ruleset',
      'table inet filter {',
      '  chain input {',
      `    type filter hook input priority 0; policy ${policy === 'deny' ? 'drop' : 'accept'};`,
      '    ct state established,related accept',
      '    iif lo accept',
    ];
    rules.forEach(r => {
      lines.push(`    ${r.protocol || 'tcp'} dport ${r.port} ${r.action === 'allow' ? 'accept' : 'drop'}`);
    });
    lines.push('  }', '}');
    return lines.join('\n');
  }

  if (backend === 'ufw') {
    const lines = ['ufw --force reset', `ufw default ${policy}`];
    rules.forEach(r => lines.push(`ufw ${r.action} ${r.port}/${r.protocol || 'tcp'}`));
    lines.push('ufw enable');
    return lines.join('\n');
  }

  return '';
}

export function generateFail2banConfig(spec: BuildSpec): string {
  const ssh = spec.securityFeatures?.ssh;
  if (!ssh?.fail2ban) return '';

  return `[DEFAULT]
bantime = ${ssh.banTime || '10m'}
maxretry = ${ssh.maxRetries || 5}

[sshd]
enabled = true
`;
}

export function generateSSHConfig(): string {
  return `PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
`;
}

export function generateKernelHardening(): string {
  return `kernel.randomize_va_space = 2
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
net.ipv4.tcp_syncookies = 1
`;
}

// AppArmor profile names: alphanumeric, underscores, hyphens, dots, max 64 chars
const APPARMOR_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/;

function validateAppArmorName(name: string): boolean {
  return APPARMOR_NAME_PATTERN.test(name);
}

export function generateAppArmorProfile(appName: string = 'custom-app'): string {
  if (!validateAppArmorName(appName)) {
    throw new Error(`Invalid AppArmor profile name: ${appName}`);
  }

  return `#include <tunables/global>

profile ${appName} flags=(attach_disconnected) {
  #include <abstractions/base>
  #include <abstractions/nameservice>

  capability net_bind_service,
  capability setuid,
  capability setgid,

  /usr/bin/${appName} mr,
  /etc/${appName}/** r,
  /var/log/${appName}/** rw,
  /tmp/** rw,

  deny /proc/*/mem rw,
  deny /sys/firmware/** r,
}
`;
}
