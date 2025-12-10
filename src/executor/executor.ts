import { exec, ExecOptions } from "child_process";
import { log } from "./logger";
import { maskSensitiveData } from "../utils/sanitizer";

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
        log(buildId, `Error executing command: ${maskSensitiveData(command)}`);
        log(buildId, maskSensitiveData(err));
        reject(err);
        return;
      }

      log(buildId, `Successfully executed command: ${maskSensitiveData(command)}`);

      if (err.trim().length > 0) {
        log(buildId, maskSensitiveData(err));
      }

      log(buildId, maskSensitiveData(out));
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
        log(buildId, maskSensitiveData(err));
        reject(err);
        return;
      }

      log(buildId, `Successfully executed secure command`);
      resolve(out);
    });
  });
};
