import { exec } from 'child_process';
import { promisify } from 'util';
import { activeSessions } from './sessionManager';

const execAsync = promisify(exec);

export async function stopGuiSession(sessionId: string): Promise<void> {
  const containerName = `gui-session-${sessionId}`;
  const timeout = activeSessions.get(sessionId);

  if (timeout) {
    clearTimeout(timeout);
    activeSessions.delete(sessionId);
  }

  try {
    console.log(`Stopping and removing container ${containerName}...`);
    await execAsync(`docker rm -f ${containerName}`);
    console.log(`Successfully stopped and removed container ${containerName}`);
  } catch (error) {
    console.error(`Failed to stop GUI session:`, error);
    // Even if the docker command fails, we proceed as the container might already be gone.
  }
}
