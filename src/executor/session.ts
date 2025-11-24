import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface GuiSession {
  containerName: string;
  expiresAt: number;
}

const sessions = new Map<string, GuiSession>();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

export const addSession = (sessionId: string, containerName: string) => {
  sessions.set(sessionId, {
    containerName,
    expiresAt: Date.now() + SESSION_TIMEOUT,
  });
};

const cleanupExpiredSessions = async () => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      try {
        await execAsync(`docker rm -f ${session.containerName}`);
        console.log(`Removed expired GUI session: ${session.containerName}`);
      } catch (error) {
        console.error(`Error removing container ${session.containerName}:`, error);
      }
      sessions.delete(sessionId);
    }
  }
};

setInterval(cleanupExpiredSessions, 60 * 1000); // Check every minute
