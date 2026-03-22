import os from 'os';
import { promisify } from 'util';
import { execFile } from 'child_process';

const execFileAsync = promisify(execFile);

export const killProcessTree = async (pid: number): Promise<void>  => {
  if (!pid || pid <= 0) return;
  try {
    if (os.platform() === "win32") {
      // /T kills the process tree; /F forces termination.
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } else {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
    }
  } catch (error) {
    throw new Error(`[SERVICE] Failed to kill process tree for pid=${pid}: ${
      error instanceof Error ? error.message : String(error)
    }`)
  }
}