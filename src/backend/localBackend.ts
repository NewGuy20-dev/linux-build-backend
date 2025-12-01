import prisma from '../db/db';
import { runBuildLifecycle } from '../executor/lifecycle';
import { generateId } from '../utils/id';
import { buildSchema, BuildSpec } from '../ai/schema';
import { Backend, BuildResponse } from './types';
import { normalizePackages } from '../utils/packages';

export class LocalBackend implements Backend {
  async build(spec: BuildSpec): Promise<BuildResponse> {
    const buildSpec = buildSchema.parse(spec);
    const normalizedSpec: BuildSpec = {
      ...buildSpec,
      packages: normalizePackages(buildSpec.packages),
    };
    const buildId = generateId();

    await prisma.userBuild.create({
      data: {
        id: buildId,
        baseDistro: normalizedSpec.base,
        spec: normalizedSpec as any,
      },
    });

    runBuildLifecycle(normalizedSpec, buildId).catch(error => {
      console.error(`[LocalBackend] build lifecycle failed for ${buildId}`, error);
    });

    return { buildId };
  }

  async getStatus(buildId: string): Promise<unknown> {
    return prisma.userBuild.findUnique({
      where: { id: buildId },
      include: { logs: true, artifacts: true },
    });
  }

  async getLogs(buildId: string): Promise<unknown> {
    return prisma.buildLog.findMany({
      where: { buildId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
