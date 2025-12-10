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

/**
 * Produce a sysctl configuration snippet that applies common kernel and network hardening settings.
 *
 * @returns A string containing sysctl key‑value lines for:
 * - `kernel.randomize_va_space = 2`
 * - `kernel.kptr_restrict = 2`
 * - `kernel.dmesg_restrict = 1`
 * - `net.ipv4.tcp_syncookies = 1`
 */
export function generateKernelHardening(): string {
  return `kernel.randomize_va_space = 2
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
net.ipv4.tcp_syncookies = 1
`;
}

/**
 * Produce an AppArmor profile tailored to a specific application name.
 *
 * The generated profile includes global tunables, standard abstractions, common capabilities,
 * file path permissions for the executable, configuration, and log directories, and explicit
 * denial rules for sensitive kernel and firmware paths.
 *
 * @param appName - The application name used to populate profile identifiers and file paths; defaults to `custom-app`.
 * @returns The AppArmor profile contents as a text block for the given `appName`.
 */
export function generateAppArmorProfile(appName: string = 'custom-app'): string {
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