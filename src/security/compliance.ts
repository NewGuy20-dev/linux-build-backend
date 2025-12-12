import prisma from '../db/db';
import { logger } from '../utils/logger';

export interface ComplianceCheck {
  id: string;
  description: string;
  check: (spec: any) => { passed: boolean; details: string };
}

export interface ComplianceProfile {
  name: string;
  description: string;
  checks: ComplianceCheck[];
}

// HIPAA compliance checks
const hipaaChecks: ComplianceCheck[] = [
  {
    id: 'hipaa-encryption',
    description: 'Data encryption at rest required',
    check: (spec) => {
      const hasEncryption = spec.filesystem?.encryption === 'luks2' || spec.filesystem?.encryption === 'luks1';
      return { passed: hasEncryption, details: hasEncryption ? 'LUKS encryption enabled' : 'No disk encryption configured' };
    },
  },
  {
    id: 'hipaa-firewall',
    description: 'Firewall must be enabled with deny policy',
    check: (spec) => {
      const fw = spec.securityFeatures?.firewall;
      const passed = fw?.enabled !== false && fw?.policy === 'deny';
      return { passed, details: passed ? 'Firewall enabled with deny policy' : 'Firewall not properly configured' };
    },
  },
  {
    id: 'hipaa-audit',
    description: 'Audit logging must be enabled',
    check: (spec) => {
      const hasAudit = spec.packages?.security?.includes('auditd') || spec.packages?.base?.includes('audit');
      return { passed: !!hasAudit, details: hasAudit ? 'Audit daemon included' : 'auditd package not included' };
    },
  },
  {
    id: 'hipaa-ssh-hardening',
    description: 'SSH must be hardened',
    check: (spec) => {
      const ssh = spec.securityFeatures?.ssh;
      const passed = ssh?.disableRoot === true && ssh?.passwordAuth === false;
      return { passed, details: passed ? 'SSH hardened' : 'SSH not fully hardened (root/password auth)' };
    },
  },
];

// PCI-DSS compliance checks
const pciDssChecks: ComplianceCheck[] = [
  {
    id: 'pci-firewall',
    description: 'Firewall required for cardholder data protection',
    check: (spec) => {
      const fw = spec.securityFeatures?.firewall;
      const passed = fw?.enabled !== false;
      return { passed, details: passed ? 'Firewall enabled' : 'Firewall not enabled' };
    },
  },
  {
    id: 'pci-no-defaults',
    description: 'No default passwords or settings',
    check: (spec) => {
      const hasUsers = spec.users?.length > 0;
      const noDefaultShell = spec.customization?.shell !== undefined;
      return { passed: hasUsers || noDefaultShell, details: 'Custom configuration detected' };
    },
  },
  {
    id: 'pci-encryption',
    description: 'Encryption for data transmission',
    check: (spec) => {
      const hasSSL = spec.packages?.security?.includes('openssl') || spec.packages?.base?.includes('openssl');
      return { passed: !!hasSSL, details: hasSSL ? 'OpenSSL included' : 'OpenSSL not included' };
    },
  },
  {
    id: 'pci-antivirus',
    description: 'Anti-malware protection',
    check: (spec) => {
      const hasAV = spec.packages?.security?.includes('clamav');
      return { passed: !!hasAV, details: hasAV ? 'ClamAV included' : 'No antivirus included (consider clamav)' };
    },
  },
  {
    id: 'pci-logging',
    description: 'Logging and monitoring',
    check: (spec) => {
      const hasLogging = spec.packages?.base?.includes('rsyslog') || spec.packages?.security?.includes('rsyslog');
      return { passed: !!hasLogging, details: hasLogging ? 'Syslog configured' : 'No syslog package' };
    },
  },
];

// SOC2 compliance checks
const soc2Checks: ComplianceCheck[] = [
  {
    id: 'soc2-access-control',
    description: 'Access control mechanisms',
    check: (spec) => {
      const hasSudo = spec.packages?.base?.includes('sudo');
      const hasUsers = spec.users?.length > 0;
      return { passed: !!hasSudo || hasUsers, details: hasSudo ? 'Sudo access control' : 'Basic access control' };
    },
  },
  {
    id: 'soc2-encryption',
    description: 'Data encryption',
    check: (spec) => {
      const hasEncryption = spec.filesystem?.encryption;
      return { passed: !!hasEncryption, details: hasEncryption ? 'Encryption enabled' : 'No encryption' };
    },
  },
  {
    id: 'soc2-monitoring',
    description: 'System monitoring',
    check: (spec) => {
      const hasMonitoring = spec.packages?.utils?.includes('htop') || spec.packages?.security?.includes('fail2ban');
      return { passed: !!hasMonitoring, details: hasMonitoring ? 'Monitoring tools included' : 'No monitoring tools' };
    },
  },
  {
    id: 'soc2-backup',
    description: 'Backup capability',
    check: (spec) => {
      const hasBackup = spec.packages?.utils?.includes('rsync') || spec.packages?.base?.includes('tar');
      return { passed: !!hasBackup, details: hasBackup ? 'Backup tools available' : 'No backup tools' };
    },
  },
];

export const COMPLIANCE_PROFILES: Record<string, ComplianceProfile> = {
  hipaa: {
    name: 'HIPAA',
    description: 'Health Insurance Portability and Accountability Act compliance',
    checks: hipaaChecks,
  },
  'pci-dss': {
    name: 'PCI-DSS',
    description: 'Payment Card Industry Data Security Standard compliance',
    checks: pciDssChecks,
  },
  soc2: {
    name: 'SOC2',
    description: 'Service Organization Control 2 compliance',
    checks: soc2Checks,
  },
};

export interface ComplianceResult {
  profile: string;
  passed: boolean;
  score: number;
  totalChecks: number;
  passedChecks: number;
  results: Array<{ id: string; description: string; passed: boolean; details: string }>;
}

export const runComplianceCheck = async (buildId: string, profileName: string, spec: any): Promise<ComplianceResult> => {
  const profile = COMPLIANCE_PROFILES[profileName];
  if (!profile) {
    throw new Error(`Unknown compliance profile: ${profileName}`);
  }

  const results = profile.checks.map((check) => {
    const result = check.check(spec);
    return { id: check.id, description: check.description, ...result };
  });

  const passedChecks = results.filter((r) => r.passed).length;
  const totalChecks = results.length;
  const score = Math.round((passedChecks / totalChecks) * 100);
  const passed = score >= 80; // 80% threshold for compliance

  // Store in database
  await prisma.securityScan.create({
    data: {
      buildId,
      scanType: 'compliance',
      status: 'completed',
      results: { profile: profileName, results, score },
      vulnerabilities: totalChecks - passedChecks,
    },
  });

  logger.info({ buildId, profile: profileName, score, passed }, 'Compliance check completed');

  return { profile: profileName, passed, score, totalChecks, passedChecks, results };
};

export const getComplianceReport = async (buildId: string): Promise<ComplianceResult[]> => {
  const scans = await prisma.securityScan.findMany({
    where: { buildId, scanType: 'compliance' },
  });

  return scans.map((scan) => {
    const data = scan.results as any;
    return {
      profile: data.profile,
      passed: data.score >= 80,
      score: data.score,
      totalChecks: data.results.length,
      passedChecks: data.results.filter((r: any) => r.passed).length,
      results: data.results,
    };
  });
};

export const listProfiles = () => Object.keys(COMPLIANCE_PROFILES);
export const getProfile = (name: string) => COMPLIANCE_PROFILES[name];
