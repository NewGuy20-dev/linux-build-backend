import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../db/db', () => ({
  default: {
    securityScan: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

describe('compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('COMPLIANCE_PROFILES', () => {
    it('should have HIPAA profile', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      expect(COMPLIANCE_PROFILES.hipaa).toBeDefined();
      expect(COMPLIANCE_PROFILES.hipaa.name).toBe('HIPAA');
      expect(COMPLIANCE_PROFILES.hipaa.checks.length).toBeGreaterThan(0);
    });

    it('should have PCI-DSS profile', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      expect(COMPLIANCE_PROFILES['pci-dss']).toBeDefined();
      expect(COMPLIANCE_PROFILES['pci-dss'].name).toBe('PCI-DSS');
    });

    it('should have SOC2 profile', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      expect(COMPLIANCE_PROFILES.soc2).toBeDefined();
      expect(COMPLIANCE_PROFILES.soc2.name).toBe('SOC2');
    });
  });

  describe('HIPAA checks', () => {
    it('should pass encryption check with LUKS2', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      const encryptionCheck = COMPLIANCE_PROFILES.hipaa.checks.find((c) => c.id === 'hipaa-encryption');
      
      const spec = { filesystem: { encryption: 'luks2' } };
      const result = encryptionCheck!.check(spec);
      
      expect(result.passed).toBe(true);
    });

    it('should fail encryption check without encryption', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      const encryptionCheck = COMPLIANCE_PROFILES.hipaa.checks.find((c) => c.id === 'hipaa-encryption');
      
      const spec = { filesystem: { root: 'ext4' } };
      const result = encryptionCheck!.check(spec);
      
      expect(result.passed).toBe(false);
    });

    it('should pass firewall check with deny policy', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      const fwCheck = COMPLIANCE_PROFILES.hipaa.checks.find((c) => c.id === 'hipaa-firewall');
      
      const spec = { securityFeatures: { firewall: { enabled: true, policy: 'deny' } } };
      const result = fwCheck!.check(spec);
      
      expect(result.passed).toBe(true);
    });
  });

  describe('PCI-DSS checks', () => {
    it('should pass firewall check when enabled', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      const fwCheck = COMPLIANCE_PROFILES['pci-dss'].checks.find((c) => c.id === 'pci-firewall');
      
      const spec = { securityFeatures: { firewall: { enabled: true } } };
      const result = fwCheck!.check(spec);
      
      expect(result.passed).toBe(true);
    });

    it('should check for antivirus', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      const avCheck = COMPLIANCE_PROFILES['pci-dss'].checks.find((c) => c.id === 'pci-antivirus');
      
      const specWithAV = { packages: { security: ['clamav'] } };
      const specWithoutAV = { packages: { security: [] } };
      
      expect(avCheck!.check(specWithAV).passed).toBe(true);
      expect(avCheck!.check(specWithoutAV).passed).toBe(false);
    });
  });

  describe('SOC2 checks', () => {
    it('should pass access control with sudo', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      const acCheck = COMPLIANCE_PROFILES.soc2.checks.find((c) => c.id === 'soc2-access-control');
      
      const spec = { packages: { base: ['sudo'] } };
      const result = acCheck!.check(spec);
      
      expect(result.passed).toBe(true);
    });

    it('should check for monitoring tools', async () => {
      const { COMPLIANCE_PROFILES } = await import('./compliance');
      const monCheck = COMPLIANCE_PROFILES.soc2.checks.find((c) => c.id === 'soc2-monitoring');
      
      const spec = { packages: { security: ['fail2ban'] } };
      const result = monCheck!.check(spec);
      
      expect(result.passed).toBe(true);
    });
  });

  describe('runComplianceCheck', () => {
    it('should throw for unknown profile', async () => {
      const { runComplianceCheck } = await import('./compliance');
      
      await expect(runComplianceCheck('build-123', 'unknown-profile', {}))
        .rejects.toThrow('Unknown compliance profile');
    });

    it('should run HIPAA check and return results', async () => {
      const { runComplianceCheck } = await import('./compliance');
      
      const spec = {
        filesystem: { encryption: 'luks2' },
        securityFeatures: { firewall: { policy: 'deny' } },
        packages: { security: ['auditd'] },
      };
      
      const result = await runComplianceCheck('clxtest123456789abcdef', 'hipaa', spec);
      
      expect(result.profile).toBe('hipaa');
      expect(result.totalChecks).toBe(4);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('listProfiles', () => {
    it('should return all profile names', async () => {
      const { listProfiles } = await import('./compliance');
      const profiles = listProfiles();
      
      expect(profiles).toContain('hipaa');
      expect(profiles).toContain('pci-dss');
      expect(profiles).toContain('soc2');
    });
  });
});
