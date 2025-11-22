import { exec, ExecOptions } from 'child_process';
import { log } from './logger';

export const executeCommand = (command: string, buildId: string, options?: ExecOptions): Promise<string> => {
  return new Promise((resolve, reject) => {
    const process = exec(command, options, (error, stdout, stderr) => {
      if (error) {
        log(buildId, `Error executing command: ${command}`);
        log(buildId, stderr);
        reject(error);
      } else {
        log(buildId, `Successfully executed command: ${command}`);
        log(buildId, stdout);
        resolve(stdout);
      }
    });
  });
};
