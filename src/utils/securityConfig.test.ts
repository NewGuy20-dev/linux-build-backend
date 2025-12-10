import { describe, it, expect } from 'vitest';
import {
  generateFirewallRules,
  generateFail2banConfig,
  generateSSHConfig,
  generateKernelHardening,
  generateAppArmorProfile,
} from './securityConfig';

// Use partial specs for testing - runtime code handles missing fields
const createSpec = (securityFeatures?: any) => ({ securityFeatures }) as any;

describe('generateFirewallRules', () => {
  it('returns empty string when no firewall config', () => {
    expect(generateFirewallRules(createSpec())).toBe('');
  });

  it('generates nftables rules with deny policy', () => {
    const result = generateFirewallRules(createSpec({
      firewall: {
        backend: 'nftables',
        policy: 'deny',
        rules: [{ port: 22, action: 'allow', protocol: 'tcp' }],
      },
    }));
    expect(result).toContain('policy drop');
    expect(result).toContain('tcp dport 22 accept');
  });

  it('generates ufw rules', () => {
    const result = generateFirewallRules(createSpec({
      firewall: {
        backend: 'ufw',
        policy: 'deny',
        rules: [{ port: 80, action: 'allow' }],
      },
    }));
    expect(result).toContain('ufw default deny');
    expect(result).toContain('ufw allow 80/tcp');
  });

  it('returns empty for unknown backend', () => {
    const result = generateFirewallRules(createSpec({
      firewall: { backend: 'unknown', policy: 'deny', rules: [] },
    }));
    expect(result).toBe('');
  });
});

describe('generateFail2banConfig', () => {
  it('returns empty when no ssh config', () => {
    expect(generateFail2banConfig(createSpec())).toBe('');
  });

  it('returns empty when fail2ban disabled', () => {
    expect(generateFail2banConfig(createSpec({ ssh: { fail2ban: false } }))).toBe('');
  });

  it('generates config with defaults', () => {
    const result = generateFail2banConfig(createSpec({ ssh: { fail2ban: true } }));
    expect(result).toContain('bantime = 10m');
    expect(result).toContain('maxretry = 5');
  });

  it('uses custom values', () => {
    const result = generateFail2banConfig(createSpec({
      ssh: { fail2ban: true, banTime: '1h', maxRetries: 3 },
    }));
    expect(result).toContain('bantime = 1h');
    expect(result).toContain('maxretry = 3');
  });
});

describe('generateSSHConfig', () => {
  it('generates secure SSH config', () => {
    const result = generateSSHConfig();
    expect(result).toContain('PermitRootLogin prohibit-password');
    expect(result).toContain('PasswordAuthentication no');
    expect(result).toContain('PubkeyAuthentication yes');
    expect(result).toContain('MaxAuthTries 3');
  });
});

describe('generateKernelHardening', () => {
  it('generates kernel hardening sysctl', () => {
    const result = generateKernelHardening();
    expect(result).toContain('kernel.randomize_va_space = 2');
    expect(result).toContain('kernel.kptr_restrict = 2');
    expect(result).toContain('net.ipv4.tcp_syncookies = 1');
  });
});

describe('generateAppArmorProfile', () => {
  it('generates profile with default name', () => {
    expect(generateAppArmorProfile()).toContain('profile custom-app');
  });

  it('generates profile with custom name', () => {
    const result = generateAppArmorProfile('myapp');
    expect(result).toContain('profile myapp');
    expect(result).toContain('/usr/bin/myapp');
  });

  it('rejects invalid profile name starting with number', () => {
    expect(() => generateAppArmorProfile('123app')).toThrow('Invalid AppArmor profile name');
  });

  it('rejects profile name with invalid chars', () => {
    expect(() => generateAppArmorProfile('my@app')).toThrow('Invalid AppArmor profile name');
  });

  it('rejects empty profile name', () => {
    expect(() => generateAppArmorProfile('')).toThrow('Invalid AppArmor profile name');
  });
});
