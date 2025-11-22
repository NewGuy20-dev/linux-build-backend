import { exec } from 'child_process';
import { promisify } from 'util';
import { createId } from '@paralleldrive/cuid2';
import getPort from 'get-port';
import { activeSessions } from './sessionManager';
import { stopGuiSession } from './stopGuiSession';

const execAsync = promisify(exec);

export async function runGuiSession(imageUrl: string): Promise<{ sessionId: string; guiUrl: string }> {
  const sessionId = createId();
  const containerName = `gui-session-${sessionId}`;
  const port = await getPort();

  const { CODESPACE_NAME } = process.env;
  if (!CODESPACE_NAME) {
    throw new Error('CODESPACE_NAME environment variable is not set.');
  }

  const guiUrl = `https://${CODESPACE_NAME}-${port}.app.github.dev`;

  try {
    console.log(`Pulling image ${imageUrl}...`);
    await execAsync(`docker pull ${imageUrl}`);

    console.log(`Starting GUI container ${containerName} on port ${port}...`);
    await execAsync(
      `docker run -d --name ${containerName} -p ${port}:6080 ${imageUrl} /usr/local/bin/start-gui.sh`
    );

    const timeout = setTimeout(() => {
      console.log(`Session ${sessionId} timed out. Stopping and removing container...`);
      stopGuiSession(sessionId);
    }, 30 * 60 * 1000); // 30 minutes

    activeSessions.set(sessionId, timeout);

    return { sessionId, guiUrl };
  } catch (error) {
    console.error(`Failed to start GUI session:`, error);
    // Cleanup on failure
    await execAsync(`docker rm -f ${containerName}`).catch(console.error);
    throw new Error('Failed to start GUI session.');
  }
}
