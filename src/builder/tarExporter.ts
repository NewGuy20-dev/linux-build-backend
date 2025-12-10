import { executeCommand } from '../executor/executor';
import * as path from 'path';
import { checkCancellation } from '../utils/cancellation';
import { escapeShellArg } from '../utils/sanitizer';

// Docker image name: [registry/][namespace/]repository[:tag]
const DOCKER_IMAGE_PATTERN = /^[a-z0-9][a-z0-9._\-\/]*[a-z0-9](:[a-z0-9._\-]+)?$/i;

function validateImageName(name: string): boolean {
  return DOCKER_IMAGE_PATTERN.test(name) && name.length <= 256;
}

export const exportDockerImage = async (imageName: string, buildId: string, workspacePath: string): Promise<string> => {
  if (!validateImageName(imageName)) {
    throw new Error(`Invalid Docker image name: ${imageName}`);
  }
  const tarballPath = path.join(workspacePath, `${imageName}.tar`);
  await checkCancellation(buildId);
  await executeCommand(`docker save -o ${escapeShellArg(tarballPath)} ${escapeShellArg(imageName)}`, buildId);
  return tarballPath;
};
