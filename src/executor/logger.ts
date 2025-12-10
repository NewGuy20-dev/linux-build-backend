import prisma from '../db/db';
import { broadcast } from '../ws/websocket';
import { maskSensitiveData } from '../utils/sanitizer';

export const log = async (buildId: string, message: string) => {
  const safeMessage = maskSensitiveData(message);
  console.log(`[${buildId}] ${safeMessage}`);

  // Save to database
  await prisma.buildLog.create({
    data: {
      buildId,
      message: safeMessage,
    },
  });

  // Broadcast to WebSocket clients
  broadcast(JSON.stringify({ buildId, message: safeMessage }));
};
