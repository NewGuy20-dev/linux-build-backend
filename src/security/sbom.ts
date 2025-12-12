import { executeCommandSecureArgs } from '../executor/executor';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const generateSBOM = async (buildId: string, artifactPath: string) => {
  try {
    const result = await executeCommandSecureArgs('syft', [artifactPath, '-o', 'spdx-json'], buildId);
    const sbom = JSON.parse(result);

    await prisma.securityScan.create({
      data: { buildId, scanType: 'sbom', status: 'completed', results: sbom },
    });

    return sbom;
  } catch (e) {
    logger.error({ buildId, error: e }, 'SBOM generation failed');
    await prisma.securityScan.create({
      data: { buildId, scanType: 'sbom', status: 'failed' },
    });
    return null;
  }
};

export const scanVulnerabilities = async (buildId: string, artifactPath: string) => {
  try {
    const result = await executeCommandSecureArgs('trivy', ['image', '--format', 'json', artifactPath], buildId);
    const scan = JSON.parse(result);

    const vulns = scan.Results?.flatMap((r: any) => r.Vulnerabilities || []) || [];
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    vulns.forEach((v: any) => {
      const sev = v.Severity?.toLowerCase();
      if (sev in counts) counts[sev as keyof typeof counts]++;
    });

    await prisma.securityScan.create({
      data: {
        buildId,
        scanType: 'vulnerability',
        status: 'completed',
        results: scan,
        vulnerabilities: vulns.length,
        ...counts,
      },
    });

    return { vulnerabilities: vulns.length, ...counts };
  } catch (e) {
    logger.error({ buildId, error: e }, 'Vulnerability scan failed');
    await prisma.securityScan.create({
      data: { buildId, scanType: 'vulnerability', status: 'failed' },
    });
    return null;
  }
};

export const getSecurityReport = async (buildId: string) => {
  return prisma.securityScan.findMany({ where: { buildId } });
};
