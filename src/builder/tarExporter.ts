import { executeCommand } from '../executor/executor';
import * as path from 'path';
import { checkCancellation } from '../utils/cancellation';

export const exportDockerImage = async (imageName: string, buildId: string, workspacePath: string): Promise<string> => {
  const tarballPath = path.join(workspacePath, `${imageName}.tar`);
  await checkCancellation(buildId);
  await executeCommand(`docker save -o ${tarballPath} ${imageName}`, buildId);
  return tarballPath;
};
