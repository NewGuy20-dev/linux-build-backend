import prisma from '../db/db';
import { broadcast } from '../ws/websocket';

export const log = async (buildId: string, message: string) => {
  console.log(`[${buildId}] ${message}`);

  // Save to database
  await prisma.buildLog.create({
    data: {
      buildId,
      message,
    },
  });

  // Broadcast to WebSocket clients
  broadcast(JSON.stringify({ buildId, message }));
};
