import { exec, ExecOptions } from "child_process";
import { log } from "./logger";

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
