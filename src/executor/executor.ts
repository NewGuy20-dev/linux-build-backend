import { exec, execFile, ExecOptions, ExecFileOptions } from "child_process";
import { log } from "./logger";

/**
 * Execute a command using execFile (no shell) - more secure for commands with known arguments.
 * Use this when you have a command and separate arguments array.
 */
export const executeCommandSecureArgs = (
  command: string,
  args: string[],
  buildId: string,
  options?: ExecFileOptions
): Promise<string> => {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      const out = stdout?.toString() || "";
      const err = stderr?.toString() || "";

      if (error) {
        log(buildId, `Error executing: ${command}`);
        log(buildId, err);
        reject(err);
        return;
      }

      log(buildId, `Successfully executed: ${command}`);
      resolve(out);
    });
  });
};

export const executeCommand = (
  command: string,
  buildId: string,
  options?: ExecOptions
): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      const out = stdout?.toString() || "";
      const err = stderr?.toString() || "";

      if (error) {
        log(buildId, `Error executing command: ${command}`);
        log(buildId, err);
        reject(err);
        return;
      }

      log(buildId, `Successfully executed command: ${command}`);

      if (err.trim().length > 0) {
        log(buildId, err);
      }

      log(buildId, out);
      resolve(out);
    });
  });
};

// Secure version - doesn't log the command at all (for sensitive operations)
export const executeCommandSecure = (
  command: string,
  buildId: string,
  options?: ExecOptions
): Promise<string> => {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      const out = stdout?.toString() || "";
      const err = stderr?.toString() || "";

      if (error) {
        log(buildId, `Error executing secure command`);
        log(buildId, err);
        reject(err);
        return;
      }

      log(buildId, `Successfully executed secure command`);
      resolve(out);
    });
  });
};
