import { WebSocketServer, WebSocket } from 'ws';

let wss: WebSocketServer;

export interface BuildCompletePayload {
  type: 'BUILD_COMPLETE';
  buildId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  artifacts: {
    dockerImage?: string;
    isoDownloadUrl?: string;
    dockerTarDownloadUrl?: string;
  };
}

export const initWebSocketServer = (server: any) => {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');
    ws.on('close', () => console.log('Client disconnected'));
  });
};

export const broadcast = (message: string) => {
  if (wss) {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
};

export const broadcastBuildComplete = (payload: BuildCompletePayload) => {
  broadcast(JSON.stringify(payload));
};
