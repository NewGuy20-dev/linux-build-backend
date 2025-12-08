import prisma from '../db/db';

export const checkCancellation = async (buildId: string) => {
  const build = await prisma.userBuild.findUnique({
    where: { id: buildId },
    select: { cancelledAt: true },
  });

  if (build?.cancelledAt) {
    throw new Error('BUILD_CANCELLED');
  }
};
