import * as fs from 'fs/promises';
import * as path from 'path';

export const createTempDir = async (): Promise<string> => {
  const tempDirPath = path.join('temp', `build-${Date.now()}`);
  await fs.mkdir(tempDirPath, { recursive: true });
  return tempDirPath;
};

export const cleanupDir = async (dirPath: string): Promise<void> => {
  await fs.rm(dirPath, { recursive: true, force: true });
};
