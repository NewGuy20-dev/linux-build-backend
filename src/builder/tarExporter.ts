import { executeCommand } from '../executor/executor';
import * as path from 'path';

export const exportDockerImage = async (imageName: string, buildId: string, workspacePath: string): Promise<string> => {
  const tarballPath = path.join(workspacePath, `${imageName}.tar`);
  await executeCommand(`docker save -o ${tarballPath} ${imageName}`, buildId);
  return tarballPath;
};
