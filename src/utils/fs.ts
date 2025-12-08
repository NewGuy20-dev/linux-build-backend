import * as fs from 'fs/promises';
import * as path from 'path';

export const createTempDir = async (): Promise<string> => {
  const tempDirPath = path.resolve('temp', `build-${Date.now()}`);
  await fs.mkdir(tempDirPath, { recursive: true });
  return tempDirPath;
};

export const cleanupDir = async (dirPath: string): Promise<void> => {
  const resolvedPath = path.resolve(dirPath);
  await fs.rm(resolvedPath, { recursive: true, force: true });
};
