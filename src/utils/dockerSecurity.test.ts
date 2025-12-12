import { describe, it, expect } from 'vitest';
import { DEFAULT_SECURITY, toSecurityArgs, getDockerSecurityArgs } from './dockerSecurity';

describe('DEFAULT_SECURITY', () => {
  it('has secure defaults', () => {
    expect(DEFAULT_SECURITY.noNewPrivileges).toBe(true);
    expect(DEFAULT_SECURITY.dropCapabilities).toContain('ALL');
  });
});

describe('toSecurityArgs', () => {
  it('generates no-new-privileges flag', () => {
    const args = toSecurityArgs(DEFAULT_SECURITY);
    expect(args).toContain('--security-opt=no-new-privileges:true');
  });

  it('generates cap-drop flag', () => {
    const args = toSecurityArgs(DEFAULT_SECURITY);
    expect(args).toContain('--cap-drop=ALL');
  });
});

describe('getDockerSecurityArgs', () => {
  it('includes network isolation', () => {
    const args = getDockerSecurityArgs();
    expect(args).toContain('--network=none');
  });

  it('includes no-new-privileges', () => {
    const args = getDockerSecurityArgs();
    expect(args.some(a => a.includes('no-new-privileges'))).toBe(true);
  });
});
